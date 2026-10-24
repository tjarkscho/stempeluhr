import { createClient } from '@supabase/supabase-js';
import './style.css';
import { CONFIG } from './config.js';
import {
  dayKey, hhmm, zurichToDate, addDays, weekday, mondayOf, isoWeek,
  fmtDate, fmtMin,
} from './lib/time.js';
import { prefs, setPref, applyPrefs, T, label, THEMES } from './i18n.js';
import { holidayName } from './lib/holidays.js';
import { groupByDay, dayStats, dayTargets, weekStats, saldoThrough, validateDay, rangeStats, saldoAt, dayRecord, lawBreak } from './lib/calc.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.getElementById('app');
applyPrefs();

if (!URL_ || !KEY) {
  app.innerHTML = `<div class="center"><div class="card"><h2>Konfiguration fehlt</h2>
  <p>VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in <code>.env</code> setzen (siehe README).</p></div></div>`;
  document.getElementById('splash')?.remove();
  throw new Error('Supabase env fehlt');
}

const sb = createClient(URL_, KEY);

const S = {
  user: null,
  entries: [],
  byDay: new Map(),
  absences: new Map(),
  reports: [],
  view: 'stamp',
  weekMonday: mondayOf(dayKey(new Date())),
  calYear: Math.max(CONFIG.calendarFrom, +dayKey(new Date()).slice(0, 4)),
  calMonth: +dayKey(new Date()).slice(5, 7) - 1,
  drawer: false,
  settings: false,
  archTab: 'weeks',
  chartSel: null,
  editor: null,   // { day, rows: [{id?, kind, time}] }
  busy: false,
  toast: null,
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Minimalistische Linien-Icons
const ICON = {
  cal: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7z"/><path d="M4 4l16 16"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  out: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10"/></svg>',
};

function toast(msg, err = false) {
  S.toast = { msg, err };
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { S.toast = null; render(); }, 3500);
}

// ---------------- Daten ----------------
// ---------------- Offline: Cache + Warteschlange ----------------
const QKEY = 'stempeluhr.queue', CKEY = 'stempeluhr.cache';
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll/gesperrt */ } };
const isNetErr = (e) => !navigator.onLine || /fetch|network|load failed|timeout/i.test(e?.message || String(e));

function queue() { return lsGet(QKEY, []); }
function setEntries(serverRows) {
  // ausstehende Offline-Stempel sichtbar mitführen
  const pending = queue().map((r, i) => ({ id: `q${i}`, ...r, manual: false, pending: true }));
  S.entries = [...serverRows, ...pending].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  S.byDay = groupByDay(S.entries);
}
function saveCache() {
  lsSet(CKEY, { entries: S.entries.filter((e) => !e.pending), absences: [...S.absences], reports: S.reports });
}
function loadCache() {
  const c = lsGet(CKEY, null);
  if (!c) return false;
  setEntries(c.entries || []); S.absences = new Map(c.absences || []); S.reports = c.reports || [];
  return true;
}
let flushing = false;
async function flushQueue() {
  const q = queue();
  if (!q.length || flushing || !navigator.onLine) return;
  flushing = true;
  const { error } = await sb.from('entries').insert(q);
  flushing = false;
  if (error) return;
  lsSet(QKEY, []);
  await loadEntries().catch(() => {});
  toast(T().synced(q.length));
}

async function loadEntries() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('entries').select('id,kind,ts,manual').order('ts').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  setEntries(all);
  saveCache();
}
async function loadAbsences() {
  const { data, error } = await sb.from('absences').select('day,kind');
  if (error) throw error;
  S.absences = new Map(data.map((a) => [a.day, a.kind]));
  saveCache();
}
async function loadReports() {
  const { data, error } = await sb.from('weekly_reports').select('*').order('week_start', { ascending: false });
  if (error) throw error;
  S.reports = data;
}
async function loadAll() {
  loadCache();
  const hadCache = S.entries.length > 0;
  countUpNext = hadCache;                     // mit Cache sofort hochzählen, sonst nach dem Laden
  render();                      // sofort aus dem Cache anzeigen
  await flushQueue();
  try { await Promise.all([loadEntries(), loadAbsences(), loadReports()]); saveCache(); }
  catch (e) { if (!isNetErr(e)) toast(T().loadFailed + e.message, true); }
  if (!hadCache) countUpNext = true;
  render();
}

// ---------------- Stempeln ----------------
function todayInfo() {
  const now = new Date();
  const today = dayKey(now);
  const events = S.byDay.get(today) || [];
  const st = dayStats(events, true, now);
  // offener Vortag?
  const last = S.entries[S.entries.length - 1];
  const lastDay = last ? dayKey(new Date(last.ts)) : null;
  const forgot = last && lastDay !== today && last.kind !== 'out' ? lastDay : null;
  return { now, today, events, st, forgot };
}

// Haptik: Android per vibrate; iOS (Safari 18+) über den nativen Schalter-Trick
function haptic() {
  try { if (navigator.vibrate) { navigator.vibrate(35); return; } } catch { /* egal */ }
  try {
    let lab = document.getElementById('hap');
    if (!lab) {
      lab = document.createElement('label'); lab.id = 'hap'; lab.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;overflow:hidden';
      lab.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(lab);
    }
    lab.click();
  } catch { /* egal */ }
}

