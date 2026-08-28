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

// Una orden es de conjunto cuando su producto termina en esa palabra. Va en el
// producto (MG-B892 CONJUNTO), no en la referencia, y a veces la escriben
// pegada al código (MG-P995CONJUNTO), así que no se exige el espacio.
export const esOrdenConjunto = (o) => /CONJUNTO\s*$/i.test(String(o.producto || '').trim())

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
      .forEach((o) => { n += Number((o.stages.ordenCorte || {}).cant) || 0 }))
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
      n += Number((o.stages.ordenCorte || {}).cant) || 0
    }))
    return n
  }
  const piezas = (fila.piezas || []).filter(Boolean)
  if (piezas.length) return Math.max(...piezas.map((r) => sumar(r, true)), 0)
  return sumar(fila.id, false)
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
  return { filas: out, marca }
}
