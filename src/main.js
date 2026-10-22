import { createClient } from '@supabase/supabase-js';
import './style.css';
import { CONFIG } from './config.js';
import {
  dayKey, hhmm, zurichToDate, addDays, weekday, mondayOf, isoWeek,
  fmtDate, fmtMin, DAY_NAMES, DAY_SHORT, MONTHS,
} from './lib/time.js';
import { holidayName } from './lib/holidays.js';
import { groupByDay, dayStats, dayTargets, weekStats, saldoThrough, validateDay } from './lib/calc.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.getElementById('app');

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
  editor: null,   // { day, rows: [{id?, kind, time}] }
  busy: false,
  toast: null,
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { in: 'Ein', out: 'Aus', break_start: 'Pause Start', break_end: 'Pause Ende' };

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
  catch (e) { toast('Laden fehlgeschlagen: ' + e.message, true); }
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
  if (error) return toast('Fehler: ' + error.message, true);
  if (navigator.vibrate) navigator.vibrate(40);
  await loadEntries();
  toast(`${KIND[kinds[kinds.length - 1]]} ${hhmm(ts)}`);
}

function viewStamp() {
  const { today, st, forgot } = todayInfo();
  const t = dayTargets(today, S.absences);
  const stateTxt = { off: st.in ? 'Ausgestempelt' : 'Nicht eingestempelt', work: 'Arbeitet', break: 'Pause' }[st.state];
  const saldo = saldoThrough(mondayOf(today), S.byDay, S.absences);
  const need = st.state !== 'off' ? Math.max(0, (t.soll - t.credit) - st.total) : null;
  let buttons = '';
  if (st.state === 'off') buttons = `<button class="big go" data-act="in" ${S.busy ? 'disabled' : ''}>Einstempeln</button>`;
  else if (st.state === 'work') buttons = `
    <button class="big stop" data-act="out" ${S.busy ? 'disabled' : ''}>Ausstempeln</button>
    <button class="big pause" data-act="pause" ${S.busy ? 'disabled' : ''}>Pause</button>`;
  else buttons = `
    <button class="big go" data-act="pause_end" ${S.busy ? 'disabled' : ''}>Pause beenden</button>
    <button class="big stop" data-act="out" ${S.busy ? 'disabled' : ''}>Ausstempeln</button>`;

  return `
  ${forgot ? `<div class="warn" data-act="edit" data-day="${forgot}">⚠️ ${fmtDate(forgot)}: Ausstempeln fehlt – tippen zum Korrigieren</div>` : ''}
  <section class="card hero">
    <div class="state s-${st.state}"><span class="dot"></span>${stateTxt}</div>
    <div class="clock">${fmtMin(st.total)}</div>
    <div class="sub">heute gearbeitet${t.label ? ` · ${esc(t.label)}` : ''}</div>
    <div class="facts">
      <div><span>Ein</span><b>${st.in ? hhmm(st.in) : '–'}</b></div>
      <div><span>Pause</span><b>${fmtMin(st.stamped)}</b></div>
      <div><span>${need != null ? 'Noch' : 'Saldo'}</span><b>${need != null ? fmtMin(need) : fmtMin(saldo, true)}</b></div>
    </div>
  </section>
  <div class="buttons">${buttons}</div>
  <p class="hint">Gesetzliche Mindestpause (ArG Art. 15) wird beim Ausstempeln automatisch berücksichtigt: ab 5:30 h → 15 min, ab 7 h → 30 min, ab 9 h → 60 min.</p>
  <button class="link" data-act="edit" data-day="${today}">Heute korrigieren</button>`;
}

