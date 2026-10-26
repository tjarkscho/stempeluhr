// Erstellt fehlende Wochen-PDFs für alle abgeschlossenen Wochen.
// Läuft per GitHub Action (Montag früh) oder lokal:  npm run report
// Benötigt: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (optional FORCE=1 -> letzte Woche neu erzeugen)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../src/config.js';
import { dayKey, addDays, mondayOf } from '../src/lib/time.js';
import { groupByDay, weekStats, saldoThrough } from '../src/lib/calc.js';
import { buildWeekPdf } from '../src/lib/pdf.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FORCE } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: users, error: uErr } = await sb.auth.admin.listUsers();
if (uErr) throw uErr;
if (users.users.length !== 1) console.warn(`Achtung: ${users.users.length} Benutzer gefunden, verwende den ersten.`);
const user = users.users[0];
if (!user) { console.log('Kein Benutzer – nichts zu tun.'); process.exit(0); }

async function all(table, cols, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).eq('user_id', user.id).range(from, from + 999);
    if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const entries = await all('entries', 'id,kind,ts,manual', 'ts');
const absences = new Map((await all('absences', 'day,kind')).map((a) => [a.day, a.kind]));
const existing = new Set((await all('weekly_reports', 'week_start')).map((r) => r.week_start));
const byDay = groupByDay(entries);

const logoPath = new URL('../public/logo-black.png', import.meta.url);
const logo = fs.existsSync(logoPath) ? new Uint8Array(fs.readFileSync(logoPath)) : null;
if (!logo) console.warn('public/logo-black.png nicht gefunden – PDF ohne Logo.');

const now = new Date();
const lastMonday = addDays(mondayOf(dayKey(now)), -7); // letzte abgeschlossene Woche
let made = 0;
for (let m = mondayOf(CONFIG.startDate); m <= lastMonday; m = addDays(m, 7)) {
  if (existing.has(m) && !(FORCE && m === lastMonday)) continue;
  const w = weekStats(m, byDay, absences, now);
  const saldo = saldoThrough(m, byDay, absences, now);
  const bytes = await buildWeekPdf(w, saldo, logo, { lang: user.user_metadata?.lang });
  const path = `${user.id}/${w.year}-KW${String(w.week).padStart(2, '0')}.pdf`;
  const up = await sb.storage.from('reports').upload(path, bytes, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
  if (up.error) throw up.error;
  const { error } = await sb.from('weekly_reports').upsert({
    user_id: user.id, week_start: m, year: w.year, week: w.week,
    soll: w.soll, ist: w.ist, diff: w.diff, saldo, pdf_path: path, created_at: now.toISOString(),
  }, { onConflict: 'user_id,week_start' });
  if (error) throw error;
  console.log(`KW ${w.week}/${w.year}: Ist ${w.ist} min, Diff ${w.diff}, Saldo ${saldo} -> ${path}`);
  made++;
}
console.log(made ? `${made} PDF(s) erstellt.` : 'Alles aktuell.');
