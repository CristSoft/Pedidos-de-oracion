import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function feedFields(fields) {
  const names = ['name', 'private', 'reasons', 'createdAt', 'status'];
  if (names.some(name => !fields[name])) throw new Error('Pedido incompleto: no se puede publicar.');
  if (fields.number) names.push('number');
  return Object.fromEntries(names.map(name => [name,
    name === 'name' && fields.private.booleanValue === true ? { stringValue: 'Anónimo' } : fields[name]]));
}

async function backfill() {
  const projectId = 'pedidos-de-oracion-sur';
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = 'https://firestore.googleapis.com/v1/';
  const token = execSync('gcloud auth print-access-token --account=adventistasjosecpazsur@gmail.com', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
  const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': projectId, 'Content-Type': 'application/json' };
  async function read(url) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Firestore: HTTP ${response.status}`);
    return response.json();
  }
  let pageToken = '', published = 0;
  do {
    const url = new URL(base + root + '/prayerRequests');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await read(url);
    for (let source of page.documents || []) {
      if (!source.name.startsWith(root + '/prayerRequests/')) throw new Error('Colección inesperada.');
      for (let attempt = 0; attempt < 3; attempt++) {
        const publicId = source.fields.publicId?.stringValue || randomBytes(16).toString('hex');
        if (!/^[a-f0-9]{32}$/.test(publicId)) throw new Error('Identificador público inválido.');
        // Preserve the source and publish only the explicitly shared fields.
        const writes = [
          { update: { name: root + '/prayerFeed/' + publicId, fields: feedFields(source.fields) } },
          { update: { name: root + '/prayerOwners/' + publicId, fields: { key: { stringValue: source.name.split('/').pop() } } } },
          { update: { name: source.name, fields: { publicId: { stringValue: publicId } } },
            updateMask: { fieldPaths: ['publicId'] }, currentDocument: { updateTime: source.updateTime } }
        ];
        const response = await fetch(base + root + ':commit', { method: 'POST', headers, body: JSON.stringify({ writes }) });
        if (response.ok) { published++; break; }
        const error = await response.json();
        if (attempt === 2 || !['ABORTED', 'FAILED_PRECONDITION'].includes(error.error?.status)) throw new Error(`Firestore: HTTP ${response.status}`);
        source = await read(base + source.name);
      }
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  console.log(JSON.stringify({ projectId, published, confidentialNamesHidden: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await backfill();
