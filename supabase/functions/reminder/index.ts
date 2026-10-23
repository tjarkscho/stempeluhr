// Supabase Edge Function "reminder"
//  GET  ?action=key   -> öffentlicher VAPID-Schlüssel (wird beim ersten Aufruf erzeugt und in app_keys gespeichert)
//  POST {action:check} (pg_cron, 16/17 UTC) -> Push an alle, die um 18:00 Zürich noch eingestempelt sind
// Einstellung: "Verify JWT" AUS (wird ohne Login aufgerufen; gibt keine Daten preis).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: cors });

async function vapid() {
  const { data } = await sb.from('app_keys').select('name,value').in('name', ['vapid_public', 'vapid_private']);
  const m = Object.fromEntries((data ?? []).map((r) => [r.name, r.value]));
  if (m.vapid_public && m.vapid_private) return { pub: m.vapid_public, priv: m.vapid_private };
  const k = webpush.generateVAPIDKeys();
  await sb.from('app_keys').upsert([{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }]);
  return { pub: k.publicKey, priv: k.privateKey };
}

function zurichNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}

async function check(force: boolean) {
  const { day, hour } = zurichNow();
  if (hour !== 18 && !force) return { skipped: `Zürich ${hour} Uhr` };
  const keys = await vapid();
  webpush.setVapidDetails('https://tjarkscho.github.io/stempeluhr/', keys.pub, keys.priv);

  const { data: subs } = await sb.from('push_subs').select('*');
  const users = [...new Set((subs ?? []).map((s) => s.user_id))];
  const since = new Date(Date.now() - 20 * 3600e3).toISOString();
  let sent = 0;
  for (const uid of users) {
    const { data: last } = await sb.from('entries').select('kind,ts').eq('user_id', uid).gte('ts', since).order('ts', { ascending: false }).limit(1);
    if (!last?.length || last[0].kind === 'out') continue;                 // nicht eingestempelt
    const { error: dup } = await sb.from('reminder_log').insert({ user_id: uid, day });
    if (dup && !force) continue;                                            // heute schon erinnert
    for (const s of (subs ?? []).filter((x) => x.user_id === uid)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: 'Stempeluhr', body: last[0].kind === 'break_start' ? 'Es ist 18:00 – du bist noch in der Pause eingestempelt.' : 'Es ist 18:00 – du bist noch eingestempelt. Ausstempeln nicht vergessen?' }));
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subs').delete().eq('endpoint', s.endpoint); // Abo abgelaufen
      }
    }
  }
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = new URL(req.url);
  try {
    if (url.searchParams.get('action') === 'key') return json({ key: (await vapid()).pub });
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (body.action === 'check') return json(await check(false));
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
