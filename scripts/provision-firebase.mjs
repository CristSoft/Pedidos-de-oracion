import { execSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Agent } from 'node:https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { adminEmail } from '../public/firebase-config.js';
import { scheduleFields } from '../public/schedule.js';

const projectId = 'pedidos-de-oracion-sur';
const credential = {
    async getAccessToken() {
      const access_token = execSync('gcloud auth print-access-token --account adventistasjosecpazsur@gmail.com', {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      }).trim();
      return { access_token, expires_in: 3500 };
    }
};
class ProjectAgent extends Agent {
  addRequest(request, options) {
    request.setHeader('x-goog-user-project', projectId);
    return super.addRequest(request, options);
  }
}
const app = initializeApp({ projectId, credential, httpAgent: new ProjectAgent() });
const auth = getAuth(app);
let user, created = false;
try {
  user = await auth.getUserByEmail(adminEmail);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  const password = randomBytes(24).toString('base64url');
  user = await auth.createUser({ email: adminEmail, password, displayName: 'Equipo de oracion' });
  created = true;
  await mkdir(new URL('../.secrets/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.secrets/admin-access.json', import.meta.url), JSON.stringify({
    email: adminEmail, password, url: 'https://pedidos-de-oracion-sur.web.app/#admin'
  }, null, 2), { flag: 'wx', mode: 0o600 });
}
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, prayerAdmin: true });
const settingsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/prayerSettings/reception`;
const { access_token } = await credential.getAccessToken();
const headers = { Authorization: 'Bearer ' + access_token, 'x-goog-user-project': projectId, 'Content-Type': 'application/json' };
const existing = await fetch(settingsUrl, { headers });
if (existing.status === 404) {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const settings = scheduleFields({ mode: 'open', date, start: '09:00', end: '21:00', timezone: 'America/Argentina/Buenos_Aires' });
  function field(value) {
    if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { stringValue: value };
  }
  const fields = Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, field(value)]));
  const result = await fetch(settingsUrl + '?currentDocument.exists=false', { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  if (!result.ok) throw new Error('No pudimos inicializar la recepcion: HTTP ' + result.status);
} else if (!existing.ok) {
  throw new Error('No pudimos consultar la recepcion: HTTP ' + existing.status);
}
console.log(JSON.stringify({ projectId, adminEmail, created, credentialsFile: created ? '.secrets/admin-access.json' : null }));
