import { verifyFirebaseAdminToken } from './auth.js';
import { generateSummaries, SummaryError } from '../shared/gemini-summary.js';

const maxBodyBytes = 96000;
async function readEntries(request) {
  const length = request.headers.get('content-length');
  if (length && Number(length) > maxBodyBytes) throw new SummaryError('Los pedidos son demasiado extensos.', 413);
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SummaryError('Formato de solicitud inválido.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new SummaryError('No hay pedidos para resumir.');
  let size = 0; const parts = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) { await reader.cancel(); throw new SummaryError('Los pedidos son demasiado extensos.', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const part of parts) { buffer.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(buffer)).entries; }
  catch { throw new SummaryError('La solicitud de resumen no es válida.'); }
}

export function createWorker({ verifyToken = verifyFirebaseAdminToken, fetchImpl = fetch } = {}) {
  return { async fetch(request, env) {
    const origin = request.headers.get('origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    // CORS restricts the app's browsers; signed Firebase tokens provide authorization.
    if (!origin || !allowed.includes(origin)) return reply(403, { error: 'Origen no autorizado.' });
    headers['Access-Control-Allow-Origin'] = origin;
    if (new URL(request.url).pathname !== '/summary') return reply(404, { error: 'No encontrado.' });
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST'; headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
      headers['Access-Control-Max-Age'] = '600';
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return reply(405, { error: 'Método no permitido.' });
    const started = Date.now();
    try {
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ') || authorization.length > 10000) throw new SummaryError('Ingresá a Administración para generar el resumen.', 401);
      if (!env.IP_LIMITER || !env.ADMIN_LIMITER) throw new SummaryError('El servicio de resúmenes no está configurado.', 503);
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      if (!(await env.IP_LIMITER.limit({ key: ip })).success) throw new SummaryError('Esperá un minuto antes de volver a generar el resumen.', 429);
      const { uid } = await verifyToken(authorization.slice(7), env.FIREBASE_PROJECT_ID);
      if (!(await env.ADMIN_LIMITER.limit({ key: uid })).success) throw new SummaryError('Esperá un minuto antes de volver a generar el resumen.', 429);
      const summaries = await generateSummaries(await readEntries(request), env.GEMINI_API_KEY, { fetchImpl, signal: request.signal });
      console.log(JSON.stringify({ event: 'summary_generated', entries: summaries.length, durationMs: Date.now() - started }));
      return reply(200, { summaries });
    } catch (error) {
      const status = error instanceof SummaryError ? error.status : 502;
      // Log outcome only: never tokens, keys, names, prayer text, or provider responses.
      console.warn(JSON.stringify({ event: 'summary_failed', status, durationMs: Date.now() - started }));
      return reply(status, { error: error instanceof SummaryError ? error.message : 'No pudimos generar el resumen. Volvé a intentar.' });
    }
  } };
}

export default createWorker();
