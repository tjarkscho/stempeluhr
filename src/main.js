import { createClient } from '@supabase/supabase-js';
import './style.css';
import { CONFIG } from './config.js';
import {
  dayKey, hhmm, zurichToDate, addDays, weekday, mondayOf, isoWeek,
  fmtDate, fmtMin,
} from './lib/time.js';
import { prefs, setPref, applyPrefs, T, label, THEMES } from './i18n.js';
import { holidayName } from './lib/holidays.js';
import { groupByDay, dayStats, dayTargets, weekStats, saldoThrough, validateDay } from './lib/calc.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.getElementById('app');
applyPrefs();

if (!URL_ || !KEY) {
  app.innerHTML = `<div class="center"><div class="card"><h2>Konfiguration fehlt</h2>
  <p>VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in <code>.env</code> setzen (siehe README).</p></div></div>`;
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
  out: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10"/></svg>',
};

function toast(msg, err = false) {
  S.toast = { msg, err };
  render();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { S.toast = null; render(); }, 3500);
}

// ---------------- Daten ----------------
async function loadEntries() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('entries').select('id,kind,ts,manual').order('ts').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  S.entries = all;
  S.byDay = groupByDay(all);
}
async function loadAbsences() {
  const { data, error } = await sb.from('absences').select('day,kind');
  if (error) throw error;
  S.absences = new Map(data.map((a) => [a.day, a.kind]));
}
async function loadReports() {
  const { data, error } = await sb.from('weekly_reports').select('*').order('week_start', { ascending: false });
  if (error) throw error;
  S.reports = data;
}
async function loadAll() {
  try { await Promise.all([loadEntries(), loadAbsences(), loadReports()]); }
  catch (e) { toast(T().loadFailed + e.message, true); }
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

async function stamp(kinds) {
  if (S.busy) return;
  S.busy = true; render();
  const ts = new Date();
  const rows = kinds.map((kind, i) => ({ kind, ts: new Date(ts.getTime() + i * 1000).toISOString() }));
  const { error } = await sb.from('entries').insert(rows);
  S.busy = false;
  if (error) return toast(T().error + error.message, true);
  if (navigator.vibrate) navigator.vibrate(40);
  await loadEntries();
  toast(`${T().kind[kinds[kinds.length - 1]]} ${hhmm(ts)}`);
}

function viewStamp() {
  const { today, st, forgot } = todayInfo();
  const t = dayTargets(today, S.absences);
  const L = T();
  const stateTxt = { off: st.in ? L.stateOff : L.stateNone, work: L.stateWork, break: L.stateBreak }[st.state];
  const saldo = saldoThrough(mondayOf(today), S.byDay, S.absences);
  const need = st.state !== 'off' ? Math.max(0, (t.soll - t.credit) - st.total) : null;
  let buttons = '';
  if (st.state === 'off') buttons = `<button class="big go" data-act="in" ${S.busy ? 'disabled' : ''}>${L.clockIn}</button>`;
  else if (st.state === 'work') buttons = `
    <button class="big stop" data-act="out" ${S.busy ? 'disabled' : ''}>${L.clockOut}</button>
    <button class="big pause" data-act="pause" ${S.busy ? 'disabled' : ''}>${L.pause}</button>`;
  else buttons = `
    <button class="big go" data-act="pause_end" ${S.busy ? 'disabled' : ''}>${L.pauseEnd}</button>
    <button class="big stop" data-act="out" ${S.busy ? 'disabled' : ''}>${L.clockOut}</button>`;

  return `
  ${forgot ? `<div class="warn" data-act="edit" data-day="${forgot}">${ICON.warn}<span>${L.forgot(fmtDate(forgot))}</span></div>` : ''}
  <section class="card hero">
    <div class="state s-${st.state}"><span class="dot"></span>${stateTxt}</div>
    <div class="clock">${fmtMin(st.total)}</div>
    <div class="sub">${L.workedToday}${t.label ? ` · ${esc(label(t.label))}` : ''}</div>
    <div class="facts">
      <div><span>${L.in}</span><b>${st.in ? hhmm(st.in) : '–'}</b></div>
      <div><span>${L.pause}</span><b>${fmtMin(st.stamped)}</b></div>
      <div><span>${need != null ? L.remaining : L.balance}</span><b>${need != null ? fmtMin(need) : fmtMin(saldo, true)}</b></div>
    </div>
  </section>
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
  const saldo = saldoThrough(m, S.byDay, S.absences, now);
  // laufende Woche: Differenz nur bis heute (sonst stünde das Soll der restlichen Tage als Minus da)
  const dw = isCurrent ? w.diffToDate : w.diff;
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
    <div><span>${L.target}</span><b>${fmtMin(w.soll)}</b></div>
    <div><span>${L.actual}</span><b>${fmtMin(w.ist)}</b>${w.bonus ? `<small class="sub2">${L.bonus} ${fmtMin(w.bonus)}</small>` : ''}</div>
    <div><span>${L.diff}${isCurrent ? ' ' + L.today : ''}</span><b class="${dw < 0 ? 'neg' : 'pos'}">${fmtMin(dw, true)}</b></div>
    <div><span>${L.balanceTotal}${isCurrent ? ' ' + L.today : ''}</span><b class="${saldo < 0 ? 'neg' : 'pos'}">${fmtMin(saldo, true)}</b></div>
  </div>
  <p class="hint">${L.weekHint}</p>
  ${done && addDays(m, 6) >= CONFIG.startDate ? `<button class="btn" data-act="genpdf" ${S.busy ? 'disabled' : ''}>${rep ? L.pdfRemake : L.pdfMake}</button>` : ''}
  ${rep ? `<button class="btn ghost" data-act="dl" data-path="${esc(rep.pdf_path)}">${L.pdfDownload}</button>` : ''}`;
}

// ---------------- Archiv ----------------
function viewArchive() {
  const L = T();
  if (!S.reports.length) return `<section class="card"><p>${L.archiveEmpty}</p></section>`;
  return `<section class="card pad0"><ul class="list">${S.reports.map((r) => `
    <li data-act="dl" data-path="${esc(r.pdf_path)}">
      <div><b>${L.week} ${r.week} / ${r.year}</b><small>${fmtDate(r.week_start)} – ${fmtDate(addDays(r.week_start, 6))}</small></div>
      <div class="r"><span class="${r.diff < 0 ? 'neg' : 'pos'}">${fmtMin(r.diff, true)}</span><small>${L.balance} ${fmtMin(r.saldo, true)}</small></div>
      <span class="dl">${ICON.download}</span>
    </li>`).join('')}</ul></section>`;
}

async function download(path) {
  const { data, error } = await sb.storage.from('reports').createSignedUrl(path, 120, { download: path.split('/').pop() });
  if (error) return toast(T().downloadFailed + error.message, true);
  window.location.href = data.signedUrl;
}

let logoCache;
async function getLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}logo.png`);
    logoCache = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { logoCache = null; }
  return logoCache;
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
  const events = S.byDay.get(day) || [];
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
    const cls = ['cd', inMonth ? '' : 'out', wd >= 5 ? 'we' : '', hol ? 'hol' : '', a ? 'a-' + a : '', d === today ? 'today' : ''].join(' ');
    const clickable = inMonth && wd < 5 && !hol;
    cells += `<div class="${cls}" ${clickable ? `data-act="abs" data-day="${d}"` : ''} title="${esc(label(hol) || '')}">
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
function viewLogin() {
  const L = T();
  return `<div class="center"><form class="card login" id="login">
    <div class="logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Net Powersafe SA" /></div>
    <h1>Stempeluhr</h1>
    <input type="email" name="email" placeholder="${L.email}" autocomplete="username" required />
    <input type="password" name="pw" placeholder="${L.password}" autocomplete="current-password" required />
    <button class="btn" ${S.busy ? 'disabled' : ''}>${L.login}</button>
  </form></div>`;
}

