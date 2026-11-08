-- Report Vigneto: archivio condiviso.
-- Da incollare ed eseguire una sola volta in Supabase: SQL Editor -> New query -> Run.

-- 1) Amministratori: possono modificare ed eliminare le visite di tutti.
create table if not exists public.amministratori (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.amministratori enable row level security;
revoke all on public.amministratori from anon;
grant select on public.amministratori to authenticated;
drop policy if exists "vedo se sono admin" on public.amministratori;
create policy "vedo se sono admin" on public.amministratori
  for select to authenticated using (user_id = auth.uid());

create or replace function public.e_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.amministratori where user_id = auth.uid());
$$;
revoke all on function public.e_admin() from public;
grant execute on function public.e_admin() to authenticated;

-- 2) Visite: una riga per visita, tutto il contenuto in "doc".
create table if not exists public.visite (
  id            text primary key,
  autore_id     uuid references auth.users (id) on delete set null,
  autore_email  text,
  data          date,
  azienda       text,
  doc           jsonb not null,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index if not exists visite_data_idx on public.visite (data desc);

create or replace function public.visite_aggiorna_data()
returns trigger language plpgsql as $$
begin
  new.aggiornato_il = now();
  return new;
end;
$$;
drop trigger if exists visite_aggiorna_data on public.visite;
create trigger visite_aggiorna_data before update on public.visite
  for each row execute function public.visite_aggiorna_data();

alter table public.visite enable row level security;
revoke all on public.visite from anon;
grant select, insert, update, delete on public.visite to authenticated;

drop policy if exists "tutti leggono" on public.visite;
create policy "tutti leggono" on public.visite
  for select to authenticated using (true);

drop policy if exists "inserisce chi e autore o admin" on public.visite;
create policy "inserisce chi e autore o admin" on public.visite
  for insert to authenticated
  with check (autore_id = auth.uid() or public.e_admin());

drop policy if exists "modifica l'autore o admin" on public.visite;
create policy "modifica l'autore o admin" on public.visite
  for update to authenticated
  using (autore_id = auth.uid() or public.e_admin())
  with check (autore_id = auth.uid() or public.e_admin());

drop policy if exists "elimina l'autore o admin" on public.visite;
create policy "elimina l'autore o admin" on public.visite
  for delete to authenticated
  using (autore_id = auth.uid() or public.e_admin());

-- 3) Foto: cartella privata. Ogni utente scrive nella propria cartella (<id utente>/<foto>.jpg),
--    tutti gli utenti collegati le leggono.
insert into storage.buckets (id, name, public, file_size_limit)
values ('foto', 'foto', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "foto: tutti leggono" on storage.objects;
create policy "foto: tutti leggono" on storage.objects
  for select to authenticated using (bucket_id = 'foto');

drop policy if exists "foto: carica nella propria cartella" on storage.objects;
create policy "foto: carica nella propria cartella" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'foto' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "foto: elimina le proprie o admin" on storage.objects;
create policy "foto: elimina le proprie o admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'foto' and ((storage.foldername(name))[1] = auth.uid()::text or public.e_admin()));
