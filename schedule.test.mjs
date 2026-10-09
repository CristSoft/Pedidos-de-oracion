import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleInstant, scheduleFields, isReceptionOpen, receptionDays } from './public/schedule.js';

test('El horario de la iglesia se convierte a UTC con zona horaria y cambios de horario', () => {
  assert.equal(scheduleInstant('2026-10-07', '09:00', 'America/Argentina/Buenos_Aires').toISOString(), '2026-10-07T12:00:00.000Z');
  assert.equal(scheduleInstant('2026-01-10', '09:00', 'Europe/Madrid').toISOString(), '2026-01-10T08:00:00.000Z');
  assert.equal(scheduleInstant('2026-07-10', '09:00', 'Europe/Madrid').toISOString(), '2026-07-10T07:00:00.000Z');
  assert.throws(() => scheduleInstant('2026-03-29', '02:30', 'Europe/Madrid'));
  assert.throws(() => scheduleInstant('2026-02-30', '09:00', 'UTC'));
  assert.throws(() => scheduleFields({ mode: 'weekly', days: [1], start: '10:00', end: '09:00' }));
});
test('La recepcion semanal se repite, respeta Argentina y excluye el cierre', () => {
  const settings = scheduleFields({ mode: 'weekly', days: [7,1,2,1], start: '09:00', end: '21:00' });
  assert.deepEqual(settings.days, [1,2,7]);
  assert.equal(isReceptionOpen(settings, new Date('2026-10-11T11:59:59Z')), false);
  assert.equal(isReceptionOpen(settings, new Date('2026-10-11T12:00:00Z')), true);
  assert.equal(isReceptionOpen(settings, new Date('2026-10-13T23:59:59Z')), true);
  assert.equal(isReceptionOpen(settings, new Date('2026-10-14T00:00:00Z')), false);
  assert.equal(isReceptionOpen(settings, new Date('2026-10-14T12:00:00Z')), false);
  assert.equal(isReceptionOpen(settings, new Date('2026-10-18T12:00:00Z')), true);
  const allDay = scheduleFields({ mode: 'weekly', days: [7], start: '00:00', end: '24:00' });
  assert.equal(isReceptionOpen(allDay, new Date('2026-10-11T02:59:59Z')), false);
  assert.equal(isReceptionOpen(allDay, new Date('2026-10-11T03:00:00Z')), true);
  assert.equal(isReceptionOpen(allDay, new Date('2026-10-12T02:59:59Z')), true);
  assert.equal(isReceptionOpen(allDay, new Date('2026-10-12T03:00:00Z')), false);
  assert.throws(() => scheduleFields({ ...settings, days: [] }));
  assert.throws(() => scheduleFields({ ...settings, days: [8] }));
  assert.throws(() => scheduleFields({ ...settings, days: ['1'] }));
  assert.throws(() => scheduleFields({ ...settings, start: '24:00' }));
  assert.throws(() => scheduleFields({ ...settings, end: '24:01' }));
  assert.equal(isReceptionOpen({ ...settings, mode: 'open' }), true);
  assert.equal(isReceptionOpen({ ...settings, mode: 'closed' }), false);
  assert.deepEqual(receptionDays({ mode: 'scheduled', date: '2026-10-07' }), [3]);
});
