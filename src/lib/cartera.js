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

// ── Contactos ──────────────────────────────────────────────────────────
// La cartera la cobran dos personas sin dueño por cliente. Lo que evita cobrar
// dos veces es que cada contacto quede con quién, cuándo y qué quedó, y que un
// cliente contactado hace poco se vea "en espera". Un contacto es una fila de
// cartera_gestion con tipo 'contacto' y un resultado de esta lista; las
// gestiones viejas (novedad, promesa, acuerdo, pendiente) siguen contando
// como contactos por su fecha.

/** Días que un cliente queda "en espera" después de un contacto. */
export const ESPERA_DIAS = 7

export const CANALES = ['WhatsApp', 'Llamada', 'Visita']
export const RESULTADOS = [
  { k: 'sin_respuesta', label: 'Sin respuesta' },
  { k: 'promesa', label: 'Promete pagar' },
  { k: 'abono', label: 'Abonó' },
  { k: 'reclamo', label: 'Reclamo / novedad' },
  { k: 'no_llamar', label: 'No volver a llamar' },
]

/** Resultado de una gestión, también para las registradas con el modelo viejo. */
export function resultadoDe(g) {
  if (!g) return ''
  if (g.resultado) return g.resultado
  if (g.tipo === 'acuerdo' || g.tipo === 'promesa') return 'promesa'
  if (g.tipo === 'pendiente') return 'sin_respuesta'
  return 'reclamo'
}
export const etiquetaResultado = (k) => ((RESULTADOS.find((r) => r.k === k) || {}).label || 'Novedad')

/** Quién registra, dicho corto: "kelly@mgmoda.local" → "Kelly". */
export function autorDe(usuario) {
  const base = String(usuario || '').split('@')[0].trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() : ''
}

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

  // Universo COMPLETO de abonos, incluidos los de clientes que ya cancelaron
  // y salieron del informe. Es lo que hay que usar para "lo recaudado en el
  // mes": si se contara sólo lo de los clientes con saldo, el total del mes
  // iría bajando a medida que la gente termina de pagar.
  const pagosTodos = unirPagos(facturas, pagosAcum || [], pagosAcum !== null)

  return {
    ...agrupar(facturas, gestion || [], pagosAcum || []),
    pagosTodos,
    seguidos: new Set((marcas || []).filter((m) => m.seguir_cobro).map((m) => m.cliente_key)),
    sync,
    // Para avisar en la vista que falta correr el SQL.
    faltanTablas: gestion === null || marcas === null,
  }
}

/**
 * Une los abonos archivados con los que trae el informe de hoy, sin repetir,
 * y de paso ARCHIVA los nuevos en `cartera_pagos`.
 *
 * El archivado hace falta porque el informe es un SNAPSHOT: trae los últimos 4
 * pagos de cada factura ABIERTA. Cuando un cliente termina de pagar, su factura
 * desaparece y con ella su historial. Sin archivar, "lo recaudado en el mes"
 * iría encogiendo solo a medida que la gente cancela — justo al revés de la
 * realidad. Lo hacía el backend viejo al importar; acá se hace al leer.
 *
 * La escritura no bloquea el render: se dispara y sigue. Suelen ser 0 filas.
 */
function unirPagos(facturas, pagosAcum, puedeArchivar) {
  const todos = new Map()
  for (const p of pagosAcum) {
    const fecha = String(p.fecha).slice(0, 10)
    const valor = Number(p.valor)
    todos.set(`${p.cliente_key}|${fecha}|${valor}`, { cliente_key: p.cliente_key, fecha, valor })
  }

  const nuevos = []
  for (const f of facturas) {
    const ck = normKey(f.cliente)
    for (const p of f.pagos || []) {
      if (!p || !p.fecha || !(Number(p.valor) > 0)) continue
      const fecha = String(p.fecha).slice(0, 10)
      const valor = Number(p.valor)
      const k = `${ck}|${fecha}|${valor}`
      if (todos.has(k)) continue
      const fila = { cliente_key: ck, fecha, valor }
      todos.set(k, fila)
      nuevos.push({ ...fila, cliente: f.cliente })
    }
  }

  if (puedeArchivar && nuevos.length) {
    supabase.from('cartera_pagos')
      .upsert(nuevos, { onConflict: 'cliente_key,fecha,valor', ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) console.warn('[cartera] no pude archivar los abonos nuevos:', error.message)
      })
  }
  return [...todos.values()]
}

