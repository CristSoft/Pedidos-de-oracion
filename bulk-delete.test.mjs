import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteRequestBatches } from './public/bulk-delete.js';

test('El borrado por lotes elimina juntos original, copia y vínculo, incluido el último lote', async () => {
  const batches = [];
  const result = await deleteRequestBatches(Array.from({ length: 12 }, (_, id) => ({ id })), () => {
    const refs = []; batches.push(refs); return { delete: ref => refs.push(ref), commit: async () => {} };
  }, item => ['requests', 'feed', 'owners'].map(collection => `${collection}/${item.id}`));
  assert.deepEqual(batches.map(batch => batch.length), [15, 15, 6]);
  assert.equal(new Set(batches.flat()).size, 36);
  assert.equal(result.deletedCount, 12);
});

test('Un fallo conserva el progreso y detiene los lotes restantes', async () => {
  let commits = 0;
  await assert.rejects(deleteRequestBatches(Array.from({ length: 12 }, (_, id) => ({ id })), () => ({
    delete() {}, commit: async () => { if (++commits === 2) throw Error('offline'); }
  }), item => [item.id]), error => error.deletedCount === 5 && /Se eliminaron 5 pedidos/.test(error.message));
  assert.equal(commits, 2);
});
