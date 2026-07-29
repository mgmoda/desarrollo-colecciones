import { diasDesde, diasEntre } from './dates.js'

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

// Las tres fases del desarrollo, en orden.
export const FASES = [
  { key: 'grafico', num: 1, label: 'Desarrollo gráfico' },
  { key: 'strikeoff', num: 2, label: 'Strike off' },
  { key: 'muestra', num: 3, label: 'Muestra y despacho' },
]

// Eventos de la bitácora. `etapa` es en qué queda el diseño tras el evento;
// `fase` es a cuál de las tres fases pertenece; `hito` marca los cierres.
export const EVENTOS = {
  recibido: { label: 'Recibido de Geodésica', etapa: 'pendiente', fase: 'grafico', img: 'varias' },
  aGrafico: { label: 'Enviado a desarrollo gráfico', etapa: 'grafico', fase: 'grafico' },
  propuesta: { label: 'Propuesta enviada al cliente', etapa: 'enviado', fase: 'grafico', img: 'una', ronda: true },
  correccion: { label: 'Corrección pedida por el cliente', etapa: 'correccion', fase: 'grafico', nota: true, vuelta: true },
  aprobado: { label: 'Diseño aprobado', etapa: 'aprobado', fase: 'grafico', codigoCliente: true, hito: true },
  strikeoff: { label: 'Strike off enviado', etapa: 'strikeoff', fase: 'strikeoff', img: 'una', ronda: true, formato: true },
  strikeoffCorreccion: { label: 'Corrección del strike off', etapa: 'strikeoffCorreccion', fase: 'strikeoff', nota: true, vuelta: true },
  strikeoffAprobado: { label: 'Strike off aprobado', etapa: 'muestraPendiente', fase: 'strikeoff', hito: true },
  muestra: { label: 'Muestra realizada', etapa: 'muestra', fase: 'muestra', img: 'una' },
  despachado: { label: 'Despachado a Geodésica', etapa: 'despachado', fase: 'muestra', hito: true },
}

// Agrupa la bitácora por fase, numerando las rondas dentro de cada una.
// Devuelve [{ fase, label, num, estado: 'hecha'|'curso', eventos: [{ ...ev, i, ronda }] }]
export function agruparPorFase(eventos = [], etapaActual) {
  const faseActual = EVENTOS[(eventos[eventos.length - 1] || {}).tipo]?.fase || 'grafico'
  const porFase = new Map()
  let rondaGrafico = 0
  let rondaStrike = 0
  eventos.forEach((ev, i) => {
    const def = EVENTOS[ev.tipo] || {}
    const fase = def.fase || 'grafico'
    let ronda = null
    if (ev.tipo === 'propuesta') { rondaGrafico += 1; ronda = rondaGrafico }
    if (ev.tipo === 'strikeoff') { rondaStrike += 1; ronda = rondaStrike }
    if (!porFase.has(fase)) porFase.set(fase, [])
    porFase.get(fase).push({ ...ev, i, ronda, def })
  })
  const orden = FASES.map((f) => f.key)
  const idxActual = orden.indexOf(faseActual)
  return FASES
    .filter((f) => porFase.has(f.key))
    .map((f) => ({
      ...f,
      eventos: porFase.get(f.key),
      estado: orden.indexOf(f.key) < idxActual ? 'hecha'
        : etapaActual === 'despachado' ? 'hecha' : 'curso',
    }))
}

// Etapas para mostrar y filtrar. `tono` alimenta el color del chip.
export const ETAPAS = [
  { key: 'pendiente', label: 'Pendiente', tono: 'gray' },
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
    return { etapa: 'pendiente', etiqueta: ETAPA_LABEL.pendiente, dias: null, rondas: 0, ultimo: null }
  }
  const ultimo = evs[evs.length - 1]
  const def = EVENTOS[ultimo.tipo] || {}
  const rondas = evs.filter((e) => e.tipo === 'propuesta').length
  const strikeOffs = evs.filter((e) => e.tipo === 'strikeoff').length
  const etapa = def.etapa || 'grafico'
  const terminado = etapa === 'despachado'
  // Ciclo total: desde que entró el diseño hasta hoy (o hasta el despacho).
  const inicio = evs[0].fecha
  const diasTotal = terminado ? diasEntre(inicio, ultimo.fecha) : diasDesde(inicio)
  // Desde que se mandó a la diseñadora gráfica (si ya se mandó).
  const envioGrafico = evs.find((e) => e.tipo === 'aGrafico')
  const diasGrafico = envioGrafico
    ? (terminado ? diasEntre(envioGrafico.fecha, ultimo.fecha) : diasDesde(envioGrafico.fecha))
    : null
  return {
    etapa,
    etiqueta: ETAPA_LABEL[etapa] || etapa,
    dias: diasDesde(ultimo.fecha),
    diasTotal,
    diasGrafico,
    rondas,
    strikeOffs,
    ultimo,
    terminado,
  }
}

// Duración de cada fase: de su primer evento al primero de la fase siguiente
// (o hasta hoy si es la fase en curso).
export function duracionFases(eventos = [], etapaActual) {
  const grupos = agruparPorFase(eventos, etapaActual)
  return grupos.map((g, i) => {
    const desde = g.eventos[0].fecha
    const siguiente = grupos[i + 1]
    const hasta = siguiente ? siguiente.eventos[0].fecha : null
    return { ...g, dias: hasta ? diasEntre(desde, hasta) : diasDesde(desde) }
  })
}

// Los eventos de cada fase, para poder elegir cualquiera y no solo el
// siguiente: el desarrollo no siempre va en línea recta.
export function eventosPorFase() {
  return FASES.map((f) => ({
    ...f,
    tipos: Object.keys(EVENTOS).filter((k) => (EVENTOS[k].fase || 'grafico') === f.key),
  }))
}

// Qué eventos tiene sentido registrar según dónde está el diseño. Ya no
// limita: solo marca cuáles son el paso natural.
export function accionesDisponibles(etapa) {
  switch (etapa) {
    case 'pendiente':
      return ['aGrafico']
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
