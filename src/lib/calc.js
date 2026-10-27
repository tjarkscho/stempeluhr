// Berechnung Tages-/Wochenzeiten. Wird von App UND GitHub Action (PDF) verwendet.
import { CONFIG } from '../config.js';
import { dayKey, addDays, weekday, mondayOf, isoWeek, hhmm } from './time.js';
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

/** Ein Einsatz gehört bis max. 18 h nach dem Einstempeln zum Einstempel-Tag (auch über Mitternacht) */
export const SHIFT_MS = 18 * 3600 * 1000;

/**
 * Einträge nach Zürcher Datum gruppieren und sortieren.
 * Läuft ein Einsatz über Mitternacht, zählen Pause/Ausstempeln zum Tag des Einstempelns.
 */
export function groupByDay(entries) {
  const map = new Map();
  let shiftDay = null, shiftStart = 0;   // offener Einsatz
  for (const e of [...entries].sort((a, b) => new Date(a.ts) - new Date(b.ts))) {
    const t = new Date(e.ts).getTime();
    let k = dayKey(new Date(t));
    if (e.kind === 'in') { shiftDay = k; shiftStart = t; }
    else if (shiftDay && t - shiftStart < SHIFT_MS) k = shiftDay;
    if (e.kind === 'out') shiftDay = null;
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

  let st = 'off', breakStart = null, lastOutT = null, lastT = null, workStart = null;
  let stampedMs = 0;
  const segs = [];                       // gearbeitete Abschnitte [von, bis] (für Nacht-/Sonntagszuschlag)
  for (const e of events) {
    const t = new Date(e.ts).getTime();
    lastT = t;
    if (e.kind === 'in') {
      if (!r.in) { r.in = new Date(t); r.manualIn = !!e.manual; }
      else if (lastOutT != null) { stampedMs += t - lastOutT; if (e.manual) r.manualPause = true; }
      st = 'work'; workStart = t;
    } else if (e.kind === 'break_start') {
      if (workStart != null) segs.push([workStart, t]);
      breakStart = t; st = 'break'; workStart = null; if (e.manual) r.manualPause = true;
    } else if (e.kind === 'break_end') {
      if (breakStart != null) stampedMs += t - breakStart;
      breakStart = null; st = 'work'; workStart = t; if (e.manual) r.manualPause = true;
    } else if (e.kind === 'out') {
      if (workStart != null) segs.push([workStart, t]);
      lastOutT = t; r.out = new Date(t); r.manualOut = !!e.manual; st = 'off'; workStart = null;
    }
  }
  r.state = st;

  let endT;
  if (st === 'off') {
    endT = lastOutT;
  } else if (isToday || now.getTime() - r.in.getTime() < SHIFT_MS) {
    // laufender Einsatz (auch wenn er nach Mitternacht noch zum Vortag gehört)
    r.open = true;
    endT = now.getTime();
    if (st === 'break' && breakStart != null) stampedMs += endT - breakStart;
    if (st === 'work' && workStart != null) segs.push([workStart, endT]);
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
  r.segs = segs;
  r.overnight = !!(r.out && dayKey(r.out) !== dayKey(r.in));
  return r;
}

/**
 * Zuschlag als Zeitgutschrift, minutengenau nach Uhrzeit (Zürich):
 *  - Samstag (Vertrag): +25 %
 *  - Sonntag/Feiertag (ArG Art. 19/20a, Sonntag = Sa 23:00 – So 23:00): +50 %
 *  - Nacht 23:00–06:00 (ArG Art. 17b, vorübergehende Nachtarbeit): +25 %, zusätzlich zu Sa/So
 * Die gesetzliche Mindestpause wird anteilig abgezogen.
 */
export function surchargeOf(segs, total) {
  let worked = 0, bonus = 0, night = 0, sunday = 0, saturday = 0;
  for (const [a, z] of segs || []) {
    for (let t = a; t < z;) {
      const next = Math.min(z, (Math.floor(t / 3600000) + 1) * 3600000);   // Zürich hat volle Stunden-Offsets
      const min = (next - t) / 60000;
      const d = new Date(t), day = dayKey(d), h = +hhmm(d).slice(0, 2), tomorrow = addDays(day, 1);
      const wd = weekday(day);
      const sun = (wd === 6 && h < 23) || (wd === 5 && h >= 23) || (holidayName(day) && h < 23) || (holidayName(tomorrow) && h >= 23);
      const sat = !sun && wd === 5;
      const nig = h >= 23 || h < 6;
      const rate = (sun ? CONFIG.surcharge.sunday : sat ? CONFIG.surcharge.saturday : 0) + (nig ? CONFIG.surcharge.night : 0);
      worked += min; bonus += min * rate;
      if (nig) night += min;
      if (sun) sunday += min; else if (sat) saturday += min;
      t = next;
    }
  }
  const k = worked > 0 ? Math.min(1, total / worked) : 0;      // Mindestpause anteilig
  return { bonus: Math.round(bonus * k), nightMin: Math.round(night * k), sundayMin: Math.round(sunday * k), saturdayMin: Math.round(saturday * k) };
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
  // Zuschlag (Samstag, Sonntag/Feiertag, Nacht) als Zeitgutschrift
  const sc = counted && !s.open ? surchargeOf(s.segs, s.total) : { bonus: 0, nightMin: 0, sundayMin: 0, saturdayMin: 0 };
  const bonus = sc.bonus;
  const rate = s.total ? bonus / s.total : 0;
  const total = counted ? s.total + t.credit + bonus : 0;
  return { day, ...s, ...t, counted, rate, bonus, nightMin: sc.nightMin, dayTotal: counted ? total : s.total };
}

/** Ist ein Tag "abgeschlossen" (zählt für Stand-heute-Werte)? */
const isDone = (r, today) => (r.day < today && !r.open) || (r.day === today && (r.credit > 0 || (r.in && !r.open)));

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
    if (!r.open) { soll += r.soll; ist += total; }   // laufender Einsatz wird von der App live dazugerechnet
    // "Stand heute": vergangene Tage + heute, sobald ausgestempelt oder abwesend (laufender Einsatz zählt live separat)
    const counts = !sollUntil || (day < sollUntil && !r.open) ||
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
