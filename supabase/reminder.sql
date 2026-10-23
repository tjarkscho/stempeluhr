-- Push-Erinnerung 18:00 – einmal im Supabase SQL Editor ausführen

-- Push-Abos der Geräte
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists own on public.push_subs;
create policy own on public.push_subs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Interne Tabelle für die VAPID-Schlüssel (nur Service-Role, keine Policies)
create table if not exists public.app_keys (name text primary key, value text not null);
alter table public.app_keys enable row level security;

-- Pro Tag nur eine Erinnerung
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.reminder_log enable row level security;

-- Zeitplan: 16:00 und 17:00 UTC; die Funktion sendet nur, wenn es in Zürich 18 Uhr ist (Sommer-/Winterzeit)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('stempeluhr-reminder') where exists (select 1 from cron.job where jobname = 'stempeluhr-reminder');
select cron.schedule('stempeluhr-reminder', '0 16,17 * * *', $$
  select net.http_post(
    url := 'https://omdalyspizybxcytvhin.supabase.co/functions/v1/reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "check"}'::jsonb
  );
$$);