// ---------------- Woche ----------------
function viewWeek() {
  const now = new Date();
  const today = dayKey(now);
  const m = S.weekMonday;
  const isCurrent = m === mondayOf(today);
  const w = weekStats(m, S.byDay, S.absences, now);
  const saldo = saldoThrough(m, S.byDay, S.absences, now);
  const rows = w.days.map((d, i) => {
    const has = !!d.in;
    const cls = [i >= 5 ? 'we' : '', d.day === today ? 'today' : '', d.day < CONFIG.startDate ? 'pre' : ''].join(' ');
    const mark = (b) => (b ? '<sup>*</sup>' : '');
    return `<tr class="${cls}" data-act="edit" data-day="${d.day}">
      <td>${DAY_SHORT[i]} <small>${fmtDate(d.day).slice(0, 5)}</small></td>
      <td>${has ? hhmm(d.in) + mark(d.manualIn) : ''}</td>
      <td>${has ? (d.out ? hhmm(d.out) + mark(d.manualOut) : (d.open ? '…' : '<b class="neg">?</b>')) : ''}</td>
      <td>${has ? fmtMin(d.pause) + mark(d.manualPause) : ''}</td>
      <td class="r"><b>${d.dayTotal ? fmtMin(d.dayTotal) : (d.soll ? '0:00' : '')}</b>${d.label ? `<div class="tag">${esc(d.label)}</div>` : ''}</td>
    </tr>`;
  }).join('');
  const done = addDays(m, 6) < today;
  const rep = S.reports.find((r) => r.week_start === m);
  return `
  <div class="weeknav">
    <button class="icon" data-act="wprev">‹</button>
    <div><b>KW ${w.week} / ${w.year}</b><small>${fmtDate(w.monday)} – ${fmtDate(w.sunday)}</small></div>
    <button class="icon" data-act="wnext" ${isCurrent ? 'disabled' : ''}>›</button>
  </div>
  <section class="card pad0">
    <table class="week">
      <thead><tr><th>Tag</th><th>Ein</th><th>Aus</th><th>Pause</th><th class="r">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <div class="stats">
    <div><span>Soll</span><b>${fmtMin(w.soll)}</b></div>
    <div><span>Ist</span><b>${fmtMin(w.ist)}</b></div>
    <div><span>Differenz</span><b class="${w.diff < 0 ? 'neg' : 'pos'}">${fmtMin(w.diff, true)}</b></div>
    <div><span>Saldo total${isCurrent ? ' (heute)' : ''}</span><b class="${saldo < 0 ? 'neg' : 'pos'}">${fmtMin(saldo, true)}</b></div>
  </div>
  <p class="hint">Tag antippen zum Korrigieren. <sup>*</sup> = manuell korrigiert.</p>
  ${done && addDays(m, 6) >= CONFIG.startDate ? `<button class="btn" data-act="genpdf" ${S.busy ? 'disabled' : ''}>${rep ? 'PDF neu erzeugen' : 'PDF erzeugen'}</button>` : ''}
  ${rep ? `<button class="btn ghost" data-act="dl" data-path="${esc(rep.pdf_path)}">PDF herunterladen</button>` : ''}`;
}

// ---------------- Archiv ----------------
function viewArchive() {
  if (!S.reports.length) return `<section class="card"><p>Noch keine Wochen-PDFs. Das erste wird am Montag nach der ersten Woche automatisch erstellt.</p></section>`;
  return `<section class="card pad0"><ul class="list">${S.reports.map((r) => `
    <li data-act="dl" data-path="${esc(r.pdf_path)}">
      <div><b>KW ${r.week} / ${r.year}</b><small>${fmtDate(r.week_start)} – ${fmtDate(addDays(r.week_start, 6))}</small></div>
      <div class="r"><span class="${r.diff < 0 ? 'neg' : 'pos'}">${fmtMin(r.diff, true)}</span><small>Saldo ${fmtMin(r.saldo, true)}</small></div>
      <span class="dl">⬇</span>
    </li>`).join('')}</ul></section>`;
}

