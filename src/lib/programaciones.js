// Programaciones: lo que el cliente pidió de cada referencia contra lo que ya
// se mandó a cortar.
//
// El pedido sale del reporte de Factory. Lo programado lo cuenta el sistema de
// sus propias órdenes de corte, que es la pregunta real: de lo que el cliente
// pidió, ¿cuánto ya se mandó a cortar?
//
// El detalle que hacía fallar la cuenta: cada prenda tiene DOS códigos, el
// interno con el que nace (MG-B744) y el final que le da el catálogo (C6864),
// y las órdenes quedan repartidas entre los dos —155 de 156 referencias tienen
// órdenes bajo el interno—. Buscando solo por el código del reporte se perdía
// más de la mitad. Hay que sumar por los dos.

// Los conjuntos ya están armados en Costos: la prenda ancla guarda con cuál
// otra va, qué código le da el catálogo al conjunto —el mismo que trae el
// reporte— y su foto propia. Aquí solo se le da la vuelta al índice para poder
// ir del código del conjunto a su foto y su descripción.
export function indiceConjuntos(refs) {
  const finalDe = (r) => (r && ((r.nuevaRef || '').trim() || r.id)) || ''
  const porId = new Map((refs || []).map((r) => [r.id, r]))
  const m = new Map()
  ;(refs || []).forEach((r) => {
    const codigo = (r.conjuntoNuevaRef || '').trim().toUpperCase()
    if (!codigo) return
    const pareja = porId.get(r.conjuntoRef)
    m.set(codigo, {
      piezas: [finalDe(r), finalDe(pareja)].filter(Boolean),
      image: r.conjuntoImage || r.image || '',
      descripcion: r.conjuntoDescripcion || '',
    })
  })
  return m
}

export const esConjunto = (fila) => /CONJUNTO/i.test(fila.descripcion || '')

// Estados del seguimiento. No son texto libre porque las respuestas de la
// reunión se repiten: o falta tela, o ya se pidió, o la referencia anda en
// estampación. Con estados la tabla se filtra y se cuenta; el detalle -qué
// color, con qué proveedor- va en la nota.
//
// "En estampación" y "Tela pedida" significan que la referencia VA ANDANDO
// aunque la columna Falta esté en rojo: el rojo sin estado es el que preocupa.
export const ESTADOS_PROG = [
  { key: 'sinTela', label: 'Sin tela', bg: '#fbeceb', fg: '#8c2f28', bd: '#f0c4c0' },
  { key: 'telaPedida', label: 'Tela pedida', bg: '#faeeda', fg: '#633806', bd: '#fac775' },
  { key: 'estampacion', label: 'En estampación', bg: '#eeedfe', fg: '#3c3489', bd: '#cecbf6' },
  { key: 'lista', label: 'Lista para programar', bg: '#eaf3de', fg: '#27500a', bd: '#c0dd97' },
]
export const estadoProg = (key) => ESTADOS_PROG.find((e) => e.key === key) || null

// Una orden es de conjunto cuando su producto termina en esa palabra. Va en el
// producto (MG-B892 CONJUNTO), no en la referencia, y a veces la escriben
// pegada al código (MG-P995CONJUNTO), así que no se exige el espacio.
export const esOrdenConjunto = (o) => /CONJUNTO\s*$/i.test(String(o.producto || '').trim())

// Lo que de verdad se cortó de una orden.
//
// La orden de corte dice lo que se mandó a cortar, pero muchas veces la tela
// no alcanza —o rinde de más— y la cantidad final es la que sale de
// alistamiento: en 69 de 269 órdenes no coincide con lo programado. Mientras
// la orden no llegue a alistamiento manda la orden de corte, que es lo único
// que hay.
export function cantidadReal(o) {
  const st = o.stages || {}
  const alis = Number((st.alistamiento || {}).cant) || 0
  return alis > 0 ? alis : Number((st.ordenCorte || {}).cant) || 0
}

// El campo de la curva que corresponde a esa cantidad, para que el detalle por
// color sume exactamente lo mismo que la columna: alistamiento se reparte por
// el detalle de entrega de corte —en Factory las dos salen de la misma
// entrega, y suman igual en las 269 órdenes— y la orden de corte por lo
// programado.
const campoCurva = (o) => (Number(((o.stages || {}).alistamiento || {}).cant) > 0 ? 'corte' : 'prog')

