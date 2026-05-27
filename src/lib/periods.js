// Helpers de período para reportes (día / semana / mes). Semana inicia lunes.
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
export function startOfWeek(d) {
  const x = startOfDay(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  return x
}
export function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x }

// Rango [start, end) del período que contiene `anchor`.
export function periodRange(mode, anchor) {
  if (mode === 'dia') {
    const s = startOfDay(anchor); const e = new Date(s); e.setDate(e.getDate() + 1)
    return { start: s, end: e }
  }
  if (mode === 'mes') {
    const s = startOfMonth(anchor); const e = new Date(s); e.setMonth(e.getMonth() + 1)
    return { start: s, end: e }
  }
  const s = startOfWeek(anchor); const e = new Date(s); e.setDate(e.getDate() + 7)
  return { start: s, end: e }
}

export function shiftPeriod(mode, anchor, delta) {
  const x = new Date(anchor)
  if (mode === 'dia') x.setDate(x.getDate() + delta)
  else if (mode === 'mes') x.setMonth(x.getMonth() + delta)
  else x.setDate(x.getDate() + delta * 7)
  return x
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function periodLabel(mode, range) {
  const { start, end } = range
  if (mode === 'mes') return `${cap(MONTHS[start.getMonth()])} ${start.getFullYear()}`
  if (mode === 'dia') return `${start.getDate()} de ${MONTHS[start.getMonth()]} ${start.getFullYear()}`
  const last = new Date(end); last.setDate(last.getDate() - 1)
  if (start.getMonth() === last.getMonth())
    return `${start.getDate()} – ${last.getDate()} de ${MONTHS[start.getMonth()]}`
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`
}