/** Suma de los abonos de un mes ("2026-09"), sobre el universo completo. */
export function recaudoDelMes(pagosTodos, mes) {
  let total = 0
  let n = 0
  const clientes = new Set()
  for (const p of pagosTodos) {
    if (p.fecha.slice(0, 7) !== mes) continue
    total += p.valor
    n += 1
    clientes.add(p.cliente_key)
  }
  return { total, n, clientes: clientes.size }
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

export function agrupar(facturas, gestion, pagosAcum) {
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

    // Último contacto, promesa vigente y turno: es lo que mira quien cobra
    // para saber si llama o espera.
    const ult = c.gestion[0] || null
    c.ult_contacto = ult
    c.dias_contacto = ult ? diasHasta(String(ult.creado_en || '').slice(0, 10)) : null
    c.no_llamar = !!(ult && resultadoDe(ult) === 'no_llamar')
    const conFecha = c.gestion.find((g) => g.acuerdo_fecha) || null
    if (conFecha) {
      const desdeP = String(conFecha.creado_en || '').slice(0, 10)
      const cumplida = c.pagos.some((p) => p.fecha >= desdeP)
      c.promesa = {
        fecha: conFecha.acuerdo_fecha, monto: conFecha.acuerdo_monto || null,
        autor: conFecha.autor || '', cumplida,
        vencida: !cumplida && conFecha.acuerdo_fecha < hoy,
        vigente: !cumplida && conFecha.acuerdo_fecha >= hoy,
      }
    } else c.promesa = null
    c.promesa_vencida = !!(c.promesa && c.promesa.vencida)
    c.en_espera = !c.no_llamar && c.dias_contacto !== null
      && c.dias_contacto < ESPERA_DIAS && !c.promesa_vencida
    c.para_llamar = !c.no_llamar && !c.en_espera

    out.push(c)
  }

  out.sort((a, b) => b.total - a.total)

  const periodos = [...periodosSet].sort().map((k) => {
    const [anio, temp] = k.split('-').map(Number)
    return { key: k, anio, temp, sub: etiquetaColeccion(temp) }
  })

  return { clientes: out, periodos, hoy }
}

/** ¿Tiene una promesa de pago vigente? (la más reciente, con fecha de hoy o futura) */
export function compromisoActivo(c) {
  return !!(c.promesa && c.promesa.vigente)
}

/** La promesa más reciente ya se venció y no llegó el abono. */
export function compromisoVencido(c) {
  return !!(c.promesa && c.promesa.vencida)
}

/** Contactos de los últimos 7 días, por persona. */
export function contactosSemana(clientes) {
  const desde = new Date(); desde.setDate(desde.getDate() - 7)
  const corte = desde.toISOString()
  const por = {}
  let n = 0
  ;(clientes || []).forEach((c) => c.gestion.forEach((g) => {
    if (String(g.creado_en || '') < corte) return
    n += 1
    const a = g.autor || '—'
    por[a] = (por[a] || 0) + 1
  }))
  return { n, por }
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

/**
 * Registra un contacto: cómo, qué quedó y, si promete pagar, para cuándo.
 * Es una fila más de cartera_gestion; el cliente pasa a "en espera" solo.
 */
export async function guardarContacto(cliente, datos, autor) {
  const promesa = datos.resultado === 'promesa'
  const fila = {
    cliente_key: normKey(cliente.cliente),
    cliente: cliente.cliente,
    tipo: 'contacto',
    resultado: datos.resultado || 'sin_respuesta',
    texto: (datos.texto || '').trim() || etiquetaResultado(datos.resultado),
    autor: autor || null,
    canal: datos.canal || null,
    estado: 'cerrada',
    acuerdo_fecha: promesa ? (datos.acuerdo_fecha || null) : null,
    acuerdo_monto: promesa ? (datos.acuerdo_monto || null) : null,
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
