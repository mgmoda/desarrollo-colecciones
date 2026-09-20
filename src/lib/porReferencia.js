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
import { empatarColor, esOrdenConjunto, indiceCodigos, indiceConjuntos } from './programaciones.js'
import { categoriaDe, esPedidoEspecial, normObs } from './pedidos.js'

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

  // Avance de cada cliente en TODO su pedido: decide el turno al repartir.
  const avance = new Map()
  ;(filasSyd || []).forEach((r) => {
    const e = r.estado || 'vendido'
    if (e !== 'vendido' && e !== 'separado') return
    const k = String(r.cliente || '').trim()
    const a = avance.get(k) || { v: 0, s: 0 }
    if (e === 'vendido') a.v += n0(r.unid); else a.s += n0(r.unid)
    avance.set(k, a)
  })

  // Pedido, separado y facturado por referencia, y por cliente dentro de ella.
  const m = new Map()
  ;(filasSyd || []).forEach((r) => {
    const estado = r.estado || 'vendido'
    if (estado === 'pendiente') return
    const ref = String(r.referencia || '').trim().toUpperCase()
    if (!ref) return
    if (!m.has(ref)) m.set(ref, { ref, descripcion: r.descripcion || '', pedido: 0, separado: 0, facturado: 0, valor: 0, clientes: new Map(), lineas: [] })
    const x = m.get(ref)
    x.lineas.push(r)
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
    // Órdenes que entraron a bodega, agrupadas por prenda (una sola si no es
    // conjunto): de su curva sale lo libre por color y talla.
    let gruposOrdenes
    const conEntrada = (os) => os.filter((o) => n0(((o.stages || {}).entradaBodega || {}).cant) > 0)
    if (conj && conj.piezas.length) {
      // La menor de las dos prendas; las órdenes que se muestran son las de esa.
      const porPieza = conj.piezas.map((p) => entradasDe(ordenesDe(p, true)))
      ent = porPieza.reduce((a, b) => (b.entro < a.entro ? b : a))
      gruposOrdenes = conj.piezas.map((p) => conEntrada(ordenesDe(p, true)))
    } else {
      const os = ordenesDe(x.ref, false)
      ent = entradasDe(os)
      gruposOrdenes = [conEntrada(os)]
    }
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
      lineas: x.lineas, gruposOrdenes, avance,
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

// ── Libres por color y talla, y a quién se le pueden asignar ─────────────
// La primera separación la hace la persona a su criterio. Sobre lo que quedó
// libre, esto dice a qué clientes se les puede completar el pedido de ESTA
// referencia (todo o nada: un parcial no cuenta), en el orden del turno:
//   ★ prioridad → cliente más cerca de completar su despacho → pedido más antiguo.
// Color: si la referencia tiene varios colores y la línea no trae
// observación, va SURTIDA y le sirve cualquier color (nunca otra talla);
// "SIN X" es surtido menos ese color; cualquier otro texto es color fijo.
const TALLAS_ORDEN = ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const tallaLimpia = (t) => String(t || '').replace(/^0+(?=\d)/, '')
const campoCurva = (o) => (Number((((o.stages || {}).alistamiento) || {}).cant) > 0 ? 'corte' : 'prog')

function curvaDe(ordenes) {
  const c = {}
  ordenes.forEach((o) => (o.curva || []).forEach((r) => {
    const n = Number(r[campoCurva(o)]) || 0
    if (!n) return
    const k = String(r.color || '').trim().toUpperCase() + '|' + tallaLimpia(r.talla)
    c[k] = (c[k] || 0) + n
  }))
  return c
}

export function calcularLibres(r, prioridades) {
  const prior = prioridades || new Set()
  const vend = r.lineas.filter((l) => (l.estado || 'vendido') === 'vendido')
  const coloresPedido = [...new Set(vend.map((l) => String(l.color || '').trim().toUpperCase()).filter(Boolean))]
  const multi = coloresPedido.length > 1

  // Lo que entró por color y talla: la curva cortada de las órdenes con
  // entrada; en un conjunto, la menor de las dos prendas en cada casilla.
  const curvas = r.gruposOrdenes.map(curvaDe)
  const llaves = new Set(curvas.flatMap((c) => Object.keys(c)))
  const entroFab = {}
  llaves.forEach((k) => { entroFab[k] = Math.min(...curvas.map((c) => c[k] || 0)) })
  // Empatar el color de Factory con el del pedido ("VINO TINTO 2" = ROJO).
  const fabCols = [...new Set(Object.keys(entroFab).map((k) => k.split('|')[0]))]
  const alias = {}
  fabCols.forEach((c) => { const e = empatarColor(c, coloresPedido, r.ref); if (e) alias[c] = String(e).toUpperCase() })
  const sinEmpate = fabCols.filter((c) => !alias[c])
  const pedidoSinFab = coloresPedido.filter((c) => !Object.values(alias).includes(c))
  if (sinEmpate.length === 1 && pedidoSinFab.length === 1) alias[sinEmpate[0]] = pedidoSinFab[0]
  const entro = {}
  Object.entries(entroFab).forEach(([k, v]) => { const [c, t] = k.split('|'); const kk = (alias[c] || c) + '|' + t; entro[kk] = (entro[kk] || 0) + v })

  // Lo que ya tiene nombre (separado) o ya salió (facturado), por casilla.
  const sepCT = {}, factCT = {}
  r.lineas.forEach((l) => {
    const e = l.estado || 'vendido'
    if (e !== 'separado' && e !== 'facturado') return
    const dest = e === 'separado' ? sepCT : factCT
    Object.entries(l.tallas || {}).forEach(([t, v]) => { const k = String(l.color || '').trim().toUpperCase() + '|' + t; dest[k] = (dest[k] || 0) + (Number(v) || 0) })
  })
  const libre = {}
  const avisos = []
  new Set([...Object.keys(entro), ...Object.keys(sepCT), ...Object.keys(factCT)]).forEach((k) => {
    const conNombre = Math.max(sepCT[k] || 0, factCT[k] || 0)
    const v = (entro[k] || 0) - conNombre
    if (v > 0) libre[k] = v
    if (v < 0) { const [c, t] = k.split('|'); avisos.push(`${c} talla ${t}: hay ${conNombre} separadas y solo entraron ${entro[k] || 0}`) }
  })

  // Demanda pendiente por cliente, línea por línea.
  const cl = new Map()
  vend.forEach((l) => {
    const nombre = String(l.cliente || '').trim()
    if (!cl.has(nombre)) cl.set(nombre, { cliente: nombre, ciudad: l.ciudad || '', pedidos: new Set(), lineas: [], tiene: {} })
    const c = cl.get(nombre)
    if (l.pedido) c.pedidos.add(l.pedido)
    const o = normObs(l.observacion)
    let surtido = false, excluye = ''
    if (multi) {
      if (!o) surtido = true
      else if (o.startsWith('SIN ') && !esPedidoEspecial(o)) { surtido = true; excluye = o.slice(4).trim() }
    }
    c.lineas.push({ color: String(l.color || '').trim().toUpperCase(), tallas: l.tallas || {}, surtido, excluye })
  })
  r.lineas.forEach((l) => {
    const e = l.estado || 'vendido'
    if (e !== 'separado' && e !== 'facturado') return
    const c = cl.get(String(l.cliente || '').trim())
    if (!c) return
    Object.entries(l.tallas || {}).forEach(([t, v]) => { const k = String(l.color || '').trim().toUpperCase() + '|' + t; c.tiene[k] = Math.max(c.tiene[k] || 0, 0) + (Number(v) || 0) })
  })
  const pendientes = []
  cl.forEach((c) => {
    const usado = { ...c.tiene }
    let pidio = 0, falta = 0
    c.lineas.forEach((l) => {
      l.dem = {}
      Object.entries(l.tallas).forEach(([t, v]) => {
        const n = Number(v) || 0
        pidio += n
        const k = l.color + '|' + t
        const ya = Math.min(n, usado[k] || 0)
        usado[k] = (usado[k] || 0) - ya
        if (n - ya > 0) { l.dem[t] = n - ya; falta += n - ya }
      })
    })
    if (falta <= 0) return
    const a = r.avance.get(c.cliente) || { v: 0, s: 0 }
    pendientes.push({
      ...c, pedidos: [...c.pedidos].sort(), pidio, falta, tenia: pidio - falta,
      avance: a.v ? a.s / a.v : 0, prior: prior.has(c.cliente), surtido: c.lineas.some((l) => l.surtido),
    })
  })
  pendientes.sort((a, b) => (b.prior - a.prior) || (b.avance - a.avance)
    || String(a.pedidos[0] || '').localeCompare(String(b.pedidos[0] || ''), 'es', { numeric: true }))

  // Reparto todo o nada, en el orden del turno.
  const stock = { ...libre }
  const colores = [...new Set([...coloresPedido, ...Object.keys(libre).map((k) => k.split('|')[0])])]
  const cubrir = (c, st) => {
    const dar = []
    for (const l of c.lineas) {
      for (const [t, n] of Object.entries(l.dem || {})) {
        let f = n
        const k = l.color + '|' + t
        const g = Math.min(f, st[k] || 0)
        if (g) { dar.push({ color: l.color, talla: t, n: g, cambio: false }); st[k] -= g; f -= g }
        if (f && l.surtido) {
          for (const col of colores) {
            if (!f) break
            if (col === l.color || (l.excluye && normObs(col).startsWith(l.excluye.slice(0, 4)))) continue
            const kk = col + '|' + t
            const h = Math.min(f, st[kk] || 0)
            if (h) { dar.push({ color: col, talla: t, n: h, cambio: true }); st[kk] -= h; f -= h }
          }
        }
        if (f) return null
      }
    }
    return dar
  }
  const asignables = []
  pendientes.forEach((c) => {
    const copia = { ...stock }
    const dar = cubrir(c, copia)
    if (dar && dar.length) {
      Object.assign(stock, copia)
      asignables.push({ cliente: c.cliente, ciudad: c.ciudad, pedidos: c.pedidos, pidio: c.pidio, tenia: c.tenia, surtido: c.surtido, prior: c.prior, dar, n: dar.reduce((s, x) => s + x.n, 0) })
    }
  })
  const queda = Object.fromEntries(Object.entries(stock).filter(([, v]) => v > 0))
  const tallas = TALLAS_ORDEN.filter((t) => Object.keys(libre).some((k) => k.split('|')[1] === t))
  const coloresLibres = colores.filter((c) => Object.keys(libre).some((k) => k.split('|')[0] === c))
  const suma = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  // La curva es la de CORTE: si a bodega entró otra cantidad, se avisa.
  const totalCurva = suma(entro)
  if (totalCurva !== r.entro) avisos.push(`La curva por talla sale de lo cortado (${totalCurva}); a bodega figuran ${r.entro} entradas`)
  return {
    colores: coloresLibres, tallas, libre, totalLibre: suma(libre),
    asignables, asignadas: asignables.reduce((s, x) => s + x.n, 0),
    queda, totalQueda: suma(queda), esperan: pendientes.length, avisos,
  }
}
