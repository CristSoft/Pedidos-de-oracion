import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedFields } from './scripts/backfill-prayer-feed.mjs';

test('La lista compartida oculta nombres históricos privados y no copia claves ni metadatos', () => {
  const source = { name: { stringValue: 'Nombre privado anterior' }, private: { booleanValue: true },
    reasons: { arrayValue: { values: [] } }, createdAt: { timestampValue: '2026-10-07T12:00:00Z' },
    status: { stringValue: 'Pendiente' }, key: { stringValue: 'clave privada' }, publicId: { stringValue: 'metadato' } };
  const shared = feedFields(source);
  assert.equal(shared.name.stringValue, 'Anónimo');
  assert.equal(source.name.stringValue, 'Nombre privado anterior');
  assert.deepEqual(Object.keys(shared), ['name', 'private', 'reasons', 'createdAt', 'status']);
  assert.equal(shared.reasons, source.reasons);
  assert.equal(feedFields({ ...source, private: { booleanValue: false } }).name.stringValue, 'Nombre privado anterior');
  assert.throws(() => feedFields({}), /incompleto/);
});
