// ════════════════════════════════════════════════════════════════════════
// PRODUCCIÓN DE UNA REFERENCIA, vista desde el cliente (Despachos → ventana
// del cliente → clic en el código). Responde "¿en qué va la C6852?":
//   · cada orden de corte con su etapa, su taller, sus días y su curva por
//     color y talla (lo cortado y lo que el taller entregó),
//   · lo libre hoy en bodega (mismo cálculo de Por referencia),
//   · y la respuesta lista para el cliente: qué se le puede separar ya y
//     dónde está lo demás.
// Todo sale de lo que ya existe: órdenes de Factory (Programaciones), etapas
// medidas (procesos), estado de tela (programaciones) y el pedido de SYD.
// ════════════════════════════════════════════════════════════════════════
import { cantidadReal, empatarColor, esOrdenConjunto, indiceCodigos, indiceConjuntos } from './programaciones.js'
import { AREA_ORDER, areaIndex, orderArea } from './domain.js'
import { diasDesde, diasEntre } from './dates.js'
import { armarPorReferencia, calcularLibres } from './porReferencia.js'
import { duracion } from './procesos.js'

const n0 = (v) => Math.max(0, Number(v) || 0)
const up = (s) => String(s || '').trim().toUpperCase()
const tallaLimpia = (t) => String(t || '').replace(/^0+(?=\d)/, '')
export const TALLAS_ORDEN = ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
const ordenTalla = (a, b) => (TALLAS_ORDEN.indexOf(a) - TALLAS_ORDEN.indexOf(b)) || String(a).localeCompare(String(b), 'es', { numeric: true })

// Los siete pasos de una orden, en el orden en que pasan. Cada uno es una
// etapa de Factory (stages) y corresponde a un área de AREA_ORDER.
export const PASOS = [
  { key: 'ordenCorte', label: 'Orden corte' },
  { key: 'trazo', label: 'Trazo' },
  { key: 'entregaCorte', label: 'Corte' },
  { key: 'alistamiento', label: 'Alistado' },
  { key: 'envioEnsamble', label: 'Taller' },
  { key: 'entregaEnsamble', label: 'Entregó' },
  { key: 'entradaBodega', label: 'Bodega' },
]

// Qué se dice de una orden según su área, y el color del chip.
const ETAPA = {
  trazos: { label: 'Por trazar', clase: 'corte' },
  corte: { label: 'En corte', clase: 'corte' },
  enviar: { label: 'Cortada · por alistar', clase: 'corte' },
  alistamiento: { label: 'Alistada · por enviar', clase: 'corte' },
  talleres: { label: 'En taller', clase: 'taller' },
  entrega: { label: 'Entregó el taller', clase: 'taller' },
  bodega: { label: 'En bodega', clase: 'bodega' },
}
// Un taller que lleva más de esto sin entregar se marca en rojo.
export const DIAS_TALLER_TARDE = 15

// Lo que cuenta como entrado: la entrada a bodega, o la entrega del taller si
// es muestra (regla de Por referencia).
function entradaDe(o) {
  const st = o.stages || {}
  const eb = st.entradaBodega || {}
  if (n0(eb.cant)) return { cant: n0(eb.cant), fecha: eb.fecha || '' }
  const ee = st.entregaEnsamble || {}
  if (o.origen === 'muestra' && n0(ee.cant)) return { cant: n0(ee.cant), fecha: ee.fecha || '', sinDigitar: true }
  return { cant: 0, fecha: '' }
}

const fechaCorta = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return `${String(d).padStart(2, '0')} ${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1]}`
}
export const diasTxt = (n) => `${n} ${n === 1 ? 'día' : 'días'}`

