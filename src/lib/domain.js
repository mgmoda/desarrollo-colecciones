import { normRef } from './constants.js'
import { parseDateLoose, diasDesde } from './dates.js'

export function stageDone(order, key) {
  const s = order.stages && order.stages[key]
  return !!(s && s.fecha)
}

// El área de una orden = la de su ÚLTIMA etapa cumplida (de la más avanzada
// a la más temprana). Las etapas intermedias del Excel (alistamiento,
// revisado, entrada bodega) no definen área propia.
export function orderArea(order) {
  if (stageDone(order, 'entregaEnsamble')) return 'entrega'
  if (stageDone(order, 'envioEnsamble')) return 'talleres'
  if (stageDone(order, 'entregaCorte')) return 'enviar'
  if (stageDone(order, 'trazo')) return 'corte'
  if (stageDone(order, 'ordenCorte')) return 'trazos'
  return null // aún sin orden de corte
}

export function ordersForArea(orders, areaKey) {
  return orders.filter((o) => orderArea(o) === areaKey)
}

// Orden de avance de las áreas (de menos a más avanzada).
export const AREA_ORDER = ['trazos', 'corte', 'enviar', 'talleres', 'entrega']

export function areaIndex(area) {
  const i = AREA_ORDER.indexOf(area)
  return i < 0 ? -1 : i // null/sin iniciar = -1 (lo más atrasado)
}

// Etapa base de cada área (su fecha inicia el conteo de atraso).
const AREA_BASE = {
  trazos: 'ordenCorte', corte: 'trazo', enviar: 'entregaCorte',
  talleres: 'envioEnsamble', entrega: 'entregaEnsamble',
}
export function areaBaseFecha(order) {
  const a = orderArea(order)
  if (!a) return ''
  const s = order.stages[AREA_BASE[a]]
  return (s && s.fecha) || ''
}

// Pistas de una referencia, separadas por origen (premuestra/muestra/producción).
// Para cada origen, la etapa representativa = la MENOS avanzada (lo que falta).
export function refTracks(orders, refId) {
  const mine = orders.filter((o) => o.referencia === refId)
  const byOrigen = {}
  mine.forEach((o) => { (byOrigen[o.origen] || (byOrigen[o.origen] = [])).push(o) })
  return ['premuestra', 'muestra', 'produccion']
    .filter((k) => byOrigen[k])
    .map((origen) => {
      const list = byOrigen[origen]
      let rep = list[0]
      let repIdx = areaIndex(orderArea(list[0]))
      list.forEach((o) => {
        const i = areaIndex(orderArea(o))
        if (i < repIdx) { repIdx = i; rep = o }
      })
      return { origen, orders: list, area: orderArea(rep), rep }
    })
}

export function areaCounts(orders) {
  const counts = { trazos: 0, corte: 0, enviar: 0, talleres: 0, entrega: 0, sinIniciar: 0 }
  orders.forEach((o) => {
    const a = orderArea(o)
    if (a) counts[a] += 1
    else counts.sinIniciar += 1
  })
  return counts
}

// Conteo por área desglosado por fase (premuestra/muestra/producción).
export function areaCountsDetailed(orders) {
  const mk = () => ({ total: 0, premuestra: 0, muestra: 0, produccion: 0 })
  const counts = { trazos: mk(), corte: mk(), enviar: mk(), talleres: mk(), entrega: mk(), sinIniciar: mk() }
  orders.forEach((o) => {
    const a = orderArea(o) || 'sinIniciar'
    counts[a].total += 1
    if (counts[a][o.origen] != null) counts[a][o.origen] += 1
  })
  return counts
}

// Cantidad asociada a una orden en una etapa (para pivots/sumas por área).
export function stageCant(order, key) {
  const s = order.stages && order.stages[key]
  const n = s ? Number(s.cant) : 0
  return Number.isFinite(n) ? n : 0
}

// Une las referencias presentes en las órdenes con los registros de
// referencia guardados (resumen + costos + foto). Devuelve una lista
// ordenada de referencias con su info combinada.
export function buildRefIndex(orders, refs) {
  const byId = new Map(refs.map((r) => [r.id, r]))
  const seen = new Set()
  const list = []
  orders.forEach((o) => {
    const id = normRef(o.referencia)
    if (!id || seen.has(id)) return
    seen.add(id)
    list.push(byId.get(id) || { id, referencia: id, _stub: true })
  })
  // Referencias que existen como registro pero ya no en órdenes (manuales).
  refs.forEach((r) => {
    if (!seen.has(r.id)) { seen.add(r.id); list.push(r) }
  })
  return list.sort((a, b) => a.referencia.localeCompare(b.referencia))
}

