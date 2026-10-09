// Grouping and formatting stay in the browser; the backend alone holds the API key.
const cleanName = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const nameKey = value => cleanName(value).toLocaleLowerCase('es');
const plain = value => String(value).replace(/[*_~`]/g, '').trim();

export function groupRequests(requests) {
  const groups = new Map();
  for (const [index, request] of requests.entries()) {
    const name = request.private ? 'Anónimo' : cleanName(request.name) || 'Anónimo';
    // Anonymous entries cannot be attributed to the same person.
    const anonymous = request.private || nameKey(name) === 'anónimo';
    const key = anonymous ? `anonymous:${index}` : `name:${nameKey(name)}`;
    if (!groups.has(key)) groups.set(key, { name, anonymous, requests: [] });
    groups.get(key).requests.push({ id: `pedido-${index + 1}`, number: request.number,
      reasons: request.reasons.map(reason => reason.text) });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function formatSummary(groups, summaries) {
  return groups.map(group => {
    const title = group.anonymous ? `Anónimo · Pedido #${group.requests[0].number}` : plain(group.name);
    const count = group.requests.length;
    const intro = count > 1 ? `_Tiene ${count} pedidos de oración._\n` : '';
    const paragraphs = group.requests.map(request => {
      const text = summaries.get(request.id);
      if (typeof text !== 'string' || !text.trim()) throw new Error('El resumen está incompleto. Volvé a generarlo.');
      return plain(text);
    });
    return `*${title}:*\n${intro}${paragraphs.join('\n')}`;
  }).join('\n\n');
}

export async function summarizeRequests(requests, generateBatch, { signal, onProgress = () => {} } = {}) {
  if (!requests.length) throw new Error('No hay pedidos para compartir.');
  const groups = groupRequests(requests);
  const entries = groups.flatMap(group => group.requests.map(({ id, reasons }) => ({ id, name: group.name, reasons })));
  const batches = []; let batch = [], size = 0;
  for (const entry of entries) {
    const length = JSON.stringify(entry).length;
    if (batch.length && (size + length > 18000 || batch.length >= 20)) { batches.push(batch); batch = []; size = 0; }
    batch.push(entry); size += length;
  }
  if (batch.length) batches.push(batch);
  const summaries = new Map();
  for (const [index, items] of batches.entries()) {
    signal?.throwIfAborted();
    onProgress(index + 1, batches.length);
    const response = await generateBatch(items, { signal });
    signal?.throwIfAborted();
    const result = response?.summaries;
    const expected = new Set(items.map(item => item.id));
    if (!Array.isArray(result) || result.length !== items.length) throw new Error('El resumen está incompleto. Volvé a generarlo.');
    for (const item of result) {
      if (!item || !expected.delete(item.id) || typeof item.text !== 'string' || !plain(item.text) || item.text.length > 6000) {
        throw new Error('El resumen está incompleto. Volvé a generarlo.');
      }
      summaries.set(item.id, item.text);
    }
    if (expected.size) throw new Error('El resumen está incompleto. Volvé a generarlo.');
  }
  return formatSummary(groups, summaries);
}
