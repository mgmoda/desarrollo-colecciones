// Doblado y corte: las dos etapas que el sistema mide por su cuenta.
//
// Factory guarda la fecha de doblado dentro del trazo y no tiene nada del
// corte —quién lo hizo, cuándo empezó, cuánto tardó—. Eso se lleva aquí: se
// abre la etapa cuando empiezan, el contador corre solo, y se cierra la tapa
// cuando terminan, dejando el tiempo que tomó.
//
// La llave es el NÚMERO DE ORDEN, no el id de la orden: el sync de Factory
// reemplaza dev_orders entero cada dos minutos y les inventa un id nuevo cada
// vez, así que cualquier cosa guardada contra ese id se perdería.

import { diasDesde, diasEntre } from './dates.js'

// Los que cortan en casa. Diego no va en esta lista: a él no se le asigna
// una orden, se le MANDA la tela, y eso es un movimiento de varias órdenes a
// la vez con su propia fecha de salida.
export const CORTADORES = ['Fabián', 'Janet']
export const EXTERNO = 'Diego'

// Una orden está afuera cuando su corte está abierto y es tercerizado.
export const estaFuera = (proc) => {
  const c = (proc || {}).corte
  return !!(c && c.desde && !c.hasta && c.externo)
}

// Una orden se cortó afuera si su corte fue tercerizado, esté abierto o ya
// cerrado: cuando Factory registra la entrega de corte, esa prenda la cortó
// Diego y no la mesa de MG, y así hay que contarla.
export const corteExterno = (proc) => !!(proc && proc.corte && proc.corte.externo)

// Manda la orden donde Diego: el corte arranca ahí mismo, porque desde que
// sale la tela ya está en sus manos. `iso` permite registrar una salida de
// ayer; sin él queda la de hoy.
export function enviarExterno(proc, usuario, iso) {
  let desde = Date.now()
  if (iso) {
    const [a, m, d] = iso.split('-').map(Number)
    if (a && m && d) {
      const ahora = new Date()
      desde = new Date(a, m - 1, d, ahora.getHours(), ahora.getMinutes()).getTime()
    }
  }
  return { ...(proc || {}), corte: { desde, usuario, quien: EXTERNO, externo: true } }
}

export const ETAPAS_PROC = [
  {
    key: 'doblado',
    label: 'Doblado',
    andando: 'Doblando',
    listo: 'Doblado',
    iniciar: 'Iniciar doblado',
    corto: 'Doblar',
    // El doblado arranca de una: ahí lo que importa es cuándo empezó.
    pregunta: null,
    limite: 5,
  },
  {
    key: 'corte',
    label: 'Corte',
    andando: 'Cortando',
    listo: 'Cortado',
    iniciar: 'Iniciar corte',
    corto: 'Cortar',
    // El corte sí pregunta quién: se quiere medir a cada cortador.
    pregunta: CORTADORES,
    limite: 5,
  },
]
export const etapaProc = (key) => ETAPAS_PROC.find((e) => e.key === key) || ETAPAS_PROC[0]

// Cuánto lleva (o cuánto tardó) una etapa. Siempre es una DURACIÓN, nunca una
// fecha: decir "hoy" era engañoso —una etapa abierta y cerrada ayer también
// mostraba "hoy", porque lo que se medía era que duró menos de un día—.
//
// Los días son de calendario, como en el resto del sistema; por debajo de un
// día se baja a horas y a minutos, que es lo que dura un corte.
export function duracion(et) {
  if (!et || !et.desde) return null
  const fin = et.hasta || Date.now()
  const dias = et.hasta ? diasEntre(et.desde, et.hasta) : diasDesde(et.desde)
  // "3 d" y no "3 días": es como ya se escribe en la columna Días, y estas
  // dos columnas tienen que caber sin mandar la tabla a scroll horizontal.
  if (dias > 0) return { dias, texto: `${dias} d` }
  const minutos = Math.max(0, Math.round((fin - et.desde) / 60000))
  if (minutos >= 60) return { dias: 0, texto: `${Math.round(minutos / 60)} h` }
  if (minutos >= 1) return { dias: 0, texto: `${minutos} min` }
  return { dias: 0, texto: 'recién' }
}

