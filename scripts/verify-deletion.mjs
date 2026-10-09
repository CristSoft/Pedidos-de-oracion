import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { firebaseConfig } from '../public/firebase-config.js';

const root = 'projects/pedidos-de-oracion-sur/databases/(default)/documents';
const base = 'https://firestore.googleapis.com/v1/';
const credentials = JSON.parse(await readFile(new URL('../.secrets/admin-access.json', import.meta.url), 'utf8'));
const login = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + firebaseConfig.apiKey, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: credentials.email, password: credentials.password, returnSecureToken: true })
});
assert.equal(login.status, 200, 'Ingreso administrativo');
const { idToken } = await login.json();
const headers = { 'Content-Type': 'application/json' };
const adminHeaders = { ...headers, Authorization: 'Bearer ' + idToken };
const pending = [];
const commit = (writes, headers) => fetch(base + root + ':commit', { method: 'POST', headers, body: JSON.stringify({ writes }) });
const deletion = paths => paths.map(name => ({ delete: name }));

try {
  for (const administrative of [false, true]) {
    const key = randomBytes(24).toString('hex'), publicId = randomBytes(16).toString('hex');
    const paths = [root + '/prayerRequests/' + key, root + '/prayerFeed/' + publicId, root + '/prayerOwners/' + publicId];
    const fields = { name: { stringValue: 'Anónimo' }, private: { booleanValue: true }, status: { stringValue: 'Pendiente' },
      reasons: { arrayValue: { values: [{ mapValue: { fields: { category: { stringValue: 'Otro motivo' }, text: { stringValue: 'Verificación técnica temporal del borrado.' } } } }] } } };
    const timestamp = [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }];
    const response = await commit([
      { update: { name: paths[0], fields: { ...fields, publicId: { stringValue: publicId } } }, updateTransforms: timestamp, currentDocument: { exists: false } },
      { update: { name: paths[1], fields }, updateTransforms: timestamp, currentDocument: { exists: false } },
      { update: { name: paths[2], fields: { key: { stringValue: key } } }, currentDocument: { exists: false } }
    ], headers);
    assert.equal(response.status, 200, 'Crear únicamente el pedido sintético de esta prueba; la recepción debe estar abierta');
    const fixture = { paths, deleted: false };
    pending.push(fixture);
    assert.equal((await fetch(base + paths[2])).status, 403, 'La clave privada no es pública');
    assert.equal((await fetch(base + paths[1], { method: 'DELETE' })).status, 403, 'Visitantes no pueden borrar por identificador público');
    assert.equal((await fetch(base + paths[0], { method: 'DELETE' })).status, 403, 'No se permiten copias incompletas');
    const removed = await commit(deletion(paths), administrative ? adminHeaders : headers);
    assert.equal(removed.status, 200, administrative ? 'Borrado administrativo' : 'Borrado con el comprobante propio');
    fixture.deleted = true;
    for (const name of paths) assert.equal((await fetch(base + name, { headers: adminHeaders })).status, 404, 'Copia eliminada');
  }
  console.log(JSON.stringify({ ownerDeletion: true, adminDeletion: true, strangerBlocked: true, testRecordsRemoved: true }));
} finally {
  // Only clean synthetic records created by this invocation, never existing requests.
  for (const fixture of pending.filter(item => !item.deleted)) {
    assert.equal((await commit(deletion(fixture.paths), adminHeaders)).status, 200, 'Limpieza de la prueba');
  }
}