// Resumen del proceso de medición a partir de la bitácora de rondas.
// mediciones: [{ fecha, resultado: 'aprobada' | 'repeticion' }]
export function medicionInfo(ref) {
  const rounds = (ref && ref.mediciones) || []
  if (!rounds.length) {
    return { estado: 'pendiente', repeticiones: 0, primera: '', aprobacion: '', ultima: '', dias: null }
  }
  const repeticiones = rounds.filter((r) => r.resultado === 'repeticion').length
  const last = rounds[rounds.length - 1]
  const estado = last.resultado === 'aprobada' ? 'aprobada'
    : last.resultado === 'descartada' ? 'descartada' : 'repeticion'
  const terminal = estado === 'aprobada' || estado === 'descartada'
  const primera = rounds[0].fecha || ''
  const aprobacion = estado === 'aprobada' ? (last.fecha || '') : ''
  const d0 = parseDateLoose(primera)
  let dias = null
  if (d0) {
    const end = terminal ? parseDateLoose(last.fecha) : new Date()
    if (end) dias = Math.round((end.getTime() - d0.getTime()) / 86400000)
  }
  // Días que lleva en la repetición ACTUAL (desde la fecha de la última
  // repetición hasta hoy). Solo aplica mientras siga en repetición.
  const diasRepeticion = estado === 'repeticion' ? diasDesde(last.fecha) : null
  return { estado, repeticiones, primera, aprobacion, ultima: last.fecha || '', dias, diasRepeticion }
}

export const MEDICION_RANK = { pendiente: 0, repeticion: 1, descartada: 2, aprobada: 3 }

export function emptyRef(id) {
  return {
    id,
    referencia: id,
    flags: {},
    mediciones: [],
    comentario: '', comentario2: '', comentario3: '',
    tipo: '', marca: '', tela: '',
    tintoreria: '',       // '' | 'no' | 'si'
    estampado: '',        // '' | 'no' | 'sublimacion' | 'reactivos'
    bordado: '',          // '' | 'no' | 'si'
    bordadoDetalle: '',
    decorado: '',         // '' | 'no' | 'si'  (ej. flores)
    decoradoDetalle: '',
    conjunto: false,
    conjuntoRef: '',
    colores: [],
    colorMuestra: '', precioTela: '', costo: '', costoRevisado: false, topIncluido: '',
    cantidad: '',
    // "Producción extra": autorización rápida hecha desde el Resumen sobre
    // una ref que originalmente solo iba a Muestras. Es solo un marcador;
    // el estado de producción real sigue derivado de los tracks e importes.
    // El chip "Extra" se queda para siempre como identificador histórico.
    produccionExtra: false,
    produccionExtraFecha: '',
    // Cada tela: { nombre, disponible, metros, nota }. Una prenda puede llevar varias.
    telas: [],
    pendiente: false, pendienteNota: '', pendienteFecha: '',
    image: null,
    updatedAt: Date.now(),
  }
}

// Devuelve las telas de una referencia, con compatibilidad hacia atrás
// (registros antiguos guardaban una sola tela en campos sueltos).
export function refTelas(ref) {
  if (ref && Array.isArray(ref.telas) && ref.telas.length) return ref.telas
  if (ref && ref.tela) {
    return [{ nombre: ref.tela, disponible: !!ref.telaDisponible, metros: ref.telaMetros || '', precio: ref.precioTela || '', nota: ref.telaNota || '' }]
  }
  return []
}

export function telaDisponible(ref) {
  return refTelas(ref).some((t) => t.disponible)
}

// Normaliza el catálogo de telas a objetos { nombre, precio, proveedor }
// (los registros antiguos guardaban solo el nombre como texto).
export function normalizeTelas(list) {
  return (list || []).map((t) =>
    typeof t === 'string'
      ? { nombre: t, precio: '', proveedor: '' }
      : { nombre: t.nombre || '', precio: t.precio || '', proveedor: t.proveedor || '' },
  )
}

// Datos de una tela del catálogo (precio y proveedor) por su nombre.
export function telaCatalogInfo(nombre, catalog) {
  const c = (catalog || []).find((t) => (t.nombre || '').toLowerCase() === (nombre || '').toLowerCase())
  return c || { nombre, precio: '', proveedor: '' }
}

// Precio/proveedor efectivos de una fila de tela de una referencia:
// se heredan del catálogo; si no están, se usa lo que tenga la fila (legado).
export function telaResuelta(telaRow, catalog) {
  const info = telaCatalogInfo(telaRow.nombre, catalog)
  return {
    nombre: telaRow.nombre,
    disponible: telaRow.disponible,
    metros: telaRow.metros || '',
    precio: info.precio || telaRow.precio || '',
    proveedor: info.proveedor || telaRow.nota || telaRow.proveedor || '',
  }
}
