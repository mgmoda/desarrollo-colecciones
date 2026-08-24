import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'

// Nota corta sobre una referencia, escrita desde la tabla del área.
//
// No es un dato nuevo: es el mismo "pendiente por resolver" que ya tiene la
// ficha, solo que ahora se puede escribir donde se trabaja. Corte ve que a la
// C6888 TOP le falta tela y lo anota ahí mismo; la nota sale también en el
// Resumen y en la lista de pendientes, que ya existían.
export default function NotaRefModal({ orden, refRow, onGuardar, onClose }) {
  const [texto, setTexto] = useState('')

  useEffect(() => {
    setTexto((refRow && refRow.pendienteNota) || '')
  }, [refRow, orden])

  if (!orden) return null
  const referencia = orden.referencia
  const habia = !!(refRow && refRow.pendiente)

  function guardar() {
    const t = texto.trim()
    if (!t) { quitar(); return }
    onGuardar({
      pendiente: true,
      pendienteNota: t,
      // La fecha marca desde cuándo está frenada, así que solo se pone la
      // primera vez: editar el texto no reinicia el reloj.
      pendienteFecha: (refRow && refRow.pendienteFecha) || new Date().toISOString().slice(0, 10),
    })
    onClose()
  }

  function quitar() {
    onGuardar({ pendiente: false, pendienteNota: '', pendienteFecha: '' })
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="modal-head">
        <h2 className="modal-title">Nota · {referencia}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <div className="field">
          <label className="field-label">¿Qué la tiene frenada?</label>
          <textarea className="input nota-ta" rows={3} value={texto} autoFocus
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej. no hay tela" />
          <p className="field-hint">
            Queda en la referencia, así que se ve en todos los módulos y en la
            lista de pendientes.
          </p>
        </div>
      </div>
      <div className="modal-foot">
        {habia && <button className="btn btn-danger" onClick={quitar}>Quitar nota</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar}>Guardar</button>
      </div>
    </Modal>
  )
}