// ---------------- Einstellungen ----------------
function prefsControls() {
  const L = T();
  const seg = (k, vals, lab) => `<div class="seg">${vals.map((v) =>
    `<button type="button" class="${prefs[k] === v ? 'on' : ''}" data-act="pref" data-k="${k}" data-v="${v}">${lab(v)}</button>`).join('')}</div>`;
  return `<div class="prefs">
    <span class="plabel">${L.theme}</span>
    <div class="swatches">${THEMES.map((th) =>
      `<button type="button" class="sw sw-${th} ${prefs.theme === th ? 'on' : ''}" data-act="pref" data-k="theme" data-v="${th}"><i></i>${L.themes[th]}</button>`).join('')}</div>
    <span class="plabel">${L.language}</span>
    ${seg('lang', ['de', 'fr'], (v) => v.toUpperCase())}
  </div>`;
}

function viewSettings() {
  return `<div class="modal" data-act="setclose"><div class="sheet" data-stop="1">
    <div class="sheethead"><b>${T().settings}</b><button class="icon" data-act="setclose">${ICON.close}</button></div>
    ${prefsControls()}
  </div></div>`;
}

// ---------------- Rendern ----------------
function render() {
  if (!S.user) {
    app.innerHTML = viewLogin() + (S.toast ? `<div class="toast ${S.toast.err ? 'err' : ''}">${esc(S.toast.msg)}</div>` : '');
    return;
  }
  const L = T();
  const body = S.view === 'stamp' ? viewStamp() : S.view === 'week' ? viewWeek() : viewArchive();
  const tab = (v, l) => `<button class="${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${l}</button>`;
  // Fokus/Scroll im Editor erhalten
  const active = document.activeElement?.dataset?.ed ? { ed: document.activeElement.dataset.ed, i: document.activeElement.dataset.i } : null;
  app.innerHTML = `
  <header><img class="hlogo" src="${import.meta.env.BASE_URL}logo.png" alt="Net Powersafe SA" /><div>
    <button class="icon" data-act="drawer" title="${L.calendar}" aria-label="${L.calendar}">${ICON.cal}</button>
    <button class="icon" data-act="settings" title="${L.settings}" aria-label="${L.settings}">${ICON.gear}</button>
    <button class="icon" data-act="logout" title="${L.logout}" aria-label="${L.logout}">${ICON.out}</button></div></header>
  <main>${body}</main>
  <nav>${tab('stamp', L.tabStamp)}${tab('week', L.tabWeek)}${tab('archive', L.tabArchive)}</nav>
  ${S.editor ? viewEditor() : ''}
  ${S.drawer ? viewDrawer() : ''}
  ${S.settings ? viewSettings() : ''}
  ${S.toast ? `<div class="toast ${S.toast.err ? 'err' : ''}">${esc(S.toast.msg)}</div>` : ''}`;
  if (active) app.querySelector(`[data-ed="${active.ed}"][data-i="${active.i}"]`)?.focus();
}

