// Zeit-Hilfsfunktionen, immer in Europe/Zurich (unabhängig von der Gerätezeitzone)
export const TZ = 'Europe/Zurich';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(d) {
  const p = {};
  for (const x of dtf.formatToParts(d)) p[x.type] = x.value;
  return p;
}

/** 'YYYY-MM-DD' des Datums in Zürich */
export function dayKey(d) {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'HH:MM' in Zürich */
export function hhmm(d) {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

/** Lokale Zürcher Zeit ('YYYY-MM-DD', 'HH:MM') -> Date (UTC-korrekt, auch bei Sommer/Winterzeit) */
export function zurichToDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, h, mi);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += target - asUtc;
  }
  return new Date(guess);
}

// ---- reine Datums-Arithmetik auf 'YYYY-MM-DD' ----
const toUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (t) => new Date(t).toISOString().slice(0, 10);

export function addDays(s, n) { return fromUtc(toUtc(s) + n * 86400000); }
/** 0 = Montag … 6 = Sonntag */
export function weekday(s) { return (new Date(toUtc(s)).getUTCDay() + 6) % 7; }
export function mondayOf(s) { return addDays(s, -weekday(s)); }
export function diffDays(a, b) { return Math.round((toUtc(b) - toUtc(a)) / 86400000); }

/** ISO-Kalenderwoche { year, week } */
export function isoWeek(s) {
  const thursday = addDays(s, 3 - weekday(s));
  const year = +thursday.slice(0, 4);
  const week = 1 + Math.floor(diffDays(`${year}-01-01`, thursday) / 7);
  return { year, week };
}

export function fmtDate(s) { const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; }
export const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Minuten -> 'H:MM' bzw. '+H:MM' / '-H:MM' */
export function fmtMin(min, signed = false) {
  const m = Math.round(min);
  const sign = m < 0 ? '-' : (signed ? '+' : '');
  const a = Math.abs(m);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}
