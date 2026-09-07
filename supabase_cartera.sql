-- ═══════════════════════════════════════════════════════════════════════
-- CARTERA — tablas que faltan en Supabase para traer el módulo a esta app
-- ───────────────────────────────────────────────────────────────────────
-- Correr UNA VEZ en el SQL Editor del proyecto queucqfinihprgaxrhux.
-- Es idempotente: se puede repetir sin romper nada.
--
-- Contexto: el servidor de SYD ya sube `cartera_facturas` + `cartera_sync_log`
-- cada 30 minutos (script E:\factorysync\cs.ps1). Eso NO se toca.
-- Lo que falta es lo que hoy sólo vive en la base local `cobranza_mg`:
-- la gestión, los pagos acumulados, las marcas por cliente y el histórico
-- de facturas vistas.
--
-- Convención: prefijo `cartera_`, RLS activo, acceso completo para
-- `authenticated` — igual que las tablas `dev_*` de esta app.
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 0) Pendiente de agosto: fecha de corte del informe
--    El .LIS trae en su encabezado "Cartera por Facturas a : AAAA/MM/DD".
--    Es a qué día están los saldos, que no es lo mismo que cuándo se subió.
--    Mientras esta columna no exista, cs.ps1 detecta el 404 y sube sin ella.
-- ───────────────────────────────────────────────────────────────────────
alter table public.cartera_sync_log add column if not exists corte date;

drop function if exists public.reemplazar_cartera(jsonb, text);

create or replace function public.reemplazar_cartera(
  p_filas   jsonb,
  p_archivo text default null,
  p_corte   text default null
) returns json
language plpgsql
security definer
as $$
declare
  v_facturas int;
  v_total    numeric(18,2);
  v_clientes int;
begin
  delete from public.cartera_facturas;

  insert into public.cartera_facturas
    (factura, cliente, ciudad, fecha, vencimiento, dias, valor, s, pagos)
  select
    x->>'factura',
    x->>'cliente',
    x->>'ciudad',
    nullif(x->>'fecha','')::date,
    nullif(x->>'vencimiento','')::date,
    coalesce((x->>'dias')::int, 0),
    coalesce((x->>'valor')::numeric, 0),
    coalesce((x->>'s')::boolean, false),
    coalesce(x->'pagos', '[]'::jsonb)
  from jsonb_array_elements(p_filas) as x;

  select count(*), coalesce(sum(valor),0), count(distinct cliente)
    into v_facturas, v_total, v_clientes
    from public.cartera_facturas;

  insert into public.cartera_sync_log (archivo, facturas, valor_total, clientes, corte)
  values (p_archivo, v_facturas, v_total, v_clientes, nullif(p_corte,'')::date);

  return json_build_object(
    'ok', true, 'facturas', v_facturas,
    'valor_total', v_total, 'clientes', v_clientes,
    'corte', nullif(p_corte,'')::date
  );
end;
$$;

grant execute on function public.reemplazar_cartera(jsonb, text, text) to authenticated;


-- ───────────────────────────────────────────────────────────────────────
-- 1) Gestión de cobro
--    Una fila por contacto/nota/compromiso. `cliente_key` es el nombre
--    normalizado (mayúsculas, sin tildes, espacios colapsados): es la única
--    llave que tenemos, porque el informe del SYD no trae NIT.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.cartera_gestion (
  id                  bigserial primary key,
  cliente_key         text not null,
  cliente             text not null,
  tipo                text not null default 'novedad',  -- novedad | promesa | acuerdo | pendiente | pago
  texto               text not null,
  autor               text,
  creado_en           timestamptz not null default now(),
  acuerdo_fecha       date,
  acuerdo_monto       numeric(16,2),
  canal               text,      -- WhatsApp | Llamada | Remito | Visita | Otro
  remitido_a          text,      -- vendedor al que se remite el contacto
  estado              text not null default 'cerrada',  -- abierta (encargo pendiente) | cerrada
  proximo_seguimiento date,      -- "volver a revisar el..."
  cerrado_en          timestamptz,
  cerrado_por         text
);
create index if not exists ix_cartera_gestion_cli on public.cartera_gestion (cliente_key);
create index if not exists ix_cartera_gestion_estado on public.cartera_gestion (estado);


-- ───────────────────────────────────────────────────────────────────────
-- 2) Marcas propias por cliente (no vienen del SYD)
--    `seguir_cobro` = la ★ del correo diario de cartera.
--    `virtual` viene del módulo de Ventas; se conserva por si algún día
--    ese módulo también se muda.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.cartera_clientes (
  cliente_key    text primary key,
  cliente        text not null,
  seguir_cobro   boolean not null default false,
  virtual        boolean not null default false,
  nota           text,
  actualizado_en timestamptz not null default now()
);


-- ───────────────────────────────────────────────────────────────────────
-- 3) Pagos acumulados
--    El informe PR0403 sólo trae los ÚLTIMOS 4 pagos por factura. Esta tabla
--    guarda la unión de todo lo que se ha visto en cada sincronización, así
--    que el historial no se pierde cuando el SYD deja de mostrar los viejos.
--    La clave (cliente, fecha, valor) es lo que evita duplicarlos.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.cartera_pagos (
  id          bigserial primary key,
  cliente_key text not null,
  cliente     text not null,
  fecha       date not null,
  valor       numeric(16,2) not null,
  visto_en    timestamptz not null default now(),
  unique (cliente_key, fecha, valor)
);
create index if not exists ix_cartera_pagos_cli on public.cartera_pagos (cliente_key);


-- ───────────────────────────────────────────────────────────────────────
-- 4) Facturas vistas alguna vez
--    Sirve para marcar cuáles son NUEVAS respecto de la sincronización
--    anterior. Sin esto, cada snapshot parece completamente nuevo.
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.cartera_facturas_vistas (
  factura     text primary key,
  primera_vez timestamptz not null default now()
);


-- ───────────────────────────────────────────────────────────────────────
-- 5) Permisos y RLS
--    Igual que las tablas dev_*: quien tenga sesión puede leer y escribir.
--    El filtro por rol (que Cartera la vea sólo el admin) se hace en la app,
--    en tabsVisibles, como con Programaciones y Asistencia.
-- ───────────────────────────────────────────────────────────────────────
alter table public.cartera_gestion         enable row level security;
alter table public.cartera_clientes        enable row level security;
alter table public.cartera_pagos           enable row level security;
alter table public.cartera_facturas_vistas enable row level security;

drop policy if exists cartera_gestion_auth on public.cartera_gestion;
create policy cartera_gestion_auth on public.cartera_gestion
  for all to authenticated using (true) with check (true);

drop policy if exists cartera_clientes_auth on public.cartera_clientes;
create policy cartera_clientes_auth on public.cartera_clientes
  for all to authenticated using (true) with check (true);

drop policy if exists cartera_pagos_auth on public.cartera_pagos;
create policy cartera_pagos_auth on public.cartera_pagos
  for all to authenticated using (true) with check (true);

drop policy if exists cartera_facturas_vistas_auth on public.cartera_facturas_vistas;
create policy cartera_facturas_vistas_auth on public.cartera_facturas_vistas
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.cartera_gestion         to authenticated;
grant select, insert, update, delete on public.cartera_clientes        to authenticated;
grant select, insert, update, delete on public.cartera_pagos           to authenticated;
grant select, insert, update, delete on public.cartera_facturas_vistas to authenticated;

grant usage, select on sequence public.cartera_gestion_id_seq to authenticated;
grant usage, select on sequence public.cartera_pagos_id_seq   to authenticated;
