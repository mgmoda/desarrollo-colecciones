import { useRef } from 'react'
import { parseDateLoose } from '../lib/dates.js'

// Campo de fecha: al hacer clic sobre la fecha se abre el calendario para
// escoger; también se puede escribir a mano. Se guarda como dd/mm/aaaa.
function toIso(v) {
  const d = parseDateLoose(v)
  if (!d) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
function isoToDisplay(iso) {
  const d = parseDateLoose(iso)
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export default function DateField({ value, onChange, className }) {
  const pickerRef = useRef(null)

  function openCalendar() {
    const el = pickerRef.current
    if (!el) return
    try { el.showPicker() } catch { /* el navegador no soporta showPicker */ }
  }

  return (
    <span className={'date-field' + (className ? ' ' + className : '')}>
      <input
        className="input date-text"
        value={value || ''}
        placeholder="dd/mm/aaaa"
        onClick={openCalendar}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        ref={pickerRef}
        type="date"
        className="date-hidden"
        value={toIso(value)}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value ? isoToDisplay(e.target.value) : '')}
      />
    </span>
  )
}
