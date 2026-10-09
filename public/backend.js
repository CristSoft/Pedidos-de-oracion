const cloud = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  || new URLSearchParams(location.search).has('firebase');
let firebase;
async function provider() {
  firebase ||= import('./firebase-backend.js');
  return firebase;
}
export async function backendApi(url, method = 'GET', data, token = '') {
  if (cloud) return (await provider()).api(url, method, data);
  const response = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'No pudimos completar la operación.');
    error.status = response.status;
    throw error;
  }
  return result;
}
export async function restoreAdminSession() {
  return cloud ? (await provider()).restoreAdminSession() : null;
}
export async function logoutAdmin() {
  if (cloud) await (await provider()).logoutAdmin();
}
