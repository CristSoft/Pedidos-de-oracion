function wallTime(milliseconds, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(milliseconds)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export function scheduleInstant(date, time, timezone) {
  const desired = `${date}T${time}:00`;
  const wall = Date.parse(desired + 'Z');
  let instant = wall;
  // Resolve the timezone offset without assuming a fixed UTC offset or ignoring DST.
  for (let attempt = 0; attempt < 4; attempt++) {
    instant += wall - Date.parse(wallTime(instant, timezone) + 'Z');
  }
  if (!Number.isFinite(instant) || wallTime(instant, timezone) !== desired) {
    throw new Error('Elegí una fecha y un horario válidos para la zona horaria de la iglesia.');
  }
  return new Date(instant);
}
export function scheduleFields(settings) {
  const days = settings.days ?? [7, 1, 2];
  if (!['open', 'closed', 'weekly'].includes(settings.mode)
    || !Array.isArray(days) || !days.length || days.length > 7
    || days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new Error('Elegí al menos un día de la semana.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.start)
    || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(settings.end)
    || settings.start >= settings.end) {
    throw new Error('Elegí un horario de cierre posterior al de apertura.');
  }
  return {
    mode: settings.mode, days: [...new Set(days)].sort((a, b) => a - b),
    start: settings.start, end: settings.end,
    startMinute: timeMinutes(settings.start), endMinute: timeMinutes(settings.end),
    timezone: 'America/Argentina/Buenos_Aires'
  };
}
function timeMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
export function receptionDays(settings) {
  if (Array.isArray(settings.days)) return settings.days;
  if (settings.mode === 'scheduled' && settings.date) {
    return [new Date(settings.date + 'T12:00:00Z').getUTCDay() || 7];
  }
  return [7, 1, 2];
}
export function isReceptionOpen(settings, instant = new Date()) {
  if (settings.mode === 'open') return true;
  if (settings.mode === 'closed') return false;
  if (settings.mode === 'scheduled') {
    // Keep existing date-based settings in effect until the administrator saves the weekly schedule.
    return instant >= scheduleInstant(settings.date, settings.start, settings.timezone)
      && instant < scheduleInstant(settings.date, settings.end, settings.timezone);
  }
  if (settings.mode !== 'weekly') return false;
  const local = new Date(instant.getTime() - 3 * 60 * 60 * 1000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return settings.days.includes(local.getUTCDay() || 7)
    && minute >= settings.startMinute && minute < settings.endMinute;
}
