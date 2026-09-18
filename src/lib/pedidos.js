// Observaciones de las líneas del informe de SYD. Casi todas son un color
// (o un color mal escrito, o "SIN CRUDO"); unas pocas son pedidos especiales:
// una modificación de la prenda o un armado distinto ("CINTURON TELA",
// "SIN FAJON", "TOP PARA C6880", "1 DE CADA COLOR"). Esas se destacan.
const quitarTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const normObs = (s) => quitarTildes(s).trim().toUpperCase().replace(/\s+/g, ' ')

// Palabras que delatan una modificación. Se amplía cuando aparezca una nueva.
export const PALABRAS_ESPECIAL = [
  /\bCINTURON(ES)?\b/, /\bFAJON(ES)?\b/, /\bFORRO\b/, /\bFLOR(ES)?\b/, /\bTOP\b/, /\bAPLIQUES?\b/,
  /\bMANGAS?\b/, /\bLARG[OA]S?\b/, /\bCORT[OA]S?\b/, /\bBOLSILLOS?\b/, /\bBOTON(ES)?\b/,
  /\bCUELLO\b/, /\bENCAJES?\b/, /\bBORDADOS?\b/, /\bCADA\b/, /\bPARA\b/, /\bTELA\b/,
]

export function esPedidoEspecial(obs) {
  const o = normObs(obs)
  return !!o && PALABRAS_ESPECIAL.some((re) => re.test(o))
}

// Agrupa por cliente las líneas con pedido especial.
export function especialesPorCliente(filas) {
  const m = new Map()
  ;(filas || []).forEach((r) => {
    if (!esPedidoEspecial(r.observacion)) return
    if (!m.has(r.cliente)) m.set(r.cliente, [])
    m.get(r.cliente).push(r)
  })
  return m
}

// Junta las líneas de un cliente por referencia + modificación: los colores
// y sus unidades quedan en una sola fila ("NEGRO 10 · AZUL 10").
export function agruparEspeciales(lineas) {
  const m = new Map()
  ;(lineas || []).forEach((r) => {
    const k = `${r.referencia}|${normObs(r.observacion)}`
    if (!m.has(k)) m.set(k, { referencia: r.referencia, descripcion: r.descripcion || '', observacion: normObs(r.observacion), colores: new Map(), unid: 0 })
    const g = m.get(k)
    const c = String(r.color || '').trim()
    g.colores.set(c, (g.colores.get(c) || 0) + (Number(r.unid) || 0))
    g.unid += Number(r.unid) || 0
  })
  return [...m.values()]
    .map((g) => ({ ...g, colores: [...g.colores.entries()].map(([color, unid]) => ({ color, unid })) }))
    .sort((a, b) => a.referencia.localeCompare(b.referencia))
}

// Categoría de la prenda, por la primera palabra de la descripción de SYD.
// Las cuatro que importan para filtrar; lo demás (short, falda, top) va en
// "Otros" con su nombre real en la etiqueta.
export const CATEGORIAS = [
  { key: 'vestido', label: 'Vestido' },
  { key: 'conjunto', label: 'Conjunto' },
  { key: 'pantalon', label: 'Pantalón' },
  { key: 'blusa', label: 'Blusa' },
  { key: 'otros', label: 'Otros' },
]
export function categoriaDe(descripcion) {
  const p = normObs(descripcion).split(' ')[0] || ''
  if (p.startsWith('VESTIDO')) return { key: 'vestido', label: 'Vestido' }
  if (p.startsWith('CONJUNTO')) return { key: 'conjunto', label: 'Conjunto' }
  if (p.startsWith('PANTALO')) return { key: 'pantalon', label: 'Pantalón' }
  if (p.startsWith('BLUS')) return { key: 'blusa', label: 'Blusa' }
  const nombre = p ? p.charAt(0) + p.slice(1).toLowerCase() : 'Otros'
  return { key: 'otros', label: nombre }
}
