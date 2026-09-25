// ════════════════════════════════════════════════════════════════════════
// FLETE POR UNIDAD de lo separado (Pedidos → Despachos).
// La ficha técnica costea $ 2.500–3.000 de flete por prenda: si lo que un
// cliente tiene separado sale por menos, se despacha; si no, se espera a
// que haya más unidades. Aquí se estima el peso de lo separado, se mira en
// cuál de los tres empaques cabe y cuánto vale el flete de Coordinadora en
// cada uno (tarifa guardada en coord_tarifas: parte fija según ciudad y
// peso + 1 % del valor declarado), y se saca el flete por unidad.
// ════════════════════════════════════════════════════════════════════════
import { EMPAQUES } from './coordinadora.js'
import { categoriaDe } from './pedidos.js'

// Peso estimado por prenda, en kg (supuesto del 25-sep-2026; se ajusta
// cuando Diego pese una caja llena).
export const PESO_CATEGORIA = { blusa: 0.25, vestido: 0.4, pantalon: 0.45, conjunto: 0.65, otros: 0.4 }
// Cuánto peso admite cada empaque.
export const PESO_MAX = { caja: 20, paq5: 5, paq1: 2 }
// Cortes del flete por unidad: hasta SALE es verde, hasta FALTA_POCO ámbar.
export const UMBRAL = { sale: 2500, faltaPoco: 3000 }
// Una tarifa guardada vale un mes; después se vuelve a cotizar.
export const TARIFA_DIAS = 30

const n0 = (v) => Math.max(0, Number(v) || 0)
export const claveTarifa = (dane, empaque) => `${dane}|${empaque}`

// Peso de lo separado de un cliente, línea por línea según la categoría.
export function pesoSeparado(lineas) {
  let peso = 0, unid = 0
  const cats = {}
  ;(lineas || []).forEach((l) => {
    const n = n0(l.sepVig)
    if (!n) return
    const k = categoriaDe(l.descripcion).key
    peso += n * (PESO_CATEGORIA[k] || PESO_CATEGORIA.otros)
    unid += n
    cats[k] = (cats[k] || 0) + n
  })
  return { peso, unid, cats }
}

export const estadoFlete = (porUnidad) => (porUnidad <= UMBRAL.sale ? 'ok' : porUnidad <= UMBRAL.faltaPoco ? 'amb' : 'no')

// El flete de lo separado en cada empaque. `tarifas` es el mapa de
// coord_tarifas por `dane|empaque`; si falta la de un empaque, esa opción
// queda "sin tarifa" hasta que se cotice.
//   → { peso, unid, dane, opciones: [{ key, label, cabe, cajas, fijo, variable,
//        flete, porUnidad, estado, dias, faltan }], mejor, estado }
export function fleteDe(lineas, dane, tarifas) {
  const { peso, unid, cats } = pesoSeparado(lineas)
  if (!unid) return null
  const pesoUnidad = peso / unid
  const opciones = EMPAQUES.map((e) => {
    const t = dane && tarifas ? tarifas[claveTarifa(dane, e.key)] : null
    const cajas = e.key === 'caja' ? Math.max(1, Math.ceil(peso / PESO_MAX.caja)) : 1
    const cabe = e.key === 'caja' ? true : peso <= PESO_MAX[e.key]
    // Cuántas prendas de este cliente caben en un empaque de estos.
    const capacidad = Math.max(1, Math.floor(PESO_MAX[e.key] / pesoUnidad))
    if (!t) return { key: e.key, label: e.label, nota: e.nota, cabe, cajas, capacidad, sinTarifa: true }
    const flete = cajas * (n0(t.fijo) + n0(t.variable))
    const porUnidad = flete / unid
    // Unidades que harían que saliera a $ 2.500 en este mismo empaque (si
    // caben); en cajas se asume la misma cantidad de cajas.
    const necesarias = Math.ceil(flete / UMBRAL.sale)
    const faltan = necesarias > unid && (e.key === 'caja' || necesarias <= capacidad) ? necesarias - unid : 0
    return {
      key: e.key, label: e.label, nota: e.nota, cabe, cajas, capacidad,
      fijo: cajas * n0(t.fijo), variable: cajas * n0(t.variable), valoracion: cajas * n0(t.valoracion),
      flete, porUnidad: Math.round(porUnidad), estado: estadoFlete(porUnidad), dias: t.dias, at: t.at, faltan,
      alcanzaria: faltan ? Math.round(flete / (unid + faltan)) : 0,
    }
  })
  const conTarifa = opciones.filter((o) => !o.sinTarifa)
  const caben = conTarifa.filter((o) => o.cabe)
  const mejor = caben.length ? caben.reduce((a, o) => (o.porUnidad < a.porUnidad ? o : a)) : null
  // Para que salga: la opción que menos unidades pide, entre las que caben o
  // cabrían con esas unidades.
  const conFaltan = conTarifa.filter((o) => o.faltan > 0 && (o.cabe || o.key === 'caja'))
  const paraSalir = mejor && mejor.estado === 'ok' ? null : conFaltan.length ? conFaltan.reduce((a, o) => (o.faltan < a.faltan ? o : a)) : null
  return {
    peso: Math.round(peso * 10) / 10, unid, cats, dane: dane || '',
    opciones, mejor, paraSalir,
    estado: !dane ? 'sinCiudad' : !conTarifa.length ? 'cotizando' : mejor ? mejor.estado : 'no',
  }
}

