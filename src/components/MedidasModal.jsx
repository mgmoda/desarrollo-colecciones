import { useMemo } from 'react'
import Modal from './Modal.jsx'

// Las medidas por talla de la ficha técnica de Factory, tal como están en la
// pestaña "Medidas por Tallas": una fila por medida y una columna por talla.
// Solo se muestran las tallas que traen algún valor.
export default function MedidasModal({ orden, medidas, onClose }) {
  const tallas = useMemo(() => {
    const s = new Set()
    ;(medidas.medidas || []).forEach((m) => Object.entries(m.tallas || {}).forEach(([t, v]) => { if (v != null && v !== '') s.add(t) }))
    return [...s].sort((a, b) => Number(a) - Number(b))
  }, [medidas])
  const hayEscala = (medidas.medidas || []).some((m) => m.escInf != null || m.escSup != null)
  const hayIngles = (medidas.medidas || []).some((m) => m.ingles)
  // Factory guarda la medida como texto y a veces viene "36.5." o "1/2": lo
  // numérico se formatea, lo demás se muestra tal cual.
  const fmt = (v) => {
    if (v == null || v === '') return ''
    return typeof v === 'number' ? v.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : String(v)
  }

  return (
    <Modal open onClose={onClose} size={tallas.length > 7 ? 'xl' : 'lg'}>
      <div className="modal-head">
        <div>
          <h2 className="modal-title">Medidas por tallas · {medidas.ref || orden.referencia}</h2>
          <p className="eb-meta">
            {medidas.nombre}{orden && orden.orden ? ` · orden ${orden.orden}` : ''} · {(medidas.medidas || []).length} medidas · tallas {tallas.join(', ')}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body tal-modal-body">
        <div className="med-wrap">
          <table className="med-tabla">
            <thead>
              <tr>
                <th>Medida</th>
                {hayIngles && <th>Inglés</th>}
                {hayEscala && <th className="num" title="Escala inferior">Esc. inf.</th>}
                {hayEscala && <th className="num" title="Escala superior">Esc. sup.</th>}
                {tallas.map((t) => <th key={t} className="num">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {(medidas.medidas || []).map((m, i) => (
                <tr key={i}>
                  <td className="strong">{m.nombre || '—'}</td>
                  {hayIngles && <td className="muted">{m.ingles || ''}</td>}
                  {hayEscala && <td className="num muted">{fmt(m.escInf)}</td>}
                  {hayEscala && <td className="num muted">{fmt(m.escSup)}</td>}
                  {tallas.map((t) => (
                    <td key={t} className="num">{m.tallas && m.tallas[t] != null && m.tallas[t] !== '' ? fmt(m.tallas[t]) : <span className="muted">·</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tal-nota">Tal como está en la ficha técnica de Factory. Se actualiza dos veces al día.</p>
      </div>
    </Modal>
  )
}
