// Helpers de fecha compartidos por las vistas.

export function parseDateLoose(v) {
  if (!v) return null
  if (v instanceof Date) return isNaN(v) ? null : v
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/) // ISO yyyy-mm-dd
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d }
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/) // dd/mm/aaaa
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; const d = new Date(+y, +m[2] - 1, +m[1]); return isNaN(d) ? null : d }
  const d = new Date(s)
  return isNaN(d) ? null : d
}

// Días transcurridos desde una fecha hasta hoy (null si no hay fecha válida).
export function diasDesde(fecha) {
  const d = parseDateLoose(fecha)
  if (!d) return null
  return Math.round((Date.now() - d.getTime()) / 86400000)
}

// Días entre dos fechas (null si alguna no es válida).
export function diasEntre(desde, hasta) {
  const a = parseDateLoose(desde)
  const b = parseDateLoose(hasta)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

// Fecha local en formato ISO (yyyy-mm-dd), sin pasar por UTC para que no se
// corra un día según la zona horaria.
export function isoLocal(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Los siete días de la semana a la que pertenece una fecha, de lunes a
// domingo. La semana se reinicia sola cada lunes.
export function semanaDe(fecha) {
  const base = parseDateLoose(fecha) || new Date()
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const desdeLunes = (d.getDay() + 6) % 7
  const lunes = new Date(d)
  lunes.setDate(d.getDate() - desdeLunes)
  const dias = []
  for (let i = 0; i < 7; i += 1) {
    const x = new Date(lunes)
    x.setDate(lunes.getDate() + i)
    dias.push(isoLocal(x))
  }
  return dias
}

export function semanaAnteriorDe(fecha) {
  const base = parseDateLoose(fecha) || new Date()
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() - 7)
  return semanaDe(d)
}

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "lun 27" para las casillas de la semana.
export function etiquetaDia(iso) {
  const d = parseDateLoose(iso)
  return d ? `${DIA_CORTO[d.getDay()]} ${d.getDate()}` : iso
}

// "27 jul – 2 ago" para el rango de la semana.
export function rangoSemana(dias) {
  const a = parseDateLoose(dias[0])
  const b = parseDateLoose(dias[dias.length - 1])
  if (!a || !b) return ''
  return `${a.getDate()} ${MES_CORTO[a.getMonth()]} – ${b.getDate()} ${MES_CORTO[b.getMonth()]}`
}

// "Martes 28 de julio" para el detalle del día.
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function etiquetaDiaLargo(iso) {
  const d = parseDateLoose(iso)
  if (!d) return iso
  const dia = DIA_LARGO[d.getDay()]
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MES_LARGO[d.getMonth()]}`
}

// Primer y último día del mes de una fecha, en ISO.
export function mesDe(fecha) {
  const base = parseDateLoose(fecha) || new Date()
  const ini = new Date(base.getFullYear(), base.getMonth(), 1)
  const fin = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  return [isoLocal(ini), isoLocal(fin)]
}

const MES_LARGO_2 = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function nombreMes(fecha) {
  const d = parseDateLoose(fecha)
  return d ? MES_LARGO_2[d.getMonth()] : ''
}