// Una orden, con todo lo que el panel muestra de ella.
function armarOrden(o, pieza, procesos, coloresPedido, ref) {
  const st = o.stages || {}
  const area = orderArea(o)
  const idx = areaIndex(area) // índice del último paso cumplido (-1 = ninguno)
  const proc = (procesos || {})[String(o.orden)] || {}
  const corte = proc.corte || {}
  const durCorte = duracion(corte)
  const envio = st.envioEnsamble || {}
  const entrega = st.entregaEnsamble || {}
  const entro = entradaDe(o)
  const taller = String(envio.taller || '').trim()
  const diasTaller = envio.fecha ? (entrega.fecha ? diasEntre(envio.fecha, entrega.fecha) : diasDesde(envio.fecha)) : null

  const pasos = PASOS.map((p, i) => {
    const s = st[p.key] || {}
    let estado
    if (i < idx) estado = s.fecha ? 'ok' : 'salto'
    else if (i === idx) estado = area === 'bodega' ? 'ok' : 'aqui'
    else estado = 'falta'
    let extra = ''
    if (p.key === 'entregaCorte' && corte.quien) extra = corte.quien + (durCorte && durCorte.texto ? ` · ${durCorte.texto}` : '')
    if (p.key === 'envioEnsamble' && s.fecha) extra = diasTaller != null ? diasTxt(diasTaller) : ''
    if ((p.key === 'entregaEnsamble' || p.key === 'entradaBodega') && n0(s.cant)) extra = `${n0(s.cant)} und`
    return {
      key: p.key, estado, fecha: s.fecha || '', fechaTxt: fechaCorta(s.fecha), extra,
      label: p.key === 'envioEnsamble' && taller ? taller : p.label,
      tarde: p.key === 'envioEnsamble' && estado === 'aqui' && diasTaller != null && diasTaller > DIAS_TALLER_TARDE,
    }
  })

  // La curva por color y talla: lo cortado (o programado si aún no hay
  // entrega de corte) y lo que el taller entregó por talla (`ent`).
  const campo = n0((st.alistamiento || {}).cant) > 0 ? 'corte' : 'prog'
  const porColor = new Map()
  const tallasSet = new Set()
  ;(o.curva || []).forEach((r) => {
    const n = n0(r[campo])
    const e = n0(r.ent)
    if (!n && !e) return
    const color = up(r.color) || '—'
    const t = tallaLimpia(r.talla)
    tallasSet.add(t)
    if (!porColor.has(color)) porColor.set(color, { color, colorPedido: empatarColor(color, coloresPedido, ref), tallas: {}, ent: {}, unid: 0, entUnid: 0 })
    const d = porColor.get(color)
    d.tallas[t] = (d.tallas[t] || 0) + n
    d.ent[t] = (d.ent[t] || 0) + e
    d.unid += n
    d.entUnid += e
  })
  const colores = [...porColor.values()].sort((a, b) => b.unid - a.unid)
  const entregoTaller = n0(entrega.cant)
  const cant = cantidadReal(o)
  // Tallas que el taller dejó de entregar (solo cuando ya entregó).
  const faltoTaller = []
  if (entregoTaller > 0) {
    colores.forEach((c) => Object.entries(c.tallas).forEach(([t, n]) => {
      const f = n - (c.ent[t] || 0)
      if (f > 0) faltoTaller.push({ color: c.color, talla: t, n: f })
    }))
  }
  const etapa = ETAPA[area] || { label: 'Sin orden de corte', clase: 'corte' }
  return {
    orden: String(o.orden), origen: o.origen || 'produccion', muestra: o.origen === 'muestra', pieza,
    fechaOC: (st.ordenCorte || {}).fecha || '', fechaOCTxt: fechaCorta((st.ordenCorte || {}).fecha),
    programada: n0((st.ordenCorte || {}).cant), cant, cortada: !!(st.entregaCorte || {}).fecha,
    area, idx, etapa, pasos, taller, diasTaller,
    tarde: !entrega.fecha && diasTaller != null && diasTaller > DIAS_TALLER_TARDE,
    entregoTaller, entregoFecha: entrega.fecha || '', entro: entro.cant, entroFecha: entro.fecha, entroSinDigitar: !!entro.sinDigitar,
    colores, tallas: [...tallasSet].sort(ordenTalla), faltoTaller,
    // Texto del chip del encabezado.
    chip: area === 'bodega'
      ? `Entró a bodega · ${fechaCorta(entro.fecha)} · ${entro.cant} und`
      : area === 'entrega'
        ? `Entregó el taller · ${fechaCorta(entrega.fecha)} · ${entregoTaller} und`
        : area === 'talleres'
          ? `En taller · ${taller || 'sin nombre'} · ${diasTaller != null ? diasTxt(diasTaller) : ''}`.replace(/ · $/, '')
          : etapa.label,
  }
}