const corto = { caja: 'caja', paq5: 'paq 5 kg', paq1: 'paq 1–2 kg' }
export const empaqueCorto = (o) => (o.key === 'caja' && o.cajas > 1 ? `${o.cajas} cajas` : corto[o.key] || o.key)
// Aún más corto, para la casilla de la tabla (caben ~50 px por empaque).
const minimo = { caja: 'caja', paq5: 'paq 5', paq1: 'paq 1–2' }
export const empaqueMinimo = (o) => (o.key === 'caja' && o.cajas > 1 ? `${o.cajas} cajas` : minimo[o.key] || o.key)

// La decisión del cliente, con el flete encima: si lo separado ya sale por
// flete se dice; si falta poco, cuántas más; si no sale, cuántas faltan.
// Solo cambia lo que hoy es "Esperar" o "Parcial": completo, no despachar y
// "todo lo abierto está separado" siguen igual.
export function decisionConFlete(decision, flete, formatPrice) {
  if (!flete || !flete.mejor || !decision) return decision
  if (decision.key !== 'esperar' && decision.key !== 'parcial') return decision
  const m = flete.mejor
  if (m.estado === 'ok') return { key: 'flete', label: 'Despachar', motivo: `${flete.unid} listas · ${empaqueCorto(m)} · ${formatPrice(m.flete)}` }
  const p = flete.paraSalir
  if (m.estado === 'amb') return { key: 'faltaPoco', label: 'Falta poco', motivo: p ? `con ${p.faltan} más baja a ${formatPrice(UMBRAL.sale)}` : `${formatPrice(m.porUnidad)}/und en ${empaqueCorto(m)}` }
  return { ...decision, motivo: p ? `faltan ${p.faltan} para que salga en ${empaqueCorto(p)}` : `${formatPrice(m.porUnidad)}/und de flete` }
}

export const FILTROS_FLETE = [
  { key: 'fleteOk', label: 'Sale por flete', f: (c) => !!(c.flete && c.flete.mejor && c.flete.mejor.estado === 'ok'), clase: 'ok' },
  { key: 'fleteAmb', label: 'Falta poco', f: (c) => !!(c.flete && c.flete.mejor && c.flete.mejor.estado === 'amb'), clase: 'amb' },
  { key: 'fleteNo', label: 'Esperar por flete', f: (c) => !!(c.flete && c.flete.mejor && c.flete.mejor.estado === 'no'), clase: 'no' },
]

// Qué cotizaciones faltan o están viejas para los clientes con separado.
export function tarifasPendientes(clientes, daneDe, tarifas) {
  const falta = new Map()
  const limite = Date.now() - TARIFA_DIAS * 86400000
  ;(clientes || []).forEach((c) => {
    if (!c.separadoVig) return
    const dane = daneDe(c)
    if (!dane) return
    EMPAQUES.forEach((e) => {
      const k = claveTarifa(dane, e.key)
      const t = tarifas && tarifas[k]
      if (t && new Date(t.at).getTime() > limite) return
      if (!falta.has(k)) falta.set(k, { dane, empaque: e })
    })
  })
  return [...falta.values()]
}
