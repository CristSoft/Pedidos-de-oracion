import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from 'jose';
import { verifyFirebaseAdminToken } from './worker/auth.js';
import { createWorker } from './worker/index.js';
import { generateSummaries, validateEntries } from './shared/gemini-summary.js';

const origin = 'https://pedidos-de-oracion-sur.web.app';
const entries = [{ id: 'pedido-1', name: 'Ana', reasons: ['Por mi salud'] }];
const limiter = () => ({ limit: async () => ({ success: true }) });
const env = () => ({ FIREBASE_PROJECT_ID: 'prayer-test', GEMINI_API_KEY: 'server-only-secret', ALLOWED_ORIGINS: origin,
  IP_LIMITER: limiter(), ADMIN_LIMITER: limiter() });
const request = (options = {}) => new Request('https://worker.test/summary', { method: 'POST',
  headers: { Origin: origin, Authorization: 'Bearer firebase-token', 'Content-Type': 'application/json' },
  body: JSON.stringify({ entries }), ...options });
const geminiAnswer = input => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [
  { text: JSON.stringify({ summaries: input.map(entry => ({ id: entry.id, text: 'Pide por su salud.' })) }) }
] } }] }));

test('Verifica firma, proyecto, expiración y permiso administrativo del token de Firebase', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey); jwk.kid = 'test-key'; jwk.alg = 'RS256';
  const keys = createLocalJWKSet({ keys: [jwk] });
  const seconds = Math.floor(Date.now() / 1000);
  const payload = { sub: 'admin-uid', aud: 'prayer-test', iss: 'https://securetoken.google.com/prayer-test',
    exp: seconds + 3600, iat: seconds - 5, auth_time: seconds - 30, prayerAdmin: true };
  const token = data => new SignJWT(data).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey);
  assert.deepEqual(await verifyFirebaseAdminToken(await token(payload), 'prayer-test', { keys }), { uid: 'admin-uid' });
  for (const override of [{ aud: 'another-project' }, { iss: 'https://attacker.test' }, { exp: seconds - 1 },
    { iat: seconds + 10 }, { iat: 'invalid' }, { auth_time: seconds + 10 }, { sub: '' }, { sub: 42 }, { auth_time: 'invalid' }]) {
    await assert.rejects(verifyFirebaseAdminToken(await token({ ...payload, ...override }), 'prayer-test', { keys }), error => error.status === 401);
  }
  for (const prayerAdmin of [false, 'true', undefined]) {
    await assert.rejects(verifyFirebaseAdminToken(await token({ ...payload, prayerAdmin }), 'prayer-test', { keys }), error => error.status === 403);
  }
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(other.privateKey);
  await assert.rejects(verifyFirebaseAdminToken(forged, 'prayer-test', { keys }), error => error.status === 401);
});

test('El proxy usa el secreto del servidor y devuelve solamente los resúmenes', async () => {
  let checked = false, called = false;
  const worker = createWorker({ verifyToken: async (token, project) => {
    assert.equal(token, 'firebase-token'); assert.equal(project, 'prayer-test'); checked = true; return { uid: 'admin-uid' };
  }, fetchImpl: async (url, options) => {
    assert.equal(checked, true); assert.equal(options.headers['x-goog-api-key'], 'server-only-secret');
    assert.doesNotMatch(url, /server-only-secret/); called = true;
    const contents = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    return geminiAnswer(contents);
  } });
  const response = await worker.fetch(request(), env());
  assert.equal(response.status, 200); assert.equal(called, true);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const text = await response.text(); assert.doesNotMatch(text, /server-only-secret|firebase-token|Ana/);
  assert.deepEqual(JSON.parse(text), { summaries: [{ id: 'pedido-1', text: 'Pide por su salud.' }] });
});

test('Origen, autorización, método y límites bloquean Gemini antes de consumir cuota', async () => {
  let calls = 0;
  const worker = createWorker({ verifyToken: async () => ({ uid: 'admin-uid' }), fetchImpl: async () => { calls++; return geminiAnswer(entries); } });
  const cases = [
    [request({ headers: { Origin: 'https://attacker.test' } }), env(), 403],
    [request({ headers: { Origin: origin } }), env(), 401],
    [request({ method: 'GET', body: undefined }), env(), 405],
    [request(), { ...env(), IP_LIMITER: { limit: async () => ({ success: false }) } }, 429],
    [request(), { ...env(), ADMIN_LIMITER: { limit: async () => ({ success: false }) } }, 429],
    [request(), { ...env(), GEMINI_API_KEY: '' }, 503],
    [request({ body: '{invalid' }), env(), 400],
    [request({ body: JSON.stringify({ entries: Array(21).fill(entries[0]) }) }), env(), 400],
    [request({ body: 'x'.repeat(96001) }), env(), 413]
  ];
  for (const [input, settings, status] of cases) assert.equal((await worker.fetch(input, settings)).status, status);
  assert.equal(calls, 0);
  const preflight = await worker.fetch(request({ method: 'OPTIONS', body: undefined }), env());
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
});

test('Valida el tamaño y estructura de cada lote y descarta metadatos del navegador', async () => {
  assert.deepEqual(validateEntries([{ ...entries[0], key: 'private-receipt', publicId: 'record' }]), entries);
  for (const invalid of [[], [{ ...entries[0], id: 'private-receipt' }], [entries[0], entries[0]],
    [{ ...entries[0], name: 'x'.repeat(101) }], [{ ...entries[0], reasons: ['x'.repeat(3001)] }],
    [{ ...entries[0], reasons: [''] }], [{ ...entries[0], reasons: Array(9).fill('x'.repeat(3000)) }]]) {
    assert.throws(() => validateEntries(invalid));
  }
  await assert.rejects(generateSummaries(entries, 'secret', { fetchImpl: async () => new Response('secret provider error', { status: 403 }) }),
    error => error.status === 503 && !error.message.includes('secret'));
});
