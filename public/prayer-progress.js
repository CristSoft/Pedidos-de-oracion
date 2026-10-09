export const progressStorageKey = 'prayer-personal-progress';

export function prayerVoterKey(storage) {
  let key = storage.getItem('prayer-voter-key');
  if (!/^[a-f0-9]{48}$/.test(key || '')) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
    storage.setItem('prayer-voter-key', key);
  }
  return key;
}

export function setPrayerProgress(storage, number, praying) {
  const values = readPrayerProgress(storage);
  if (praying) values.add(number); else values.delete(number);
  storage.setItem(progressStorageKey, JSON.stringify([...values]));
  return values;
}

export function readPrayerProgress(storage) {
  try {
    const values = JSON.parse(storage.getItem(progressStorageKey) || '[]');
    return new Set(Array.isArray(values) ? values.filter(value => Number.isSafeInteger(value) && value > 0) : []);
  } catch { return new Set(); }
}

export function togglePrayerProgress(storage, number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Pedido sin número.');
  const values = readPrayerProgress(storage);
  if (values.has(number)) values.delete(number); else values.add(number);
  storage.setItem(progressStorageKey, JSON.stringify([...values]));
  return values;
}
