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

export async function dbLoadRefs() {
  const list = await loadTable('dev_refs')
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
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