// Las órdenes de la referencia: las suyas si es una prenda suelta; las de sus
// dos prendas (órdenes CONJUNTO) si es un conjunto. Sin premuestras.
function ordenesDeRef(ref, orders, refs) {
  const codigos = indiceCodigos(refs)
  const conjuntos = indiceConjuntos(refs)
  const porRef = new Map()
  ;(orders || []).forEach((o) => {
    if (o.origen === 'premuestra') return
    const k = String(o.referencia || '').trim()
    if (!porRef.has(k)) porRef.set(k, [])
    porRef.get(k).push(o)
  })
  const juntar = (r, deConjunto) => {
    const cods = codigos.get(r) || new Set([r])
    const out = []
    cods.forEach((c) => (porRef.get(c) || []).forEach((o) => { if (esOrdenConjunto(o) === deConjunto) out.push(o) }))
    return out
  }
  const conj = conjuntos.get(up(ref))
  if (conj && conj.piezas.length) return { esConjunto: true, grupos: conj.piezas.map((p) => ({ pieza: p, ordenes: juntar(p, true) })) }
  return { esConjunto: false, grupos: [{ pieza: '', ordenes: juntar(ref, false) }] }
}

// Estado de tela de la referencia (Programaciones): lo que está andando.
function estadoTelaDe(ref, programaciones) {
  const p = (programaciones || []).find((x) => up(x.id) === up(ref))
  if (!p) return null
  const abiertos = (p.movimientos || []).filter((m) => !m.llegadaAt)
  const label = { telaPedida: 'Tela pedida', estampacion: 'En estampación', sinTela: 'Sin tela', lista: 'Lista para programar' }[p.estado] || ''
  return {
    estado: p.estado || '', label,
    movimientos: abiertos.map((m) => ({
      proceso: m.proceso === 'textampa' ? 'Textampa' : 'Tela pedida',
      color: up(m.color), cant: n0(m.cant), dias: m.desde ? diasDesde(m.desde) : null,
    })),
    cerrada: p.cerrada || null,
  }
}

// Lo que este cliente pide de la referencia y aún no tiene, por color y talla.
function pendienteDe(lineas) {
  return (lineas || []).map((l) => {
    const tallas = {}
    let n = 0
    Object.entries(l.tallas || {}).forEach(([t, v]) => {
      const ya = Math.max(n0((l.sepTallas || {})[t]), n0((l.factTallas || {})[t]))
      const p = n0(v) - ya
      if (p > 0) { tallas[t] = p; n += p }
    })
    return { color: up(l.color), tallas, n, pedidos: l.pedidos || [] }
  }).filter((c) => c.n > 0)
}

// Todo lo que el panel necesita de una referencia.
//   ref: código; lineas: las líneas de este cliente para esa referencia
//   (ventana del cliente); filasSyd: todas las líneas de SYD (para libres);
//   orders/refs/programaciones/procesos: lo que ya carga la app.
export function produccionDe({ ref, lineas, filasSyd, orders, refs, programaciones, procesos, cerrada }) {
  const codigo = up(ref)
  const { esConjunto, grupos } = ordenesDeRef(codigo, orders, refs)

  // Colores que pide el mercado (todos los clientes), para empatar los de Factory.
  const coloresPedido = [...new Set((filasSyd || [])
    .filter((r) => up(r.referencia) === codigo && (r.estado || 'vendido') === 'vendido')
    .map((r) => up(r.color)).filter(Boolean))]

  const gruposArmados = grupos.map((g) => ({
    pieza: g.pieza,
    ordenes: g.ordenes.map((o) => armarOrden(o, g.pieza, procesos, coloresPedido, codigo))
      .sort((a, b) => (b.fechaOC || '').localeCompare(a.fechaOC || '') || b.orden.localeCompare(a.orden, 'es', { numeric: true })),
  }))
  const ordenes = gruposArmados.flatMap((g) => g.ordenes)

  // Cifras: por prenda, y en un conjunto la menor de las dos (un conjunto
  // existe cuando están las dos piezas).
  const cifrasDe = (os) => ({
    programado: os.reduce((n, o) => n + o.cant, 0),
    cortado: os.reduce((n, o) => n + (o.cortada ? o.cant : 0), 0),
    entrego: os.reduce((n, o) => n + o.entregoTaller, 0),
    bodega: os.reduce((n, o) => n + o.entro, 0),
    enTaller: os.reduce((n, o) => n + ((o.area === 'talleres') ? o.cant : 0), 0),
    ordenes: os.length,
  })
  const porGrupo = gruposArmados.map((g) => cifrasDe(g.ordenes))
  const cifras = porGrupo.length === 1 ? porGrupo[0] : {
    programado: Math.min(...porGrupo.map((c) => c.programado)),
    cortado: Math.min(...porGrupo.map((c) => c.cortado)),
    entrego: Math.min(...porGrupo.map((c) => c.entrego)),
    bodega: Math.min(...porGrupo.map((c) => c.bodega)),
    enTaller: Math.min(...porGrupo.map((c) => c.enTaller)),
    ordenes: ordenes.length,
  }

  // Libres hoy: exactamente lo que dice Por referencia.
  let libres = { libre: {}, total: 0, tallas: [], colores: [], entro: 0, conNombre: 0, avisos: [] }
  const fila = armarPorReferencia(filasSyd || [], orders, refs).find((r) => r.ref === codigo)
  if (fila) {
    const l = calcularLibres(fila)
    libres = { libre: l.libre, total: l.totalLibre, tallas: l.tallas, colores: l.colores, entro: fila.entro, conNombre: Math.max(fila.separado, fila.facturado), avisos: l.avisos }
  }
  cifras.libres = libres.total

  const tela = estadoTelaDe(codigo, programaciones)
  const pendiente = pendienteDe(lineas)
  // Un conjunto se corta en dos órdenes iguales (una por prenda): para decir
  // dónde está lo que falta basta con las de la primera prenda.
  const respuesta = armarRespuesta({ pendiente, libres, ordenes: esConjunto ? gruposArmados[0].ordenes : ordenes, tela, cerrada })

  return { ref: codigo, esConjunto, grupos: gruposArmados, ordenes, cifras, libres, tela, pendiente, respuesta, cerrada: !!cerrada }
}

