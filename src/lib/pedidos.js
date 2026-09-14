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
