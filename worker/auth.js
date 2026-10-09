import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SummaryError } from '../shared/gemini-summary.js';

// Cache only Google's public signing keys. User tokens and secrets are request-scoped.
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function verifyFirebaseAdminToken(token, projectId, { keys = googleKeys, now = new Date() } = {}) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      algorithms: ['RS256'], issuer: `https://securetoken.google.com/${projectId}`, audience: projectId,
      requiredClaims: ['exp', 'iat', 'sub', 'auth_time'], currentDate: now
    }));
    const seconds = now.getTime() / 1000;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128
      || !Number.isInteger(payload.iat) || payload.iat > seconds || !Number.isInteger(payload.auth_time)
      || payload.auth_time <= 0 || payload.auth_time > seconds) throw new Error();
  } catch (error) {
    if (['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'].includes(error.code) || error instanceof TypeError) {
      throw new SummaryError('No pudimos verificar tu sesión. Volvé a intentar.', 503);
    }
    throw new SummaryError('Tu sesión no es válida o venció. Volvé a ingresar a Administración.', 401);
  }
  if (payload.prayerAdmin !== true) throw new SummaryError('Solo administración puede generar resúmenes.', 403);
  return { uid: payload.sub };
}
