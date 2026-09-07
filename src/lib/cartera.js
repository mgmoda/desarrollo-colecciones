import { supabase } from './supabase.js'

// ════════════════════════════════════════════════════════════════════════
// CARTERA — capa de datos
// ────────────────────────────────────────────────────────────────────────
// Las facturas las sube solo el servidor de SYD cada 30 minutos a
// `cartera_facturas` (script E:\factorysync\cs.ps1). Acá sólo se leen.
// Lo que sí escribe la app es la gestión de cobro y las marcas por cliente.
//
// Reglas de negocio traídas tal cual del backend que se reemplaza
// (cobranza-app/backend/app.py, endpoint /api/cartera):
//   · La antigüedad se calcula A HOY desde la fecha de emisión. NO se usa la
//     columna "Días" del informe: viene congelada en las facturas viejas.
//   · Colección 1 = Madres (Ene–May), 2 = Diciembre (Jun–Dic), por la fecha
//     de la factura. Igual que en el módulo de Ventas.
//   · El cliente se identifica por el nombre normalizado: el informe del SYD
//     no trae NIT. Ojo con eso si algún día se cruza con otro maestro.
// ════════════════════════════════════════════════════════════════════════

/** Clave estable de cliente: mayúsculas, sin tildes, espacios colapsados. */
export function normKey(txt) {
  if (!txt) return ''
  return String(txt).trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Días entre una fecha ISO y hoy, en días calendario (sin zona horaria). */
function diasHasta(iso) {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const desde = Date.UTC(a, m - 1, d)
  const h = new Date()
  const hasta = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())
  return Math.round((hasta - desde) / 86400000)
}

/** Colección a la que pertenece una factura por su fecha. */
function coleccionDe(iso) {
  if (!iso) return { anio: null, temp: null }
  const anio = Number(iso.slice(0, 4))
  const mes = Number(iso.slice(5, 7))
  return { anio, temp: mes <= 5 ? 1 : 2 }
}

export const etiquetaColeccion = (temp) => (temp === 1 ? 'Madres' : 'Diciembre')

// ── Lectura ────────────────────────────────────────────────────────────

// Supabase devuelve 1000 filas por defecto; la cartera ronda las 600 pero
// crece, así que se pagina siempre.
async function traerTodo(tabla, columnas, orden) {
  const paso = 1000
  let desde = 0
  const filas = []
  for (;;) {
    let q = supabase.from(tabla).select(columnas).range(desde, desde + paso - 1)
    if (orden) q = q.order(orden.col, { ascending: !!orden.asc })
    const { data, error } = await q
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < paso) break
    desde += paso
  }
  return filas
}

/**
 * Tablas que sólo existen después de correr supabase_cartera.sql. Mientras no
 * estén, la vista tiene que funcionar igual (con las facturas, que sí están),
 * así que un 404 devuelve lista vacía en vez de romper.
 */
async function traerOpcional(tabla, columnas) {
  try {
    return await traerTodo(tabla, columnas)
  } catch (e) {
    // 42P01 = la tabla no existe (Postgres); PGRST205 = PostgREST no la tiene
    // en su caché de esquema. Cualquier otro error sí es un problema real.
    const code = (e && e.code) || ''
    const msg = String((e && e.message) || e)
    if (code === '42P01' || code === 'PGRST205' ||
        /does not exist|schema cache|not find the table/i.test(msg)) return null
    throw e
  }
}

export async function cargarCartera() {
  const [facturas, gestion, marcas, pagosAcum, sync] = await Promise.all([
    traerTodo('cartera_facturas', 'factura,cliente,ciudad,fecha,vencimiento,dias,valor,s,pagos'),
    traerOpcional('cartera_gestion', '*'),
    traerOpcional('cartera_clientes', 'cliente_key,cliente,seguir_cobro,virtual,nota'),
    traerOpcional('cartera_pagos', 'cliente_key,fecha,valor'),
    ultimaSync(),
  ])

  return {
    ...agrupar(facturas, gestion || [], pagosAcum || []),
    seguidos: new Set((marcas || []).filter((m) => m.seguir_cobro).map((m) => m.cliente_key)),
    sync,
    // Para avisar en la vista que falta correr el SQL.
    faltanTablas: gestion === null || marcas === null,
  }
}

async function ultimaSync() {
  // `corte` se agregó después; si la columna todavía no existe, se reintenta
  // sin ella para no dejar la vista sin la fecha del informe.
  for (const cols of ['archivo,creado_en,facturas,valor_total,clientes,corte',
                      'archivo,creado_en,facturas,valor_total,clientes']) {
    const { data, error } = await supabase
      .from('cartera_sync_log').select(cols)
      .order('id', { ascending: false }).limit(1)
    if (!error) return (data && data[0]) || null
  }
  return null
}

// ── Agrupación por cliente ─────────────────────────────────────────────