// Cuándo empezó, dicho como se dice hablando: la hora si fue hoy, "ayer" si
// fue ayer, y la fecha si fue antes. Sin esto, un "desde las 16:04" no deja
// saber de qué día se está hablando.
export function desdeTxt(ts) {
  const d = diasDesde(ts)
  const hora = horaProc(ts)
  if (d === 0) return `desde las ${hora}`
  if (d === 1) return `desde ayer ${hora}`
  return `desde el ${fechaHoraProc(ts)}`
}

// El rango de una etapa cerrada. Si empezó y terminó el mismo día la fecha no
// se repite.
export function rangoTxt(desde, hasta) {
  const mismoDia = diasEntre(desde, hasta) === 0
  return mismoDia
    ? `${fechaHoraProc(desde)} → ${horaProc(hasta)}`
    : `${fechaHoraProc(desde)} → ${fechaHoraProc(hasta)}`
}

export const estaAndando = (et) => !!(et && et.desde && !et.hasta)
export const estaListo = (et) => !!(et && et.desde && et.hasta)

// Con el doblado y el corte cerrados la orden ya no espera tijera: está
// alistándose, aunque siga en la mesa de corte hasta que Factory registre el
// alistamiento. Si el corte fue afuera, el doblado también se hizo afuera y no
// se marca aquí: basta con que el corte haya vuelto cerrado.
export const estaAlistando = (proc) => {
  const p = proc || {}
  if (!estaListo(p.corte)) return false
  return estaListo(p.doblado) || !!p.corte.externo
}

// Desde cuándo está alistando: cuando se cerró la última de las dos tapas.
export const alistandoDesde = (proc) => {
  const p = proc || {}
  return Math.max((p.corte && p.corte.hasta) || 0, (p.doblado && p.doblado.hasta) || 0)
}

// Abre la etapa. `quien` solo lo usa el corte.
export function abrir(proc, etapaKey, usuario, quien) {
  const et = { desde: Date.now(), usuario }
  if (quien) et.quien = quien
  return { ...(proc || {}), [etapaKey]: et }
}

// Cierra la tapa: queda la fecha de fin y quién la cerró.
export function cerrar(proc, etapaKey, usuario) {
  const et = (proc || {})[etapaKey]
  if (!et || !et.desde) return proc
  return { ...proc, [etapaKey]: { ...et, hasta: Date.now(), cerradoPor: usuario } }
}

// Vuelve a abrir una etapa cerrada por error: se le quita el fin y sigue
// contando desde donde arrancó.
export function reabrir(proc, etapaKey) {
  const et = (proc || {})[etapaKey]
  if (!et) return proc
  const { hasta: _fin, cerradoPor: _quien, ...resto } = et
  return { ...proc, [etapaKey]: resto }
}

// Borra la etapa completa: para cuando se inició por equivocación.
export function borrarEtapa(proc, etapaKey) {
  const { [etapaKey]: _fuera, ...resto } = proc || {}
  return resto
}

// Corrige la fecha de inicio o de fin. Se conserva la hora original —lo que
// se corrige es el día, no el momento— y el día empieza a las 8 si la etapa
// se está creando de cero.
export function cambiarFecha(proc, etapaKey, campo, iso) {
  const et = (proc || {})[etapaKey]
  if (!et || !iso) return proc
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return proc
  const previa = new Date(et[campo] || Date.now())
  const nueva = new Date(a, m - 1, d, previa.getHours(), previa.getMinutes())
  return { ...proc, [etapaKey]: { ...et, [campo]: nueva.getTime() } }
}

// Fecha y hora de una etapa. La hora siempre se guardó —el registro es un
// instante, no un día—; esto es para poder mostrarla.
export function fechaHoraProc(ts) {
  const d = new Date(Number(ts) || 0)
  if (isNaN(d)) return ''
  const dia = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${dia} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function horaProc(ts) {
  const d = new Date(Number(ts) || 0)
  if (isNaN(d)) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// La fecha de una etapa en el formato que entiende el calendario del
// navegador (aaaa-mm-dd), en hora local.
export function aIso(ts) {
  const d = new Date(Number(ts) || 0)
  if (isNaN(d)) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
