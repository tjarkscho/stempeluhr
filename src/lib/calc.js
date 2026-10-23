// Berechnung Tages-/Wochenzeiten. Wird von App UND GitHub Action (PDF) verwendet.
import { CONFIG } from '../config.js';
import { dayKey, addDays, weekday, mondayOf, isoWeek } from './time.js';
import { holidayName } from './holidays.js';

/** Mindestpause nach ArG Art. 15 für eine Netto-Arbeitszeit (Minuten) */
export function lawBreak(netMin) {
  if (netMin > 540) return 60; // > 9 h
  if (netMin > 420) return 30; // > 7 h
  if (netMin > 330) return 15; // > 5,5 h
  return 0;
}

/**
 * Abzuziehende Pause: mindestens die gestempelte Pause, mindestens das
 * gesetzliche Minimum für die resultierende Arbeitszeit.
 */
export function effectiveBreak(spanMin, stampedMin) {
  const candidates = [stampedMin, 15, 30, 60].filter((d) => d >= stampedMin).sort((a, b) => a - b);
  for (const d of candidates) if (d >= lawBreak(spanMin - d)) return d;
  return Math.max(stampedMin, 60);
}

/** Einträge nach Zürcher Datum gruppieren und sortieren */
export function groupByDay(entries) {
  const map = new Map();
  for (const e of [...entries].sort((a, b) => new Date(a.ts) - new Date(b.ts))) {
    const k = dayKey(new Date(e.ts));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

/** Prüft eine Tagesfolge. Gibt Fehlertext oder null zurück. */
export function validateDay(events) {
  let st = 'off';
  for (const e of events) {
    const ok =
      (st === 'off' && e.kind === 'in') ||
      (st === 'work' && (e.kind === 'out' || e.kind === 'break_start')) ||
      (st === 'break' && e.kind === 'break_end');
    if (!ok) return `Ungültige Reihenfolge bei ${e.kind === 'in' ? 'Ein' : e.kind === 'out' ? 'Aus' : 'Pause'}`;
    st = e.kind === 'in' || e.kind === 'break_end' ? 'work' : e.kind === 'break_start' ? 'break' : 'off';
  }
  return null;
}

/**
 * Tagesauswertung.
 * @param events  sortierte Einträge des Tages
 * @param isToday offene Zeiten laufen bis `now`
 */
export function dayStats(events, isToday, now = new Date()) {
  const r = {
    in: null, out: null, stamped: 0, pause: 0, total: 0, span: 0,
    open: false, incomplete: false, state: 'off',
    manualIn: false, manualOut: false, manualPause: false, autoPause: false,
  };
  if (!events?.length) return r;

  let st = 'off', breakStart = null, lastOutT = null, lastT = null;
  let stampedMs = 0;
  for (const e of events) {
    const t = new Date(e.ts).getTime();
    lastT = t;
    if (e.kind === 'in') {
      if (!r.in) { r.in = new Date(t); r.manualIn = !!e.manual; }
      else if (lastOutT != null) { stampedMs += t - lastOutT; if (e.manual) r.manualPause = true; }
      st = 'work';
    } else if (e.kind === 'break_start') {
      breakStart = t; st = 'break'; if (e.manual) r.manualPause = true;
    } else if (e.kind === 'break_end') {
      if (breakStart != null) stampedMs += t - breakStart;
      breakStart = null; st = 'work'; if (e.manual) r.manualPause = true;
    } else if (e.kind === 'out') {
      lastOutT = t; r.out = new Date(t); r.manualOut = !!e.manual; st = 'off';
    }
  }
  r.state = st;

  let endT;
  if (st === 'off') {
    endT = lastOutT;
  } else if (isToday) {
    r.open = true;
    endT = now.getTime();
    if (st === 'break' && breakStart != null) stampedMs += endT - breakStart;
  } else {
    // vergessen auszustempeln -> nur bis zum letzten Stempel zählen, markieren
    r.incomplete = true;
    endT = lastT;
    r.out = null;
  }

  r.span = Math.max(0, Math.round((endT - r.in.getTime()) / 60000));
  r.stamped = Math.round(stampedMs / 60000);
  // auch am laufenden Tag gleich die gesetzliche Mindestpause berücksichtigen (keine Sprünge beim Ausstempeln)
  r.pause = effectiveBreak(r.span, r.stamped);
  r.autoPause = r.pause > r.stamped;
  r.total = Math.max(0, r.span - r.pause);
  return r;
}

/** Soll- und Gutschrift-Minuten für einen Tag */
export function dayTargets(day, absences) {
  const isWorkday = weekday(day) < 5 && day >= CONFIG.startDate;
  const soll = isWorkday ? CONFIG.sollDayMin : 0;
  let credit = 0, label = null;
  if (isWorkday) {
    const hol = holidayName(day);
    const abs = absences.get(day);
    if (hol) { credit = CONFIG.sollDayMin; label = hol; }
    else if (abs === 'ferien') { credit = CONFIG.sollDayMin; label = 'Ferien'; }
    else if (abs === 'ferien_halb') { credit = CONFIG.sollDayMin / 2; label = '½ Ferien'; }
    else if (abs === 'krank') { credit = CONFIG.sollDayMin; label = 'Krank'; }
  }
  return { soll, credit, label };
}

/** Auswertung eines einzelnen Tages inkl. Gutschrift und Zuschlag */
export function dayRecord(day, byDay, absences, now = new Date()) {
  const today = dayKey(now);
  const i = weekday(day);
  const s = dayStats(byDay.get(day), day === today, now);
  const t = dayTargets(day, absences);
  const counted = day >= CONFIG.startDate; // vor Start: nur anzeigen, nicht zählen
  // Zuschlag: Samstag +25 %, Sonntag/Feiertag +50 % (als Zeitgutschrift)
  const rate = i === 6 || holidayName(day) ? CONFIG.surcharge.sunday : i === 5 ? CONFIG.surcharge.saturday : 0;
  const bonus = counted && !s.open ? Math.round(s.total * rate) : 0;
  const total = counted ? s.total + t.credit + bonus : 0;
  return { day, ...s, ...t, counted, rate, bonus, dayTotal: counted ? total : s.total };
}

/** Ist ein Tag "abgeschlossen" (zählt für Stand-heute-Werte)? */
const isDone = (r, today) => r.day < today || (r.day === today && (r.credit > 0 || (r.in && !r.open)));

/**
 * Auswertung eines beliebigen Zeitraums (Monat, Jahr). Zählt nur abgeschlossene Tage.
 * @returns { days, soll, ist, diff, bonus, vacation, sick, partial }
 */
export function rangeStats(from, to, byDay, absences, now = new Date()) {
  const today = dayKey(now);
  const days = [];
  let soll = 0, ist = 0, bonus = 0, vacation = 0, sick = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = dayRecord(d, byDay, absences, now);
    r.done = isDone(r, today);
    days.push(r);
    if (!r.counted || !r.done) continue;
    soll += r.soll; ist += r.dayTotal; bonus += r.bonus;
    if (r.label === 'Ferien') vacation += 1;
    if (r.label === '½ Ferien') vacation += 0.5;
    if (r.label === 'Krank') sick += 1;
  }
  return { from, to, days, soll, ist, diff: ist - soll, bonus, vacation, sick, partial: to >= today };
}

/** Saldo vom Startdatum bis inkl. `day` (höchstens bis heute) */
export function saldoAt(day, byDay, absences, now = new Date()) {
  const today = dayKey(now);
  const end = day < today ? day : today;
  if (end < CONFIG.startDate) return 0;
  return rangeStats(CONFIG.startDate, end, byDay, absences, now).diff;
}

/**
 * Wochenauswertung.
 * @param monday   'YYYY-MM-DD'
 * @param byDay    Map aus groupByDay
 * @param absences Map 'YYYY-MM-DD' -> 'ferien' | 'ferien_halb' | 'krank'
 * @param sollUntil optional: Soll nur bis inkl. diesem Tag zählen (laufende Woche)
 */
export function weekStats(monday, byDay, absences, now = new Date(), sollUntil = null) {
  const today = dayKey(now);
  const days = [];
  let soll = 0, ist = 0, sollToDate = 0, istToDate = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const r = dayRecord(day, byDay, absences, now);
    const total = r.counted ? r.dayTotal : 0;
    days.push(r);
    soll += r.soll;
    ist += total;
    // "Stand heute": vergangene Tage + heute, sobald ausgestempelt oder abwesend
    const counts = !sollUntil || day < sollUntil ||
      (day === sollUntil && (r.credit > 0 || (r.in && !r.open)));
    if (counts) { sollToDate += r.soll; istToDate += total; }
  }
  const { year, week } = isoWeek(monday);
  const bonus = days.reduce((a, d) => a + d.bonus, 0);
  return { bonus, monday, sunday: addDays(monday, 6), year, week, days, soll, ist, diff: ist - soll, sollToDate, istToDate, diffToDate: istToDate - sollToDate };
}

/** Kumulierter Saldo vom Startdatum bis inkl. Woche `monday` (laufende Woche: Soll nur bis heute) */
export function saldoThrough(monday, byDay, absences, now = new Date()) {
  const today = dayKey(now);
  const currentMonday = mondayOf(today);
  let saldo = 0;
  for (let m = mondayOf(CONFIG.startDate); m <= monday; m = addDays(m, 7)) {
    const w = weekStats(m, byDay, absences, now, m === currentMonday ? today : null);
    saldo += m === currentMonday ? w.diffToDate : w.diff;
  }
  return saldo;
}