async function download(path) {
  const { data, error } = await sb.storage.from('reports').createSignedUrl(path, 120, { download: path.split('/').pop() });
  if (error) return toast('Download fehlgeschlagen: ' + error.message, true);
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
    toast('PDF gespeichert');
  } catch (e) { toast('PDF-Fehler: ' + e.message, true); }
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
  const opts = (k) => Object.entries(KIND).map(([v, l]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="modal"><div class="sheet">
    <div class="sheethead"><b>${DAY_NAMES[weekday(ed.day)]}, ${fmtDate(ed.day)}</b><button class="icon" data-act="edclose">✕</button></div>
    ${ed.rows.length ? '' : '<p class="hint">Keine Einträge.</p>'}
    ${ed.rows.map((r, i) => `<div class="edrow">
      <select data-ed="kind" data-i="${i}">${opts(r.kind)}</select>
      <input type="time" value="${r.time}" data-ed="time" data-i="${i}" />
      <button class="icon del" data-act="edrm" data-i="${i}">🗑</button></div>`).join('')}
    <button class="btn ghost" data-act="edadd">+ Eintrag</button>
    <p class="hint">Geänderte Einträge werden als „manuell korrigiert“ markiert.</p>
    <button class="btn" data-act="edsave" ${S.busy ? 'disabled' : ''}>Speichern</button>
  </div></div>`;
}

async function saveEditor() {
  const ed = S.editor;
  if (ed.rows.some((r) => !/^\d\d:\d\d$/.test(r.time))) return toast('Bitte alle Zeiten ausfüllen', true);
  const rows = ed.rows.map((r) => ({ ...r, ts: zurichToDate(ed.day, r.time).toISOString() }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  const err = validateDay(rows);
  if (err) return toast(err + ' (Reihenfolge: Ein → Pause Start → Pause Ende → Aus)', true);

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
    toast(S.reports.some((r) => r.week_start === m) ? 'Gespeichert – PDF dieser Woche bei Bedarf neu erzeugen' : 'Gespeichert');
  } catch (e) { toast('Fehler: ' + e.message, true); }
  S.busy = false; render();
}

// ---------------- Ferienkalender ----------------
const ABS_CYCLE = [undefined, 'ferien', 'ferien_halb', 'krank'];
const ABS_LABEL = { ferien: 'F', ferien_halb: '½', krank: 'K' };

function viewDrawer() {
  const y = S.calYear, mo = S.calMonth;
  const first = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  const start = mondayOf(first);
  const today = dayKey(new Date());
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
    cells += `<div class="${cls}" ${clickable ? `data-act="abs" data-day="${d}"` : ''} title="${esc(hol || '')}">
      <span>${+d.slice(8)}</span>${a && inMonth ? `<i>${ABS_LABEL[a]}</i>` : hol && inMonth ? '<i>FT</i>' : ''}</div>`;
  }
  const yearCount = [...S.absences.entries()].filter(([d]) => d.startsWith(String(y)))
    .reduce((s, [, k]) => s + (k === 'ferien' ? 1 : k === 'ferien_halb' ? 0.5 : 0), 0);
  const canPrev = y > CONFIG.calendarFrom || mo > 0;
  const canNext = y < CONFIG.calendarTo || mo < 11;
  return `<div class="drawer-bg" data-act="drawer"></div>
  <aside class="drawer">
    <div class="sheethead"><b>Ferien & Abwesenheit</b><button class="icon" data-act="drawer">✕</button></div>
    <div class="weeknav">
      <button class="icon" data-act="cprev" ${canPrev ? '' : 'disabled'}>‹</button>
      <div><b>${MONTHS[mo]} ${y}</b></div>
      <button class="icon" data-act="cnext" ${canNext ? '' : 'disabled'}>›</button>
    </div>
    <div class="cal">${DAY_SHORT.map((d) => `<div class="ch">${d}</div>`).join('')}${cells}</div>
    <div class="legend"><span><i class="a-ferien">F</i> Ferien</span><span><i class="a-ferien_halb">½</i> Halbtag</span><span><i class="a-krank">K</i> Krank</span><span><i class="hol">FT</i> Feiertag VD</span></div>
    <p class="hint">Tag antippen: Ferien → ½ Ferien → Krank → leer. Wird mit Tagessoll (8:00 / 4:00) gutgeschrieben.</p>
    <p class="hint"><b>Ferientage ${y}: ${yearCount}</b></p>
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
  if (res.error) { toast('Fehler: ' + res.error.message, true); await loadAbsences(); render(); }
}

// ---------------- Login ----------------
function viewLogin() {
  return `<div class="center"><form class="card login" id="login">
    <h1>Stempeluhr</h1>
    <input type="email" name="email" placeholder="E-Mail" autocomplete="username" required />
    <input type="password" name="pw" placeholder="Passwort" autocomplete="current-password" required />
    <button class="btn" ${S.busy ? 'disabled' : ''}>Anmelden</button>
  </form></div>`;
}

// ---------------- Rendern ----------------
function render() {
  if (!S.user) {
    app.innerHTML = viewLogin() + (S.toast ? `<div class="toast ${S.toast.err ? 'err' : ''}">${esc(S.toast.msg)}</div>` : '');
    return;
  }
  const body = S.view === 'stamp' ? viewStamp() : S.view === 'week' ? viewWeek() : viewArchive();
  const tab = (v, l) => `<button class="${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${l}</button>`;
  // Fokus/Scroll im Editor erhalten
  const active = document.activeElement?.dataset?.ed ? { ed: document.activeElement.dataset.ed, i: document.activeElement.dataset.i } : null;
  app.innerHTML = `
  <header><b>Stempeluhr</b><div>
    <button class="icon" data-act="drawer" title="Ferienkalender">📅</button>
    <button class="icon" data-act="logout" title="Abmelden">⎋</button></div></header>
  <main>${body}</main>
  <nav>${tab('stamp', 'Stempeln')}${tab('week', 'Woche')}${tab('archive', 'Archiv')}</nav>
  ${S.editor ? viewEditor() : ''}
  ${S.drawer ? viewDrawer() : ''}
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
  if (error) toast('Anmeldung fehlgeschlagen', true);
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
  else if (a === 'logout') { await sb.auth.signOut(); }
});

// Uhr aktualisieren
setInterval(() => { if (S.user && S.view === 'stamp' && !S.editor && !S.drawer) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) loadEntries().then(render); });

sb.auth.onAuthStateChange((_ev, session) => {
  const was = S.user?.id;
  S.user = session?.user || null;
  if (S.user && S.user.id !== was) loadAll();
  else render();
});
