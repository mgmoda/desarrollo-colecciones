-- Tablas para "Desarrollo de Colecciones".
-- Reutiliza el mismo proyecto Supabase de Inventarios MG (mismo login).
-- Ejecuta este script una sola vez en: Supabase > SQL Editor.

create table if not exists dev_orders (
  id     text primary key,
  origen text,
  data   jsonb
);

create table if not exists dev_refs (
  id   text primary key,
  data jsonb
);

create table if not exists dev_settings (
  id   int  primary key,
  data jsonb
);

-- Seguridad: solo usuarios con sesión iniciada pueden leer/escribir.
alter table dev_orders   enable row level security;
alter table dev_refs     enable row level security;
alter table dev_settings enable row level security;

create policy "dev_orders_auth"   on dev_orders   for all to authenticated using (true) with check (true);
create policy "dev_refs_auth"     on dev_refs     for all to authenticated using (true) with check (true);
create policy "dev_settings_auth" on dev_settings for all to authenticated using (true) with check (true);

-- Diseños que Geodésica envía para desarrollar (bitácora de rondas).
-- La fila guarda { meta, imgs } por separado: la lista pide solo `meta` para
-- no descargar las imágenes de todas las rondas al abrir el módulo.
create table if not exists dev_disenos (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);
alter table dev_disenos enable row level security;
create policy "dev_disenos_auth" on dev_disenos for all to authenticated using (true) with check (true);
