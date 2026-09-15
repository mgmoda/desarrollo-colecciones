import { useState } from 'react'
import Modal from './Modal.jsx'
import { EXTERNO, EXTERNOS, aIso } from '../lib/procesos.js'

// Mandar un grupo de órdenes a corte externo (se escoge a quién). Se hace en
// bloque porque así sale
// la tela: una remesa, no una orden a la vez. La fecha es la de hoy y se
// puede cambiar si la remesa salió ayer y se viene a registrar hoy.
export default function EnviarExternoModal({ ordenes, onConfirmar, onClose }) {
  const [fecha, setFecha] = useState(() => aIso(Date.now()))
  const [quien, setQuien] = useState(EXTERNO)
  if (!ordenes || !ordenes.length) return null
  const unid = ordenes.reduce((n, o) => n + (Number((o.stages.ordenCorte || {}).cant) || 0), 0)
  const refs = [...new Set(ordenes.map((o) => o.referencia))]

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="modal-head">
        <h2 className="modal-title">Enviar a corte externo</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>
          <b>{ordenes.length}</b> {ordenes.length === 1 ? 'orden' : 'órdenes'} ·{' '}
          <b>{unid.toLocaleString('es-CO')}</b> unidades
        </p>
        <p className="ext-refs">{refs.join(' · ')}</p>
        <div className="field">
          <label className="field-label">¿Donde quién?</label>
          <div className="dis-filtros">
            {EXTERNOS.map((n) => (
              <button key={n} type="button" className={'proc-f-btn' + (quien === n ? ' on' : '')}
                onClick={() => setQuien(n)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">¿Qué día sale la tela?</label>
          <input className="input" type="date" value={fecha} max={aIso(Date.now())}
            onChange={(e) => setFecha(e.target.value)} />
        </div>
        <p className="field-hint">
          Desde esa fecha corre el contador de días afuera. Cuando vuelvan cortadas
          se cierra el corte con el ✓, como con los demás.
        </p>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!fecha}
          onClick={() => onConfirmar(fecha, quien)}>
          Enviar {ordenes.length} donde {quien}
        </button>
      </div>
    </Modal>
  )
}
