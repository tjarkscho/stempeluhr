// Monatliche Datensicherung auf den PC (nur Chrome/Edge am Computer: File System Access API).
// Der gewählte Ordner wird im Browser (IndexedDB) gemerkt; pro Sicherung entsteht ein Unterordner mit CSV-Dateien.
import { CONFIG } from '../config.js';
import { dayKey, addDays, hhmm, fmtMin } from './time.js';
import { dayRecord } from './calc.js';

const DB = 'stempeluhr-backup', STORE = 'kv';
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function kv(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, val === undefined ? 'readonly' : 'readwrite');
    const st = tx.objectStore(STORE);
    const q = val === undefined ? st.get(key) : st.put(val, key);
    q.onsuccess = () => res(val === undefined ? q.result : val); q.onerror = () => rej(q.error);
  });
}

/** Nur am Computer anbieten (Chrome/Edge, Maus) */
export const backupSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window
  && !matchMedia('(pointer: coarse)').matches;

export async function backupState() {
  if (!backupSupported()) return null;
  const dir = await kv('dir').catch(() => null);
  const last = await kv('last').catch(() => null);
  let perm = 'none';
  if (dir) { try { perm = await dir.queryPermission({ mode: 'readwrite' }); } catch { perm = 'none'; } }
  const due = !last || last.slice(0, 7) < dayKey(new Date()).slice(0, 7);   // diesen Monat noch nicht gesichert
  return { dir, name: dir?.name || null, last, perm, due };
}

export async function chooseFolder() {
  const dir = await window.showDirectoryPicker({ id: 'stempeluhr-backup', mode: 'readwrite', startIn: 'documents' });
  await kv('dir', dir);
  return dir;
}

const csv = (rows) => '\uFEFF' + rows.map((r) => r.map((v) => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(';')).join('\r\n');

/** Sicherung schreiben. Braucht eine Nutzeraktion, falls die Ordner-Berechtigung neu erteilt werden muss. */
export async function runBackup({ entries, absences, expenses, byDay }) {
  const dir = await kv('dir');
  if (!dir) throw new Error('nofolder');
  if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted'
    && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('denied');
  const today = dayKey(new Date());
  const sub = await dir.getDirectoryHandle(`Stempeluhr_Sicherung_${today}`, { create: true });
  const write = async (name, text) => {
    const fh = await sub.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(text); await w.close();
  };
  const kinds = { in: 'Ein', out: 'Aus', break_start: 'Pause Start', break_end: 'Pause Ende' };
  await write('stempel.csv', csv([['Datum', 'Uhrzeit', 'Art', 'Manuell', 'Zeitstempel (UTC)'],
    ...[...entries].sort((a, b) => a.ts.localeCompare(b.ts)).map((e) => {
      const d = new Date(e.ts); return [dayKey(d), hhmm(d), kinds[e.kind] || e.kind, e.manual ? 'ja' : '', e.ts];
    })]));
  const days = [];
  for (let d = CONFIG.startDate; d < today; d = addDays(d, 1)) {
    const r = dayRecord(d, byDay, absences);
    if (!r.in && !r.soll && !r.credit) continue;
    days.push([d, r.in ? hhmm(r.in) : '', r.out ? hhmm(r.out) : '', fmtMin(r.pause), fmtMin(r.total), fmtMin(r.bonus || 0),
      fmtMin(r.dayTotal || 0), fmtMin(r.soll || 0), fmtMin((r.dayTotal || 0) - (r.soll || 0), true), r.label || '']);
  }
  await write('tage.csv', csv([['Datum', 'Ein', 'Aus', 'Pause', 'Arbeitszeit', 'Zuschlag', 'Total', 'Soll', 'Differenz', 'Bemerkung'], ...days]));
  await write('abwesenheiten.csv', csv([['Datum', 'Art'], ...[...absences].sort(([a], [b]) => a.localeCompare(b))]));
  await write('spesen.csv', csv([['Datum', 'Kategorie', 'Betrag CHF', 'Währung', 'Originalbetrag', 'Kurs', 'km', 'Strecke', 'Notiz'],
    ...[...(expenses || [])].sort((a, b) => a.day.localeCompare(b.day))
      .map((x) => [x.day, x.category, Number(x.amount).toFixed(2), x.currency || 'CHF',
        x.amount_orig != null ? Number(x.amount_orig).toFixed(2) : '', x.rate ?? '', x.km ?? '', x.route || '', x.note || ''])]));
  await kv('last', new Date().toISOString());
  return { folder: `${dir.name}/Stempeluhr_Sicherung_${today}` };
}
