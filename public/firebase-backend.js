import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, getCountFromServer, setDoc, writeBatch, runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { runWithNumberRetry } from './numbered-transaction.js';
import { deleteRequestBatches } from './bulk-delete.js';
import { firebaseConfig, adminEmail } from './firebase-config.js';
import { scheduleFields, isReceptionOpen, receptionDays } from './schedule.js';
import { summaryServiceUrl } from './summary-config.js';
import { setParticipation } from './prayer-participation.js';

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const persistence = setPersistence(auth, browserSessionPersistence);
const settingsRef = doc(db, 'prayerSettings', 'reception');
const counterRef = doc(db, 'prayerCounters', 'requests');
const categories = ['Salud', 'Familia', 'Trabajo', 'Vida espiritual', 'Otro motivo'];
const randomId = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
async function isAdmin() {
  await persistence;
  await auth.authStateReady();
  return !!auth.currentUser && (await auth.currentUser.getIdTokenResult()).claims.prayerAdmin === true;
}
export async function restoreAdminSession() { return isAdmin(); }
export async function logoutAdmin() { await signOut(auth); }
export async function generateSummaryBatch(entries, { signal } = {}) {
  if (!await isAdmin()) throw fail('Ingresá a Administración para generar el resumen.', 401);
  if (!summaryServiceUrl) throw fail('El servicio de resúmenes todavía no está configurado.', 503);
  const idToken = await auth.currentUser.getIdToken();
  let response;
  try {
    response = await fetch(summaryServiceUrl + '/summary', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ entries }), signal, credentials: 'omit'
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw fail('No pudimos conectar con el servicio de resúmenes. Revisá tu conexión y volvé a intentar.', 502);
  }
  const result = await response.json();
  if (!response.ok) throw fail(result.error || 'No pudimos generar el resumen.', response.status);
  return result;
}
function reception(data) {
  return { ...data, days: receptionDays(data), open: isReceptionOpen(data), demoPassword: false };
}
async function settings() {
  const snapshot = await getDoc(settingsRef);
  if (!snapshot.exists()) throw fail('La recepción todavía no está configurada.');
  return reception(snapshot.data());
}
function request(snapshot, includeKey = false) {
  const value = snapshot.data();
  const reasons = Array.isArray(value.reasons) ? value.reasons.filter(reason =>
    reason && typeof reason.text === 'string' && categories.includes(reason.category)
  ).map(reason => ({ text: reason.text, category: reason.category })) : [];
  return {
    id: snapshot.id, prayerId: value.publicId || (snapshot.ref.parent.id === 'prayerFeed' ? snapshot.id : null), number: value.number, ...(includeKey ? { key: snapshot.id } : {}),
    name: value.private ? 'Anónimo' : String(value.name || ''), private: !!value.private, reasons,
    createdAt: value.createdAt.toDate().toISOString(), status: value.status
  };
}
function validateDraft(data) {
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 100
    || !Array.isArray(data.reasons) || data.reasons.length !== 1
    || data.reasons.some(reason => !reason || typeof reason.text !== 'string'
      || !reason.text.trim() || reason.text.length > 3000 || !categories.includes(reason.category))) {
    throw fail('Escribí tu nombre y un solo motivo de oración.');
  }
  if (JSON.stringify(data).length > 100000) throw fail('La entrada es demasiado extensa.');
}
export async function api(url, method = 'GET', data) {
  try {
    if ((url === '/prayers' && method === 'POST') || (url.startsWith('/prayers/') && method === 'PUT')) {
      if (!/^[a-f0-9]{48}$/.test(data?.voterKey || '')) throw fail('No pudimos identificar tu registro de oración.');
      const ids = url === '/prayers' ? data.ids : [url.split('/').pop()];
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id))) throw fail('Pedido inválido.');
      if (method === 'PUT') {
        if (typeof data.praying !== 'boolean') throw fail('Estado de oración inválido.');
        await setParticipation({ doc, runTransaction }, db, ids[0], data.voterKey, data.praying, randomId(16), data.onlyIfMissing === true);
      }
      const results = [];
      for (let start = 0; start < ids.length; start += 10) {
        results.push(...await Promise.all(ids.slice(start, start + 10).map(async id => {
          const parent = doc(db, 'prayerFeed', id);
          const [count, receipt] = await Promise.all([
            getCountFromServer(collection(parent, 'participants')),
            getDoc(doc(parent, 'participationKeys', data.voterKey))
          ]);
          return { id, prayerCount: count.data().count, praying: !!receipt.data()?.voteId, registered: receipt.exists() };
        })));
      }
      return method === 'PUT' ? results[0] : results;
    }
    if (url === '/settings' && method === 'GET') return await settings();
    if (url === '/login' && method === 'POST') {
      await persistence;
      await signInWithEmailAndPassword(auth, adminEmail, data.password);
      if (!await isAdmin()) { await logoutAdmin(); throw fail('Esta cuenta no tiene acceso a administración.', 401); }
      return { token: 'firebase' };
    }
    if (url === '/requests' && method === 'POST') {
      validateDraft(data);
      if (!(await settings()).open) throw fail('El horario para enviar pedidos ha terminado. Tus motivos siguen en pantalla.', 403);
      const key = randomId(24), publicId = randomId(16);
      const item = {
        name: data.private ? 'Anónimo' : data.name.trim(), private: !!data.private,
        reasons: data.reasons.map(reason => ({ category: reason.category, text: reason.text.trim() })),
        createdAt: serverTimestamp(), status: 'Pendiente'
      };
      const number = await runWithNumberRetry(observe => runTransaction(db, async transaction => {
        const counter = await transaction.get(counterRef);
        if (!counter.exists()) throw fail('No pudimos preparar el pedido. Volvé a intentar.');
        observe(counter.data().lastNumber);
        const number = counter.data().lastNumber + 1;
        transaction.set(doc(db, 'prayerRequests', key), { ...item, number, publicId });
        transaction.set(doc(db, 'prayerFeed', publicId), { ...item, number });
        transaction.set(doc(db, 'prayerOwners', publicId), { key });
        transaction.update(counterRef, { lastNumber: number, publicId });
        return number;
      }), async () => (await getDoc(counterRef)).data().lastNumber);
      return { ...item, number, id: key, key, createdAt: new Date().toISOString() };
    }
    if (url === '/mine' && method === 'POST') {
      const keys = [...new Set(Array.isArray(data.keys) ? data.keys : [])].filter(key => /^[a-f0-9]{48}$/.test(key));
      const items = [];
      for (let start = 0; start < keys.length; start += 10) {
        const snapshots = await Promise.all(keys.slice(start, start + 10).map(key => getDoc(doc(db, 'prayerRequests', key))));
        items.push(...snapshots.filter(snapshot => snapshot.exists()).map(snapshot => request(snapshot, true)));
      }
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    if (url === '/shared-requests' && method === 'GET') {
      const result = await getDocs(collection(db, 'prayerFeed'));
      return result.docs.map(snapshot => request(snapshot)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (url.startsWith('/requests/') && method === 'DELETE') {
      const key = url.split('/').pop();
      if (!/^[a-f0-9]{48}$/.test(key)) throw fail('No tenés permiso para borrar este pedido.', 403);
      const ref = doc(db, 'prayerRequests', key), existing = await getDoc(ref);
      if (!existing.exists()) return { deleted: true };
      const batch = writeBatch(db);
      batch.delete(ref);
      if (existing.data().publicId) {
        batch.delete(doc(db, 'prayerFeed', existing.data().publicId));
        batch.delete(doc(db, 'prayerOwners', existing.data().publicId));
      }
      await batch.commit();
      return { deleted: true };
    }
    if (!await isAdmin()) throw fail('Ingresá a administración para continuar.', 401);
    if (url === '/requests' && method === 'DELETE') {
      if (!Array.isArray(data?.ids) || data.ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{48}$/.test(id))) {
        throw fail('La lista de pedidos para eliminar no es válida.');
      }
      const ids = new Set(data.ids);
      const snapshots = await getDocs(collection(db, 'prayerRequests'));
      return await deleteRequestBatches(snapshots.docs.filter(item => ids.has(item.id)), () => writeBatch(db), item => {
        const refs = [item.ref], publicId = item.data().publicId;
        if (publicId) refs.push(doc(db, 'prayerFeed', publicId), doc(db, 'prayerOwners', publicId));
        return refs;
      });
    }
    if (url === '/requests' && method === 'GET') {
      const result = await getDocs(collection(db, 'prayerRequests'));
      return result.docs.map(snapshot => request(snapshot)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (url === '/settings' && method === 'PUT') {
      let fields;
      try { fields = scheduleFields(data); } catch (error) { throw fail(error.message); }
      await setDoc(settingsRef, fields);
      return await settings();
    }
    if (url.startsWith('/requests/') && method === 'PATCH') {
      if (!['Pendiente', 'Orado'].includes(data.status)) throw fail('Estado inválido.');
      const ref = doc(db, 'prayerRequests', url.split('/').pop());
      const existing = await getDoc(ref);
      if (!existing.exists()) throw fail('Pedido no encontrado.', 404);
      const batch = writeBatch(db);
      batch.update(ref, { status: data.status });
      if (existing.data().publicId) batch.update(doc(db, 'prayerFeed', existing.data().publicId), { status: data.status });
      await batch.commit();
      return request(await getDoc(ref));
    }
    throw fail('No encontrado.', 404);
  } catch (error) {
    if (error.status) throw error;
    if (error.code?.startsWith('auth/')) throw fail('La contraseña no es correcta o no pudimos iniciar sesión.', 401);
    if (error.code === 'permission-denied') {
      if (url === '/requests' && method === 'POST' && !(await settings()).open) {
        throw fail('El horario para enviar pedidos ha terminado. Tus motivos siguen en pantalla.', 403);
      }
      throw fail('No tenés permiso para realizar esta operación.', 403);
    }
    throw fail('No pudimos completar la operación. Revisá tu conexión y volvé a intentarlo.');
  }
}
