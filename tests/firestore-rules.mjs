import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, runTransaction } from 'firebase/firestore';
import { runWithNumberRetry } from '../public/numbered-transaction.js';
import { scheduleFields, isReceptionOpen } from '../public/schedule.js';
import { deleteRequestBatches } from '../public/bulk-delete.js';

let env;
before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  // Exercise the production weekly helper at fixed instants without depending on the machine clock.
  const testRules = rules.replace('match /prayerRequests/{key} {',
    'match /weeklyChecks/{id} { allow get: if weeklyOpen(resource.data.settings, resource.data.instant); }\n    match /prayerRequests/{key} {');
  env = await initializeTestEnvironment({
    projectId: 'demo-prayer-rules',
    firestore: { host: '127.0.0.1', port: 8089, rules: testRules }
  });
  await env.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'prayerCounters/requests'),{lastNumber:0,publicId:''}));
});
after(async () => { await env?.cleanup(); });
function reception(mode, days = [1,2,3,4,5,6,7], start = '00:00', end = '24:00') {
  return scheduleFields({ mode, days, start, end });
}
async function seedSettings(settings) {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'prayerSettings/reception'), settings));
}
function draft(extra = {}) {
  return { name: 'Anónimo', private: true, reasons: [{ category: 'Salud', text: 'Motivo de prueba' }],
    createdAt: serverTimestamp(), status: 'Pendiente', number:1, ...extra };
}

function submit(db, key, extra = {}) {
  const publicId=randomBytes(16).toString('hex'),counter=doc(db,'prayerCounters/requests');
  return runWithNumberRetry(observe=>runTransaction(db,async transaction=>{
    const previous=(await transaction.get(counter)).data().lastNumber;observe(previous);
    const number=previous+1,data=draft({number,...extra});
    transaction.set(doc(db,'prayerRequests',key),{...data,publicId});
    transaction.set(doc(db,'prayerFeed',publicId),data);
    transaction.set(doc(db,'prayerOwners',publicId),{key});
    transaction.update(counter,{lastNumber:number,publicId});
  }),async()=>(await getDoc(counter)).data().lastNumber);
}

test('La lista publica no expone comprobantes y solo administracion puede marcar pedidos', async () => {
  await seedSettings(reception('open'));
  const visitor = env.unauthenticatedContext().firestore();
  const unrelated = env.authenticatedContext('otro-usuario').firestore();
  const admin = env.authenticatedContext('administrador', { prayerAdmin: true }).firestore();
  const key = 'a'.repeat(48), ref = doc(visitor, 'prayerRequests', key);
  await assertSucceeds(submit(visitor, key));
  assert.equal((await getDoc(ref)).data().reasons.length, 1);
  assert.equal((await getDoc(ref)).data().name, 'Anónimo');
  await assertFails(submit(visitor, '3'.repeat(48), { name: 'Nombre privado' }));
  await assertSucceeds(submit(visitor, '4'.repeat(48), { name: 'Nombre visible', private: false }));
  await assertFails(getDocs(collection(visitor, 'prayerRequests')));
  await assertFails(getDocs(collection(unrelated, 'prayerRequests')));
  const feed = await assertSucceeds(getDocs(collection(visitor, 'prayerFeed')));
  assert.equal(feed.size, 2);
  for (const item of feed.docs) {
    assert.equal('key' in item.data(), false);
    assert.equal('publicId' in item.data(), false);
    assert.notEqual(item.id, key);
    if (item.data().private) assert.equal(item.data().name, 'Anónimo');
  }
  const publicId = (await getDoc(ref)).data().publicId;
  await assertFails(getDoc(doc(visitor, 'prayerRequests', publicId)));
  await assertFails(updateDoc(ref, { status: 'Orado' }));
  await assertFails(setDoc(doc(visitor, 'prayerSettings/reception'), reception('closed')));
  await assertSucceeds(getDocs(collection(admin, 'prayerRequests')));
  await assertFails(updateDoc(doc(admin, 'prayerRequests', key), { status: 'Orado' }));
  const batch = writeBatch(admin);
  batch.update(doc(admin, 'prayerRequests', key), { status: 'Orado' });
  batch.update(doc(admin, 'prayerFeed', publicId), { status: 'Orado' });
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(visitor, 'prayerFeed', publicId))).data().status, 'Orado');
  await assertFails(updateDoc(doc(visitor, 'prayerFeed', publicId), { status: 'Pendiente' }));
  await assertFails(updateDoc(doc(admin, 'prayerFeed', publicId), { name: 'No permitido' }));
  await assertFails(updateDoc(doc(admin, 'prayerRequests', key), { name: 'Cambio no permitido' }));
  await assertFails(deleteDoc(ref));
  await assertFails(getDocs(collection(visitor, 'prayerSettings')));
});