function agrupar(facturas, gestion, pagosAcum) {
  const hoy = hoyISO()
  const clientes = new Map()
  const periodosSet = new Set()

  for (const f of facturas) {
    const ck = normKey(f.cliente)
    let c = clientes.get(ck)
    if (!c) {
      c = {
        cliente_key: ck, cliente: f.cliente, ciudad: f.ciudad || '',
        facturas: [], pagos: [], gestion: [],
        total: 0, t1: 0, t2: 0, dias_max: 0, periodos: {},
      }
      clientes.set(ck, c)
    }

    const valor = Number(f.valor) || 0
    // Antigüedad REAL a hoy; la columna "Días" del informe queda congelada.
    const ref = f.fecha || f.vencimiento
    const dias = ref ? diasHasta(ref) : (f.dias || 0)
    const { anio, temp } = coleccionDe(f.fecha)

    c.facturas.push({
      factura: f.factura, fecha: f.fecha, venc: f.vencimiento,
      dias, valor, temp, anio, s: !!f.s,
    })
    c.total += valor
    if (temp === 1) c.t1 += valor
    else if (temp === 2) c.t2 += valor
    if (anio && temp) {
      const k = `${anio}-${temp}`
      c.periodos[k] = (c.periodos[k] || 0) + valor
      periodosSet.add(k)
    }
    if (dias > c.dias_max) c.dias_max = dias

    // Pagos que vienen dentro de la factura (los últimos 4 del informe).
    for (const p of f.pagos || []) {
      if (p && p.fecha && Number(p.valor) > 0) {
        c.pagos.push({ fecha: String(p.fecha).slice(0, 10), valor: Number(p.valor) })
      }
    }
  }

  // Pagos acumulados: el informe sólo muestra los últimos 4 por factura, así
  // que el histórico completo vive en su propia tabla. Se unen y se quitan
  // repetidos por (fecha, valor) — es la misma llave que usa la tabla.
  for (const p of pagosAcum) {
    const c = clientes.get(p.cliente_key)
    if (c) c.pagos.push({ fecha: String(p.fecha).slice(0, 10), valor: Number(p.valor) })
  }

  for (const g of gestion) {
    const c = clientes.get(g.cliente_key)
    if (c) c.gestion.push(g)
  }

  const out = []
  for (const c of clientes.values()) {
    const vistos = new Set()
    c.pagos = c.pagos
      .filter((p) => {
        const k = `${p.fecha}|${p.valor}`
        if (vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

    c.gestion.sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
    c.facturas.sort((a, b) => b.dias - a.dias)

    c.ult_pago = c.pagos.length ? c.pagos[0].fecha : null
    c.dias_ult_pago = c.ult_pago ? diasHasta(c.ult_pago) : null

    // Encargo abierto más reciente, y si el cliente abonó después de abrirlo
    // (entonces probablemente ya se atendió y sólo falta cerrarlo).
    const pend = c.gestion.find((g) => (g.estado || 'cerrada') === 'abierta') || null
    const desde = pend ? String(pend.creado_en || '').slice(0, 10) : ''
    c.pendiente = pend
    c.pendiente_pagado = !!(pend && desde && c.pagos.some((p) => p.fecha >= desde))
    c.pendiente_vencido = !!(
      pend && !c.pendiente_pagado &&
      pend.proximo_seguimiento && pend.proximo_seguimiento <= hoy
    )
    c.acuerdo = c.gestion.find((g) => g.tipo === 'acuerdo' && g.estado !== 'abierta') || null

    out.push(c)
  }

  out.sort((a, b) => b.total - a.total)

  const periodos = [...periodosSet].sort().map((k) => {
    const [anio, temp] = k.split('-').map(Number)
    return { key: k, anio, temp, sub: etiquetaColeccion(temp) }
  })

  return { clientes: out, periodos, hoy }
}

/** ¿Tiene un compromiso de pago vigente? (acuerdo con fecha futura o de hoy) */
export function compromisoActivo(c) {
  const hoy = hoyISO()
  return c.gestion.some((g) => g.tipo === 'acuerdo' && g.acuerdo_fecha && g.acuerdo_fecha >= hoy)
}

/** Compromisos que ya se vencieron sin que se registre el abono. */
export function compromisoVencido(c) {
  const hoy = hoyISO()
  return c.gestion.some((g) => {
    if (g.tipo !== 'acuerdo' || !g.acuerdo_fecha || g.acuerdo_fecha >= hoy) return false
    return !c.pagos.some((p) => p.fecha >= g.acuerdo_fecha)
  })
}

// ── Escritura ──────────────────────────────────────────────────────────

export async function guardarGestion(cliente, datos, autor) {
  const fila = {
    cliente_key: normKey(cliente.cliente),
    cliente: cliente.cliente,
    tipo: datos.tipo || 'novedad',
    texto: (datos.texto || '').trim(),
    autor: autor || null,
    canal: datos.canal || null,
    remitido_a: datos.remitido_a || null,
    estado: datos.estado || 'cerrada',
    acuerdo_fecha: datos.acuerdo_fecha || null,
    acuerdo_monto: datos.acuerdo_monto || null,
    proximo_seguimiento: datos.proximo_seguimiento || null,
  }
  const { data, error } = await supabase.from('cartera_gestion').insert(fila).select()
  if (error) throw error
  return (data && data[0]) || fila
}

export async function cerrarGestion(id, quien) {
  const { error } = await supabase.from('cartera_gestion')
    .update({ estado: 'cerrada', cerrado_en: new Date().toISOString(), cerrado_por: quien || null })
    .eq('id', id)
  if (error) throw error
}

export async function marcarSeguimiento(cliente, seguir) {
  const { error } = await supabase.from('cartera_clientes').upsert({
    cliente_key: normKey(cliente.cliente),
    cliente: cliente.cliente,
    seguir_cobro: !!seguir,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'cliente_key' })
  if (error) throw error
}
