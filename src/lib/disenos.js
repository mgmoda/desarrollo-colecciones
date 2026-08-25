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
  // Una sola corrección para todo el desarrollo. Da igual si el cliente la
  // pide viendo la propuesta o viendo el strike off: lo que se corrige es
  // siempre el arte y siempre lo hace la diseñadora gráfica. Por eso lleva
  // fotos —el cliente marca sobre la tela el tono o el tamaño que quiere— y
  // saca su propia hoja para mandársela a ella.
  correccion: { label: 'Corrección gráfica', etapa: 'correccion', fase: 'sigue', enFases: ['grafico', 'strikeoff'], nota: true, vuelta: true, img: 'varias', formatoCorreccion: true, hoja: 'CORRECCIÓN GRÁFICA', boton: 'Ver corrección para la diseñadora' },
  aprobado: { label: 'Diseño aprobado', etapa: 'aprobado', fase: 'grafico', codigoCliente: true, hito: true },
  strikeoff: { label: 'Strike off', etapa: 'strikeoff', fase: 'strikeoff', img: 'una', ronda: true, formato: true, hoja: 'STRIKE OFF' },
  // Quedó de cuando había dos correcciones distintas. Ya no se ofrece, pero
  // sigue definida para que los diseños viejos se sigan leyendo bien.
  strikeoffCorreccion: { label: 'Corrección gráfica', etapa: 'correccion', fase: 'sigue', enFases: ['grafico', 'strikeoff'], nota: true, vuelta: true, img: 'varias', formatoCorreccion: true, hoja: 'CORRECCIÓN GRÁFICA', boton: 'Ver corrección para la diseñadora', oculto: true },
  strikeoffAprobado: { label: 'Strike off aprobado', etapa: 'muestraPendiente', fase: 'strikeoff', hito: true },
  // Aprobado el strike off se manda a imprimir tela de verdad, en metros, y
  // solo con esa se confecciona la prenda. Son dos cosas distintas y antes
  // cabían las dos en un mismo "Muestra realizada".
  // Lleva la misma hoja del strike off, porque también se le manda a la
  // diseñadora gráfica: es ella la que programa esa impresión.
  telaMuestra: { label: 'Tela de muestra impresa', etapa: 'telaMuestra', fase: 'muestra', img: 'una', tela: true, formato: true, hoja: 'TELA DE MUESTRA' },
  muestra: { label: 'Muestra de prenda confeccionada', etapa: 'muestra', fase: 'muestra', img: 'una' },
  despachado: { label: 'Despachado a Geodésica', etapa: 'despachado', fase: 'muestra', hito: true },
  // Despachar ya no es el final. Geodésica recibe la prenda y a veces pide
  // ajustes —cambio de moldes, sobre todo—, y ahí el diseño se reabre y vuelve
  // a pasar por los procesos que haga falta hasta despacharse otra vez.
  // Se separa de la corrección gráfica a propósito: aquella es del arte y la
  // hace la diseñadora; esta suele ser de patronaje y la hace otra persona.
  ajuste: { label: 'Ajuste pedido por Geodésica', etapa: 'ajuste', fase: 'sigue', enFases: ['muestra'], trasHito: true, nota: true, vuelta: true, img: 'varias', formatoCorreccion: true, hoja: 'AJUSTE PEDIDO', boton: 'Ver hoja del ajuste' },
  // Los dos finales del diseño, después de que Geodésica ve la prenda. El
  // aprobado se registra solo al pasarlo a producción; el rechazado se marca a
  // mano y saca el diseño de la lista, porque ya no hay nada que hacerle.
  aprobadoCliente: { label: 'Aprobado por Geodésica', etapa: 'aprobadoCliente', fase: 'sigue', enFases: ['muestra'], trasHito: true, hito: true },
  rechazado: { label: 'Rechazado por Geodésica', etapa: 'rechazado', fase: 'sigue', enFases: ['muestra'], trasHito: true, nota: true, hito: true },
}

// Etapas en las que el diseño ya no se mueve más.
export const terminadoEtapa = (e) => (
  e === 'despachado' || e === 'aprobadoCliente' || e === 'rechazado'
)

// Agrupa la bitácora por fase, numerando las rondas dentro de cada una.
// Devuelve [{ fase, label, num, estado, eventos: [{ ...ev, i, ronda }] }]
export function agruparPorFase(eventos = [], etapaActual) {
  const porFase = new Map()
  let rondaGrafico = 0
  let rondaStrike = 0
  // La corrección gráfica no tiene fase propia: se queda donde esté el diseño
  // en ese momento. Si se pide viendo el strike off, va bajo Strike off; si se
  // pide viendo la propuesta, bajo Desarrollo gráfico.
  let faseAnterior = 'grafico'
  eventos.forEach((ev, i) => {
    const def = EVENTOS[ev.tipo] || {}
    const fase = def.fase === 'sigue' ? faseAnterior : (def.fase || 'grafico')
    faseAnterior = fase
    let ronda = null
    if (ev.tipo === 'propuesta') { rondaGrafico += 1; ronda = rondaGrafico }
    if (ev.tipo === 'strikeoff') { rondaStrike += 1; ronda = rondaStrike }
    if (!porFase.has(fase)) porFase.set(fase, [])
    porFase.get(fase).push({ ...ev, i, ronda, def })
  })
  const orden = FASES.map((f) => f.key)
  const idxActual = orden.indexOf(faseAnterior)
  // Una fase se da por cerrada solo si su hito quedó registrado. Antes bastaba
  // con que el diseño hubiera pasado a la siguiente, así que una fase saltada
  // —un strike off que nunca se aprobó— mostraba un ✓ que no era cierto.
  return FASES
    .filter((f) => porFase.has(f.key))
    .map((f) => {
      const eventos = porFase.get(f.key)
      const cerrada = !!(EVENTOS[eventos[eventos.length - 1].tipo] || {}).hito
      const pasada = orden.indexOf(f.key) < idxActual || terminadoEtapa(etapaActual)
      return {
        ...f,
        eventos,
        estado: cerrada ? 'hecha' : pasada ? 'abierta' : 'curso',
      }
    })
}

