// Programaciones: lo que el cliente pidió de cada referencia contra lo que ya
// se mandó a cortar.
//
// Las tres cifras —pedido, cortado y lo que falta— salen del mismo reporte de
// Factory. Se intentó calcular lo cortado con las órdenes que ya tiene el
// sistema y no da: Factory reparte entre la prenda suelta y el conjunto con un
// criterio que no está en lo que sincronizamos. C6856 y C6857 tienen 40
// unidades cada una en el sistema y el reporte les pone cero, porque se las
// abona al conjunto C6858. Dos números que se contradicen son peores que uno
// solo, así que manda el reporte.
//
// Lo que sí pone el sistema, y el Excel no tiene: la foto —la del conjunto es
// la de las dos prendas puestas, no la de la blusa sola—, y el seguimiento de
// por qué algo lleva sin programarse.

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
