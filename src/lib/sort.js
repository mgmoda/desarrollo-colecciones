import { useState } from 'react'

// Hook de ordenamiento para tablas: recuerda columna y dirección.
export function useSort(defaultKey = '', defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)
  function toggle(key) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  return { sortKey, sortDir, toggle }
}

function isEmpty(v) {
  return v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))
}

// Convierte a número comparable: números, textos numéricos y fechas dd/mm/aaaa.
function toNum(v) {
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'string') {
    const s = v.trim()
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
    if (m) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3]
      const d = new Date(Number(y), Number(m[2]) - 1, Number(m[1]))
      if (!isNaN(d)) return d.getTime()
    }
    if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'))
  }
  return null
}

// Devuelve una copia ordenada según el accessor y la dirección.
// Los valores vacíos quedan siempre al final.
export function sortRows(rows, accessor, dir) {
  if (!accessor) return rows
  const s = dir === 'desc' ? -1 : 1
  return [...rows].sort((ra, rb) => {
    const a = accessor(ra)
    const b = accessor(rb)
    const ea = isEmpty(a), eb = isEmpty(b)
    if (ea && eb) return 0
    if (ea) return 1
    if (eb) return -1
    const na = toNum(a), nb = toNum(b)
    if (na != null && nb != null) return (na - nb) * s
    return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }) * s
  })
}
