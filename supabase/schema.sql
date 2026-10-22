-- Stempeluhr: einmal im Supabase SQL Editor ausführen

-- Stempel-Ereignisse
create table if not exists public.entries (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null check (kind in ('in', 'out', 'break_start', 'break_end')),
  ts         timestamptz not null,
  manual     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists entries_user_ts on public.entries (user_id, ts);

-- Ferien / Krank
create table if not exists public.absences (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('ferien', 'ferien_halb', 'krank')),
  primary key (user_id, day)
);

-- Wochenberichte (PDF im Storage)
create table if not exists public.weekly_reports (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,
  year       int not null,
  week       int not null,
  soll       int not null,
  ist        int not null,
  diff       int not null,
  saldo      int not null,
  pdf_path   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- Zugriff nur auf eigene Daten
alter table public.entries        enable row level security;
alter table public.absences       enable row level security;
alter table public.weekly_reports enable row level security;

drop policy if exists own on public.entries;
drop policy if exists own on public.absences;
drop policy if exists own on public.weekly_reports;
create policy own on public.entries        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.absences       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.weekly_reports for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Privater Storage-Bucket für PDFs (Ordner = User-ID)
insert into storage.buckets (id, name, public) values ('reports', 'reports', false)
on conflict (id) do nothing;

drop policy if exists "reports own select" on storage.objects;
drop policy if exists "reports own insert" on storage.objects;
drop policy if exists "reports own update" on storage.objects;
create policy "reports own select" on storage.objects for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reports own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reports own update" on storage.objects for update to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
