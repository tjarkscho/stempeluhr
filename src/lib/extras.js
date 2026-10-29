// Zusatz-Infos: Ferienkonto, Feiertage/Brückentage, Prognose, Statistiken, Saldo in Franken
import { CONFIG } from '../config.js';
import { dayKey, addDays, weekday, hhmm } from './time.js';
import { holidaysOf } from './holidays.js';
import { dayRecord, dayTargets, saldoAt } from './calc.js';

/** Saldo in Franken (Minuten × Stundenlohn) */
export const toChf = (min) => (min / 60) * CONFIG.hourlyRate;
export function fmtChf(min, signed = true) {
  const v = toChf(min);
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${signed ? (v < -0.004 ? '−' : v > 0.004 ? '+' : '') : ''}${s} Fr.`;
}

/**
 * Ferienkonto laut Vertrag: Anspruch pro Kalenderjahr, im Eintrittsjahr anteilig (auf ½ Tag gerundet).
 * genommen = Ferien + ½ Ferien im Jahr. Betriebsferien zwischen Weihnachten und Neujahr werden separat ausgewiesen.
 */
export function vacationAccount(year, absences) {
  const start = CONFIG.employmentStart;
  const [sy, sm] = start.split('-').map(Number);
  let months = 12;
  if (year < sy) months = 0;
  else if (year === sy) months = 13 - sm;                        // Eintrittsmonat zählt voll
  const entitlement = Math.round((CONFIG.vacationDays * months / 12) * 2) / 2;
  let taken = 0, planned = 0;
  const today = dayKey(new Date());
  for (const [d, k] of absences) {
    if (!d.startsWith(String(year))) continue;
    const v = k === 'ferien' ? 1 : k === 'ferien_halb' ? 0.5 : 0;
    if (d <= today) taken += v; else planned += v;
  }
  // Betriebsferien: Werktage zwischen 25.12. und 1.1., die keine Feiertage sind und nicht schon als Ferien eingetragen
  let closure = 0;
  const hol = holidaysOf(year);
  for (let d = `${year}-12-24`; d <= `${year}-12-31`; d = addDays(d, 1)) {
    if (weekday(d) < 5 && !hol.has(d) && d !== `${year}-12-24` && !absences.get(d)) closure++;
  }
  return { entitlement, taken, planned, used: taken + planned, left: entitlement - taken - planned, closure };
}

/** Nächste Feiertage ab heute (inkl. Brückentag-Hinweis) */
export function upcomingHolidays(today = dayKey(new Date()), n = 3) {
  const y = +today.slice(0, 4);
  const all = [...holidaysOf(y), ...holidaysOf(y + 1)].filter(([d]) => d >= today).sort(([a], [b]) => a.localeCompare(b));
  return all.slice(0, n).map(([d, name]) => {
    const wd = weekday(d);
    let bridge = null;
    if (wd === 3 && !holidaysOf(+d.slice(0, 4)).has(addDays(d, 1))) bridge = addDays(d, 1);       // Do -> Fr
    if (wd === 1 && !holidaysOf(+d.slice(0, 4)).has(addDays(d, -1))) bridge = addDays(d, -1);      // Di -> Mo
    return { day: d, name, weekday: wd, bridge, inDays: Math.round((Date.parse(d) - Date.parse(today)) / 86400000) };
  });
}

/**
 * Prognose Saldo am Monatsende: aktueller Saldo + Ø Tagesdifferenz der letzten (max. 10) abgeschlossenen Arbeitstage
 * × verbleibende Arbeitstage (ohne Feiertage/Ferien).
 */
export function forecastMonthEnd(byDay, absences, now = new Date(), liveDiff = 0) {
  const today = dayKey(now);
  const saldo = saldoAt(addDays(today, -1), byDay, absences, now) + liveDiff;
  const diffs = [];
  for (let d = addDays(today, -1); diffs.length < 10 && d >= CONFIG.startDate; d = addDays(d, -1)) {
    const t = dayTargets(d, absences);
    if (!t.soll || t.credit) continue;
    const r = dayRecord(d, byDay, absences, now);
    if (!r.in || r.incomplete) continue;
    diffs.push(r.dayTotal - r.soll);
  }
  if (diffs.length < 3) return null;                              // zu wenig Daten
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  let rest = 0;
  for (let d = addDays(today, 1); d <= last; d = addDays(d, 1)) {
    const t = dayTargets(d, absences);
    if (t.soll && !t.credit) rest++;
  }
  return { saldo, avg, rest, value: Math.round(saldo + avg * rest), monthEnd: last };
}

/** Kleine Statistiken über alle abgeschlossenen Tage */
export function workStats(byDay, absences, now = new Date()) {
  const today = dayKey(now);
  const days = [];
  for (const d of byDay.keys()) {
    if (d < CONFIG.startDate || d >= today) continue;
    const r = dayRecord(d, byDay, absences, now);
    if (!r.in || r.open) continue;
    days.push(r);
  }
  if (!days.length) return null;
  const minOfDay = (dt) => { const [h, m] = hhmm(dt).split(':').map(Number); return h * 60 + m; };
  const by = (f, cmp) => days.reduce((a, b) => (cmp(f(b), f(a)) ? b : a));
  const done = days.filter((r) => r.out);
  const earliest = by((r) => minOfDay(r.in), (a, b) => a < b);
  const latest = done.length ? by((r) => minOfDay(r.out), (a, b) => a > b) : null;
  const longest = by((r) => r.total, (a, b) => a > b);
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  // Serie: Arbeitstage in Folge (rückwärts ab gestern) ohne vergessenes Ausstempeln / Korrektur
  let streak = 0;
  for (let d = addDays(today, -1); d >= CONFIG.startDate; d = addDays(d, -1)) {
    const t = dayTargets(d, absences);
    if (!t.soll || t.credit) continue;
    const r = dayRecord(d, byDay, absences, now);
    if (!r.in || r.incomplete || r.manualIn || r.manualOut) break;
    streak++;
  }
  return {
    count: days.length,
    earliest: { day: earliest.day, time: hhmm(earliest.in) },
    latest: latest && { day: latest.day, time: hhmm(latest.out) },
    longest: { day: longest.day, min: longest.total },
    avgWork: avg(days.map((r) => r.total)),
    avgPause: avg(days.map((r) => r.pause)),
    avgIn: avg(days.map((r) => minOfDay(r.in))),
    avgOut: done.length ? avg(done.map((r) => minOfDay(r.out))) : null,
    streak,
  };
}

/** Tageszeit für den Hintergrund */
export function timeOfDay(now = new Date()) {
  const h = +hhmm(now).slice(0, 2);
  return h >= 5 && h < 11 ? 'morgen' : h >= 11 && h < 17 ? 'tag' : h >= 17 && h < 21 ? 'abend' : 'nacht';
}
