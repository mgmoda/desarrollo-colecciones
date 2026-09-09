import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { formatDate } from '../lib/constants.js'

// Nota corta sobre UNA ORDEN, escrita desde la tabla del área.
//
// Va pegada al número de orden y no a la referencia: "la tela venía con
// manchas" es de este lote, y cuando la misma referencia se vuelva a
// programar la orden nueva arranca sin la nota vieja.
export default function NotaOrdenModal({ orden, nota, onGuardar, onClose }) {
  const [texto, setTexto] = useState('')

  useEffect(() => {
    setTexto((nota && nota.texto) || '')
  }, [nota, orden])

  if (!orden) return null
  const habia = !!(nota && nota.texto)

  function guardar() {
    const t = texto.trim()
    if (!t) { quitar(); return }
    onGuardar({
      texto: t,
      // La fecha marca desde cuándo está frenada, así que solo se pone la
      // primera vez: editar el texto no reinicia el reloj.
      fecha: (nota && nota.fecha) || new Date().toISOString().slice(0, 10),
    })
    onClose()
  }

  function quitar() {
    onGuardar(null)
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="modal-head">
        <h2 className="modal-title">Nota · orden {orden.orden} · {orden.referencia}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <div className="field">
          <label className="field-label">¿Qué tiene frenada esta orden?</label>
          <textarea className="input nota-ta" rows={3} value={texto} autoFocus
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej. la tela venía con manchas" />
          <p className="field-hint">
            Queda en esta orden, en todas las etapas por las que pase.
            {habia && nota.fecha ? ` Anotada el ${formatDate(nota.fecha)}.` : ''}
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
