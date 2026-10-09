import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupRequests, formatSummary, summarizeRequests } from './public/prayer-summary.js';
import { shareText } from './public/admin-actions.js';
const request = (name, number, extra = {}) => ({ name, number, reasons: [{ text: `Motivo ${number}` }], ...extra });
const answer = items => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: {
  parts: [{ text: JSON.stringify({ summaries: items.map(item => ({ id: item.id, text: `Pide por ${item.reasons.join(' y ')}.` })) }) }]
} }] }), { status: 200 });

test('Agrupa entradas por nombre normalizado sin vincular personas anónimas', () => {
  const groups = groupRequests([request(' Cristian  Sánchez Esquivel ', 1), request('cristian sánchez esquivel', 2),
    request('Nombre histórico privado', 3, { private: true }), request('Anónimo', 4), request('Ana', 5)]);
  assert.equal(groups.length, 4);
  const cristian = groups.find(group => group.name === 'Cristian Sánchez Esquivel');
  assert.equal(cristian.requests.length, 2);
  assert.equal(JSON.stringify(groups).includes('Nombre histórico privado'), false);
  const text = formatSummary(groups, new Map(groups.flatMap(group => group.requests.map(item => [item.id, '**Pide por su salud.**']))));
  assert.match(text, /\*Cristian Sánchez Esquivel:\*\n_Tiene 2 pedidos de oración\._\nPide por su salud\.\nPide por su salud\./);
  assert.match(text, /\*Anónimo · Pedido #3:\*/);
  assert.match(text, /\*Anónimo · Pedido #4:\*/);
  assert.doesNotMatch(text, /\*\*/);
});

test('Gemini recibe motivos sin claves ni IDs reales y resume todos los pedidos en lotes', async () => {
  const items = Array.from({ length: 25 }, (_, index) => request('Ana', index + 1, { id: 'private-id', key: 'private-receipt',
    reasons: [{ text: `Por la salud ${index}` }, { text: 'Por la familia' }] }));
  items.push(request('Nombre oculto', 26, { private: true }));
  const calls = [];
  const text = await summarizeRequests(items, 'test-key', { fetchImpl: async (url, options) => {
    calls.push(options); assert.ok(url.endsWith(':generateContent')); assert.ok(!url.includes('test-key'));
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    assert.doesNotMatch(options.body, /private-id|private-receipt|Nombre oculto/);
    return answer(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text));
  } });
  assert.equal(calls.length, 2);
  assert.match(text, /_Tiene 25 pedidos de oración\._/);
  assert.equal(text.match(/Pide por/g).length, 26);
  assert.equal(text.match(/Por la familia/g).length, 25);
});

test('Rechaza resultados incompletos, duplicados, bloqueados y truncados', async () => {
  for (const payload of [
    { summaries: [] },
    { summaries: [{ id: 'pedido-1', text: 'Uno' }, { id: 'pedido-1', text: 'Dos' }] },
    { summaries: [{ id: 'pedido-1', text: '' }, { id: 'pedido-2', text: 'Dos' }] }
  ]) {
    await assert.rejects(summarizeRequests([request('Ana', 1), request('Ana', 2)], 'key', { fetchImpl: async () =>
      new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] })) }), /incompleto/);
  }
  for (const finishReason of ['MAX_TOKENS', 'SAFETY']) {
    await assert.rejects(summarizeRequests([request('Ana', 1)], 'key', { fetchImpl: async () =>
      new Response(JSON.stringify({ candidates: [{ finishReason }] })) }), /incompleto/);
  }
});

test('Errores de cuota y cancelación no comparten texto ni exponen respuestas de Gemini', async () => {
  await assert.rejects(summarizeRequests([request('Ana', 1)], 'key', { fetchImpl: async () =>
    new Response('secret-error-body', { status: 429 }) }), /límite de uso/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(summarizeRequests([request('Ana', 1)], 'key', { signal: controller.signal, fetchImpl: async (url, options) => {
    assert.equal(options.signal.aborted, true); throw new DOMException('Canceled', 'AbortError');
  } }), { name: 'AbortError' });
});

test('Compartir llama al sistema dentro de la pulsación con el texto exacto', async () => {
  let invoked = false;
  const promise = shareText('*Ana:*\nPide por su salud.', { canShare: () => true,
    share: payload => { invoked = true; assert.deepEqual(payload, { text: '*Ana:*\nPide por su salud.' }); return Promise.resolve(); } });
  assert.equal(invoked, true); await promise;
  assert.throws(() => shareText('Texto', {}), /copiar el texto/);
  assert.throws(() => shareText('Texto', { share() {}, canShare: () => false }), /copiarlo/);
});