app.addEventListener('submit', async (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const f = new FormData(e.target);
  S.busy = true; render();
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('pw') });
  S.busy = false;
  if (error) toast(T().loginFailed, true);
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
  else if (a === 'view') { S.view = el.dataset.v; if (S.view === 'archive') loadReports().then(render); render(); }
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
  else if (a === 'drawer') { S.drawer = !S.drawer; render(); }
  else if (a === 'cprev') { if (--S.calMonth < 0) { S.calMonth = 11; S.calYear--; } render(); }
  else if (a === 'cnext') { if (++S.calMonth > 11) { S.calMonth = 0; S.calYear++; } render(); }
  else if (a === 'abs') toggleAbsence(el.dataset.day);
  else if (a === 'genpdf') generatePdf(S.weekMonday);
  else if (a === 'dl') download(el.dataset.path);
  else if (a === 'settings') { S.settings = true; render(); }
  else if (a === 'setclose') { S.settings = false; render(); }
  else if (a === 'pref') { setPref(el.dataset.k, el.dataset.v); render(); }
  else if (a === 'logout') { await sb.auth.signOut(); }
});

// Uhr aktualisieren
setInterval(() => { if (S.user && S.view === 'stamp' && !S.editor && !S.drawer && !S.settings) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) loadEntries().then(render); });

sb.auth.onAuthStateChange((_ev, session) => {
  const was = S.user?.id;
  S.user = session?.user || null;
  if (S.user && S.user.id !== was) loadAll();
  else render();
});
