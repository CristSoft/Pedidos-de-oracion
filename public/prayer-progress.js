export const progressStorageKey = 'prayer-personal-progress';

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