// Un conjunto se programa en dos órdenes, una por prenda, con la misma
// cantidad: 61 blusas y 61 pantalones son 61 conjuntos. Si una de las dos no se
// programó, la tela de la otra se queda esperando. Esto devuelve cuál falta.
export function piezaQueFalta(piezas, ordenesPorRef, refMap, codigos) {
  if (!piezas || piezas.length < 2) return null
  const cuenta = (ref) => {
    const cods = (codigos && codigos.get(ref)) || new Set([ref])
    let n = 0
    cods.forEach((c) => (ordenesPorRef.get(c) || [])
      .filter(esOrdenConjunto)
      .forEach((o) => { n += cantidadReal(o) }))
    return n
  }
  const conteos = piezas.map((ref) => ({ ref, n: cuenta(ref) }))
  const hechas = conteos.filter((c) => c.n > 0)
  // Si ninguna se programó todavía no falta nada: el conjunto no ha arrancado.
  if (!hechas.length || hechas.length === conteos.length) return null
  const falta = conteos.find((c) => c.n === 0)
  const ficha = refMap && refMap.get(falta.ref)
  return {
    ref: falta.ref,
    tipo: ((ficha && ficha.tipo) || 'la otra prenda').toLowerCase(),
    hechas: hechas[0].n,
  }
}

// Todos los códigos con que una prenda pudo quedar registrada en las órdenes.
export function indiceCodigos(refs) {
  const m = new Map()
  ;(refs || []).forEach((r) => {
    const final = (r.nuevaRef || '').trim() || r.id
    if (!m.has(final)) m.set(final, new Set())
    m.get(final).add(r.id)
    m.get(final).add(final)
  })
  return m
}

// Unidades ya mandadas a cortar de una referencia.
//
// Una prenda que se vende suelta y también en conjunto tiene órdenes de las dos
// clases, y en el reporte son renglones distintos: la blusa por su lado y el
// conjunto por el suyo. Por eso una fila normal cuenta solo lo suelto.
//
// El conjunto no tiene órdenes propias: se arma con las de sus prendas, y
// cuenta UNA de ellas —61 blusas y 61 pantalones son 61 conjuntos, no 122—,
// así que se toma la mayor.
export function programadoDe(fila, ordenesPorRef, codigos) {
  const sumar = (ref, deConjunto) => {
    const cods = (codigos && codigos.get(ref)) || new Set([ref])
    let n = 0
    cods.forEach((c) => (ordenesPorRef.get(c) || []).forEach((o) => {
      if (esOrdenConjunto(o) !== deConjunto) return
      n += cantidadReal(o)
    }))
    return n
  }
  const piezas = (fila.piezas || []).filter(Boolean)
  if (piezas.length) return Math.max(...piezas.map((r) => sumar(r, true)), 0)
  return sumar(fila.id, false)
}

// El nombre con el que se muestra una tela.
//
// Factory deja el guión de la referencia pegado al final (INDISOULLAB-,
// CAPRI-), y hay telas que figuran con dos referencias distintas siendo la
// misma en la práctica: MIILA es INDISOULLAB. Sin unificar salen partidas en
// dos renglones y los metros de una misma tela quedan repartidos.
const ALIAS_TELA = { MIILA: 'INDISOULLAB' }
export function nombreTela(s) {
  const limpio = String(s || '').trim().replace(/[\s-]+$/, '').trim()
  return ALIAS_TELA[limpio.toUpperCase()] || limpio
}

