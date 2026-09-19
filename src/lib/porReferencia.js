// ════════════════════════════════════════════════════════════════════════
// POR REFERENCIA — lo que entró a bodega, cuánto se separó y qué queda libre.
// ────────────────────────────────────────────────────────────────────────
// Cruza tres cosas que el sistema ya tiene:
//   · la entrada a bodega de cada orden (Factory → stages.entradaBodega),
//   · el pedido de SYD (líneas con estado 'vendido'),
//   · lo separado y facturado de SYD (estado 'separado' / 'facturado').
// Libre en bodega = entró − lo que ya tiene nombre o ya salió
//                 = entró − max(separado, facturado)   (nunca negativo)
// Falta producir  = pedido − entró                     (nunca negativo)
//
// Un CONJUNTO no tiene órdenes propias: se arma con las órdenes CONJUNTO de
// sus dos prendas, así que su entrada es la MENOR de las dos (sin pantalón no
// hay conjunto). Una prenda suelta cuenta solo sus órdenes sueltas.
// Las premuestras no cuentan; las muestras sí, porque esa mercancía se vende.
// ════════════════════════════════════════════════════════════════════════
import { esOrdenConjunto, indiceCodigos, indiceConjuntos } from './programaciones.js'
import { categoriaDe } from './pedidos.js'

const n0 = (v) => Math.max(0, Number(v) || 0)
const marcaDe = (ref) => {
  const l = String(ref || '').trim().charAt(0).toUpperCase()
  return l === 'C' ? 'Casania' : l === 'M' ? 'Mariset' : 'Otra'
}

// Entradas a bodega de una lista de órdenes: total, última fecha y órdenes.
function entradasDe(ordenes) {
  let entro = 0, fecha = ''
  const lista = []
  ordenes.forEach((o) => {
    const eb = (o.stages || {}).entradaBodega || {}
    const n = n0(eb.cant)
    if (!n) return
    entro += n
    if ((eb.fecha || '') > fecha) fecha = eb.fecha
    lista.push({ orden: o.orden, cant: n, fecha: eb.fecha || '', muestra: o.origen === 'muestra' })
  })
  return { entro, fecha, ordenes: lista.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)) }
}

export function armarPorReferencia(filasSyd, orders, refs) {
  // Órdenes por código, sin premuestras.
  const porRefOrden = new Map()
  ;(orders || []).forEach((o) => {
    if (o.origen === 'premuestra') return
    const k = String(o.referencia || '').trim()
    if (!porRefOrden.has(k)) porRefOrden.set(k, [])
    porRefOrden.get(k).push(o)
  })
  const codigos = indiceCodigos(refs)
  const conjuntos = indiceConjuntos(refs)
  const ordenesDe = (ref, deConjunto) => {
    const cods = codigos.get(ref) || new Set([ref])
    const out = []
    cods.forEach((c) => (porRefOrden.get(c) || []).forEach((o) => { if (esOrdenConjunto(o) === deConjunto) out.push(o) }))
    return out
  }

  // Pedido, separado y facturado por referencia, y por cliente dentro de ella.
  const m = new Map()
  ;(filasSyd || []).forEach((r) => {
    const estado = r.estado || 'vendido'
    if (estado === 'pendiente') return
    const ref = String(r.referencia || '').trim().toUpperCase()
    if (!ref) return
    if (!m.has(ref)) m.set(ref, { ref, descripcion: r.descripcion || '', pedido: 0, separado: 0, facturado: 0, valor: 0, clientes: new Map() })
    const x = m.get(ref)
    if (!x.descripcion && r.descripcion) x.descripcion = r.descripcion
    const nombre = String(r.cliente || '').trim()
    if (!x.clientes.has(nombre)) x.clientes.set(nombre, { cliente: nombre, ciudad: r.ciudad || '', pedidos: new Set(), pidio: 0, separado: 0, facturado: 0, colores: new Set() })
    const c = x.clientes.get(nombre)
    const u = n0(r.unid)
    if (estado === 'vendido') { x.pedido += u; x.valor += Number(r.total) || 0; c.pidio += u; if (r.pedido) c.pedidos.add(r.pedido); if (r.color) c.colores.add(r.color) }
    else if (estado === 'separado') { x.separado += u; c.separado += u }
    else if (estado === 'facturado') { x.facturado += u; c.facturado += u }
  })

  return [...m.values()].map((x) => {
    const conj = conjuntos.get(x.ref)
    let ent
    if (conj && conj.piezas.length) {
      // La menor de las dos prendas; las órdenes que se muestran son las de esa.
      const porPieza = conj.piezas.map((p) => entradasDe(ordenesDe(p, true)))
      ent = porPieza.reduce((a, b) => (b.entro < a.entro ? b : a))
    } else ent = entradasDe(ordenesDe(x.ref, false))
    const conNombre = Math.max(x.separado, x.facturado)
    const clientes = [...x.clientes.values()].map((c) => ({
      ...c, pedidos: [...c.pedidos].sort(), colores: [...c.colores],
      falta: Math.max(c.pidio - Math.max(c.separado, c.facturado), 0),
    }))
    return {
      ref: x.ref, descripcion: x.descripcion, marca: marcaDe(x.ref), categoria: categoriaDe(x.descripcion),
      esConjunto: !!conj, piezas: conj ? conj.piezas : [],
      pedido: x.pedido, valor: x.valor, separado: x.separado, facturado: x.facturado,
      entro: ent.entro, fechaEntrada: ent.fecha, ordenes: ent.ordenes,
      libre: ent.entro ? Math.max(ent.entro - conNombre, 0) : 0,
      faltaProducir: Math.max(x.pedido - ent.entro, 0),
      // Se separó más de lo que figura entrado: la entrada de Factory va atrasada.
      sinEntradaSuficiente: conNombre > ent.entro,
      clientes, nClientes: clientes.length, nConSeparado: clientes.filter((c) => c.separado > 0).length,
    }
  })
}

export const FILTROS_REF = [
  { key: 'entrada', label: 'Con entrada a bodega', f: (r) => r.entro > 0 },
  { key: 'libre', label: 'Con libre por separar', f: (r) => r.libre > 0 },
  { key: 'completo', label: 'Todo separado', f: (r) => r.entro > 0 && r.libre === 0 },
  { key: 'sinEntrada', label: 'Pedido sin entrada', f: (r) => r.entro === 0 },
  { key: 'todas', label: 'Todas', f: () => true },
]

export function totalesRef(lista) {
  const t = { entro: 0, separado: 0, libre: 0, pedido: 0, faltaProducir: 0, refs: lista.length }
  lista.forEach((r) => { t.entro += r.entro; t.separado += r.separado; t.libre += r.libre; t.pedido += r.pedido; t.faltaProducir += r.faltaProducir })
  return t
}