test('Las reglas bloquean recepcion cerrada o fuera de horario y rechazan campos administrativos inyectados', async () => {
  const db = env.unauthenticatedContext().firestore();
  await seedSettings(reception('closed'));
  await assertFails(submit(db, 'b'.repeat(48)));
  const today = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCDay() || 7;
  await seedSettings(reception('weekly', [today === 7 ? 1 : today + 1]));
  await assertFails(submit(db, 'c'.repeat(48)));
  await seedSettings(reception('weekly'));
  await assertSucceeds(submit(db, 'd'.repeat(48)));
  await assertFails(submit(db, 'e'.repeat(48), { status: 'Orado' }));
  await assertFails(submit(db, 'f'.repeat(48), { prayerAdmin: true }));
  await assertFails(submit(db, '1'.repeat(48), { reasons: [] }));
  await assertFails(submit(db, '1'.repeat(48), { reasons: [
    { category: 'Salud', text: 'Primer motivo' }, { category: 'Familia', text: 'Segundo motivo' }
  ] }));
  await assertFails(submit(db, '2'.repeat(48), { createdAt: new Date(0) }));
  await assertFails(setDoc(doc(db, 'prayerRequests', '5'.repeat(48)), { ...draft(), publicId: '5'.repeat(32) }));
  await assertFails(setDoc(doc(db, 'prayerFeed', '6'.repeat(32)), draft({ key: 'clave privada' })));
});

test('Borrar exige la clave privada o administracion y elimina todas las copias juntas', async () => {
  await seedSettings(reception('open'));
  const owner = env.unauthenticatedContext().firestore();
  const stranger = env.authenticatedContext('sin-clave').firestore();
  const admin = env.authenticatedContext('administrador', { prayerAdmin: true }).firestore();
  const key = '7'.repeat(48);
  await assertSucceeds(submit(owner, key));
  const publicId = (await getDoc(doc(owner, 'prayerRequests', key))).data().publicId;
  await assertFails(getDoc(doc(stranger, 'prayerOwners', publicId)));
  await assertFails(getDocs(collection(stranger, 'prayerOwners')));
  await assertFails(updateDoc(doc(stranger, 'prayerOwners', publicId), { key: '9'.repeat(48) }));
  await assertFails(deleteDoc(doc(stranger, 'prayerFeed', publicId)));
  await assertFails(deleteDoc(doc(stranger, 'prayerOwners', publicId)));
  const attack = writeBatch(stranger);
  attack.delete(doc(stranger, 'prayerRequests', '9'.repeat(48)));
  attack.delete(doc(stranger, 'prayerFeed', publicId));
  attack.delete(doc(stranger, 'prayerOwners', publicId));
  await assertFails(attack.commit());
  assert.equal((await getDoc(doc(owner, 'prayerRequests', key))).exists(), true);
  await assertFails(deleteDoc(doc(owner, 'prayerRequests', key)));
  const incomplete = writeBatch(owner);
  incomplete.delete(doc(owner, 'prayerRequests', key));
  incomplete.delete(doc(owner, 'prayerFeed', publicId));
  await assertFails(incomplete.commit());
  function remove(db, key, publicId) {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'prayerRequests', key));
    batch.delete(doc(db, 'prayerFeed', publicId));
    batch.delete(doc(db, 'prayerOwners', publicId));
    return batch.commit();
  }
  await seedSettings(reception('closed'));
  await assertSucceeds(remove(owner, key, publicId));
  assert.equal((await getDoc(doc(owner, 'prayerRequests', key))).exists(), false);
  assert.equal((await getDoc(doc(owner, 'prayerFeed', publicId))).exists(), false);
  assert.equal((await getDoc(doc(admin, 'prayerOwners', publicId))).exists(), false);
  await seedSettings(reception('open'));
  const adminKey = '8'.repeat(48);
  await assertSucceeds(submit(owner, adminKey));
  const adminPublicId = (await getDoc(doc(admin, 'prayerRequests', adminKey))).data().publicId;
  await assertSucceeds(remove(admin, adminKey, adminPublicId));
  assert.equal((await getDoc(doc(owner, 'prayerFeed', adminPublicId))).exists(), false);
  const signedInOwner = env.authenticatedContext('sender-with-receipt').firestore(), signedInKey = '6'.repeat(48);
  await assertSucceeds(submit(signedInOwner, signedInKey));
  const signedInPublicId = (await getDoc(doc(signedInOwner, 'prayerRequests', signedInKey))).data().publicId;
  await assertSucceeds(remove(signedInOwner, signedInKey, signedInPublicId));
  const legacyKey = '0'.repeat(48);
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'prayerRequests', legacyKey), {
    ...draft(), name: 'Nombre privado antiguo', reasons: [
      { category: 'Salud', text: 'Motivo antiguo' }, { category: 'Familia', text: 'Otro motivo antiguo' }
    ]
  }));
  assert.equal((await getDoc(doc(owner, 'prayerRequests', legacyKey))).data().reasons.length, 2);
  await assertSucceeds(updateDoc(doc(admin, 'prayerRequests', legacyKey), { status: 'Orado' }));
  await assertSucceeds(deleteDoc(doc(owner, 'prayerRequests', legacyKey)));
});

