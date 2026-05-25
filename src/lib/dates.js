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
