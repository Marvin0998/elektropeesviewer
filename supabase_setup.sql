-- ============================================
-- 360° Viewer - Datenbank Setup
-- Alles markieren und auf "Run" klicken!
-- ============================================

-- Tabelle: Projekte (deine "Ordner")
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamp with time zone default now()
);

-- Tabelle: Fotos (pro Projekt)
create table if not exists photos (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  storage_path text not null,
  public_url text not null,
  created_at timestamp with time zone default now()
);

-- Tabelle: Notizen (Hotspots im 360°-Bild)
create table if not exists notes (
  id uuid default gen_random_uuid() primary key,
  photo_id uuid references photos(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text,
  yaw float not null,    -- horizontale Position im Bild (0-360)
  pitch float not null,  -- vertikale Position im Bild (-90 bis 90)
  created_at timestamp with time zone default now()
);

-- Sicherheitsregeln: Jeder sieht nur seine eigenen Daten
alter table projects enable row level security;
alter table photos enable row level security;
alter table notes enable row level security;

-- Projekte: nur eigene sehen, erstellen, ändern, löschen
create policy "Eigene Projekte" on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fotos: nur eigene sehen, erstellen, löschen
create policy "Eigene Fotos" on photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Notizen: nur eigene sehen, erstellen, ändern, löschen
create policy "Eigene Notizen" on notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage-Regeln für den "photos" Bucket
-- (Diese nach dem Erstellen des Buckets ausführen)
create policy "Fotos hochladen" on storage.objects
  for insert with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Eigene Fotos lesen" on storage.objects
  for select using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Eigene Fotos löschen" on storage.objects
  for delete using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