// Las telas de una fila, desde la ficha técnica de Factory. La ficha puede
// estar bajo el código final o bajo el interno, así que se busca por los dos.
// El conjunto no tiene ficha propia: se arma sumando las telas de sus dos
// prendas —2,58 m por conjunto es la blusa más el pantalón—, y si las dos
// llevan la misma tela, se junta en un solo renglón.
export function telasDe(fila, telasIdx, codigos) {
  if (!telasIdx) return []
  const de = (ref) => {
    if (telasIdx[ref] && telasIdx[ref].length) return telasIdx[ref]
    const cods = (codigos && codigos.get(ref)) || new Set()
    for (const c of cods) if (telasIdx[c] && telasIdx[c].length) return telasIdx[c]
    return []
  }
  const piezas = (fila.piezas || []).filter(Boolean)
  const fuentes = piezas.length ? piezas : [fila.id]
  const m = new Map()
  fuentes.forEach((r) => de(r).forEach((t) => {
    const nombre = nombreTela(t.tela)
    const k = nombre.toUpperCase()
    if (!k) return
    if (!m.has(k)) m.set(k, { tela: nombre, grupo: t.grupo || '', prom: 0 })
    m.get(k).prom = Math.round((m.get(k).prom + (Number(t.prom) || 0)) * 10000) / 10000
  }))
  return [...m.values()].sort((a, b) => b.prom - a.prom)
}

const aNumero = (v) => Math.round(Number(String(v).replace(/\./g, '').replace(',', '.')) || 0)

// Lectura de las filas pegadas a mano, por si el archivo no abre. Las columnas
// del reporte van: referencia, descripción, nro. cortes, pedido, cortado,
// por cortar, %.
export function leerPegado(texto, marca) {
  const filas = []
  String(texto || '').split(/\r?\n/).forEach((linea) => {
    const t = linea.trim()
    if (!t) return
    const celdas = t.split(/\t|\s{2,}|;/).map((c) => c.trim()).filter(Boolean)
    if (celdas.length < 3) return
    const ref = celdas[0].toUpperCase()
    if (!/^[A-Z0-9-]{3,}$/i.test(ref) || /^REFERENCIA$/i.test(ref)) return
    const numeros = celdas.slice(1).filter((c) => /^-?[\d.,]+$/.test(c))
    if (numeros.length < 2) return
    const desc = celdas.slice(1).find((c) => !/^-?[\d.,]+$/.test(c)) || ''
    filas.push({
      id: ref,
      marca,
      descripcion: desc,
      pedido: aNumero(numeros[1]),
      cortado: numeros.length > 2 ? aNumero(numeros[2]) : 0,
    })
  })
  return { filas }
}

// Lectura del archivo tal como sale de Factory (.xls o .xlsx).
//
// El reporte trae dos filas de título antes del encabezado y una en blanco
// después, así que las columnas se buscan por nombre y no por posición. La
// marca sale del propio título —"(C)" es Casania, "(M)" Mariset— para que no se
// pueda cargar el archivo de una en la pestaña de la otra.
export async function leerArchivo(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  if (!hoja) throw new Error('El archivo no tiene hojas.')
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, blankrows: true })

  const norm = (v) => String(v == null ? '' : v).trim()
  // El mismo botón recibe los dos reportes: el de pedidos y cortes, y el de
  // separados por cliente. Se distinguen por la columna Combin, que solo
  // existe en el segundo.
  if (filas.slice(0, 12).some((f) => (f || []).some((c) => /combin/i.test(norm(c))))) {
    return leerSeparadosDeFilas(filas, norm)
  }
  const iCab = filas.findIndex((f) => (f || []).some((c) => /^referencia$/i.test(norm(c))))
  if (iCab < 0) throw new Error('No encontré la fila de encabezados. ¿Es el reporte de Pedidos y Cortes?')

  const cab = (filas[iCab] || []).map(norm)
  const col = (re) => cab.findIndex((c) => re.test(c))
  const cRef = col(/^referencia$/i)
  const cDesc = col(/descripci/i)
  const cPed = col(/^pedido$/i)
  const cCort = col(/^cortado$/i)
  if (cPed < 0) throw new Error('El reporte no trae la columna Pedido.')

  let marca = ''
  filas.slice(0, iCab).forEach((f) => {
    const t = (f || []).map(norm).join(' ')
    if (/\(\s*C\s*\)/.test(t)) marca = 'Casania'
    else if (/\(\s*M\s*\)/.test(t)) marca = 'Mariset'
  })
  if (!marca) {
    const n = String(file.name || '').toUpperCase()
    if (n.includes('CASANIA')) marca = 'Casania'
    else if (n.includes('MARISET')) marca = 'Mariset'
  }

  const out = []
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i] || []
    const ref = norm(f[cRef]).toUpperCase()
    if (!ref || /^referencia$/i.test(ref)) continue
    out.push({
      id: ref,
      marca,
      descripcion: cDesc >= 0 ? norm(f[cDesc]) : '',
      pedido: Math.round(Number(f[cPed]) || 0),
      cortado: cCort >= 0 ? Math.round(Number(f[cCort]) || 0) : 0,
    })
  }
  if (!out.length) throw new Error('El reporte no trae referencias.')
  return { tipo: 'pedidos', filas: out, marca }
}

