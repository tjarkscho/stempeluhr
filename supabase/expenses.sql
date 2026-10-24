-- Spesen: Belege mit Foto, monatliches Spesenblatt
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  amount numeric(10,2) not null check (amount >= 0),
  category text not null default 'anderes' check (category in ('essen','fahrt','material','uebernachtung','anderes')),
  note text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_day on public.expenses (user_id, day);

create table if not exists public.expense_reports (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,                 -- 'YYYY-MM'
  total numeric(10,2) not null default 0,
  count int not null default 0,
  pdf_path text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.expenses enable row level security;
alter table public.expense_reports enable row level security;
drop policy if exists own on public.expenses;
drop policy if exists own on public.expense_reports;
create policy own on public.expenses        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own on public.expense_reports for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Belegfotos: privater Bucket, nur eigener Ordner
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do nothing;
drop policy if exists "receipts own select" on storage.objects;
drop policy if exists "receipts own insert" on storage.objects;
drop policy if exists "receipts own update" on storage.objects;
drop policy if exists "receipts own delete" on storage.objects;
create policy "receipts own select" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts own update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