test('Solo administracion puede guardar dias semanales y horarios coherentes', async () => {
  const admin = env.authenticatedContext('administrador', { prayerAdmin: true }).firestore();
  const ref = doc(admin, 'prayerSettings/reception');
  const settings = reception('weekly', [7,1,2], '09:00', '21:00');
  await assertSucceeds(setDoc(ref, settings));
  await assertSucceeds(setDoc(ref, reception('weekly', [7], '00:00', '24:00')));
  await assertSucceeds(setDoc(ref, reception('open')));
  await assertSucceeds(setDoc(ref, reception('closed')));
  await assertFails(setDoc(ref, { ...settings, days: [] }));
  await assertFails(setDoc(ref, { ...settings, days: [8] }));
  await assertFails(setDoc(ref, { ...settings, days: ['1'] }));
  await assertFails(setDoc(ref, { ...settings, endMinute: 9 * 60 }));
  await assertFails(setDoc(ref, { ...settings, startMinute: 0 }));
  await assertFails(setDoc(ref, { ...settings, timezone: 'UTC' }));
});

test('Firebase y la app coinciden en dias, limites horarios y cambio de semana', async () => {
  const db = env.unauthenticatedContext().firestore();
  const settings = reception('weekly', [7,1,2], '09:00', '21:00');
  const allDay = reception('weekly', [7], '00:00', '24:00');
  const cases = [
    [settings, '2026-10-11T11:59:59Z', false],
    [settings, '2026-10-11T12:00:00Z', true],
    [settings, '2026-10-13T23:59:59Z', true],
    [settings, '2026-10-14T00:00:00Z', false],
    [settings, '2026-10-14T12:00:00Z', false],
    [settings, '2026-10-18T12:00:00Z', true],
    [allDay, '2026-10-11T02:59:59Z', false],
    [allDay, '2026-10-11T03:00:00Z', true],
    [allDay, '2026-10-12T02:59:59Z', true],
    [allDay, '2026-10-12T03:00:00Z', false]
  ];
  for (const [index, [settings, time, open]] of cases.entries()) {
    const instant = new Date(time);
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'weeklyChecks', String(index)), { settings, instant }));
    assert.equal(isReceptionOpen(settings, instant), open);
    const read = getDoc(doc(db, 'weeklyChecks', String(index)));
    await (open ? assertSucceeds(read) : assertFails(read));
  }
});

test('La numeración es atómica, no se falsifica y no se reutiliza tras borrar',async()=>{
  await seedSettings(reception('open'));
  const db=env.unauthenticatedContext().firestore(),admin=env.authenticatedContext('administrador',{prayerAdmin:true}).firestore();
  const counter=doc(db,'prayerCounters/requests'),before=(await getDoc(counter)).data().lastNumber;
  await assertFails(updateDoc(counter,{lastNumber:before+1,publicId:'b'.repeat(32)}));
  await assertFails(submit(db,'ba'.repeat(24),{number:before+20}));
  assert.equal((await getDoc(counter)).data().lastNumber,before);
  const first='ab'.repeat(24),second='bc'.repeat(24);
  await Promise.all([submit(db,first),submit(db,second)]);
  const a=(await getDoc(doc(db,'prayerRequests',first))).data(),b=(await getDoc(doc(db,'prayerRequests',second))).data();
  assert.deepEqual([a.number,b.number].sort((x,y)=>x-y),[before+1,before+2]);
  await assertFails(updateDoc(doc(admin,'prayerRequests',first),{number:999}));
  const deletion=writeBatch(admin);deletion.delete(doc(admin,'prayerRequests',first));deletion.delete(doc(admin,'prayerFeed',a.publicId));deletion.delete(doc(admin,'prayerOwners',a.publicId));await deletion.commit();
  await submit(db,'cd'.repeat(24));
  assert.equal((await getDoc(doc(db,'prayerRequests','cd'.repeat(24)))).data().number,before+3);
  assert.equal((await getDoc(doc(db,'prayerRequests',second))).data().number,b.number);
});

test('Borrado administrativo en lotes conserva juntos comprobantes, copias y vínculos', async () => {
  const admin = env.authenticatedContext('bulk-administrador', { prayerAdmin: true }).firestore();
  const visitor = env.unauthenticatedContext().firestore();
  const items = Array.from({ length: 12 }, (_, index) => ({ id: String(index).padStart(48, 'e'), publicId: String(index).padStart(32, 'e') }));
  await env.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore());
    for (const item of items) {
      batch.set(doc(context.firestore(), 'prayerRequests', item.id), { ...draft(), publicId: item.publicId, number: 1000 });
      batch.set(doc(context.firestore(), 'prayerFeed', item.publicId), { ...draft(), number: 1000 });
      batch.set(doc(context.firestore(), 'prayerOwners', item.publicId), { key: item.id });
    }
    await batch.commit();
  });
  await assertFails(getDocs(collection(visitor, 'prayerRequests')));
  const refs = item => [doc(admin, 'prayerRequests', item.id), doc(admin, 'prayerFeed', item.publicId), doc(admin, 'prayerOwners', item.publicId)];
  const result = await assertSucceeds(deleteRequestBatches(items, () => writeBatch(admin), refs));
  assert.equal(result.deletedCount, 12);
  for (const item of items) for (const ref of refs(item)) assert.equal((await getDoc(ref)).exists(), false);
});