// El reporte de separados: los pedidos de los clientes, renglón por color con
// sus tallas. De aquí sale el desglose que se ve al tocar el número de pedido.
//
// Cada cliente trae sus renglones de color y debajo un subtotal cuya columna
// Combin dice PENDIENTE: ese se salta, igual que los renglones sin número de
// pedido, para no contar dos veces.
function leerSeparadosDeFilas(filas, norm) {
  const iCab = filas.findIndex((f) => (f || []).some((c) => /^referencia$/i.test(norm(c)))
    && (f || []).some((c) => /combin/i.test(norm(c))))
  if (iCab < 0) throw new Error('El reporte de separados no trae encabezados.')
  const cab = (filas[iCab] || []).map(norm)
  const col = (re) => cab.findIndex((c) => re.test(c))
  const iRef = col(/^referencia$/i)
  const iComb = col(/combin/i)
  const iPed = col(/^pedido/i)
  const iUnid = col(/^unid/i)
  const iCli = col(/nombre/i)
  const iDesc = col(/descripci/i)

  // Las tallas van en su propia fila: la primera que traiga cinco o más
  // números chicos (6, 8, 10…).
  let tallaCols = []
  for (const f of filas.slice(0, iCab + 4)) {
    const cols = []
    ;(f || []).forEach((c, j) => {
      const t = norm(c)
      const v = Number(t)
      if (t !== '' && Number.isInteger(v) && v >= 2 && v <= 30) cols.push([j, String(v)])
    })
    if (cols.length >= 5) { tallaCols = cols; break }
  }
  if (!tallaCols.length) throw new Error('No encontré las columnas de tallas.')

  const porRef = new Map()
  const clientes = new Map()
  const descs = new Map()
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i] || []
    const ref = norm(f[iRef]).toUpperCase()
    const combin = norm(f[iComb]).toUpperCase()
    if (!ref || !combin || combin === 'PENDIENTE') continue
    if (iPed >= 0 && !norm(f[iPed])) continue
    if (!porRef.has(ref)) porRef.set(ref, new Map())
    if (iDesc >= 0 && norm(f[iDesc]) && !descs.has(ref)) descs.set(ref, norm(f[iDesc]))
    const colores = porRef.get(ref)
    if (!colores.has(combin)) colores.set(combin, { tallas: {}, unid: 0 })
    const d = colores.get(combin)
    let suma = 0
    tallaCols.forEach(([j, talla]) => {
      const n = Math.round(Number(f[j]) || 0)
      if (!n) return
      d.tallas[talla] = (d.tallas[talla] || 0) + n
      suma += n
    })
    d.unid += iUnid >= 0 ? (Math.round(Number(f[iUnid]) || 0) || suma) : suma
    if (iCli >= 0 && norm(f[iCli])) {
      if (!clientes.has(ref)) clientes.set(ref, new Set())
      clientes.get(ref).add(norm(f[iCli]))
    }
  }
  if (!porRef.size) throw new Error('El reporte de separados no trae renglones.')

  const desglose = {}
  porRef.forEach((colores, ref) => {
    const lista = [...colores.entries()]
      .map(([color, d]) => ({ color, tallas: d.tallas, unid: d.unid }))
      .sort((a, b) => b.unid - a.unid)
    desglose[ref] = {
      colores: lista,
      total: lista.reduce((n, c) => n + c.unid, 0),
      clientes: (clientes.get(ref) || new Set()).size,
      tallas: tallaCols.map(([, t]) => t),
      descripcion: descs.get(ref) || '',
    }
  })
  return { tipo: 'separados', desglose, refs: porRef.size }
}

// ---- Programado por color ----

