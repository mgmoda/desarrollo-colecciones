import { procesoColor } from '../lib/constants.js'
import { refProcesos } from '../lib/domain.js'

// Procesos especiales de la referencia (recuadros, tintorería, bordado…),
// para que en el taller sepan qué lleva la prenda.
export default function ProcesosTags({ refRow, vacio = '—' }) {
  const lista = refProcesos(refRow)
  if (!lista.length) return <span className="muted">{vacio}</span>
  return (
    <span className="proc-cell">
      {lista.map((p) => {
        const c = procesoColor(p)
        return (
          <span key={p} className="proc-tag proc-tag-ro" title={p}
            style={{ background: c.bg, color: c.fg, borderColor: c.bd }}>{p}</span>
        )
      })}
    </span>
  )
}
