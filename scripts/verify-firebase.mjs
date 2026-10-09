import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { firebaseConfig } from '../public/firebase-config.js';
import { feedFields } from './backfill-prayer-feed.mjs';

const origin = 'https://pedidos-de-oracion-sur.web.app';
for (const file of ['', 'app.js', 'backend.js', 'firebase-backend.js', 'firebase-config.js', 'schedule.js', 'styles.css', 'group-rules.js']) {
  const response = await fetch(origin + '/' + file);
  assert.equal(response.status, 200, 'Archivo publicado: ' + file);
  if (!file) assert.match(await response.text(), /Mis pedidos[\s\S]*Todos los pedidos[\s\S]*Cómo funciona/);
}
const credentials = JSON.parse(await readFile(new URL('../.secrets/admin-access.json', import.meta.url), 'utf8'));
const login = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + firebaseConfig.apiKey, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: credentials.email, password: credentials.password, returnSecureToken: true })
});
assert.equal(login.status, 200, 'Ingreso administrativo');
const { idToken } = await login.json();
const api = 'https://firestore.googleapis.com/v1/projects/pedidos-de-oracion-sur/databases/(default)/documents';
assert.equal((await fetch(api + '/prayerSettings/reception')).status, 200, 'Horario publico');
assert.equal((await fetch(api + '/prayerRequests')).status, 403, 'Lista protegida');
assert.equal((await fetch(api + '/prayerOwners')).status, 403, 'Vínculos privados protegidos');
const headers = { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' };
async function list(collection, headers = {}) {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(api + '/' + collection);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200, 'Lectura: ' + collection);
    const page = await response.json();
    documents.push(...page.documents || []);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return documents;
}
const shared = await list('prayerFeed');
for (const record of shared) {
  assert.match(record.name.split('/').pop(), /^[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(record.fields).sort(), ['createdAt', 'name', 'private', 'reasons', 'status']);
  if (record.fields.private.booleanValue) assert.equal(record.fields.name.stringValue, 'Anónimo');
}
const originals = await list('prayerRequests', headers);
const owners = await list('prayerOwners', headers);
for (const source of originals) {
  const publicId = source.fields.publicId?.stringValue;
  assert.ok(publicId, 'Pedido incorporado a la lista compartida');
  const record = shared.find(item => item.name === api.replace('https://firestore.googleapis.com/v1/', '') + '/prayerFeed/' + publicId);
  assert.ok(record, 'Copia compartida encontrada');
  assert.deepEqual(record.fields, feedFields(source.fields), 'Contenido compartido coherente y nombres privados ocultos');
  const owner = owners.find(item => item.name.endsWith('/prayerOwners/' + publicId));
  assert.equal(owner?.fields.key.stringValue, source.name.split('/').pop(), 'Vínculo privado de borrado coherente');
}
console.log(JSON.stringify({ hosting: true, adminLogin: true, publicRead: true, receiptListProtected: true, sharedCount: shared.length }));
