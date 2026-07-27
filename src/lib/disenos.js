import { diasDesde } from './dates.js'

// Diseños que Geodésica envía para desarrollar. El flujo es iterativo:
// recibido → desarrollo gráfico → propuesta al cliente → (corrección → otra
// propuesta)* → aprobado → strike off (opcional, también con correcciones)
// → muestra → despachado.
//
// El estado NO se guarda como campo: se deriva del último evento de la
// bitácora, igual que las mediciones de una referencia. Así queda el histórico
// completo y no hay estados que se contradigan.

// Tipos de prenda con su letra para el código interno (GEO-B123, GEO-V45…).
export const TIPO_LETRA = {
  Blusa: 'B', Vestido: 'V', Pantalón: 'P', Short: 'S',
  Falda: 'F', Conjunto: 'C', Chaqueta: 'H', Enterizo: 'E',
}
export const TIPOS_DISENO = Object.keys(TIPO_LETRA)

export function codigoDiseno(tipo, numero) {
  const letra = TIPO_LETRA[tipo] || 'X'
  return `GEO-${letra}${numero}`
}

// Siguiente número libre para un tipo, mirando los códigos ya usados.
export function siguienteNumero(disenos, tipo) {
  const letra = TIPO_LETRA[tipo] || 'X'
  const re = new RegExp(`^GEO-${letra}(\\d+)$`, 'i')
  let max = 0
  disenos.forEach((d) => {
    const m = re.exec(d.codigo || '')
    if (m) max = Math.max(max, Number(m[1]) || 0)
  })
  return max + 1
}

// Eventos de la bitácora. `etapa` es en qué queda el diseño tras el evento.
export const EVENTOS = {
  recibido: { label: 'Recibido de Geodésica', etapa: 'grafico', img: 'varias' },
  propuesta: { label: 'Propuesta enviada al cliente', etapa: 'enviado', img: 'una', ronda: true },
  correccion: { label: 'Corrección pedida por el cliente', etapa: 'correccion', nota: true },
  aprobado: { label: 'Diseño aprobado', etapa: 'aprobado', codigoCliente: true },
  strikeoff: { label: 'Strike off enviado', etapa: 'strikeoff', img: 'una', ronda: true },
  strikeoffCorreccion: { label: 'Corrección del strike off', etapa: 'strikeoffCorreccion', nota: true },
  strikeoffAprobado: { label: 'Strike off aprobado', etapa: 'muestraPendiente' },
  muestra: { label: 'Muestra realizada', etapa: 'muestra', img: 'una' },
  despachado: { label: 'Despachado a Geodésica', etapa: 'despachado' },
}

// Etapas para mostrar y filtrar. `tono` alimenta el color del chip.
export const ETAPAS = [
  { key: 'grafico', label: 'Desarrollo gráfico', tono: 'purple' },
  { key: 'enviado', label: 'Con el cliente', tono: 'blue' },
  { key: 'correccion', label: 'Corrección', tono: 'amber' },
  { key: 'aprobado', label: 'Aprobado', tono: 'teal' },
  { key: 'strikeoff', label: 'Strike off', tono: 'pink' },
  { key: 'strikeoffCorreccion', label: 'Corrección strike off', tono: 'amber' },
  { key: 'muestraPendiente', label: 'Muestra pendiente', tono: 'coral' },
  { key: 'muestra', label: 'Muestra', tono: 'coral' },
  { key: 'despachado', label: 'Despachado', tono: 'green' },
]
export const ETAPA_LABEL = Object.fromEntries(ETAPAS.map((e) => [e.key, e.label]))
export const ETAPA_TONO = Object.fromEntries(ETAPAS.map((e) => [e.key, e.tono]))

const TONOS = {
  purple: { bg: '#eeedfe', fg: '#3c3489', bd: '#cecbf6' },
  blue: { bg: '#e6f1fb', fg: '#0c447c', bd: '#b5d4f4' },
  amber: { bg: '#faeeda', fg: '#633806', bd: '#fac775' },
  teal: { bg: '#e1f5ee', fg: '#085041', bd: '#9fe1cb' },
  pink: { bg: '#fbeaf0', fg: '#72243e', bd: '#f4c0d1' },
  coral: { bg: '#faece7', fg: '#712b13', bd: '#f5c4b3' },
  green: { bg: '#eaf3de', fg: '#27500a', bd: '#c0dd97' },
  gray: { bg: '#f1efe8', fg: '#2c2c2a', bd: '#d3d1c7' },
}
export const etapaColor = (etapa) => TONOS[ETAPA_TONO[etapa]] || TONOS.gray

// Estado derivado del diseño: etapa actual, días en ella y número de rondas.
export function disenoInfo(diseno) {
  const evs = (diseno && diseno.eventos) || []
  if (!evs.length) {
    return { etapa: 'grafico', etiqueta: ETAPA_LABEL.grafico, dias: null, rondas: 0, ultimo: null }
  }
  const ultimo = evs[evs.length - 1]
  const def = EVENTOS[ultimo.tipo] || {}
  const rondas = evs.filter((e) => e.tipo === 'propuesta').length
  const strikeOffs = evs.filter((e) => e.tipo === 'strikeoff').length
  const etapa = def.etapa || 'grafico'
  return {
    etapa,
    etiqueta: ETAPA_LABEL[etapa] || etapa,
    dias: diasDesde(ultimo.fecha),
    rondas,
    strikeOffs,
    ultimo,
    terminado: etapa === 'despachado',
  }
}

// Qué eventos tiene sentido registrar según dónde está el diseño.
export function accionesDisponibles(etapa) {
  switch (etapa) {
    case 'grafico':
    case 'correccion':
      return ['propuesta']
    case 'enviado':
      return ['correccion', 'aprobado']
    case 'aprobado':
      return ['strikeoff', 'muestra']
    case 'strikeoff':
      return ['strikeoffCorreccion', 'strikeoffAprobado']
    case 'strikeoffCorreccion':
      return ['strikeoff']
    case 'muestraPendiente':
      return ['muestra']
    case 'muestra':
      return ['despachado']
    default:
      return []
  }
}

export function emptyDiseno(codigo, tipo) {
  return {
    codigo,                 // código interno: GEO-B123
    codigoCliente: '',      // el real, cuando Geodésica lo asigna al aprobar
    nombre: '',
    tipo: tipo || '',
    recibidoAt: '',
    nota: '',
    eventos: [],            // bitácora: [{ tipo, fecha, nota, codigoCliente }]
    imgs: {},               // { 'ev-0': [dataUrl], 'ev-1': [dataUrl] } — pesado
    updatedAt: Date.now(),
  }
}

// La lista solo necesita los textos: separamos lo pesado (imágenes) para no
// descargarlas todas al abrir el módulo.
export function partirDiseno(diseno) {
  const { imgs, ...meta } = diseno
  return { meta, imgs: imgs || {} }
}
