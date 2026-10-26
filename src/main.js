import { createClient } from '@supabase/supabase-js';
import './style.css';
import { CONFIG } from './config.js';
import {
  dayKey, hhmm, zurichToDate, addDays, weekday, mondayOf, isoWeek,
  fmtDate, fmtMin,
} from './lib/time.js';
import { prefs, setPref, applyPrefs, T, label, THEMES } from './i18n.js';
import { holidayName } from './lib/holidays.js';
import { parseReceipt, expenseTotals, fmtChf, CATEGORIES, PHOTO_CATS, kmAmount, lastWorkday, cleanRoute } from './lib/receipt.js';
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

// Nach einem Update fehlen die alten Programmteile auf dem Server -> Seite einmal neu laden
function reloadForUpdate() {
  try {
    const last = +sessionStorage.getItem('stempeluhr.reload') || 0;
    if (Date.now() - last < 60000) return false;          // keine Endlosschleife
    sessionStorage.setItem('stempeluhr.reload', String(Date.now()));
  } catch { /* egal */ }
  location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (e) => { if (reloadForUpdate()) e.preventDefault(); });

const S = {
  locked: (() => { try { return !!JSON.parse(localStorage.getItem('stempeluhr.lock') || 'null')?.id; } catch { return false; } })(),
  bioAvail: false,
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
  expMonth: dayKey(new Date()).slice(0, 7),
  expenses: [],
  expReports: [],
  thumbs: {},
  exp: null,      // offener Beleg { id?, day, amount, category, note, blob?, url, ocr }
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
  face: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 16c1.4 1 3.6 1 5 0"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.2A1.5 1.5 0 0 1 9.8 5h4.4a1.5 1.5 0 0 1 1.2.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  car: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11.5l1.6-4.2A2 2 0 0 1 8.5 6h7a2 2 0 0 1 1.9 1.3l1.6 4.2V16"/><path d="M3.5 16h17v2.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5V18h-11v.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5z"/><path d="M5 11.5h14"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/></svg>',
  image: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8 8.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  out: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10"/></svg>',
};

function toast(msg, err = false) {
  if (err && /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg) && reloadForUpdate()) return;
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
// PDF-Sprache = App-Sprache; auch für die automatischen Blätter (Server liest sie aus dem Benutzerprofil)
const pdfLang = () => ({ lang: prefs.lang });
function syncLang() {
  if (S.user && S.user.user_metadata?.lang !== prefs.lang) {
    const changed = !!S.user.user_metadata?.lang;
    sb.auth.updateUser({ data: { lang: prefs.lang } }).then(({ data }) => { if (data?.user) S.user = data.user; }).catch(() => {});
    // gespeicherte Spesenblätter in der neuen Sprache ablegen (für Archiv/automatische Läufe)
    if (changed && S.expReports.length) refreshSheets(S.expReports.map((r) => `${r.month}-01`));
  }
}