// Bestätigung nach dem Stempeln: Häkchen zeichnet sich, kurz halten, ausblenden
function confirmStamp(kind, ts, offline) {
  const L = T();
  const color = { in: 'var(--go)', out: 'var(--stop)', break_start: 'var(--pause)', break_end: 'var(--go)' }[kind];
  document.querySelector('.confirm')?.remove();
  const el = document.createElement('div');
  el.className = 'confirm';
  el.style.setProperty('--cc', color);
  el.innerHTML = `<div class="confirm-box">
    <svg viewBox="0 0 64 64" width="84" height="84"><circle class="cc-ring" cx="32" cy="32" r="28"/><path class="cc-check" d="M19 33.5l8.5 8.5L45.5 23"/></svg>
    <b>${L.done[kind]}</b><span>${L.at(hhmm(ts))}${offline ? `<br>${L.offlineSaved}` : ''}</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1250);
  setTimeout(() => el.remove(), 1650);
}

async function stamp(kinds) {
  if (S.busy) return;
  haptic();
  S.busy = true; render();
  const ts = new Date();
  const rows = kinds.map((kind, i) => ({ kind, ts: new Date(ts.getTime() + i * 1000).toISOString() }));
  let error = null;
  if (navigator.onLine && !queue().length) {
    try { ({ error } = await sb.from('entries').insert(rows)); } catch (e) { error = e; }
  } else error = new Error('offline');
  S.busy = false;
  if (error && !isNetErr(error) && error.message !== 'offline') return toast(T().error + error.message, true);
  const lastKind = kinds[kinds.length - 1];
  if (error) {
    // offline -> lokal merken, später hochladen
    lsSet(QKEY, [...queue(), ...rows]);
    setEntries(S.entries.filter((e) => !e.pending));
    render();
    return confirmStamp(lastKind, ts, true);
  }
  confirmStamp(lastKind, ts, false);
  await loadEntries().catch(() => {});
  render();
}

// ---------------- Wisch-Regler (Touch) / Knopf (Maus) ----------------
const touchUI = () => matchMedia('(pointer: coarse)').matches;
function stampControl(act, cls, label, slideLabel) {
  if (!touchUI()) return `<button class="big ${cls}" data-act="${act}" ${S.busy ? 'disabled' : ''}>${label}</button>`;
  return `<div class="slider ${cls}" data-slide="${act}" ${S.busy ? 'aria-disabled="true"' : ''}>
    <span class="slider-fill"></span><span class="slider-label">${slideLabel}</span>
    <span class="slider-knob"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
  </div>`;
}
let slide = null;
app.addEventListener('pointerdown', (e) => {
  const knob = e.target.closest('.slider-knob');
  if (!knob || S.busy) return;
  const sl = knob.closest('.slider');
  const max = sl.clientWidth - knob.offsetWidth - 8;
  slide = { sl, knob, x0: e.clientX, max, act: sl.dataset.slide, dx: 0 };
  knob.setPointerCapture(e.pointerId);
  sl.classList.add('dragging');
});
app.addEventListener('pointermove', (e) => {
  if (!slide) return;
  slide.dx = Math.max(0, Math.min(slide.max, e.clientX - slide.x0));
  const p = slide.dx / slide.max;
  slide.knob.style.transform = `translateX(${slide.dx}px)`;
  slide.sl.style.setProperty('--p', p.toFixed(3));
});
const endSlide = () => {
  if (!slide) return;
  const s_ = slide; slide = null;
  s_.sl.classList.remove('dragging');
  if (s_.dx / s_.max > 0.85) {
    s_.knob.style.transform = `translateX(${s_.max}px)`;
    s_.sl.style.setProperty('--p', '1');
    if (s_.act === 'in') stamp(['in']);
    else if (s_.act === 'out') stamp(todayInfo().st.state === 'break' ? ['break_end', 'out'] : ['out']);
  } else {
    s_.knob.animate([{ transform: `translateX(${s_.dx}px)` }, { transform: 'translateX(0)' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    s_.knob.style.transform = '';
    s_.sl.style.setProperty('--p', '0');
  }
};
app.addEventListener('pointerup', endSlide);
app.addEventListener('pointercancel', endSlide);

/** Differenz des noch laufenden heutigen Tages (0, wenn nicht eingestempelt) */
function liveToday(now = new Date()) {
  const today = dayKey(now);
  const st = dayStats(S.byDay.get(today) || [], true, now);
  if (!st.open || today < CONFIG.startDate) return 0;
  const t = dayTargets(today, S.absences);
  return st.total + t.credit - t.soll;
}

function viewStamp() {
  const { today, st, forgot } = todayInfo();
  const t = dayTargets(today, S.absences);
  const L = T();
  const stateTxt = { off: st.in ? L.stateOff : L.stateNone, work: L.stateWork, break: L.stateBreak }[st.state];
  const now = new Date();
  // Bilanz: heute / diese Woche / Saldo – ein laufender Tag zählt live mit
  const todayDiff = st.total + t.credit - t.soll;
  const live = st.open ? todayDiff : 0;            // offener Tag ist in den Wochenwerten noch nicht enthalten
  const wk = weekStats(mondayOf(today), S.byDay, S.absences, now, today);
  const weekDiff = wk.diffToDate + live;
  const saldo = saldoThrough(mondayOf(today), S.byDay, S.absences, now) + live;
  const need = st.state !== 'off' ? Math.max(0, (t.soll - t.credit) - st.total) : null;
  const sg = (m) => `<b class="${m < 0 ? 'neg' : m > 0 ? 'pos' : ''}" data-count="${m}" data-signed="1">${fmtMin(m, true)}</b>`;
  // Begrüssung + voraussichtlicher Feierabend (inkl. noch fehlender gesetzlicher Pause)
  const hr = +hhmm(now).slice(0, 2);
  const name = CONFIG.employee.split(' ')[0];
  let endTxt = '';
  if (st.state !== 'off') {
    const target = Math.max(0, t.soll - t.credit);
    if (target && need === 0) endTxt = L.sollReached;
    else if (target) {
      const extra = Math.max(0, lawBreak(target) - st.pause);
      endTxt = st.state === 'break' ? L.endAfterBreak(fmtMin(need)) : L.endAt(hhmm(new Date(now.getTime() + (need + extra) * 60000)));
    }
  } else if (st.in) endTxt = L.niceEvening;
  let buttons = '';
  if (st.state === 'off') buttons = stampControl('in', 'go', L.clockIn, L.slideIn);
  else if (st.state === 'work') buttons = `
    ${stampControl('out', 'stop', L.clockOut, L.slideOut)}
    <button class="big pause" data-act="pause" ${S.busy ? 'disabled' : ''}>${L.pause}</button>`;
  else buttons = `
    <button class="big go" data-act="pause_end" ${S.busy ? 'disabled' : ''}>${L.pauseEnd}</button>
    ${stampControl('out', 'stop', L.clockOut, L.slideOut)}`;

  const pend = queue().length;
  return `
  ${pend ? `<div class="offline">${ICON.cloud}<span>${T().pending(pend)}</span></div>` : ''}
  ${forgot ? `<div class="warn" data-act="edit" data-day="${forgot}">${ICON.warn}<span>${L.forgot(fmtDate(forgot))}</span></div>` : ''}
  <div class="greet"><h2>${L.greet(hr)}, ${esc(name)}</h2>${endTxt ? `<p>${endTxt}</p>` : ''}</div>
  <section class="card hero">
    <div class="state s-${st.state}"><span class="dot"></span>${stateTxt}</div>
    ${ring(st.total, Math.max(0, t.soll - t.credit), L, st.state === 'work')}
    <div class="sub">${L.workedToday}${t.label ? ` · ${esc(label(t.label))}` : ''}</div>
    <div class="facts">
      <div><span>${L.in}</span><b>${st.in ? hhmm(st.in) : '–'}</b></div>
      <div><span>${L.pause}</span><b>${fmtMin(st.pause)}</b></div>
      <div><span>${L.remaining}</span><b>${need != null ? fmtMin(need) : '–'}</b></div>
    </div>
  </section>
  <div class="balance">
    <div><span>${L.diffToday}</span>${sg(todayDiff)}</div>
    <div><span>${L.tabWeek}</span>${sg(weekDiff)}</div>
    <div><span>${L.balanceTotal}</span>${sg(saldo)}</div>
  </div>
  <div class="buttons">${buttons}</div>
  <p class="hint">${L.breakHint}</p>
  <button class="link" data-act="edit" data-day="${today}">${L.correctToday}</button>`;
}

// ---------------- Woche ----------------
function viewWeek() {
  const now = new Date();
  const today = dayKey(now);
  const L = T();
  const m = S.weekMonday;
  const isCurrent = m === mondayOf(today);
  const w = weekStats(m, S.byDay, S.absences, now, isCurrent ? today : null);
  // laufende Woche: Differenz nur bis jetzt (heute live) – gleiche Werte wie auf der Stempel-Seite
  const live = liveToday(now);
  const saldo = saldoThrough(m, S.byDay, S.absences, now) + (m >= mondayOf(today) ? live : 0);
  const dw = isCurrent ? w.diffToDate + live : w.diff;
  const rows = w.days.map((d, i) => {
    const has = !!d.in;
    const cls = [i >= 5 ? 'we' : '', d.day === today ? 'today' : '', d.day < CONFIG.startDate ? 'pre' : ''].join(' ');
    const mark = (b) => (b ? '<sup>*</sup>' : '');
    return `<tr class="${cls}" data-act="edit" data-day="${d.day}">
      <td>${L.daysShort[i]} <small>${fmtDate(d.day).slice(0, 5)}</small></td>
      <td>${has ? hhmm(d.in) + mark(d.manualIn) : ''}</td>
      <td>${has ? (d.out ? hhmm(d.out) + mark(d.manualOut) : (d.open ? '…' : '<b class="neg">?</b>')) : ''}</td>
      <td>${has ? fmtMin(d.pause) + mark(d.manualPause) : ''}</td>
      <td class="r"><b>${d.dayTotal ? fmtMin(d.dayTotal) : (d.soll ? '0:00' : '')}</b>${d.label ? `<div class="tag">${esc(label(d.label))}</div>` : ''}${d.bonus ? `<div class="tag">+${Math.round(d.rate * 100)} %</div>` : ''}</td>
    </tr>`;
  }).join('');
  const done = addDays(m, 6) < today;
  const rep = S.reports.find((r) => r.week_start === m);
  return `
  <div class="weeknav">
    <button class="icon" data-act="wprev">${ICON.prev}</button>
    <div><b>${L.week} ${w.week} / ${w.year}</b><small>${fmtDate(w.monday)} – ${fmtDate(w.sunday)}</small></div>
    <button class="icon" data-act="wnext" ${isCurrent ? 'disabled' : ''}>${ICON.next}</button>
  </div>
  <section class="card pad0">
    <table class="week">
      <thead><tr><th>${L.day}</th><th>${L.in}</th><th>${L.out}</th><th>${L.pause}</th><th class="r">${L.total}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <div class="stats">
    <div><span>${L.targetWeek}</span><b>${fmtMin(w.soll)}</b></div>
    <div><span>${L.actualWeek}</span><b>${fmtMin(w.ist)}</b>${w.bonus ? `<small class="sub2">${L.bonus} ${fmtMin(w.bonus)}</small>` : ''}</div>
    <div><span>${L.diffWeek}</span><b class="${dw < 0 ? 'neg' : 'pos'}">${fmtMin(dw, true)}</b>${isCurrent ? `<small class="sub2">${L.untilToday}</small>` : ''}</div>
    <div><span>${L.balanceTotal}</span><b class="${saldo < 0 ? 'neg' : 'pos'}">${fmtMin(saldo, true)}</b><small class="sub2">${L.since(fmtDate(CONFIG.startDate))}</small></div>
  </div>
  ${saldoChart(L, now)}
  <p class="hint">${L.weekHint}</p>
  ${done && addDays(m, 6) >= CONFIG.startDate ? `<button class="btn" data-act="genpdf" ${S.busy ? 'disabled' : ''}>${rep ? L.pdfRemake : L.pdfMake}</button>` : ''}
  ${isCurrent ? `<button class="btn ghost" data-act="draftpdf" ${S.busy ? 'disabled' : ''}>${L.pdfDraft}</button><p class="hint">${L.pdfDraftHint}</p>` : ''}
  ${rep ? `<button class="btn ghost" data-act="dl" data-path="${esc(rep.pdf_path)}">${L.pdfDownload}</button>` : ''}`;
}

// ---------------- Archiv ----------------
function viewArchive() {
  const L = T();
  const tab = (v, l) => `<button type="button" class="${S.archTab === v ? 'on' : ''}" data-act="arch" data-v="${v}">${l}</button>`;
  const tabs = `<div class="seg seg3" data-seg="arch"><span class="ind"></span>${tab('weeks', L.archWeeks)}${tab('months', L.archMonths)}${tab('years', L.archYears)}</div>`;
  if (S.archTab === 'months' || S.archTab === 'years') return tabs + viewPeriods(L);
  if (!S.reports.length) return tabs + `<section class="card"><p>${L.archiveEmpty}</p></section>`;
  return tabs + `<section class="card pad0"><ul class="list">${S.reports.map((r) => `
    <li data-act="dl" data-path="${esc(r.pdf_path)}">
      <div><b>${L.week} ${r.week} / ${r.year}</b><small>${fmtDate(r.week_start)} – ${fmtDate(addDays(r.week_start, 6))}</small></div>
      <div class="r"><span class="${r.diff < 0 ? 'neg' : 'pos'}">${fmtMin(r.diff, true)}</span><small>${L.balance} ${fmtMin(r.saldo, true)}</small></div>
      <span class="dl">${ICON.download}</span>
    </li>`).join('')}</ul></section>`;
}

// ---------------- Ring ----------------
function ring(worked, target, L, running = false) {
  const R = 84, CIRC = 2 * Math.PI * R;
  const ref = target > 0 ? target : CONFIG.sollDayMin;          // Wochenende/Feiertag: alles ist Überzeit
  const base = target > 0 ? Math.min(worked / target, 1) : 0;
  const over = Math.min(Math.max(0, worked - target) / ref, 1);
  const arc = (f, cls) => (f > 0
    ? `<circle class="${cls}" cx="100" cy="100" r="${R}" stroke-dasharray="${(f * CIRC).toFixed(1)} ${CIRC.toFixed(1)}"/>` : '');
  const sub = target > 0
    ? (worked > target ? `<b class="over">+${fmtMin(worked - target)}</b> ${L.overtime}` : `${L.of} ${fmtMin(target)}`)
    : (worked ? `<b class="over">+${fmtMin(worked)}</b> ${L.overtime}` : L.noTarget);
  return `<div class="ring" role="img" aria-label="${fmtMin(worked)} / ${fmtMin(target)}">
    <svg viewBox="0 0 200 200"><g transform="rotate(-90 100 100)">
      <circle class="r-track" cx="100" cy="100" r="${R}"/>
      ${arc(base, 'r-base')}${arc(over, 'r-over')}
    </g>${running ? (() => { const n = new Date(); return `<g class="sec" style="animation-delay:-${(n.getSeconds() + n.getMilliseconds() / 1000).toFixed(2)}s"><circle cx="100" cy="16" r="5"/></g>`; })() : ''}</svg>
    <div class="ring-in"><div class="clock" data-count="${worked}">${fmtMin(worked)}</div><div class="ring-sub">${sub}</div></div>
  </div>`;
}

// ---------------- Saldo-Verlauf ----------------
function saldoChart(L, now) {
  const today = dayKey(now);
  const pts = [];
  for (let m = mondayOf(CONFIG.startDate); m <= mondayOf(today); m = addDays(m, 7)) {
    const sun = addDays(m, 6);
    pts.push({ wk: isoWeek(m).week, v: saldoAt(sun, S.byDay, S.absences, now) + (sun >= today ? liveToday(now) : 0) });
  }
  const P = pts.slice(-12);
  const Wd = 320, Hd = 130, pl = 8, pr = 8, pt = 14, pb = 22;
  const vals = P.map((p) => p.v);
  const max = Math.max(60, ...vals), min = Math.min(-60, ...vals);
  const X = (i) => pl + (P.length === 1 ? (Wd - pl - pr) / 2 : i * (Wd - pl - pr) / (P.length - 1));
  const Y = (v) => pt + (max - v) * (Hd - pt - pb) / (max - min);
  const y0 = Y(0);
  const line = P.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const area = P.length > 1 ? `${line} L${X(P.length - 1).toFixed(1)},${y0.toFixed(1)} L${X(0).toFixed(1)},${y0.toFixed(1)} Z` : '';
  const sel = S.chartSel != null && S.chartSel < P.length ? S.chartSel : P.length - 1;
  const step = Math.ceil(P.length / 6);
  const pts_ = P.map((p, i) => `
    <circle class="c-pt ${p.v < 0 ? 'neg' : 'pos'} ${i === sel ? 'sel' : ''}" cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${i === sel ? 5 : 4}"/>
    <rect class="c-hit" data-act="pt" data-i="${i}" x="${(X(i) - 14).toFixed(1)}" y="0" width="28" height="${Hd}"/>
    ${i % step === 0 || i === P.length - 1 ? `<text class="c-x" x="${X(i).toFixed(1)}" y="${Hd - 6}" text-anchor="middle">${p.wk}</text>` : ''}`).join('');
  const s = P[sel];
  return `<section class="card chart">
    <div class="chart-head"><span>${L.saldoTrend}</span><b class="${s.v < 0 ? 'neg' : 'pos'}">${L.week} ${s.wk}: ${fmtMin(s.v, true)}</b></div>
    <svg viewBox="0 0 ${Wd} ${Hd}">
      <defs>
        <clipPath id="cpos"><rect x="0" y="0" width="${Wd}" height="${y0.toFixed(1)}"/></clipPath>
        <clipPath id="cneg"><rect x="0" y="${y0.toFixed(1)}" width="${Wd}" height="${(Hd - y0).toFixed(1)}"/></clipPath>
      </defs>
      <line class="c-zero" x1="0" x2="${Wd}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/>
      ${area ? `<path class="c-area pos" d="${area}" clip-path="url(#cpos)"/><path class="c-area neg" d="${area}" clip-path="url(#cneg)"/>` : ''}
      ${P.length > 1 ? `<path class="c-line" d="${line}"/>` : ''}
      ${pts_}
    </svg>
    ${P.length < 2 ? `<p class="hint">${L.chartSoon}</p>` : ''}
  </section>`;
}

// ---------------- Monate / Jahre ----------------
const lastOfMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1); };
function viewPeriods(L) {
  const now = new Date(), today = dayKey(now);
  const items = [];
  if (S.archTab === 'months') {
    for (let ym = today.slice(0, 7); ym >= CONFIG.startDate.slice(0, 7);) {
      const st = rangeStats(`${ym}-01`, lastOfMonth(ym), S.byDay, S.absences, now);
      items.push({ key: ym, title: `${L.months[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`, st, saldo: saldoAt(lastOfMonth(ym), S.byDay, S.absences, now) });
      const [y, m] = ym.split('-').map(Number);
      ym = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    }
  } else {
    for (let y = +today.slice(0, 4); y >= +CONFIG.startDate.slice(0, 4); y--) {
      const st = rangeStats(`${y}-01-01`, `${y}-12-31`, S.byDay, S.absences, now);
      items.push({ key: String(y), title: String(y), st, saldo: saldoAt(`${y}-12-31`, S.byDay, S.absences, now) });
    }
  }
  return `<section class="card pad0"><ul class="list">${items.map((it) => `
    <li data-act="rep" data-k="${it.key}">
      <div><b>${it.title}</b><small>${L.actual} ${fmtMin(it.st.ist)} · ${L.target} ${fmtMin(it.st.soll)}${it.st.partial ? ` · ${L.untilToday}` : ''}</small></div>
      <div class="r"><span class="${it.st.diff < 0 ? 'neg' : 'pos'}">${fmtMin(it.st.diff, true)}</span><small>${L.balance} ${fmtMin(it.saldo, true)}</small></div>
      <span class="dl">${ICON.download}</span>
    </li>`).join('')}</ul></section>
  <p class="hint">${L.periodHint}</p>`;
}

async function saveFile(bytes, name) {
  const file = new File([bytes], name, { type: 'application/pdf' });
  try {
    // Teilen-Dialog nur am Handy (dort klappt "Sichern in Dateien" am besten); am PC direkt herunterladen
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    if (mobile && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function periodPdf(key) {
  if (S.busy) return;
  S.busy = true; render();
  try {
    const now = new Date();
    const { buildMonthPdf, buildYearPdf } = await import('./lib/pdf-report.js');
    const logo = await getLogo();
    let bytes, name;
    if (key.length === 7) {
      const st = rangeStats(`${key}-01`, lastOfMonth(key), S.byDay, S.absences, now);
      bytes = await buildMonthPdf(key, st, saldoAt(lastOfMonth(key), S.byDay, S.absences, now), logo);
      name = `Arbeitszeit_${key}.pdf`;
    } else {
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const ym = `${key}-${String(m).padStart(2, '0')}`;
        months.push({ ym, st: rangeStats(`${ym}-01`, lastOfMonth(ym), S.byDay, S.absences, now), saldo: saldoAt(lastOfMonth(ym), S.byDay, S.absences, now) });
      }
      bytes = await buildYearPdf(+key, months, rangeStats(`${key}-01-01`, `${key}-12-31`, S.byDay, S.absences, now), saldoAt(`${key}-12-31`, S.byDay, S.absences, now), logo);
      name = `Arbeitszeit_${key}.pdf`;
    }
    S.busy = false; render();
    await saveFile(bytes, name);
  } catch (e) { S.busy = false; toast(T().pdfError + e.message, true); }
}

async function download(path) {
  if (S.busy) return;
  S.busy = true; render();
  try {
    const { data, error } = await sb.storage.from('reports').download(path);
    if (error) throw error;
    const bytes = new Uint8Array(await data.arrayBuffer());
    S.busy = false; render();
    await saveFile(bytes, `Arbeitszeitnachweis_${path.split('/').pop()}`);
  } catch (e) { S.busy = false; render(); toast(T().downloadFailed + (e.message || e), true); }
}

let logoCache;
async function getLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}logo-black.png`);
    logoCache = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { logoCache = null; }
  return logoCache;
}

// Zwischenstand der laufenden Woche: nur herunterladen, nicht im Archiv speichern
async function draftPdf() {
  if (S.busy) return;
  S.busy = true; render();
  try {
    const now = new Date(), today = dayKey(now), m = mondayOf(today);
    const w = weekStats(m, S.byDay, S.absences, now, today);
    const saldo = saldoThrough(m, S.byDay, S.absences, now);
    const stamp = `Stand ${fmtDate(today)}, ${hhmm(now)}`;
    const { buildWeekPdf } = await import('./lib/pdf.js');
    const bytes = await buildWeekPdf(w, saldo, await getLogo(), { draft: true, today, stamp });
    S.busy = false; render();
    await saveFile(bytes, `Arbeitszeitnachweis_${w.year}-KW${String(w.week).padStart(2, '0')}_Zwischenstand_${today.slice(8)}-${today.slice(5, 7)}.pdf`);
  } catch (e) { S.busy = false; render(); toast(T().pdfError + e.message, true); }
}

async function generatePdf(monday) {
  S.busy = true; render();
  try {
    const now = new Date();
    const w = weekStats(monday, S.byDay, S.absences, now);
    const saldo = saldoThrough(monday, S.byDay, S.absences, now);
    const { buildWeekPdf } = await import('./lib/pdf.js');
    const bytes = await buildWeekPdf(w, saldo, await getLogo());
    const path = `${S.user.id}/${w.year}-KW${String(w.week).padStart(2, '0')}.pdf`;
    const up = await sb.storage.from('reports').upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
    if (up.error) throw up.error;
    const { error } = await sb.from('weekly_reports').upsert({
      week_start: monday, year: w.year, week: w.week, soll: w.soll, ist: w.ist, diff: w.diff, saldo, pdf_path: path,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,week_start' });
    if (error) throw error;
    await loadReports();
    toast(T().pdfSaved);
  } catch (e) { toast(T().pdfError + e.message, true); }
  S.busy = false; render();
}

// ---------------- Tageskorrektur ----------------
function openEditor(day) {
  enterAnim = 'sheet';
  const events = S.byDay.get(day) || [];
  if (events.some((e) => e.pending) || !navigator.onLine) return toast(T().offlineEdit, true);
  S.editor = { day, rows: events.map((e) => ({ id: e.id, kind: e.kind, time: hhmm(new Date(e.ts)), orig: e })) };
  render();
}

function viewEditor() {
  const ed = S.editor;
  const L = T();
  const opts = (k) => Object.entries(L.kind).map(([v, l]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="modal"><div class="sheet">
    <div class="sheethead"><b>${L.days[weekday(ed.day)]}, ${fmtDate(ed.day)}</b><button class="icon" data-act="edclose">${ICON.close}</button></div>
    ${ed.rows.length ? '' : `<p class="hint">${L.noEntries}</p>`}
    ${ed.rows.map((r, i) => `<div class="edrow">
      <select data-ed="kind" data-i="${i}">${opts(r.kind)}</select>
      <input type="time" value="${r.time}" data-ed="time" data-i="${i}" />
      <button class="icon del" data-act="edrm" data-i="${i}">${ICON.trash}</button></div>`).join('')}
    <button class="btn ghost" data-act="edadd">${L.addEntry}</button>
    <p class="hint">${L.manualHint}</p>
    <button class="btn" data-act="edsave" ${S.busy ? 'disabled' : ''}>${L.save}</button>
  </div></div>`;
}

async function saveEditor() {
  const ed = S.editor;
  if (ed.rows.some((r) => !/^\d\d:\d\d$/.test(r.time))) return toast(T().fillTimes, true);
  const rows = ed.rows.map((r) => ({ ...r, ts: zurichToDate(ed.day, r.time).toISOString() }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (validateDay(rows)) return toast(T().badOrder, true);

  S.busy = true; render();
  try {
    const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
    const removed = (S.byDay.get(ed.day) || []).filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (removed.length) { const { error } = await sb.from('entries').delete().in('id', removed); if (error) throw error; }
    for (const r of rows.filter((r) => r.id)) {
      const changed = r.kind !== r.orig.kind || new Date(r.ts).getTime() !== new Date(r.orig.ts).getTime();
      if (changed) {
        const { error } = await sb.from('entries').update({ kind: r.kind, ts: r.ts, manual: true }).eq('id', r.id);
        if (error) throw error;
      }
    }
    const added = rows.filter((r) => !r.id).map((r) => ({ kind: r.kind, ts: r.ts, manual: true }));
    if (added.length) { const { error } = await sb.from('entries').insert(added); if (error) throw error; }
    S.editor = null;
    await loadEntries();
    const m = mondayOf(ed.day);
    toast(S.reports.some((r) => r.week_start === m) ? T().savedPdf : T().saved);
  } catch (e) { toast(T().error + e.message, true); }
  S.busy = false; render();
}

// ---------------- Ferienkalender ----------------
const ABS_CYCLE = [undefined, 'ferien', 'ferien_halb', 'krank'];

function viewDrawer() {
  const y = S.calYear, mo = S.calMonth;
  const first = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  const start = mondayOf(first);
  const today = dayKey(new Date());
  const L = T();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const inMonth = +d.slice(5, 7) === mo + 1;
    if (!inMonth && i >= 35) break;
    const wd = weekday(d);
    const hol = holidayName(d);
    const a = S.absences.get(d);
    // Heatmap: Farbton nach Arbeitszeit (gelb wenig -> grün Soll -> rot viel Überzeit)
    let heat = '';
    if (inMonth && d <= today && S.byDay.get(d)) {
      const r = dayRecord(d, S.byDay, S.absences);
      if (r.total > 0) {
        const ref = r.soll || CONFIG.sollDayMin;
        const q = r.total / ref;
        const h = q <= 1 ? 38 + 102 * q : Math.max(0, 140 - 280 * (q - 1));
        heat = `style="--h:${Math.round(h)}" data-min="${fmtMin(r.total)}"`;
      }
    }
    const cls = ['cd', inMonth ? '' : 'out', wd >= 5 ? 'we' : '', hol ? 'hol' : '', a ? 'a-' + a : '', d === today ? 'today' : '', heat ? 'heat' : ''].join(' ');
    const clickable = inMonth && wd < 5 && !hol;
    cells += `<div class="${cls}" ${heat} ${clickable ? `data-act="abs" data-day="${d}"` : ''} title="${esc(label(hol) || '')}">
      <span>${+d.slice(8)}</span>${a && inMonth ? `<i>${L.absShort[a]}</i>` : hol && inMonth ? `<i>${L.absShort.hol}</i>` : ''}</div>`;
  }
  const yearCount = [...S.absences.entries()].filter(([d]) => d.startsWith(String(y)))
    .reduce((s, [, k]) => s + (k === 'ferien' ? 1 : k === 'ferien_halb' ? 0.5 : 0), 0);
  const canPrev = y > CONFIG.calendarFrom || mo > 0;
  const canNext = y < CONFIG.calendarTo || mo < 11;
  return `<div class="drawer-bg" data-act="drawer"></div>
  <aside class="drawer">
    <div class="sheethead"><b>${L.absTitle}</b><button class="icon" data-act="drawer">${ICON.close}</button></div>
    <div class="weeknav">
      <button class="icon" data-act="cprev" ${canPrev ? '' : 'disabled'}>${ICON.prev}</button>
      <div><b>${L.months[mo]} ${y}</b></div>
      <button class="icon" data-act="cnext" ${canNext ? '' : 'disabled'}>${ICON.next}</button>
    </div>
    <div class="cal">${L.daysShort.map((d) => `<div class="ch">${d}</div>`).join('')}${cells}</div>
    <div class="legend"><span><i class="a-ferien">${L.absShort.ferien}</i> ${L.absF}</span><span><i class="a-ferien_halb">½</i> ${L.absH}</span><span><i class="a-krank">${L.absShort.krank}</i> ${L.absK}</span><span><i class="hol">${L.absShort.hol}</i> ${L.absFT}</span></div>
    <div class="heat-legend"><span>${L.heatLow}</span><i></i><span>${L.heatHigh}</span></div>
    <p class="hint">${L.absHint}</p>
    <p class="hint"><b>${L.vacDays(y, yearCount)}</b></p>
  </aside>`;
}

async function toggleAbsence(day) {
  const cur = S.absences.get(day);
  const next = ABS_CYCLE[(ABS_CYCLE.indexOf(cur) + 1) % ABS_CYCLE.length];
  // optimistisch
  if (next) S.absences.set(day, next); else S.absences.delete(day);
  render();
  const res = next
    ? await sb.from('absences').upsert({ day, kind: next }, { onConflict: 'user_id,day' })
    : await sb.from('absences').delete().eq('day', day);
  if (res.error) { toast(T().error + res.error.message, true); await loadAbsences(); render(); }
}

// ---------------- Login ----------------
function loginDial() {
  // Zifferblatt einer Stempeluhr: 60 Minutenstriche, Bogen = laufende Stunde, Mitte = Uhrzeit
  const now = new Date();
  const [h, mi] = hhmm(now).split(':').map(Number);
  const R = 92, C = 2 * Math.PI * R;
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI, big = i % 5 === 0;
    const r1 = big ? 104 : 107, r2 = 112;
    ticks += `<line class="${big ? 'tk tk-h' : 'tk'} ${i <= mi ? 'past' : ''}" x1="${(120 + r1 * Math.sin(a)).toFixed(1)}" y1="${(120 - r1 * Math.cos(a)).toFixed(1)}" x2="${(120 + r2 * Math.sin(a)).toFixed(1)}" y2="${(120 - r2 * Math.cos(a)).toFixed(1)}"/>`;
  }
  return `<div class="dial" aria-hidden="true"><svg viewBox="0 0 240 240">${ticks}
    <circle class="d-track" cx="120" cy="120" r="${R}"/>
    <circle class="d-arc" cx="120" cy="120" r="${R}" stroke-dasharray="${((mi / 60) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 120 120)"/></svg>
    <div class="dial-in"><span class="dial-time">${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}</span>
    <span class="dial-date">${now.toLocaleDateString(prefs.lang === 'fr' ? 'fr-CH' : 'de-CH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Zurich' })}</span></div></div>`;
}

function viewLogin() {
  const L = T();
  return `<div class="login-wrap">
    <img class="login-logo" src="${import.meta.env.BASE_URL}logo.png" alt="Net Powersafe SA" />
    ${loginDial()}
    <form class="login" id="login" novalidate>
      <h1>Stempeluhr</h1>
      <label class="fld"><span>${L.email}</span><input type="email" name="email" autocomplete="username" inputmode="email" required /></label>
      <label class="fld"><span>${L.password}</span><span class="pw"><input type="password" name="pw" autocomplete="current-password" required />
        <button type="button" class="pw-eye" data-act="pweye" aria-label="${L.showPw}">${ICON.eye}</button></span></label>
      <button class="btn login-btn" ${S.busy ? 'disabled' : ''}>${S.busy ? L.loggingIn : L.login}</button>
      ${S.loginErr ? `<p class="login-err">${esc(S.loginErr)}</p>` : ''}
    </form>
  </div>`;
}

// ---------------- Einstellungen ----------------
function prefsControls() {
  const L = T();
  const seg = (k, vals, lab) => `<div class="seg" data-seg="${k}"><span class="ind"></span>${vals.map((v) =>
    `<button type="button" class="${prefs[k] === v ? 'on' : ''}" data-act="pref" data-k="${k}" data-v="${v}">${lab(v)}</button>`).join('')}</div>`;
  return `<div class="prefs">
    <span class="plabel">${L.theme}</span>
    <div class="swatches">${THEMES.map((th) =>
      `<button type="button" class="sw sw-${th} ${prefs.theme === th ? 'on' : ''}" data-act="pref" data-k="theme" data-v="${th}"><i></i>${L.themes[th]}</button>`).join('')}</div>
    <span class="plabel">${L.language}</span>
    ${seg('lang', ['de', 'fr'], (v) => v.toUpperCase())}
    ${S.user ? `<span class="plabel">${L.reminder}</span>
    <button type="button" class="toggle ${S.pushOn ? 'on' : ''}" data-act="push" ${S.busy ? 'disabled' : ''}>
      <span>${L.reminderText}</span><i></i></button>
    ${S.pushHint ? `<p class="hint">${esc(S.pushHint)}</p>` : ''}` : ''}
  </div>`;
}

function viewSettings() {
  return `<div class="modal" data-act="setclose"><div class="sheet" data-stop="1">
    <div class="sheethead"><b>${T().settings}</b><button class="icon" data-act="setclose">${ICON.close}</button></div>
    ${prefsControls()}
  </div></div>`;
}

// ---------------- Rendern ----------------
// ---------------- Seiten-Slider + Animationen ----------------
const VIEWS = ['stamp', 'week', 'archive'];
const EASE = 'cubic-bezier(.22,1,.36,1)';               // weiches Auslaufen (easeOutQuint)
let shownIdx = 0, dragDx = 0, enterAnim = null;   // enterAnim: 'sheet' | 'drawer' – nur beim Öffnen animieren
const segPrev = {};
const viewOf = (v) => (v === 'stamp' ? viewStamp() : v === 'week' ? viewWeek() : viewArchive());

function animateAfterRender() {
  const pager = app.querySelector('.pager');
  const ind = app.querySelector('.tabbar .ind');
  const to = VIEWS.indexOf(S.view);
  if (pager) {
    pager.style.transform = `translateX(${-to * 100}%)`;
    if (ind) ind.style.transform = `translateX(${to * 100}%)`;
    if (shownIdx !== to || dragDx) {
      if (shownIdx !== to) window.scrollTo({ top: 0 });
      const w = pager.clientWidth || 1;
      const from = `translateX(calc(${-shownIdx * 100}% + ${dragDx}px))`;
      pager.classList.add('moving');
      const an = pager.animate([{ transform: from }, { transform: `translateX(${-to * 100}%)` }], { duration: 520, easing: EASE });
      an.onfinish = an.oncancel = () => pager.classList.remove('moving');
      ind?.animate([{ transform: `translateX(${(shownIdx - dragDx / w) * 100}%)` }, { transform: `translateX(${to * 100}%)` }], { duration: 520, easing: EASE });
    }
  }
  shownIdx = to; dragDx = 0;
  // Segment-Umschalter: Glas-Tropfen gleitet zur neuen Auswahl
  app.querySelectorAll('.seg[data-seg]').forEach((seg) => {
    const btns = [...seg.querySelectorAll('button')];
    const i = Math.max(0, btns.findIndex((b) => b.classList.contains('on')));
    const ind = seg.querySelector('.ind');
    if (!ind) return;
    ind.style.transform = `translateX(${i * 100}%)`;
    const prev = segPrev[seg.dataset.seg];
    if (prev != null && prev !== i) ind.animate([{ transform: `translateX(${prev * 100}%)` }, { transform: `translateX(${i * 100}%)` }], { duration: 480, easing: EASE });
    segPrev[seg.dataset.seg] = i;
  });
}

// Wischen zwischen den Tabs (folgt dem Finger)
let touch = null;
app.addEventListener('touchstart', (e) => {
  if (!S.user || S.editor || S.drawer || S.settings || !e.target.closest('main') || e.target.closest('input,select,textarea,.c-hit,.slider')) return;
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, t: performance.now(), dir: null, dx: 0 };
}, { passive: true });
app.addEventListener('touchmove', (e) => {
  if (!touch) return;
  const t = e.touches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (!touch.dir) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; touch.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'; }
  if (touch.dir !== 'h') return;
  e.preventDefault();
  const idx = VIEWS.indexOf(S.view);
  const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === VIEWS.length - 1);
  touch.dx = edge ? dx * 0.3 : dx;                       // Gummiband am Rand
  const pager = app.querySelector('.pager'), ind = app.querySelector('.tabbar .ind');
  pager.classList.add('moving');
  pager.style.transform = `translateX(calc(${-idx * 100}% + ${touch.dx}px))`;
  if (ind) ind.style.transform = `translateX(${(idx - touch.dx / pager.clientWidth) * 100}%)`;
}, { passive: false });
app.addEventListener('touchend', () => {
  if (!touch) return;
  const tc = touch; touch = null;
  if (tc.dir !== 'h') return;
  const w = app.querySelector('.pager')?.clientWidth || 1;
  const v = tc.dx / (performance.now() - tc.t);          // px/ms
  const idx = VIEWS.indexOf(S.view);
  let next = idx;
  if (tc.dx < -w * 0.22 || v < -0.45) next = Math.min(VIEWS.length - 1, idx + 1);
  if (tc.dx > w * 0.22 || v > 0.45) next = Math.max(0, idx - 1);
  dragDx = tc.dx;
  if (VIEWS[next] === 'archive' && S.view !== 'archive') loadReports().then(() => setTimeout(render, 500)).catch(() => {});
  S.view = VIEWS[next];
  render();
});

// Zahlen beim Öffnen kurz hochzählen lassen
let countUpNext = false;
function countUp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const els = [...app.querySelectorAll('.page.active [data-count]')];
  if (!els.length) return;
  const t0 = performance.now(), D = 900;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
    for (const el of els) {
      if (!el.isConnected) continue;
      const v = +el.dataset.count;
      el.textContent = fmtMin(Math.round(v * e), !!el.dataset.signed);
    }
    if (k < 1 && els.some((el) => el.isConnected)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function render() {
  if (!S.user) {
    app.innerHTML = viewLogin() + (S.toast ? `<div class="toast ${S.toast.err ? 'err' : ''}">${esc(S.toast.msg)}</div>` : '');
    return;
  }
  const L = T();
  const tab = (v, l) => `<button class="${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${l}</button>`;
  // Fokus/Scroll im Editor erhalten
  const active = document.activeElement?.dataset?.ed ? { ed: document.activeElement.dataset.ed, i: document.activeElement.dataset.i } : null;
  app.innerHTML = `
  <header><img class="hlogo" src="${import.meta.env.BASE_URL}logo.png" alt="Net Powersafe SA" /><div>
    <button class="icon" data-act="drawer" title="${L.calendar}" aria-label="${L.calendar}">${ICON.cal}</button>
    <button class="icon" data-act="settings" title="${L.settings}" aria-label="${L.settings}">${ICON.gear}</button>
    <button class="icon" data-act="logout" title="${L.logout}" aria-label="${L.logout}">${ICON.out}</button></div></header>
  <main><div class="pager">${VIEWS.map((v) => `<section class="page ${v === S.view ? 'active' : ''}"><div class="page-in">${viewOf(v)}</div></section>`).join('')}</div></main>
  <nav><div class="tabbar"><span class="ind"></span>${tab('stamp', L.tabStamp)}${tab('week', L.tabWeek)}${tab('archive', L.tabArchive)}</div></nav>
  ${S.editor ? viewEditor() : ''}
  ${S.drawer ? viewDrawer() : ''}
  ${S.settings ? viewSettings() : ''}
  ${S.toast ? `<div class="toast ${S.toast.err ? 'err' : ''}">${esc(S.toast.msg)}</div>` : ''}`;
  if (enterAnim) { app.querySelectorAll(enterAnim === 'drawer' ? '.drawer, .drawer-bg' : '.sheet, .modal').forEach((e) => e.classList.add('enter')); enterAnim = null; }
  animateAfterRender();
  if (countUpNext && S.view === 'stamp') { countUpNext = false; countUp(); }
  if (active) app.querySelector(`[data-ed="${active.ed}"][data-i="${active.i}"]`)?.focus();
}

app.addEventListener('submit', async (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const f = new FormData(e.target);
  S.busy = true; render();
  S.loginErr = null;
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('pw') });
  S.busy = false;
  if (error) {
    S.loginErr = T().loginFailedHint; render();
    const fm = app.querySelector('#login');
    if (fm) { fm.email.value = f.get('email'); fm.pw.focus(); }
  }
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.dataset.ed || !S.editor) return;
  S.editor.rows[+t.dataset.i][t.dataset.ed] = t.value;
});

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act;
  // Klick im Sheet soll das Modal nicht schliessen
  if (a === 'setclose' && e.target.closest('[data-stop]') && !e.target.closest('.icon')) return;
  if (a === 'in') stamp(['in']);
  else if (a === 'out') stamp(todayInfo().st.state === 'break' ? ['break_end', 'out'] : ['out']);
  else if (a === 'pause') stamp(['break_start']);
  else if (a === 'pause_end') stamp(['break_end']);
  else if (a === 'view') { S.view = el.dataset.v; if (S.view === 'archive') loadReports().then(() => setTimeout(render, 500)).catch(() => {}); render(); }
  else if (a === 'wprev') { S.weekMonday = addDays(S.weekMonday, -7); render(); }
  else if (a === 'wnext') { S.weekMonday = addDays(S.weekMonday, 7); render(); }
  else if (a === 'edit') openEditor(el.dataset.day);
  else if (a === 'edclose') { S.editor = null; render(); }
  else if (a === 'edadd') {
    const last = S.editor.rows[S.editor.rows.length - 1];
    const next = !last ? 'in' : last.kind === 'in' || last.kind === 'break_end' ? 'out' : last.kind === 'break_start' ? 'break_end' : 'in';
    S.editor.rows.push({ kind: next, time: '' }); render();
  }
  else if (a === 'edrm') { S.editor.rows.splice(+el.dataset.i, 1); render(); }
  else if (a === 'edsave') saveEditor();
  else if (a === 'drawer') { S.drawer = !S.drawer; if (S.drawer) enterAnim = 'drawer'; render(); }
  else if (a === 'cprev') { if (--S.calMonth < 0) { S.calMonth = 11; S.calYear--; } render(); }
  else if (a === 'cnext') { if (++S.calMonth > 11) { S.calMonth = 0; S.calYear++; } render(); }
  else if (a === 'abs') toggleAbsence(el.dataset.day);
  else if (a === 'genpdf') generatePdf(S.weekMonday);
  else if (a === 'draftpdf') draftPdf();
  else if (a === 'dl') download(el.dataset.path);
  else if (a === 'arch') { S.archTab = el.dataset.v; render(); }
  else if (a === 'rep') periodPdf(el.dataset.k);
  else if (a === 'pt') { S.chartSel = +el.dataset.i; render(); }
  else if (a === 'settings') { S.settings = true; enterAnim = 'sheet'; render(); }
  else if (a === 'setclose') { S.settings = false; render(); }
  else if (a === 'pweye') { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.classList.toggle('on'); }
  else if (a === 'push') togglePush();
  else if (a === 'pref') { setPref(el.dataset.k, el.dataset.v); render(); }
  else if (a === 'logout') { await sb.auth.signOut(); }
});

