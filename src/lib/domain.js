import { normRef } from './constants.js'
import { parseDateLoose, diasDesde, diasEntre } from './dates.js'

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
// Acepta un código o la lista de códigos de la prenda (interno y final), para
// que el histórico no quede partido entre los dos.
export function refTracks(orders, refIdOCodigos) {
  const codigos = new Set(
    (Array.isArray(refIdOCodigos) ? refIdOCodigos : [refIdOCodigos]).filter(Boolean),
  )
  const mine = orders.filter((o) => codigos.has(o.referencia))
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
// Una prenda tiene dos códigos: el interno con el que nace (MG-B838) y la
// referencia final que le asigna el catálogo (M5293). Las órdenes de
// premuestra vienen con el interno y las de muestra/producción con el final,
// pero son la misma prenda: aquí se unifican en una sola fila, mostrando la
// referencia final como nombre y guardando ambos códigos en `codigos`.
function filaDeFicha(r, finalDe) {
  const final = (r.nuevaRef || '').trim()
  const par = r.conjuntoRef && finalDe ? finalDe(r.conjuntoRef) : r.conjuntoRef
  const base = { ...r, codigos: final ? [r.id, final] : [r.id], conjuntoRefFinal: par }
  if (!final) return base
  return { ...base, referencia: final, refInterna: r.id }
}

// Prendas enlazadas a otra referencia: "MG-V834 TOP" es el top que acompaña
// al vestido MG-V834. Llevan sus propios procesos, así que son fila aparte,
// pero heredan de su base lo que no tengan propio (empezando por la foto).
function baseEnlazada(codigo, porCodigo) {
  const i = codigo.lastIndexOf(' ')
  if (i <= 0) return null
  const base = codigo.slice(0, i).trim()
  const sufijo = codigo.slice(i + 1).trim()
  if (!base || !sufijo) return null
  const ficha = porCodigo.get(base)
  return ficha ? { ficha, sufijo } : null
}

function filaEnlazada(codigo, { ficha, sufijo }, propia, finalDe) {
  const finalBase = (ficha.nuevaRef || '').trim() || ficha.id
  const base = propia || { id: codigo, _stub: true }
  return {
    ...base,
    id: codigo,
    referencia: `${finalBase} ${sufijo}`,
    refInterna: codigo,
    codigos: [codigo],
    enlazadaA: ficha.id,
    // Lo propio manda; si no lo tiene, se toma de la referencia base.
    image: base.image || ficha.image,
    tipo: base.tipo || sufijo,
    marca: base.marca || ficha.marca,
    conjuntoRefFinal: base.conjuntoRef && finalDe ? finalDe(base.conjuntoRef) : base.conjuntoRef,
  }
}

export function buildRefIndex(orders, refs) {
  const byId = new Map(refs.map((r) => [r.id, r]))
  // Cualquier código conocido apunta a su ficha.
  const porCodigo = new Map()
  refs.forEach((r) => {
    porCodigo.set(r.id, r)
    const n = (r.nuevaRef || '').trim()
    if (n && !byId.has(n)) porCodigo.set(n, r)
  })
  // La pareja del conjunto se guarda por código interno; para mostrarla se
  // usa su referencia final.
  const finalDe = (codigo) => {
    const f = byId.get(codigo)
    return (f && (f.nuevaRef || '').trim()) || codigo
  }
  const seen = new Set()
  const list = []
  orders.forEach((o) => {
    const cod = normRef(o.referencia)
    if (!cod) return
    const ficha = porCodigo.get(cod)
    const clave = ficha ? ficha.id : cod
    if (seen.has(clave)) return
    seen.add(clave)
    if (ficha) { list.push(filaDeFicha(ficha, finalDe)); return }
    const enlace = baseEnlazada(cod, porCodigo)
    if (enlace) { list.push(filaEnlazada(cod, enlace, byId.get(cod), finalDe)); return }
    list.push({ id: cod, referencia: cod, codigos: [cod], _stub: true })
  })
  // Referencias que existen como registro pero ya no en órdenes (manuales).
  refs.forEach((r) => {
    if (seen.has(r.id)) return
    seen.add(r.id)
    const enlace = baseEnlazada(r.id, porCodigo)
    list.push(enlace ? filaEnlazada(r.id, enlace, r, finalDe) : filaDeFicha(r, finalDe))
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

// Procesos especiales de una referencia. Lee la lista nueva y, por
// compatibilidad, los interruptores antiguos (tintorería/bordado/decorado).
export function refProcesos(ref) {
  if (!ref) return []
  const out = []
  const add = (v) => {
    const s = (v || '').trim()
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  if (Array.isArray(ref.procesos)) ref.procesos.forEach(add)
  if (ref.tintoreria === 'si') add('Tintorería')
  if (ref.bordado === 'si') add('Bordado')
  if (ref.decorado === 'si') add(ref.decoradoDetalle || 'Decorado')
  return out
}

// ---------------------------------------------------------------------------
// Vínculo prenda ↔ top
//
// Cuando una prenda lleva top incluido, el top se corta y se ensambla por su
// lado, con su propia orden y muchas veces en otro taller. Esa orden se
// programa con el código de la prenda y el sufijo TOP (MG-V834 TOP).
//
// El nombre dice a qué REFERENCIA pertenece el top, pero no a qué LOTE: la
// misma referencia se produce varias veces. El lote se deduce de tres señales
// que en los datos siempre concuerdan: misma fase, misma cantidad, y el top se
// corta después de la prenda (10881 → 10975, 10984 → 11065).
// ---------------------------------------------------------------------------

const SUFIJO_TOP = /\s+TOP$/i

export function esOrdenTop(o) {
  return SUFIJO_TOP.test((o && o.referencia) || '')
}

export function refBaseDeTop(referencia) {
  return String(referencia || '').replace(SUFIJO_TOP, '').trim()
}

// Clave estable de una orden: el id se regenera en cada importación, pero la
// referencia y el número de orden se mantienen.
export function claveOrden(o) {
  return o ? `${o.referencia}|${o.orden || ''}` : ''
}

function numOrden(o) {
  const n = parseInt(String((o && o.orden) || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function cantOrden(o) {
  const s = (o && o.stages && o.stages.ordenCorte) || {}
  const n = parseInt(String(s.cant || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

// Empareja cada orden de top con la orden de prenda a la que pertenece.
// `refMap` (opcional) resuelve códigos equivalentes, para que un top programado
// con el código final (M5273 TOP) encuentre igual su prenda (MG-V834).
// `manual` corrige a mano lo que el automático no acierte: { claveTop: claveBase }
// —y con cadena vacía se declara que ese top no va con ninguna orden—.
export function buildTopLinks(orders, refMap, manual) {
  const fijos = manual || {}
  const porBase = new Map() // clave de la prenda -> { top, aviso }
  const porTop = new Map() // clave del top -> { base, aviso }
  const bases = orders.filter((o) => !esOrdenTop(o))

  orders.filter(esOrdenTop).forEach((top) => {
    const claveTop = claveOrden(top)
    const fijo = Object.prototype.hasOwnProperty.call(fijos, claveTop) ? fijos[claveTop] : null

    let elegida = null
    let aviso = ''
    const aMano = fijo !== null
    if (aMano) {
      if (!fijo) return // marcado a mano como "sin prenda"
      elegida = bases.find((o) => claveOrden(o) === fijo) || null
      aviso = elegida ? '' : 'La orden vinculada a mano ya no existe'
    } else {
      const raiz = refBaseDeTop(top.referencia)
      const ficha = refMap && refMap.get(raiz)
      const codigos = new Set(
        ficha && Array.isArray(ficha.codigos) ? ficha.codigos.concat(raiz) : [raiz],
      )
      const mismos = bases.filter((o) => codigos.has(o.referencia) && o.origen === top.origen)
      const nTop = numOrden(top)
      // La prenda de este lote es la última cortada antes del top.
      const antes = mismos.filter((o) => numOrden(o) < nTop)
      if (antes.length) {
        elegida = antes.reduce((a, b) => (numOrden(a) >= numOrden(b) ? a : b))
      } else if (mismos.length) {
        // No debería pasar (el top va después), pero si pasa se toma la más
        // cercana y se avisa en vez de dejar la fila sin dato.
        elegida = mismos.reduce((a, b) => (numOrden(a) <= numOrden(b) ? a : b))
        aviso = 'El top se cortó antes que la prenda — verifica el lote'
      }
      if (elegida) {
        const cT = cantOrden(top)
        const cB = cantOrden(elegida)
        if (cT != null && cB != null && cT !== cB) {
          aviso = `Cantidades distintas: prenda ${cB}, top ${cT}`
        }
      }
    }

    if (!elegida) return
    porTop.set(claveTop, { base: elegida, aviso, aMano })
    // Si dos tops reclaman la misma prenda, se queda el de número menor.
    const previo = porBase.get(claveOrden(elegida))
    if (!previo || numOrden(top) < numOrden(previo.top)) {
      porBase.set(claveOrden(elegida), { top, aviso, aMano })
    }
  })

  return { porBase, porTop }
}

// Normaliza texto para comparar tipo (minúsculas, sin acentos).
function normTipo(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}
export function esPrendaTop(r) { return ['blusa', 'camisa', 'top', 'chaqueta'].some((k) => normTipo(r.tipo).includes(k)) }
export function esPrendaBottom(r) { return ['pantalon', 'short', 'falda'].some((k) => normTipo(r.tipo).includes(k)) }

// Recargo de la Talla 20 según el tipo de prenda: Vestido/Enterizo +$10.000,
// las demás (Blusa, Short, Falda, Pantalón…) +$6.000.
export function recargoTalla20(tipo) {
  const t = normTipo(tipo)
  return (t.includes('vestido') || t.includes('enterizo')) ? 10000 : 6000
}
// Precio de Talla 20 de una prenda = su precio de Talla 6-18 (costo) más el
// recargo del tipo. Si no tiene precio base, no hay Talla 20 (0).
export function precioTalla20(ref) {
  const base = Number(ref.costo) || Number(ref.precioTalla618) || 0
  return base > 0 ? base + recargoTalla20(ref.tipo) : 0
}

// Filas para la lista de precios (PDF) de una marca: solo aprobadas, con los
// conjuntos colapsados a una fila (ref + descripción + precio sumado). Ordena
// por nueva referencia. Devuelve [{ ref, desc, t618, t20 }].
export function buildListaPreciosRows(refs, marca) {
  const base = refs.filter((r) => medicionInfo(r).estado === 'aprobada' && r.marca === marca)
  const pairs = buildConjuntoPairs(base)
  const p618 = (d) => Number(d.costo) || Number(d.precioTalla618) || 0
  const out = []
  // Cada prenda aprobada aparece con su propia referencia y precio, incluidas
  // las que forman parte de un conjunto. La Talla 20 es derivada (helper).
  base.forEach((d) => out.push({
    ref: d.nuevaRef || '',
    desc: d.descripcion || d.tipo || '',
    t618: p618(d),
    t20: precioTalla20(d),
  }))
  // Y además, una fila por conjunto: precio y Talla 20 = suma de sus prendas.
  pairs.forEach(({ top, bottom }) => out.push({
    ref: top.conjuntoNuevaRef || '',
    desc: top.conjuntoDescripcion || 'Conjunto',
    t618: p618(top) + p618(bottom),
    t20: precioTalla20(top) + precioTalla20(bottom),
  }))
  out.sort((a, b) => (a.ref || 'zzzz').localeCompare(b.ref || 'zzzz'))
  return out
}

// Tarjetas de precio para imprimir y recortar (una por conjunto o por prenda
// suelta). Un conjunto da una tarjeta de 3 filas: prenda de arriba, prenda de
// abajo y el conjunto con el precio sumado. Devuelve [{ rows: [{ref,desc,precio}] }].
export function buildTarjetasPreciosCards(refs, marca) {
  const base = refs.filter((r) => medicionInfo(r).estado === 'aprobada' && r.marca === marca)
  const pairs = buildConjuntoPairs(base)
  const enPar = new Set()
  pairs.forEach((p) => { enPar.add(p.top.id); enPar.add(p.bottom.id) })
  const p618 = (d) => Number(d.costo) || Number(d.precioTalla618) || 0
  const linea = (d) => ({ ref: d.nuevaRef || '', desc: d.descripcion || d.tipo || '', precio: p618(d) })
  const cards = []
  // Cada conjunto genera DOS tarjetas idénticas: una se pone en la blusa y la
  // otra en el short/pantalón. Salen seguidas (una al lado de la otra).
  pairs.forEach(({ top, bottom }) => {
    const rows = [
      linea(top),
      linea(bottom),
      {
        ref: top.conjuntoNuevaRef || '',
        desc: top.conjuntoDescripcion || 'Conjunto',
        precio: p618(top) + p618(bottom),
      },
    ]
    cards.push({ rows, esConjunto: true }, { rows, esConjunto: true })
  })
  base.filter((r) => !enPar.has(r.id)).forEach((d) => cards.push({ rows: [linea(d)] }))
  // Primero los conjuntos (3 filas) y luego las prendas sueltas, cada grupo por
  // referencia: así las tarjetas de cada fila miden igual y no se desperdicia hoja.
  cards.sort((a, b) => (b.rows.length - a.rows.length)
    || (a.rows[0].ref || 'zzzz').localeCompare(b.rows[0].ref || 'zzzz'))
  return cards
}

// Empareja referencias enlazadas por conjunto/conjuntoRef en { top, bottom }.
// Solo forma el par si ambas prendas están en la lista recibida.
export function buildConjuntoPairs(refs) {
  const byId = new Map(refs.map((r) => [r.id, r]))
  const used = new Set()
  const pairs = []
  refs.forEach((r) => {
    if (used.has(r.id)) return
    if (!r.conjunto || !r.conjuntoRef) return
    const partner = byId.get(r.conjuntoRef)
    if (!partner || used.has(partner.id)) return
    let top, bottom
    if (esPrendaTop(r)) { top = r; bottom = partner }
    else if (esPrendaBottom(r)) { top = partner; bottom = r }
    else if (esPrendaTop(partner)) { top = partner; bottom = r }
    else { top = r; bottom = partner }
    pairs.push({ top, bottom })
    used.add(r.id); used.add(partner.id)
  })
  return pairs
}

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
    // Procesos especiales de producción (lista libre del catálogo editable).
    procesos: [],
    colores: [],
    colorMuestra: '', precioTela: '', costo: '', costoRevisado: false, topIncluido: '',
    // Costos (hoja de precios de lista para la diseñadora):
    // El precio de Talla 6-18 es el mismo campo `costo` de arriba.
    nuevaRef: '', descripcion: '', precioTalla20: '',
    // En un conjunto, estos se guardan en la prenda "de arriba" (ancla):
    conjuntoNuevaRef: '', conjuntoDescripcion: '', conjuntoImage: null,
    cantidad: '',
    // "Producción extra": autorización rápida hecha desde el Resumen sobre
    // una ref que originalmente solo iba a Muestras. Es solo un marcador;
    // el estado de producción real sigue derivado de los tracks e importes.
    // El chip "Extra" se queda para siempre como identificador histórico.
    produccionExtra: false,
    produccionExtraFecha: '',
    // Pool de "Fotos": una ref está en el pool cuando enFotos=true.
    // Cuando se fotografía queda con fotografiada=true (se muestra en la
    // zona "Ya fotografiadas"). El histórico se conserva para siempre.
    enFotos: false,
    enFotosAt: '',
    fotografiada: false,
    fotografiadaAt: '',
    // Preorden de Geodésica: ref ingresada manualmente antes de que llegue
    // en el Excel. Cuando el Excel trae órdenes con esa referencia, la
    // preorden "se gradúa" (deja de aparecer en Por programar y entra al
    // flujo normal de Geodésica).
    geodesicaPreOrder: false,
    geodesicaPreOrderAt: '',
    geodesicaProducto: '',
    geodesicaFechaEntrega: '',
    geodesicaMaquila: false,
    // Cada tela: { nombre, disponible, metros, nota }. Una prenda puede llevar varias.
    telas: [],
    pendiente: false, pendienteNota: '', pendienteFecha: '',
    image: null,
    // Fotos de la sesión para el catálogo: hasta 3 por página.
    // [{ src, name, rol?, refId? }]
    //   rol: '' (prenda de la página) | 'detalle' (detalle, sin referencia)
    //   refId: si la foto es de OTRA referencia (ej. el pantalón que acompaña
    //          la blusa sin ser conjunto) — trae código y colores de esa ficha.
    // imageReal/imageDetalle son campos legados que se consolidan en
    // fotosCatalogo al editar desde el armador.
    fotosCatalogo: [],
    imageDetalle: null,
    imageDetalleName: '',
    imageReal: null,
    imageRealName: '',
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

// ---------------------------------------------------------------------------
// KPIs por área
// ---------------------------------------------------------------------------

function cantEtapa(order, key) {
  const s = (order.stages && order.stages[key]) || {}
  const n = parseInt(String(s.cant || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

// Lo que falta por hacer en un área: unidades y órdenes, con el desglose por
// fase. Las unidades salen de la orden de corte, que es la cantidad del lote.
export function pendienteDeArea(ordersDelArea) {
  const porFase = {}
  let unidades = 0
  ordersDelArea.forEach((o) => {
    const n = cantEtapa(o, 'ordenCorte')
    unidades += n
    const f = porFase[o.origen] || (porFase[o.origen] = { ordenes: 0, unidades: 0 })
    f.ordenes += 1
    f.unidades += n
  })
  return { unidades, ordenes: ordersDelArea.length, porFase }
}

// Lo que el área terminó cada día: se mide por la etapa que ella cumple
// (Trazos cierra el trazo, Corte la entrega de corte, etc.). Una orden ya
// trazada salió de Trazos, así que hay que mirar todas las órdenes, no solo
// las que siguen en la etapa.
export function produccionPorDia(orders, etapaKey, dias) {
  const mapa = new Map(dias.map((d) => [d, { unidades: 0, refs: [] }]))
  orders.forEach((o) => {
    const fecha = (o.stages && o.stages[etapaKey] && o.stages[etapaKey].fecha) || ''
    const dia = mapa.get(fecha)
    if (!dia) return
    const cant = cantEtapa(o, etapaKey) || cantEtapa(o, 'ordenCorte')
    dia.unidades += cant
    dia.refs.push({ id: o.id, referencia: o.referencia, orden: o.orden, origen: o.origen, cant, fecha })
  })
  mapa.forEach((d) => d.refs.sort((a, b) => b.cant - a.cant))
  return mapa
}

export function totalSemana(orders, etapaKey, dias) {
  let unidades = 0
  let refs = 0
  produccionPorDia(orders, etapaKey, dias).forEach((d) => {
    unidades += d.unidades
    refs += d.refs.length
  })
  return { unidades, refs }
}

// ---------------------------------------------------------------------------
// Vínculo entre las dos prendas de un conjunto
//
// Un conjunto se despacha completo, así que sus dos prendas deberían avanzar
// a la par. Cada una lleva su propia orden y muchas veces va a un taller
// distinto: la pareja está declarada en la ficha (conjuntoRef), y el lote se
// resuelve emparejando en orden las órdenes de cada prenda dentro de la misma
// fase (el primer lote de la blusa con el primero del pantalón, y así).
// ---------------------------------------------------------------------------

function numeroOrden(o) {
  const n = parseInt(String((o && o.orden) || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

const ORIGENES_ORDEN = ['premuestra', 'muestra', 'produccion', 'geodesica']

export function buildConjuntoLinks(orders, refMap) {
  if (!refMap) return new Map()
  // Órdenes agrupadas por ficha y fase, en el orden en que se cortaron.
  const porFicha = new Map()
  orders.forEach((o) => {
    const ficha = refMap.get(o.referencia)
    if (!ficha) return
    const clave = `${ficha.id}|${o.origen}`
    const lista = porFicha.get(clave) || porFicha.set(clave, []).get(clave)
    lista.push(o)
  })
  porFicha.forEach((lista) => lista.sort((a, b) => numeroOrden(a) - numeroOrden(b)))

  const enlaces = new Map()
  const hechos = new Set()
  refMap.forEach((ficha) => {
    const parejaId = (ficha.conjuntoRef || '').trim()
    if (!parejaId) return
    const pareja = refMap.get(parejaId)
    if (!pareja || pareja.id === ficha.id) return
    const par = [ficha.id, pareja.id].sort().join('|')
    if (hechos.has(par)) return
    hechos.add(par)

    ORIGENES_ORDEN.forEach((origen) => {
      const a = porFicha.get(`${ficha.id}|${origen}`) || []
      const b = porFicha.get(`${pareja.id}|${origen}`) || []
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i += 1) {
        const aviso = a.length !== b.length
          ? `${ficha.id} tiene ${a.length} lote(s) y ${pareja.id} ${b.length} en esta fase`
          : ''
        enlaces.set(claveOrden(a[i]), { pareja: b[i], ficha: pareja, aviso })
        enlaces.set(claveOrden(b[i]), { pareja: a[i], ficha, aviso })
      }
    })
  })
  return enlaces
}

// ¿Van a la par las dos prendas del conjunto? Lo que importa es que entren a
// ensamble con poca diferencia, porque el conjunto se despacha completo.
export function estadoConjunto(orden, pareja) {
  const a = orderArea(orden)
  const b = orderArea(pareja)
  const entregaA = (orden.stages && orden.stages.entregaEnsamble && orden.stages.entregaEnsamble.fecha) || ''
  const entregaB = (pareja.stages && pareja.stages.entregaEnsamble && pareja.stages.entregaEnsamble.fecha) || ''
  const dias = entregaA && entregaB ? Math.abs(diasEntre(entregaA, entregaB)) : null
  return { area: a, areaPareja: b, juntas: a === b, dias }
}
