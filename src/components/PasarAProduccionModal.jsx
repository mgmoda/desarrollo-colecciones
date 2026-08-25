import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'

// Diseños aprobados por Geodésica que pasan a producción.
//
// El diseño se llama GEO-B145 mientras se desarrolla, pero al entrar a
// producción Geodésica le da su propia referencia (S06241). Ese código es lo
// único que no se puede adivinar, así que es lo único que se pide aquí. El
// resto —foto, prenda— viaja solo. Precio, cantidad y fecha se completan
// después en Por programar, que es donde ya se llenan.
export default function PasarAProduccionModal({ disenos, refsExistentes, onConfirmar, onClose }) {
  const [codigos, setCodigos] = useState({})
  const [err, setErr] = useState('')

  useEffect(() => {
    setCodigos({})
    setErr('')
  }, [disenos])

  if (!disenos || !disenos.length) return null

  const usados = new Set((refsExistentes || []).map((r) => String(r.id || '').toUpperCase()))

  function confirmar() {
    const items = []
    const vistos = new Set()
    for (const d of disenos) {
      const cod = String(codigos[d.codigo] || '').trim().toUpperCase()
      if (!cod) { setErr(`Falta la referencia de ${d.codigo}`); return }
      if (usados.has(cod)) { setErr(`La referencia ${cod} ya existe en el sistema`); return }
      if (vistos.has(cod)) { setErr(`Repetiste la referencia ${cod}`); return }
      vistos.add(cod)
      items.push({
        codigo: d.codigo,
        referencia: cod,
        producto: d.nombre || d.tipo || '',
        image: d.thumb || '',
      })
    }
    onConfirmar(items)
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">
          Pasar a producción · {disenos.length} {disenos.length === 1 ? 'diseño' : 'diseños'}
        </h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>
          Escribe la referencia con que Geodésica va a pedir cada uno. Quedan en
          <b> Por programar</b> con su foto, y el diseño se marca como aprobado.
        </p>
        <ul className="pasar-lista">
          {disenos.map((d) => (
            <li key={d.codigo} className="pasar-item">
              {d.thumb
                ? <img src={d.thumb} alt={d.codigo} className="thumb" />
                : <span className="thumb empty">—</span>}
              <div className="pasar-id">
                <b>{d.codigo}</b>
                <span className="muted">{d.nombre || d.tipo || '—'}</span>
              </div>
              <input className="input" value={codigos[d.codigo] || ''}
                placeholder="Ej. S06241"
                onChange={(e) => {
                  setErr('')
                  setCodigos((c) => ({ ...c, [d.codigo]: e.target.value }))
                }} />
            </li>
          ))}
        </ul>
        {err && <p className="form-err">{err}</p>}
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar}>
          Crear preórdenes
        </button>
      </div>
    </Modal>
  )
}
