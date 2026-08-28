import { supabase } from './supabase.js'

// Reutilizamos el proyecto Supabase de MG, pero con tablas propias con
// prefijo "dev_" para no chocar con el inventario. Cada tabla guarda
// una fila por registro: { id, data (jsonb) }.

async function loadTable(table) {
  const { data, error } = await supabase.from(table).select('data')
  if (error) throw error
  return (data || []).map((r) => r.data)
}

export async function dbLoadOrders() {
  const list = await loadTable('dev_orders')
  return list
}

// Marca de "las órdenes cambiaron": la mueve un trigger cada vez que se
// escribe dev_orders, venga de Factory o de una importación desde la app.
// Son unos bytes, y evita bajar las 461 órdenes cuando no cambió nada.
export async function dbLoadOrdersStamp() {
  const { data, error } = await supabase
    .from('dev_sync')
    .select('updated_at')
    .eq('id', 'orders')
    .maybeSingle()
  if (error) throw error
  return data ? data.updated_at : null
}

export async function dbLoadRefs() {
  const list = await loadTable('dev_refs')
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

// Las fichas pesan: llevan la foto en base64 y entre todas son ~22 MB. Traerlas
// enteras en cada sincronización es lo que ahogaba el refresco automático. Con
// `updated_at` (columna real, la pone un trigger) se pregunta primero qué
// cambió —una lista de ids, unos pocos KB— y solo se bajan esas fichas.
export async function dbLoadRefsMeta() {
  const { data, error } = await supabase.from('dev_refs').select('id, updated_at')
  if (error) throw error
  return data || []
}

export async function dbLoadRefsByIds(ids) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('dev_refs').select('data').in('id', ids)
  if (error) throw error
  return (data || []).map((r) => r.data)
}

export async function dbLoadSettings() {
  const { data, error } = await supabase
    .from('dev_settings')
    .select('data')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data ? data.data : {}
}

export async function dbUpsertRef(ref) {
  const { error } = await supabase
    .from('dev_refs')
    .upsert({ id: ref.id, data: ref })
  if (error) throw error
}

export async function dbDeleteRef(id) {
  const { error } = await supabase.from('dev_refs').delete().eq('id', id)
  if (error) throw error
}

// Reemplaza todas las órdenes de un origen (premuestra/muestra/produccion).
// Cada importación sustituye los datos de ese origen.
export async function dbReplaceOrders(origen, orders) {
  const { error: delErr } = await supabase
    .from('dev_orders')
    .delete()
    .eq('origen', origen)
  if (delErr) throw delErr
  if (!orders.length) return
  const rows = orders.map((o) => ({ id: o.id, origen, data: o }))
  const { error } = await supabase.from('dev_orders').insert(rows)
  if (error) throw error
}

export async function dbSaveSettings(settings) {
  const { error } = await supabase
    .from('dev_settings')
    .upsert({ id: 1, data: settings })
  if (error) throw error
}

// ---- Diseños de Geodésica ----
// La fila guarda { meta, imgs } por separado: la lista pide solo `meta` para no
// descargar las imágenes de todas las rondas al abrir el módulo.

export async function dbLoadDisenos() {
  const { data, error } = await supabase.from('dev_disenos').select('meta:data->meta')
  if (error) throw error
  return (data || []).map((r) => r.meta).filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

// Imágenes de un diseño concreto (se piden solo al abrirlo).
export async function dbLoadDisenoImgs(codigo) {
  const { data, error } = await supabase
    .from('dev_disenos')
    .select('imgs:data->imgs')
    .eq('id', codigo)
    .maybeSingle()
  if (error) throw error
  return (data && data.imgs) || {}
}

export async function dbUpsertDiseno(meta, imgs) {
  const { error } = await supabase
    .from('dev_disenos')
    .upsert({ id: meta.codigo, data: { meta, imgs: imgs || {} } })
  if (error) throw error
}

export async function dbDeleteDiseno(codigo) {
  const { error } = await supabase.from('dev_disenos').delete().eq('id', codigo)
  if (error) throw error
}

// Guardado de referencia con debounce — evita escribir en cada tecla.
const refTimers = {}
export function queueUpsertRef(ref) {
  clearTimeout(refTimers[ref.id])
  refTimers[ref.id] = setTimeout(() => {
    delete refTimers[ref.id]
    dbUpsertRef(ref).catch((e) => console.error('Guardar referencia:', e))
  }, 700)
}

// ---------------------------------------------------------------------------
// Bitácora: quién cambió qué y cuándo.
//
// El usuario no lo manda el navegador: la tabla lo toma del token de la sesión
// y la regla exige que coincida, así que nadie puede registrar a nombre de
// otro. Solo hay permiso de insertar y leer —no de modificar ni borrar—, para
// que lo anotado quede como quedó.
// ---------------------------------------------------------------------------

export async function dbLog(accion, entidad, clave, detalle) {
  // Anotar nunca debe tumbar la acción del usuario: si falla, queda en consola.
  try {
    const { error } = await supabase.from('dev_log').insert({
      accion,
      entidad: entidad || null,
      clave: clave || null,
      detalle: detalle || null,
    })
    if (error) console.error('Bitácora:', error)
  } catch (e) {
    console.error('Bitácora:', e)
  }
}

export async function dbLoadLog(limite = 300) {
  const { data, error } = await supabase
    .from('dev_log')
    .select('*')
    .order('at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// Faltantes de corte: piezas, tela o estampación pendientes de una orden.
// Reemplazan al grupo de WhatsApp donde las solicitudes se hundían.
// ---------------------------------------------------------------------------

export async function dbLoadFaltantes() {
  const list = await loadTable('dev_faltantes')
  return list.sort((a, b) => (b.creadoAt || 0) - (a.creadoAt || 0))
}

export async function dbUpsertFaltante(f) {
  const { error } = await supabase.from('dev_faltantes').upsert({ id: f.id, data: f })
  if (error) throw error
}

export async function dbDeleteFaltante(id) {
  const { error } = await supabase.from('dev_faltantes').delete().eq('id', id)
  if (error) throw error
}

// Preórdenes de Geodésica: lo que el cliente pidió y todavía no llega en el
// archivo de Factory. Viven en su propia tabla y no en la referencia, porque
// Geodésica vuelve a pedir la misma referencia y una marca sobre la ficha solo
// aguanta un pedido.
export async function dbLoadPreordenes() {
  const list = await loadTable('dev_preordenes')
  return list.sort((a, b) => (b.geodesicaPreOrderAt || 0) - (a.geodesicaPreOrderAt || 0))
}

export async function dbUpsertPreorden(p) {
  const { error } = await supabase.from('dev_preordenes').upsert({ id: p.id, data: p })
  if (error) throw error
}

export async function dbDeletePreorden(id) {
  const { error } = await supabase.from('dev_preordenes').delete().eq('id', id)
  if (error) throw error
}