// Los nombres de color no vienen de la misma mano: el pedido dice VINOTINTO y
// la orden de corte VINO TINTO 2, o AGUA contra AGUAMARINA. Se iguala
// quitando tildes, mayúsculas y espacios; si aún así no aparece en el pedido,
// se deja el nombre de la orden tal cual y marcado, porque una diferencia real
// —NARANJA donde el pedido dice AMARILLO— es información, no ruido.
const normColor = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().trim()
// Nombres distintos que son el mismo color, confirmados por Diego: en las
// \u00f3rdenes digitan NARANJA para el que el pedido llama AMARILLO, y el pedido
// escribe FUSCIA donde la orden dice FUCSIA. El alias solo entra cuando el
// empate normal no encuentra nada: si un pedido trae NARANJA de verdad,
// el exacto gana primero.
const ALIAS_COLOR = { NARANJA: 'AMARILLO', FUCSIA: 'FUSCIA', FUSCIA: 'FUCSIA' }
// Cambios de color de UNA referencia, confirmados por Diego: el cliente pidió
// un color y la producción salió en otro (se corta cruda y cambia el plan, o
// el pedido lo nombró distinto). Color de la orden → color del pedido al que
// corresponde. Son puntuales: CRUDO no significa lo mismo en otra referencia.
const EQUIV_POR_REF = {
  C6900: { CRUDO: 'AZUL' },
  M5238: { CRUDO: 'BLANCO' },
  M5253: { CRUDO: 'BEIGE' },
  C6895: { VERDE: 'CAQUI' },
  C6911: { 'VINO TINTO 2': 'ROJO', 'VINO TINTO': 'ROJO' },
}
// El nombre con el que realmente sale ese color: para avisar en el modal que
// el BEIGE del pedido se está produciendo como CRUDO.
export function colorProducidoDe(refId, colorPedido) {
  const eq = EQUIV_POR_REF[String(refId || '').toUpperCase().trim()]
  if (!eq) return null
  const buscado = normColor(colorPedido)
  const hallado = Object.entries(eq).find(([, ped]) => normColor(ped) === buscado)
  return hallado ? hallado[0] : null
}
export function empatarColor(color, coloresPedido, refId) {
  const c = normColor(color)
  const exacto = coloresPedido.find((p) => normColor(p) === c)
  if (exacto) return exacto
  const cc = c.replace(/[^A-Z0-9]/g, '')
  const parcial = coloresPedido.find((p) => {
    const pp = normColor(p).replace(/[^A-Z0-9]/g, '')
    return pp && cc && (cc.includes(pp) || pp.includes(cc))
  })
  if (parcial) return parcial
  const alias = ALIAS_COLOR[c]
  if (alias) {
    const porAlias = coloresPedido.find((p) => normColor(p) === alias)
    if (porAlias) return porAlias
  }
  const eq = EQUIV_POR_REF[String(refId || '').toUpperCase().trim()]
  if (eq && eq[c]) {
    const objetivo = normColor(eq[c])
    const porEquiv = coloresPedido.find((p) => normColor(p) === objetivo)
    if (porEquiv) return porEquiv
  }
  return null
}

// Los cortes (órdenes) de una fila, cada uno con su curva de colores y tallas
// tal como se programó. Para el conjunto son las órdenes CONJUNTO de sus dos
// prendas; para una referencia normal, sus órdenes sueltas.
export function cortesDe(fila, ordenesPorRef, codigos, coloresPedido) {
  const juntar = (ref, deConjunto, pieza) => {
    const cods = (codigos && codigos.get(ref)) || new Set([ref])
    const out = []
    cods.forEach((c) => (ordenesPorRef.get(c) || []).forEach((o) => {
      if (esOrdenConjunto(o) !== deConjunto) return
      const oc = o.stages.ordenCorte || {}
      const campo = campoCurva(o)
      // La curva agrupada por color, con la talla sin el cero de relleno
      // (Factory escribe "08", el pedido "8").
      const porColor = new Map()
      const tallas = new Set()
      ;(o.curva || []).forEach((r) => {
        const n = Number(r[campo]) || 0
        if (!n) return
        const color = String(r.color || '').trim() || '—'
        const talla = String(r.talla || '').replace(/^0+(?=\d)/, '')
        tallas.add(talla)
        if (!porColor.has(color)) porColor.set(color, { tallas: {}, unid: 0 })
        const d = porColor.get(color)
        d.tallas[talla] = (d.tallas[talla] || 0) + n
        d.unid += n
      })
      const colores = [...porColor.entries()].map(([color, d]) => ({
        color,
        // El color real es el del pedido: si el nombre de la orden empata con
        // uno del pedido, se muestra con ese nombre. Las equivalencias
        // puntuales van por la referencia de la fila, no por la de la pieza.
        colorPedido: coloresPedido ? empatarColor(color, coloresPedido, fila.id) : null,
        tallas: d.tallas,
        unid: d.unid,
      })).sort((a, b) => b.unid - a.unid)
      out.push({
        orden: o.orden,
        fecha: oc.fecha || '',
        cant: cantidadReal(o),
        // Lo que se mandó a cortar, cuando terminó siendo otra cosa: sirve
        // para explicar en el modal por qué la cifra no es la de la orden.
        programada: Number(oc.cant) || 0,
        alistada: campo === 'corte',
        pieza: pieza || '',
        muestra: o.origen === 'muestra',
        colores,
        tallas: [...tallas].sort((a, b) => Number(a) - Number(b)),
      })
    }))
    return out
  }
  const piezas = (fila.piezas || []).filter(Boolean)
  const cortes = piezas.length
    ? piezas.flatMap((r) => juntar(r, true, r))
    : juntar(fila.id, false, '')
  return cortes.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
}

