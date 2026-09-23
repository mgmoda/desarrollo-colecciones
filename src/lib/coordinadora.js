// Puente con Coordinadora: todo pasa por la función segura `coordinadora` de
// Supabase (las credenciales viven allá). Desde el navegador solo se manda la
// acción y los datos del envío con la sesión del usuario.
import { supabase } from './supabase.js'

export async function coordinadora(accion, datos = {}) {
  const { data, error } = await supabase.functions.invoke('coordinadora', { body: { accion, ...datos } })
  if (error) {
    // supabase-js esconde el cuerpo del error; se intenta leer para mostrar el motivo real.
    let detalle = error.message || String(error)
    try { const j = await error.context?.json?.(); if (j && j.error) detalle = j.error } catch { /* sin cuerpo */ }
    throw new Error(detalle)
  }
  if (data && data.error) throw new Error(data.error)
  return data
}
