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

// Empaques reales de MG (reporte de guías 2026): la caja de 20 kg es el 73 %
// de los envíos. Las medidas dan el mismo peso volumétrico que liquida
// Coordinadora (40×40×30 / 2500 = 19,2 kg).
export const EMPAQUES = [
  { key: 'caja', label: 'Caja de mercancía', peso: 20, largo: 40, ancho: 30, alto: 40, valor: 832000, nota: '20 kg · 40×40×30 cm' },
  { key: 'paq5', label: 'Paquete 3–5 kg', peso: 5, largo: 30, ancho: 20, alto: 15, valor: 50000, nota: '5 kg · 30×20×15 cm' },
  { key: 'paq1', label: 'Paquete 1–2 kg', peso: 1, largo: 25, ancho: 20, alto: 8, valor: 50000, nota: '1 kg · 25×20×8 cm' },
]

export const CONTENIDO = 'Prendas de vestir MG Moda'

export function detalleDe(emp, cajas, valorDeclarado) {
  const n = Math.max(1, Number(cajas) || 1)
  return [{ pesoReal: String(emp.peso), largo: String(emp.largo), ancho: String(emp.ancho), alto: String(emp.alto), unidades: n, ubl: 0, referencia: 'CAJA', valorDeclarado: Math.round((Number(valorDeclarado) || 0) / n) }]
}

// Arma el cuerpo de la guía con lo que sabe el navegador; la función del
// servidor le agrega la cuenta y el remitente.
export function armarGuia({ dest, emp, cajas, valorDeclarado, pedidos, observacion }) {
  const soloDigitos = (s) => String(s || '').replace(/\D/g, '')
  return {
    valoracion: String(Math.round(Number(valorDeclarado) || 0)),
    contenido: CONTENIDO,
    referenciaGuia: ('Pedidos ' + (pedidos || []).join('-')).slice(0, 30),
    observaciones: String(observacion || '').slice(0, 100),
    detalle: detalleDe(emp, cajas, valorDeclarado),
    datosDestinatario: {
      identificacionDestinatario: soloDigitos(dest.documento),
      tipoDocumentoDestinatario: Number(dest.tipo_documento) || 13,
      nombreDestinatario: String(dest.nombre || '').trim(),
      direccionDestinatario: String(dest.direccion || '').trim(),
      codigoCiudadDestinatario: String(dest.dane || ''),
      indicativoDestinatario: '57',
      celularDestinatario: soloDigitos(dest.celular),
      correoDestinatario: String(dest.correo || '').trim(),
    },
  }
}

// Qué le falta a un destinatario para poder generar la guía.
export function faltantesDe(dest) {
  const f = []
  if (!String(dest.nombre || '').trim()) f.push('nombre')
  if (!String(dest.direccion || '').trim()) f.push('dirección')
  if (!dest.dane) f.push('ciudad (código DANE)')
  if (String(dest.celular || '').replace(/\D/g, '').length < 10) f.push('celular (10 dígitos)')
  return f
}