// La respuesta para el cliente, color por color: qué se le puede separar hoy
// y dónde está lo que falta.
function armarRespuesta({ pendiente, libres, ordenes, tela, cerrada }) {
  const enCamino = ordenes.filter((o) => o.area !== 'bodega')
  return pendiente.map((p) => {
    const tallas = Object.keys(p.tallas).sort(ordenTalla)
    let puede = 0
    const faltan = []
    tallas.forEach((t) => {
      const l = n0(libres.libre[p.color + '|' + t])
      const n = p.tallas[t]
      puede += Math.min(n, l)
      if (l < n) faltan.push(n - l > 1 ? `${t} (${n - l})` : t)
    })
    const partes = []
    if (puede >= p.n) partes.push(`se le pueden separar hoy ${p.n === 1 ? 'la unidad' : `las ${p.n}`}`)
    else if (puede > 0) partes.push(`se le pueden separar hoy ${puede} de ${p.n}; sin libres en talla ${faltan.join(', ')}`)
    else partes.push(`nada libre en bodega (pide ${p.n})`)

    if (puede < p.n) {
      // Dónde está lo que falta: las órdenes en camino que traen ese color
      // (empatado con el nombre del pedido).
      const donde = []
      enCamino.forEach((o) => {
        const c = o.colores.find((x) => x.colorPedido && up(x.colorPedido) === p.color)
        if (!c) return
        const und = `${c.unid} und`
        if (o.area === 'talleres') donde.push(`${und} en ${o.taller || 'taller'} desde el ${o.pasos[4].fechaTxt}${o.diasTaller != null ? ` (${diasTxt(o.diasTaller)})` : ''}`)
        else if (o.area === 'entrega') donde.push(`${und} ya las entregó ${o.taller || 'el taller'} el ${o.pasos[5].fechaTxt}, falta la entrada a bodega`)
        else if (o.area === 'alistamiento') donde.push(`${und} alistadas, por enviar a taller`)
        else if (o.area === 'enviar') donde.push(`${und} cortadas, por alistar`)
        else donde.push(`${und} en corte (orden ${o.orden} del ${o.fechaOCTxt})`)
      })
      if (donde.length) partes.push(donde.join('; '))
      else if (cerrada) partes.push('producción cerrada: no sale más')
      else if (tela && tela.movimientos.length) {
        const m = tela.movimientos.filter((x) => x.color === p.color)
        const lista = (m.length ? m : tela.movimientos).map((x) => `${x.proceso.toLowerCase()} ${x.cant ? x.cant + ' und' : ''}${x.dias != null ? ` hace ${diasTxt(x.dias)}` : ''}`.replace(/\s+/g, ' ').trim())
        partes.push(`sin orden de corte de ese color: ${lista.join(', ')}`)
      } else if (tela && tela.label) partes.push(`sin orden de corte de ese color · ${tela.label.toLowerCase()}`)
      else partes.push('sin orden de corte de ese color')
    }
    return { color: p.color, n: p.n, puede, texto: partes.join(' · ') }
  })
}