// Uhr aktualisieren
// Login-Zifferblatt jede Minute nachführen (ohne die Eingaben zu verlieren)
setInterval(() => { if (!S.user) { const d = app.querySelector('.dial'); if (d) d.outerHTML = loginDial(); } }, 15000);
setInterval(() => { if (S.user && S.view === 'stamp' && !S.editor && !S.drawer && !S.settings && !slide) render(); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.user) countUpNext = true;
  if (!document.hidden && S.user) flushQueue().then(() => loadEntries()).then(render).catch(() => render());
});
window.addEventListener('online', () => { if (S.user) flushQueue().then(render); });
window.addEventListener('offline', () => render());

// ---------------- Service Worker + Push ----------------
const FN_URL = `${URL_}/functions/v1/reminder`;
let swReg = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((r) => { swReg = r; refreshPushState(); }).catch(() => {});
}
async function refreshPushState() {
  try { S.pushOn = !!(await swReg?.pushManager?.getSubscription()); } catch { S.pushOn = false; }
}
const b64ToU8 = (b64) => { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function togglePush() {
  const L = T();
  S.pushHint = null;
  if (!swReg || !('PushManager' in window) || !('Notification' in window)) {
    S.pushHint = /iphone|ipad/i.test(navigator.userAgent) ? L.pushIos : L.pushUnsupported; return render();
  }
  S.busy = true; render();
  try {
    const existing = await swReg.pushManager.getSubscription();
    if (existing) {
      await sb.from('push_subs').delete().eq('endpoint', existing.endpoint);
      await existing.unsubscribe();
      S.pushOn = false;
    } else {
      if (await Notification.requestPermission() !== 'granted') throw new Error(L.pushDenied);
      const { key } = await (await fetch(`${FN_URL}?action=key`)).json();
      const sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
      const j = sub.toJSON();
      const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
      if (error) throw error;
      S.pushOn = true;
      toast(L.pushOk);
    }
  } catch (e) { S.pushHint = e.message; }
  S.busy = false; render();
}

function hideSplash() {
  const sp = document.getElementById('splash');
  if (!sp || sp.dataset.out) return;
  sp.dataset.out = '1';
  const wait = Math.max(0, 650 - performance.now()); // kurz sichtbar lassen, nicht flackern
  setTimeout(() => sp.classList.add('gone'), wait);
  setTimeout(() => sp.remove(), wait + 450);
}

sb.auth.onAuthStateChange((_ev, session) => {
  const was = S.user?.id;
  S.user = session?.user || null;
  if (S.user && S.user.id !== was) loadAll();
  else render();
  hideSplash();
});
