// Programaciones: lo que el cliente pidió de cada referencia contra lo que ya
// se mandó a cortar.
//
// El pedido se digita —por ahora sale del reporte de Factory que se saca a
// mano—. Lo programado NO se digita: se cuenta de las órdenes de corte que ya
// están en el sistema, así que no hay dos números que puedan contradecirse.

// Una orden es de conjunto cuando su producto termina en esa palabra. Va en el
// producto (MG-B951 CONJUNTO), no en la referencia, y a veces la escriben
// pegada al código (MG-P995CONJUNTO), así que no se exige el espacio.
export const esOrdenConjunto = (o) => /CONJUNTO\s*$/i.test(String(o.producto || '').trim())

// Lo programado de una fila.
//
// Una prenda que se vende suelta y también en conjunto tiene órdenes de las dos
// clases, y en el reporte son renglones distintos: la blusa por su lado y el
// conjunto por el suyo. Por eso una fila normal cuenta solo lo suelto.
//
// El conjunto no tiene órdenes propias: se arma con las de sus piezas. Y cuenta
// UNA pieza, no la suma —30 blusas y 30 shorts son 30 conjuntos, no 60—, así
// que se toma la mayor de las piezas.
export function programadoDe(fila, ordenesPorRef) {
  const suma = (lista) => lista.reduce(
    (n, o) => n + (Number((o.stages.ordenCorte || {}).cant) || 0), 0,
  )
  const piezas = (fila.piezas || []).filter(Boolean)
  if (piezas.length) {
    const porPieza = piezas.map(
      (ref) => suma((ordenesPorRef.get(ref) || []).filter(esOrdenConjunto)),
    )
    return porPieza.length ? Math.max(...porPieza) : 0
  }
  const propias = ordenesPorRef.get(fila.id) || []
  return suma(propias.filter((o) => !esOrdenConjunto(o)))
}

// Órdenes agrupadas por referencia, para no recorrerlas por cada fila.
export function agruparOrdenes(orders) {
  const m = new Map()
  orders.forEach((o) => {
    if (!m.has(o.referencia)) m.set(o.referencia, [])
    m.get(o.referencia).push(o)
  })
  return m
}

export const esConjunto = (fila) => /CONJUNTO/i.test(fila.descripcion || '')

// Lectura del reporte de Factory pegado desde el Excel. Cada renglón trae
// referencia, descripción y varios números; de esos solo interesa el pedido,
// que es la cuarta columna (después de Nro. Cortes).
export function leerPegado(texto, marca) {
  const filas = []
  const errores = []
  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    const t = linea.trim()
    if (!t) return
    const celdas = t.split(/\t|\s{2,}|;/).map((c) => c.trim()).filter(Boolean)
    if (celdas.length < 3) return
    const ref = celdas[0].toUpperCase()
    // El encabezado del reporte y los títulos se cuelan al copiar: se ignoran.
    if (!/^[A-Z0-9-]{3,}$/i.test(ref) || /^REFERENCIA$/i.test(ref)) return
    const numeros = celdas.slice(1).filter((c) => /^-?[\d.,]+$/.test(c))
    if (!numeros.length) { errores.push(`Línea ${i + 1}: sin cantidades`); return }
    // Pedido = el segundo número (el primero es Nro. Cortes). Si solo hay uno,
    // se toma ese: alguien pegó únicamente referencia y pedido.
    const crudo = numeros.length > 1 ? numeros[1] : numeros[0]
    const pedido = Math.round(Number(String(crudo).replace(/\./g, '').replace(',', '.')) || 0)
    const desc = celdas.slice(1).find((c) => !/^-?[\d.,]+$/.test(c)) || ''
    filas.push({ id: ref, marca, descripcion: desc, pedido })
  })
  return { filas, errores }
}

// Lectura del archivo del reporte tal como sale de Factory (.xls o .xlsx).
//
// El reporte trae dos filas de título antes del encabezado y una fila en blanco
// después, así que las columnas se buscan por nombre y no por posición. La
// marca sale del propio título —"(C)" es Casania, "(M)" Mariset— para que no
// se pueda cargar el archivo de una en la pestaña de la otra.
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
  if (cPed < 0) throw new Error('El reporte no trae la columna Pedido.')

  // La marca la dice el título: "… Dic 31/2026    (C)".
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
    const pedido = Math.round(Number(f[cPed]) || 0)
    out.push({ id: ref, marca, descripcion: cDesc >= 0 ? norm(f[cDesc]) : '', pedido })
  }
  if (!out.length) throw new Error('El reporte no trae referencias.')
  return { filas: out, marca }
}
