import Modal from './Modal.jsx'

export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="confirm">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel || 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