// Etapas para mostrar y filtrar. `tono` alimenta el color del chip.
export const ETAPAS = [
  { key: 'pendiente', label: 'Pendiente', tono: 'gray' },
  { key: 'grafico', label: 'Desarrollo gráfico', tono: 'purple' },
  { key: 'enviado', label: 'Con el cliente', tono: 'blue' },
  { key: 'correccion', label: 'Corrección', tono: 'amber' },
  { key: 'aprobado', label: 'Arte aprobado', tono: 'teal' },
  { key: 'strikeoff', label: 'Strike off', tono: 'pink' },
  { key: 'muestraPendiente', label: 'Muestra pendiente', tono: 'coral' },
  { key: 'telaMuestra', label: 'Tela de muestra', tono: 'coral' },
  { key: 'muestra', label: 'Muestra de prenda', tono: 'coral' },
  { key: 'despachado', label: 'Despachado', tono: 'green' },
  { key: 'ajuste', label: 'Ajuste pedido', tono: 'amber' },
  { key: 'aprobadoCliente', label: 'Aprobado', tono: 'green' },
  { key: 'rechazado', label: 'Rechazado', tono: 'gray' },
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
  const terminado = etapa === 'despachado' || etapa === 'aprobadoCliente' || etapa === 'rechazado'
  // Un diseño despachado que vuelve con ajustes sigue vivo. Se guarda la fecha
  // del último despacho para que la lista pueda mostrar las dos cosas: que ya
  // se entregó y en qué anda ahora.
  const ajustes = evs.filter((e) => e.tipo === 'ajuste').length
  const ultimoDespacho = [...evs].reverse().find((e) => e.tipo === 'despachado')
  const despachadoAt = (ultimoDespacho && ultimoDespacho.fecha) || ''
  const reabierto = !!despachadoAt && !terminado
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
    ajustes,
    despachadoAt,
    reabierto,
    aprobado: etapa === 'aprobadoCliente',
    rechazado: etapa === 'rechazado',
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

// Los eventos que ofrece una fase. La corrección gráfica no es de ninguna en
// particular —se puede pedir en cualquier punto— así que se cuela justo antes
// del cierre de la fase, que es donde tiene sentido: se corrige mientras
// todavía no se ha aprobado.
function tiposDeFase(fase) {
  const propios = Object.keys(EVENTOS).filter((k) => {
    const d = EVENTOS[k]
    return !d.oculto && (d.fase || 'grafico') === fase
  })
  const sueltos = Object.keys(EVENTOS).filter((k) => {
    const d = EVENTOS[k]
    return !d.oculto && d.fase === 'sigue' && (d.enFases || []).includes(fase)
  })
  if (!sueltos.length) return propios
  const iHito = propios.findIndex((k) => EVENTOS[k].hito)
  // Antes del cierre van los que se piden mientras la fase está viva —una
  // corrección se pide antes de aprobar—. El ajuste va después, porque llega
  // cuando la prenda ya se despachó.
  const antes = sueltos.filter((k) => !EVENTOS[k].trasHito)
  const despues = sueltos.filter((k) => EVENTOS[k].trasHito)
  const corte = iHito === -1 ? propios.length : iHito
  return [...propios.slice(0, corte), ...antes, ...propios.slice(corte), ...despues]
}

// Los eventos de cada fase, para poder elegir cualquiera y no solo el
// siguiente: el desarrollo no siempre va en línea recta.
export function eventosPorFase() {
  return FASES.map((f) => ({
    ...f,
    tipos: tiposDeFase(f.key),
  }))
}

// Qué eventos tiene sentido registrar según dónde está el diseño. Ya no
// limita: solo marca cuáles son el paso natural.
export function accionesDisponibles(etapa) {
  switch (etapa) {
    case 'pendiente':
      return ['aGrafico']
    case 'grafico':
      return ['propuesta']
    case 'correccion':
      return ['propuesta', 'strikeoff']
    case 'enviado':
      return ['correccion', 'aprobado']
    case 'aprobado':
      return ['strikeoff', 'telaMuestra']
    case 'strikeoff':
      return ['correccion', 'strikeoffAprobado']
    case 'muestraPendiente':
      return ['telaMuestra']
    case 'telaMuestra':
      return ['muestra']
    case 'muestra':
      return ['despachado']
    case 'despachado':
      return ['ajuste', 'rechazado']
    // Un ajuste puede tocar los moldes o el arte, así que se abren los dos
    // caminos y quien registra elige.
    case 'ajuste':
      return ['correccion', 'strikeoff', 'telaMuestra', 'muestra']
    // Aprobado y rechazado son el final del camino: no hay paso siguiente.
    case 'aprobadoCliente':
    case 'rechazado':
      return []
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
