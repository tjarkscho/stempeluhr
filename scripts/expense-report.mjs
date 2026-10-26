// Erstellt das monatliche Spesenblatt am letzten Werktag des Monats (läuft täglich per GitHub Action).
// Holt verpasste Monate nach und erneuert ein Blatt, wenn danach noch Belege dazugekommen sind.
// Benötigt: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (optional MONTH=YYYY-MM -> diesen Monat jetzt erzeugen)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { dayKey } from '../src/lib/time.js';
import { holidayName } from '../src/lib/holidays.js';
import { lastWorkday, expenseTotals } from '../src/lib/receipt.js';
import { buildExpensePdf } from '../src/lib/pdf-expense.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MONTH } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: users, error: uErr } = await sb.auth.admin.listUsers();
if (uErr) throw uErr;
const user = users.users[0];
if (!user) { console.log('Kein Benutzer – nichts zu tun.'); process.exit(0); }

const today = dayKey(new Date());
const curYm = today.slice(0, 7);
const prevYm = (() => { const [y, m] = curYm.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
const isHol = (d) => !!holidayName(d);

const { data: reports, error: rErr } = await sb.from('expense_reports').select('*').eq('user_id', user.id);
if (rErr) throw rErr;
const repOf = (ym) => reports.find((r) => r.month === ym);

async function itemsOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const { data, error } = await sb.from('expenses').select('*').eq('user_id', user.id)
    .gte('day', `${ym}-01`).lte('day', last).order('day').order('created_at');
  if (error) throw error;
  return data;
}

// Welche Monate jetzt erzeugen?
const todo = [];
if (MONTH) todo.push(MONTH);
else {
  if (today >= lastWorkday(curYm, isHol)) todo.push(curYm);                 // heute (oder später) ist Monatsende
  todo.push(prevYm);                                                         // Vormonat: fehlt oder veraltet?
}

const logoPath = new URL('../public/logo-black.png', import.meta.url);
const logo = fs.existsSync(logoPath) ? new Uint8Array(fs.readFileSync(logoPath)) : null;

for (const ym of [...new Set(todo)]) {
  const items = await itemsOf(ym);
  const rep = repOf(ym);
  if (!items.length) { console.log(`${ym}: keine Belege.`); continue; }
  const newest = items.reduce((a, x) => (x.created_at > a ? x.created_at : a), '');
  if (!MONTH && rep && ym !== curYm && newest <= rep.created_at) { console.log(`${ym}: aktuell.`); continue; }
  if (!MONTH && rep && ym === curYm && newest <= rep.created_at) { console.log(`${ym}: heute schon erstellt.`); continue; }

  // Belegfotos kommen nicht ins Spesenblatt – sie sind in der App separat abrufbar
  const bytes = await buildExpensePdf(ym, items, new Map(), logo);
  const path = `${user.id}/Spesen-${ym}.pdf`;
  const up = await sb.storage.from('reports').upload(path, bytes, { upsert: true, contentType: 'application/pdf' });
  if (up.error) throw up.error;
  const tot = expenseTotals(items);
  const { error } = await sb.from('expense_reports').upsert({
    user_id: user.id, month: ym, total: tot.total, count: items.length, pdf_path: path, created_at: new Date().toISOString(),
  }, { onConflict: 'user_id,month' });
  if (error) throw error;
  console.log(`${ym}: ${items.length} Belege, CHF ${tot.total.toFixed(2)} -> ${path}`);
}