// Lo que falta, color por color: el pedido menos lo ya programado, casando los
// colores por su nombre del pedido. Lo programado en un color que el pedido no
// tiene queda como fila propia en negativo, y los cortes viejos sin curva se
// restan aparte, sin inventarles color. Así el total del modal es exactamente
// pedido menos programado, el mismo número de la columna.
// Un conjunto se corta en dos órdenes, una por prenda y con la misma cantidad:
// 61 blusas y 61 pantalones son 61 conjuntos. Para restar del pedido cuenta
// una sola prenda —la que más se cortó, igual que la columna Programado—;
// restando las dos se descontaba el doble y la falta llegaba a salir negativa.
function cortesQueCuentan(cortes) {
  const lista = cortes || []
  const piezas = [...new Set(lista.map((c) => c.pieza).filter(Boolean))]
  if (piezas.length < 2) return lista
  const total = (p) => lista.filter((c) => c.pieza === p).reduce((n, c) => n + c.cant, 0)
  const mayor = piezas.reduce((a, p) => (total(p) > total(a) ? p : a), piezas[0])
  return lista.filter((c) => c.pieza === mayor)
}

export function faltaPorColor(desglose, cortesTodos) {
  const cortes = cortesQueCuentan(cortesTodos)
  const filas = new Map()
  ;(desglose.colores || []).forEach((c) => {
    filas.set(c.color, { color: c.color, delPedido: true, tallas: { ...c.tallas }, unid: c.unid })
  })
  const extras = new Map()
  let sinDetalle = 0
  // Las tallas salen de los datos mismos, no de la lista del reporte: un
  // desglose guardado con otra versión puede no traerla.
  const tallas = new Set(desglose.tallas || [])
  ;(desglose.colores || []).forEach((c) => Object.keys(c.tallas || {}).forEach((t) => tallas.add(t)))
  ;(cortes || []).forEach((corte) => {
    let enCurva = 0
    corte.colores.forEach((c) => {
      enCurva += c.unid
      let fila
      if (c.colorPedido && filas.has(c.colorPedido)) fila = filas.get(c.colorPedido)
      else {
        if (!extras.has(c.color)) extras.set(c.color, { color: c.color, delPedido: false, tallas: {}, unid: 0 })
        fila = extras.get(c.color)
      }
      Object.entries(c.tallas).forEach(([t, n]) => {
        tallas.add(t)
        fila.tallas[t] = (fila.tallas[t] || 0) - n
      })
      fila.unid -= c.unid
    })
    // Lo que la orden programó por encima de su curva (o sin curva del todo)
    // no tiene color al que restarse, pero sí cuenta en el total.
    sinDetalle += Math.max(0, corte.cant - enCurva)
  })
  return {
    colores: [...filas.values(), ...extras.values()],
    tallas: [...tallas].sort((a, b) => Number(a) - Number(b)),
    sinDetalle,
    total: [...filas.values(), ...extras.values()].reduce((n, f) => n + f.unid, 0) - sinDetalle,
  }
}