async function loadAll() {
  syncLang();
  loadCache();
  const hadCache = S.entries.length > 0;
  countUpNext = hadCache;                     // mit Cache sofort hochzählen, sonst nach dem Laden
  render();                      // sofort aus dem Cache anzeigen
  await flushQueue();
  loadExpenses().catch(() => {});
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
  ${rep ? `<button class="btn ghost" data-act="sheet" data-kind="week" data-key="${m}">${L.pdfDownload}</button>` : ''}`;
}

// ---------------- Archiv ----------------
function viewArchive() {
  const L = T();
  const tab = (v, l) => `<button type="button" class="${S.archTab === v ? 'on' : ''}" data-act="arch" data-v="${v}">${l}</button>`;
  const tabs = `<div class="seg seg3" data-seg="arch"><span class="ind"></span>${tab('weeks', L.archWeeks)}${tab('months', L.archMonths)}${tab('years', L.archYears)}</div>`;
  if (S.archTab === 'months' || S.archTab === 'years') return tabs + viewPeriods(L);
  if (!S.reports.length) return tabs + `<section class="card"><p>${L.archiveEmpty}</p></section>`;
  return tabs + `<section class="card pad0"><ul class="list">${S.reports.map((r) => `
    <li data-act="sheet" data-kind="week" data-key="${r.week_start}">
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

async function saveFile(bytes, name, type = 'application/pdf') {
  const file = new File([bytes], name, { type });
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
      bytes = await buildMonthPdf(key, st, saldoAt(lastOfMonth(key), S.byDay, S.absences, now), logo, pdfLang());
      name = `${T().fileMonth}_${key}.pdf`;
    } else {
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const ym = `${key}-${String(m).padStart(2, '0')}`;
        months.push({ ym, st: rangeStats(`${ym}-01`, lastOfMonth(ym), S.byDay, S.absences, now), saldo: saldoAt(lastOfMonth(ym), S.byDay, S.absences, now) });
      }
      bytes = await buildYearPdf(+key, months, rangeStats(`${key}-01-01`, `${key}-12-31`, S.byDay, S.absences, now), saldoAt(`${key}-12-31`, S.byDay, S.absences, now), logo, pdfLang());
      name = `${T().fileYear}_${key}.pdf`;
    }
    S.busy = false; render();
    await saveFile(bytes, name);
  } catch (e) { S.busy = false; toast(T().pdfError + e.message, true); }
}

// Gespeicherte Blätter immer frisch aus den Daten erstellen – so stimmen Sprache, Layout und Korrekturen immer
async function sheetPdf(kind, key) {
  if (S.busy) return;
  S.busy = true; render();
  try {
    const L = T(), now = new Date(), logo = await getLogo();
    let bytes, name;
    if (kind === 'week') {
      const w = weekStats(key, S.byDay, S.absences, now);
      const { buildWeekPdf } = await import('./lib/pdf.js');
      bytes = await buildWeekPdf(w, saldoThrough(key, S.byDay, S.absences, now), logo, pdfLang());
      name = `${L.fileWeek}_${w.year}-${L.fileKw}${String(w.week).padStart(2, '0')}.pdf`;
    } else {
      const { buildExpensePdf } = await import('./lib/pdf-expense.js');
      bytes = await buildExpensePdf(key, monthItems(key), new Map(), logo, pdfLang());
      name = `${L.fileExp}_${key}.pdf`;
    }
    S.busy = false; render();
    await saveFile(bytes, name);
  } catch (e) { S.busy = false; render(); toast(T().pdfError + (e.message || e), true); }
}

async function download(path, name) {
  if (S.busy) return;
  S.busy = true; render();
  try {
    // immer die aktuelle Fassung holen (kein Zwischenspeicher – Blätter werden überschrieben)
    const { data, error } = await sb.storage.from('reports').createSignedUrl(path, 120);
    if (error) throw error;
    const res = await fetch(`${data.signedUrl}&v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    S.busy = false; render();
    await saveFile(bytes, name || `Arbeitszeitnachweis_${path.split('/').pop()}`);
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
    const stamp = `${T().pdfStand} ${fmtDate(today)}, ${hhmm(now)}`;
    const { buildWeekPdf } = await import('./lib/pdf.js');
    const bytes = await buildWeekPdf(w, saldo, await getLogo(), { draft: true, today, stamp, ...pdfLang() });
    S.busy = false; render();
    await saveFile(bytes, `${T().fileWeek}_${w.year}-${T().fileKw}${String(w.week).padStart(2, '0')}_${T().fileDraft}_${today.slice(8)}-${today.slice(5, 7)}.pdf`);
  } catch (e) { S.busy = false; render(); toast(T().pdfError + e.message, true); }
}

async function generatePdf(monday) {
  S.busy = true; render();
  try {
    const now = new Date();
    const w = weekStats(monday, S.byDay, S.absences, now);
    const saldo = saldoThrough(monday, S.byDay, S.absences, now);
    const { buildWeekPdf } = await import('./lib/pdf.js');
    const bytes = await buildWeekPdf(w, saldo, await getLogo(), pdfLang());
    const path = `${S.user.id}/${w.year}-KW${String(w.week).padStart(2, '0')}.pdf`;
    const up = await sb.storage.from('reports').upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
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
  // Zifferblatt einer Stempeluhr: 60 Striche = Sekunden, Bogen läuft live mit, Mitte = Uhrzeit
  const now = new Date();
  const sec = now.getSeconds() + now.getMilliseconds() / 1000;
  const R = 92, C = 2 * Math.PI * R;
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI, big = i % 5 === 0;
    const r1 = big ? 104 : 107, r2 = 112;
    ticks += `<line data-i="${i}" class="${big ? 'tk tk-h' : 'tk'} ${i <= Math.floor(sec) ? 'past' : ''}" x1="${(120 + r1 * Math.sin(a)).toFixed(1)}" y1="${(120 - r1 * Math.cos(a)).toFixed(1)}" x2="${(120 + r2 * Math.sin(a)).toFixed(1)}" y2="${(120 - r2 * Math.cos(a)).toFixed(1)}"/>`;
  }
  return `<div class="dial" aria-hidden="true"><svg viewBox="0 0 240 240">${ticks}
    <circle class="d-track" cx="120" cy="120" r="${R}"/>
    <circle class="d-arc" cx="120" cy="120" r="${R}" style="--c:${C.toFixed(1)};animation-delay:-${sec.toFixed(2)}s" transform="rotate(-90 120 120)"/>
    <g class="d-dot" style="animation-delay:-${sec.toFixed(2)}s"><circle cx="120" cy="28" r="4.5"/></g></svg>
    <div class="dial-in"><span class="dial-time">${hhmm(now)}</span>
    <span class="dial-date">${now.toLocaleDateString(prefs.lang === 'fr' ? 'fr-CH' : 'de-CH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Zurich' })}</span></div></div>`;
}
// Login-Uhr jede Sekunde nachführen, ohne die Eingaben anzufassen
function tickDial() {
  const d = app.querySelector('.dial');
  if (!d) return;
  const now = new Date(), sec = now.getSeconds();
  if (sec === 0) { d.outerHTML = loginDial(); return; }   // neue Minute: Bogen sauber neu starten
  d.querySelectorAll('.tk').forEach((l) => l.classList.toggle('past', +l.dataset.i <= sec));
  const t = d.querySelector('.dial-time');
  if (t && t.textContent !== hhmm(now)) t.textContent = hhmm(now);
}

function viewLogin() {
  const L = T();
  return `<div class="login-wrap">
    <img class="login-logo" src="${import.meta.env.BASE_URL}logo.png" alt="Net Powersafe SA" />
    ${loginDial()}
    <form class="login" id="login" novalidate>
      <h1>${L.appName}</h1>
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
    ${S.pushHint ? `<p class="hint">${esc(S.pushHint)}</p>` : ''}
    ${S.bioAvail ? `<span class="plabel">${L.bioTitle}</span>
    <button type="button" class="toggle ${lockId() ? 'on' : ''}" data-act="bio" ${S.busy ? 'disabled' : ''}>
      <span>${L.bioText}</span><i></i></button>
    ${S.bioHint ? `<p class="hint">${esc(S.bioHint)}</p>` : ''}` : ''}` : ''}
  </div>`;
}

function viewSettings() {
  return `<div class="modal" data-act="setclose"><div class="sheet" data-stop="1">
    <div class="sheethead"><b>${T().settings}</b><button class="icon" data-act="setclose">${ICON.close}</button></div>
    ${prefsControls()}
  </div></div>`;
}

// ---------------- Spesen ----------------
async function loadExpenses() {
  const [ex, rep_] = await Promise.all([
    sb.from('expenses').select('*').order('day', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('expense_reports').select('*').order('month', { ascending: false }),
  ]);
  if (ex.error) throw ex.error;
  S.expenses = ex.data;
  S.expReports = rep_.data || [];
  const missing = S.expenses.map((x) => x.photo_path).filter((p) => p && !S.thumbs[p]);
  if (missing.length) {
    const { data } = await sb.storage.from('receipts').createSignedUrls(missing, 6 * 3600);
    for (const d of data || []) if (d.signedUrl) S.thumbs[d.path] = d.signedUrl;
  }
  if (S.view === 'expenses' && !S.exp) render();
  fixStaleSheets();
}

// Spesenblätter prüfen: stimmen Summe/Anzahl nicht (z. B. Änderung vor diesem Update), sofort neu erstellen
let fixingSheets = false;
const SHEET_LAYOUT = '2026-10-26T06:30:00Z';   // Blätter, die vorher erstellt wurden, bekommen das neue Layout
async function fixStaleSheets() {
  if (fixingSheets || !S.user) return;
  const cur = dayKey(new Date()).slice(0, 7);
  const months = new Set([...S.expenses.map((x) => x.day.slice(0, 7)), ...S.expReports.map((r) => r.month)]);
  const stale = [...months].filter((ym) => {
    const rep = S.expReports.find((r) => r.month === ym);
    const items = S.expenses.filter((x) => x.day.startsWith(ym));
    if (!rep) return ym < cur && items.length > 0;
    return Math.abs(Number(rep.total) - expenseTotals(items).total) > 0.004 || rep.count !== items.length
      || rep.created_at < SHEET_LAYOUT;   // altes Layout (z. B. mit Unterschriften) -> neu erstellen
  });
  if (!stale.length) return;
  fixingSheets = true;
  try { await refreshSheets(stale.map((ym) => `${ym}-01`)); } finally { fixingSheets = false; }
}

// Rück-Zusatz der Strecke in der App-Sprache anzeigen
const routeLabel = (r) => cleanRoute(r).replace(/\s*(und zurück|aller-retour)$/i, () => ` ${T().expRetSuffix}`);
const monthLabel = (ym) => `${T().months[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

function viewExpenses() {
  const L = T();
  const ym = S.expMonth;
  const items = S.expenses.filter((x) => x.day.startsWith(ym));
  const tot = expenseTotals(items);
  const lwd = lastWorkday(ym, (d) => !!holidayName(d));
  const today = dayKey(new Date());
  const rep = S.expReports.find((r) => r.month === ym);
  const curYm = today.slice(0, 7);
  const sub = rep ? L.expSheetDone(fmtDate(rep.created_at.slice(0, 10)))
    : ym === curYm ? L.expSheetOn(fmtDate(lwd)) : ym < curYm ? (items.length ? L.expSheetSoon : '') : '';
  const cats = CATEGORIES.filter((c) => tot.byCat[c] > 0);
  return `
  <div class="weeknav">
    <button class="icon" data-act="expprev">${ICON.prev}</button>
    <div><b>${monthLabel(ym)}</b><small>${L.expCount(items.length)}</small></div>
    <button class="icon" data-act="expnext" ${ym >= curYm ? 'disabled' : ''}>${ICON.next}</button>
  </div>
  <section class="card exp-sum">
    <div class="exp-total"><span>CHF</span>${fmtChf(tot.total)}</div>
    ${sub ? `<p class="exp-sub">${sub}</p>` : ''}
    ${cats.length > 1 ? `<div class="exp-cats">${cats.map((c) => `<span class="cat-${c}"><i></i>${L.cat[c]} ${fmtChf(tot.byCat[c])}</span>`).join('')}</div>` : ''}
  </section>
  <label class="big go cam">${ICON.camera}<span>${L.expPhoto}</span><input type="file" accept="image/*" capture="environment" data-exp-file hidden /></label>
  <div class="exp-alt">
    <label class="link exp-pick">${ICON.image}<span>${L.expPickShort}</span><input type="file" accept="image/*" data-exp-file hidden /></label>
    <button class="link exp-pick" data-act="expkm">${ICON.car}<span>${L.expKm}</span></button>
  </div>
  ${items.length ? `<section class="card pad0"><ul class="list exp-list">${items.map((x) => `
    <li data-act="expopen" data-id="${x.id}">
      <span class="thumb ${x.category === 'km' ? 'cat-km' : ''}">${x.category === 'km' ? ICON.car : x.photo_path && S.thumbs[x.photo_path] ? `<img src="${esc(S.thumbs[x.photo_path])}" alt="" loading="lazy" />` : ICON.camera}</span>
      <div><b>${esc((x.category === 'km' ? routeLabel(x.route) : '') || x.note || L.cat[x.category])}</b><small><i class="dot cat-${x.category}"></i>${x.category === 'km' ? `${String(Number(x.km)).replace('.', ',')} km` : L.cat[x.category]} · ${fmtDate(x.day)}</small></div>
      <div class="r"><b>${fmtChf(x.amount)}</b></div>
    </li>`).join('')}</ul></section>` : `<p class="hint center-t">${L.expEmpty}</p>`}
  ${items.length ? `<div class="exp-btns"><button class="btn ghost" data-act="expdraft" ${S.busy ? 'disabled' : ''}>${L.expDraft}</button>
    ${items.some((x) => x.photo_path) ? `<button class="btn ghost" data-act="expphotos" ${S.busy ? 'disabled' : ''}>${ICON.image}<span>${L.expPhotos}</span></button>` : ''}</div>` : ''}
  ${S.expReports.length ? `<h3 class="exp-h">${L.expSheets}</h3><section class="card pad0"><ul class="list">${S.expReports.map((r) => `
    <li data-act="sheet" data-kind="exp" data-key="${r.month}">
      <div><b>${monthLabel(r.month)}</b><small>${L.expCount(r.count)}</small></div>
      <div class="r"><b>CHF ${fmtChf(r.total)}</b></div><span class="dl">${ICON.download}</span>
    </li>`).join('')}</ul></section>` : ''}`;
}

function viewKmSheet() {
  const L = T(), x = S.exp;
  const routes = [...new Set(S.expenses.filter((e) => e.category === 'km' && e.route).map((e) => e.route))].slice(0, 20);
  return `<div class="modal"><div class="sheet exp-sheet">
    <div class="sheethead"><b>${x.id ? L.expKmEdit : L.expKmNew}</b><button class="icon" data-act="expclose">${ICON.close}</button></div>
    <label class="fld"><span>${L.expRoute}</span><input data-exp="route" list="km-routes" maxlength="80" value="${esc(x.route || '')}" placeholder="${L.expRouteHint}" autocomplete="off" />
      <datalist id="km-routes">${routes.map((r) => `<option value="${esc(r)}"></option>`).join('')}</datalist></label>
    <div class="exp-grid">
      <label class="fld"><span>${L.expKmField}</span><input data-exp="km" inputmode="decimal" value="${esc(x.km ?? '')}" placeholder="0" /></label>
      <label class="fld"><span>${L.expDate}</span><input type="date" data-exp="day" value="${esc(x.day)}" max="${dayKey(new Date())}" /></label>
    </div>
    <button type="button" class="toggle ${x.ret ? 'on' : ''}" data-act="expret"><span>${L.expReturn}</span><i></i></button>
    <div class="km-calc"><span class="km-formula">${kmFormula()}</span><b class="km-amt">CHF ${fmtChf(kmTotal().amount)}</b></div>
    <label class="fld"><span>${L.expNote}</span><input data-exp="note" maxlength="120" value="${esc(x.note || '')}" placeholder="${L.expKmNoteHint}" /></label>
    <button class="btn" data-act="expsave" ${S.busy ? 'disabled' : ''}>${L.save}</button>
    ${x.id ? `<button class="link danger" data-act="expdel">${L.expDelete}</button>` : ''}
  </div></div>`;
}
const numIn = (v) => Number(String(v ?? '').replace(/['’\s]/g, '').replace(',', '.'));
function kmTotal() {
  const x = S.exp, km = Math.round(numIn(x.km) * (x.ret ? 2 : 1) * 10) / 10;
  return { km: km > 0 ? km : 0, amount: km > 0 ? kmAmount(km, CONFIG.kmRate) : 0 };
}
function kmFormula() {
  const x = S.exp, k = numIn(x.km);
  if (!(k > 0)) return `CHF ${fmtChf(CONFIG.kmRate)} / km`;
  const t = kmTotal().km;
  return `${x.ret ? `2 × ${String(k).replace('.', ',')} km = ` : ''}${String(t).replace('.', ',')} km × ${fmtChf(CONFIG.kmRate)}`;
}
function refreshKm() {
  const f = app.querySelector('.km-formula'), a = app.querySelector('.km-amt');
  if (f) f.textContent = kmFormula();
  if (a) a.textContent = `CHF ${fmtChf(kmTotal().amount)}`;
}

function viewExpSheet() {
  const L = T(), x = S.exp;
  if (x.kind === 'km') return viewKmSheet();
  const status = { run: L.expOcrRun, ok: L.expOcrOk, fail: L.expOcrFail }[x.ocr] || '';
  return `<div class="modal"><div class="sheet exp-sheet">
    <div class="sheethead"><b>${x.id ? L.expEdit : L.expNew}</b><button class="icon" data-act="expclose">${ICON.close}</button></div>
    ${x.url ? `<img class="exp-photo" src="${esc(x.url)}" alt="" />` : ''}
    ${x.id && x.photo_path ? `<button class="link exp-dl" data-act="expphoto">${ICON.download}<span>${L.expPhotoDl}</span></button>` : ''}
    ${status ? `<p class="exp-ocr ${x.ocr}">${x.ocr === 'run' ? '<i class="spin"></i>' : ''}<span>${status}</span></p>` : ''}
    <div class="exp-grid">
      <label class="fld"><span>${L.expAmount}</span><input data-exp="amount" inputmode="decimal" enterkeyhint="done" value="${esc(x.amount ?? '')}" placeholder="0.00" /></label>
      <label class="fld"><span>${L.expDate}</span><input type="date" data-exp="day" value="${esc(x.day)}" max="${dayKey(new Date())}" /></label>
    </div>
    <span class="fld-l">${L.expCat}</span>
    <div class="chips">${PHOTO_CATS.map((c) => `<button type="button" class="chip cat-${c} ${x.category === c ? 'on' : ''}" data-act="expcat" data-v="${c}"><i></i>${L.cat[c]}</button>`).join('')}</div>
    <label class="fld"><span>${L.expNote}</span><input data-exp="note" maxlength="120" value="${esc(x.note || '')}" placeholder="${L.expNoteHint}" /></label>
    <button class="btn" data-act="expsave" ${S.busy ? 'disabled' : ''}>${L.save}</button>
    ${x.id ? `<button class="link danger" data-act="expdel">${L.expDelete}</button>` : ''}
  </div></div>`;
}

// Foto verkleinern (max. 1600 px, JPEG) – spart Speicher und lädt schnell
async function shrinkPhoto(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w0 = src.width, h0 = src.height, k = Math.min(1, 1600 / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
}

function newExpense(file) {
  S.exp = { day: dayKey(new Date()), amount: '', category: 'essen', note: '', url: URL.createObjectURL(file), ocr: 'run', touched: {} };
  enterAnim = 'sheet';
  render();
  (async () => {
    const exp = S.exp;
    try {
      exp.blob = await shrinkPhoto(file);
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('deu');
      const { data } = await worker.recognize(exp.blob);
      await worker.terminate();
      const r = parseReceipt(data.text);
      if (S.exp !== exp) return;
      if (r.amount != null && !exp.touched.amount) exp.amount = r.amount.toFixed(2);
      if (r.day && !exp.touched.day) exp.day = r.day;
      exp.ocr = r.amount != null ? 'ok' : 'fail';
    } catch (e) {
      console.warn('OCR', e);
      if (!exp.blob) try { exp.blob = await shrinkPhoto(file); } catch { exp.blob = file; }
      exp.ocr = 'fail';
    }
    if (S.exp !== exp) return;
    // nur die betroffenen Felder aktualisieren, damit Eingaben/Fokus erhalten bleiben
    const sh = app.querySelector('.exp-sheet');
    if (!sh) return;
    const a = sh.querySelector('[data-exp=amount]'), d = sh.querySelector('[data-exp=day]');
    if (!exp.touched.amount && a) a.value = exp.amount;
    if (!exp.touched.day && d) d.value = exp.day;
    const st = sh.querySelector('.exp-ocr');
    if (st) { st.className = `exp-ocr ${exp.ocr}`; st.innerHTML = `<span>${exp.ocr === 'ok' ? T().expOcrOk : T().expOcrFail}</span>`; }
    if (exp.ocr === 'ok') a?.classList.add('flash');
  })();
}

function openExpense(id) {
  const x = S.expenses.find((e) => e.id === id);
  if (!x) return;
  if (x.category === 'km') {
    const r = cleanRoute(x.route), ret = /\s(und zurück|aller-retour)$/i.test(r);
    S.exp = { kind: 'km', id, day: x.day, km: String(ret ? Number(x.km) / 2 : Number(x.km)), ret, route: r.replace(/\s*(und zurück|aller-retour)$/i, ''), note: x.note, touched: {} };
    enterAnim = 'sheet'; return render();
  }
  S.exp = { id, day: x.day, amount: Number(x.amount).toFixed(2), category: x.category, note: x.note, url: x.photo_path ? S.thumbs[x.photo_path] : null, photo_path: x.photo_path, touched: {} };
  enterAnim = 'sheet';
  render();
}

async function saveExpense() {
  const L = T(), x = S.exp;
  if (x.kind === 'km') return saveKm();
  const amount = Number(String(x.amount).replace(/['’\s]/g, '').replace(',', '.'));
  if (!(amount > 0)) { toast(L.expNeedAmount, true); app.querySelector('[data-exp=amount]')?.focus(); return; }
  if (!x.day) { toast(L.expNeedDate, true); return; }
  S.busy = true; render();
  try {
    const row = { day: x.day, amount: Math.round(amount * 100) / 100, category: x.category, note: (x.note || '').trim() };
    const origDay = x.id ? S.expenses.find((e) => e.id === x.id)?.day : null;
    if (x.id) {
      const { error } = await sb.from('expenses').update(row).eq('id', x.id);
      if (error) throw error;
    } else {
      if (!x.blob && x.url) x.blob = await (await fetch(x.url)).blob();
      const path = `${S.user.id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from('receipts').upload(path, x.blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await sb.from('expenses').insert({ ...row, photo_path: path });
      if (error) { await sb.storage.from('receipts').remove([path]); throw error; }
      S.thumbs[path] = x.url;
    }
    S.expMonth = x.day.slice(0, 7);
    S.exp = null; S.busy = false;
    haptic();
    await loadExpenses();
    render();
    toast(x.id ? L.expSaved : L.expAdded(fmtChf(row.amount)));
    refreshSheets([x.day, origDay]);
  } catch (e) { S.busy = false; render(); toast(L.error + (e.message || e), true); }
}

async function saveKm() {
  const L = T(), x = S.exp;
  const { km, amount } = kmTotal();
  if (!(km > 0)) { toast(L.expNeedKm, true); app.querySelector('[data-exp=km]')?.focus(); return; }
  if (!x.day) { toast(L.expNeedDate, true); return; }
  const base = cleanRoute(x.route).replace(/\s*(und zurück|aller-retour)$/i, '');
  const route = base + (x.ret ? ` ${L.expRetSuffix}` : '');
  S.busy = true; render();
  try {
    const row = { day: x.day, amount, category: 'km', km, route, note: (x.note || '').trim() };
    const origDay = x.id ? S.expenses.find((e) => e.id === x.id)?.day : null;
    const { error } = x.id ? await sb.from('expenses').update(row).eq('id', x.id) : await sb.from('expenses').insert(row);
    if (error) throw error;
    S.expMonth = x.day.slice(0, 7);
    S.exp = null; S.busy = false;
    haptic();
    await loadExpenses();
    render();
    toast(L.expKmAdded(String(km).replace('.', ','), fmtChf(amount)));
    refreshSheets([x.day, origDay]);
  } catch (e) { S.busy = false; render(); toast(L.error + (e.message || e), true); }
}

async function deleteExpense(btn) {
  const L = T();
  if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = L.expDeleteSure; return; }
  const x = S.exp;
  S.busy = true; render();
  try {
    const { error } = await sb.from('expenses').delete().eq('id', x.id);
    if (error) throw error;
    if (x.photo_path) await sb.storage.from('receipts').remove([x.photo_path]);
    S.exp = null; S.busy = false;
    await loadExpenses(); render();
    refreshSheets([x.day]);
  } catch (e) { S.busy = false; render(); toast(L.error + (e.message || e), true); }
}

const monthItems = (ym) => S.expenses.filter((x) => x.day.startsWith(ym))
  .sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at));
async function loadPhotos(items) {
  const photos = new Map();
  await Promise.all(items.filter((x) => x.photo_path).map(async (x) => {
    const { data } = await sb.storage.from('receipts').download(x.photo_path);
    if (data) photos.set(x.id, new Uint8Array(await data.arrayBuffer()));
  }));
  return photos;
}

// Nach einer Änderung: Spesenblatt eines abgeschlossenen (oder schon erstellten) Monats sofort neu erzeugen
async function refreshSheets(days) {
  const months = [...new Set(days.filter(Boolean).map((d) => d.slice(0, 7)))];
  const today = dayKey(new Date()), cur = today.slice(0, 7);
  for (const ym of months) {
    const rep = S.expReports.find((r) => r.month === ym);
    const due = rep || ym < cur || today >= lastWorkday(ym, (d) => !!holidayName(d));
    if (!due) continue;
    try {
      const items = monthItems(ym);
      const path = `${S.user.id}/Spesen-${ym}.pdf`;
      if (!items.length) {
        if (rep) {
          await sb.from('expense_reports').delete().eq('month', ym);
          await sb.storage.from('reports').remove([rep.pdf_path]);
        }
        continue;
      }
      const { buildExpensePdf } = await import('./lib/pdf-expense.js');
      const bytes = await buildExpensePdf(ym, items, new Map(), await getLogo(), pdfLang());
      const up = await sb.storage.from('reports').upload(path, bytes, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
      if (up.error) throw up.error;
      const { error } = await sb.from('expense_reports').upsert({
        month: ym, total: expenseTotals(items).total, count: items.length, pdf_path: path, created_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month' });
      if (error) throw error;
      toast(T().expSheetUpdated(monthLabel(ym)));
    } catch (e) { toast(T().error + (e.message || e), true); }
  }
  await loadExpenses().catch(() => {});
}

// Belegfotos eines Monats als eigenes PDF (Nummern wie im Spesenblatt)
async function receiptsPdf() {
  if (S.busy) return;
  S.busy = true; render();
  try {
    const ym = S.expMonth, items = monthItems(ym);
    const { buildExpensePdf } = await import('./lib/pdf-expense.js');
    const bytes = await buildExpensePdf(ym, items, await loadPhotos(items), null, { receiptsOnly: true, ...pdfLang() });
    S.busy = false; render();
    await saveFile(bytes, `${T().fileReceipts}_${ym}.pdf`);
  } catch (e) { S.busy = false; render(); toast(T().error + (e.message || e), true); }
}

// einzelnes Belegfoto herunterladen
async function photoDownload() {
  const x = S.exp;
  if (!x?.photo_path || S.busy) return;
  try {
    const { data, error } = await sb.storage.from('receipts').download(x.photo_path);
    if (error) throw error;
    await saveFile(new Uint8Array(await data.arrayBuffer()), `${T().fileReceipt}_${x.day}.jpg`, 'image/jpeg');
  } catch (e) { toast(T().error + (e.message || e), true); }
}

async function expenseDraftPdf() {
  if (S.busy) return;
  S.busy = true; render();
  try {
    const ym = S.expMonth;
    const items = monthItems(ym);
    const photos = new Map();
    const { buildExpensePdf } = await import('./lib/pdf-expense.js');
    const now = new Date();
    const bytes = await buildExpensePdf(ym, items, photos, await getLogo(),
      { draft: true, stamp: `${T().pdfStand} ${fmtDate(dayKey(now))} ${hhmm(now)}`, ...pdfLang() });
    S.busy = false; render();
    await saveFile(bytes, `${T().fileExp}_${ym}_${T().fileDraft}.pdf`);
  } catch (e) { S.busy = false; render(); toast(T().error + (e.message || e), true); }
}

// ---------------- Rendern ----------------
// ---------------- Seiten-Slider + Animationen ----------------
const VIEWS = ['stamp', 'week', 'expenses', 'archive'];
const EASE = 'cubic-bezier(.22,1,.36,1)';               // weiches Auslaufen (easeOutQuint)
let shownIdx = 0, dragDx = 0, enterAnim = null;   // enterAnim: 'sheet' | 'drawer' – nur beim Öffnen animieren
const segPrev = {};
const viewOf = (v) => (v === 'stamp' ? viewStamp() : v === 'week' ? viewWeek() : v === 'expenses' ? viewExpenses() : viewArchive());

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
  if (VIEWS[next] === 'expenses' && S.view !== 'expenses') loadExpenses().catch(() => {});
  if (VIEWS[next] === 'archive' && S.view !== 'archive') loadReports().then(() => setTimeout(render, 500)).catch(() => {});
  S.view = VIEWS[next];
  render();
});

app.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset.exp || !S.exp) return;
  S.exp[t.dataset.exp] = t.value;
  S.exp.touched = { ...S.exp.touched, [t.dataset.exp]: true };
  if (S.exp.kind === 'km') {
    if (t.dataset.exp === 'route' && !S.exp.touched.km) {
      // bekannte Strecke: Kilometer vom letzten Mal übernehmen
      const r = t.value.trim(), ret = (T().expRetSuffix || '').trim();
      const prev = S.expenses.find((e) => e.category === 'km' && (e.route === r || e.route === `${r} ${ret}`));
      if (prev) {
        const isRet = prev.route.endsWith(ret);
        S.exp.km = String(isRet ? Number(prev.km) / 2 : Number(prev.km)); S.exp.ret = isRet;
        if (isRet) S.exp.route = r;
        const k = app.querySelector('[data-exp=km]'); if (k) { k.value = S.exp.km; k.classList.add('flash'); }
        app.querySelector('[data-act=expret]')?.classList.toggle('on', isRet);
      }
    }
    refreshKm();
  }
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
  if (S.locked && lockId()) { app.innerHTML = viewLock(); return; }
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
  <nav><div class="tabbar"><span class="ind"></span>${tab('stamp', L.tabStamp)}${tab('week', L.tabWeek)}${tab('expenses', L.tabExp)}${tab('archive', L.tabArchive)}</div></nav>
  ${S.editor ? viewEditor() : ''}
  ${S.drawer ? viewDrawer() : ''}
  ${S.settings ? viewSettings() : ''}
  ${S.exp ? viewExpSheet() : ''}
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
  if (t.matches('[data-exp-file]')) { const f = t.files?.[0]; t.value = ''; if (f) newExpense(f); return; }
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
  else if (a === 'view') { S.view = el.dataset.v; if (S.view === 'expenses') loadExpenses().catch(() => {}); if (S.view === 'archive') loadReports().then(() => setTimeout(render, 500)).catch(() => {}); render(); }
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
  else if (a === 'dl') download(el.dataset.path, el.dataset.name);
  else if (a === 'sheet') sheetPdf(el.dataset.kind, el.dataset.key);
  else if (a === 'expprev' || a === 'expnext') {
    const [y, m] = S.expMonth.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + (a === 'expnext' ? 1 : -1), 1));
    S.expMonth = d.toISOString().slice(0, 7); render();
  }
  else if (a === 'expopen') openExpense(el.dataset.id);
  else if (a === 'expclose') { if (S.exp?.url?.startsWith('blob:')) URL.revokeObjectURL(S.exp.url); S.exp = null; render(); }
  else if (a === 'expcat') { S.exp.category = el.dataset.v; app.querySelectorAll('[data-act=expcat]').forEach((b) => b.classList.toggle('on', b === el)); }
  else if (a === 'expsave') saveExpense();
  else if (a === 'expdel') deleteExpense(el);
  else if (a === 'expdraft') expenseDraftPdf();
  else if (a === 'expphotos') receiptsPdf();
  else if (a === 'expphoto') photoDownload();
  else if (a === 'expkm') { S.exp = { kind: 'km', day: dayKey(new Date()), km: '', ret: false, route: '', note: '', touched: {} }; enterAnim = 'sheet'; render(); app.querySelector('[data-exp=route]')?.focus(); }
  else if (a === 'expret') { S.exp.ret = !S.exp.ret; el.classList.toggle('on', S.exp.ret); refreshKm(); }
  else if (a === 'arch') { S.archTab = el.dataset.v; render(); }
  else if (a === 'rep') periodPdf(el.dataset.k);
  else if (a === 'pt') { S.chartSel = +el.dataset.i; render(); }
  else if (a === 'settings') { S.settings = true; enterAnim = 'sheet'; render(); }
  else if (a === 'setclose') { S.settings = false; render(); }
  else if (a === 'pweye') { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.classList.toggle('on'); }
  else if (a === 'push') togglePush();
  else if (a === 'bio') toggleBio();
  else if (a === 'unlock') unlock();
  else if (a === 'pref') { setPref(el.dataset.k, el.dataset.v); if (el.dataset.k === 'lang') syncLang(); render(); }
  else if (a === 'logout') { S.locked = false; await sb.auth.signOut(); }
});

// Uhr aktualisieren
// Login-Zifferblatt jede Minute nachführen (ohne die Eingaben zu verlieren)
setInterval(() => { if (!S.user || S.locked) tickDial(); }, 1000);
setInterval(() => { if (S.user && !S.locked && S.view === 'stamp' && !S.editor && !S.drawer && !S.settings && !S.exp && !slide) render(); }, 30000);
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

// ---------------- Face ID (App-Sperre über WebAuthn, nur auf diesem Gerät) ----------------
const LKEY = 'stempeluhr.lock';
function lockId() { try { return JSON.parse(localStorage.getItem(LKEY) || 'null')?.id || null; } catch { return null; } }
const u8 = (n) => crypto.getRandomValues(new Uint8Array(n));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
try {
  window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.().then((ok) => { S.bioAvail = !!ok; }).catch(() => {});
} catch { /* egal */ }

async function toggleBio() {
  const L = T();
  S.bioHint = null;
  if (lockId()) { try { localStorage.removeItem(LKEY); } catch { /* egal */ } return render(); }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: u8(32),
      rp: { name: 'Stempeluhr', id: location.hostname },
      user: { id: u8(16), name: S.user.email || 'stempeluhr', displayName: CONFIG.employee },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } });
    localStorage.setItem(LKEY, JSON.stringify({ id: toB64(cred.rawId) }));
    toast(L.bioOn);
  } catch (e) { if (e.name !== 'NotAllowedError') S.bioHint = e.message; }
  render();
}

let unlocking = false;
async function unlock() {
  const id = lockId();
  if (!id) { S.locked = false; return render(); }
  if (unlocking) return;
  unlocking = true;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: u8(32), rpId: location.hostname, timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: b64ToU8(id) }],
    } });
    S.locked = false; countUpNext = true; render();
  } catch { /* abgebrochen: Sperrbildschirm bleibt */ }
  unlocking = false;
}

function viewLock() {
  const L = T();
  return `<div class="login-wrap lock">
    <img class="login-logo" src="${import.meta.env.BASE_URL}logo.png" alt="Net Powersafe SA" />
    ${loginDial()}
    <div class="login">
      <h1>${L.greet(+hhmm(new Date()).slice(0, 2))}, ${esc(CONFIG.employee.split(' ')[0])}</h1>
      <button class="btn login-btn bio-btn" data-act="unlock">${ICON.face}<span>${L.bioUnlock}</span></button>
      <button class="link" data-act="logout">${L.bioPassword}</button>
    </div>
  </div>`;
}

// nach mehr als 5 Minuten im Hintergrund wieder sperren
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (S.user && lockId() && hiddenAt && Date.now() - hiddenAt > 5 * 60000) { S.locked = true; render(); unlock(); }
});

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
  if (!S.user) S.locked = false;
  if (S.user && S.user.id !== was) { loadAll(); if (S.locked) unlock(); }
  else render();
  hideSplash();
});
