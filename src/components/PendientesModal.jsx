import Modal from './Modal.jsx'

// Lista enfocada de pendientes: foto, referencia y motivo. Clic = resolver.
export default function PendientesModal({ open, pendientes = [], onClose, onOpenRef, onViewImage }) {
  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">⚠ Pendientes por resolver</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        {pendientes.length === 0 ? (
          <div className="empty-state"><p>No hay pendientes. 🎉</p></div>
        ) : (
          <ul className="pendm-list">
            {pendientes.map((r) => (
              <li key={r.id} className="pendm-item" onClick={() => onOpenRef(r)}>
                {r.image ? (
                  <img src={r.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                    onClick={(e) => { e.stopPropagation(); onViewImage(r.image) }} />
                ) : (
                  <span className="thumb empty">—</span>
                )}
                <div className="pendm-body">
                  <span className="pendm-ref">{r.referencia}</span>
                  <span className="pendm-note">{r.pendienteNota || 'Sin descripción'}</span>
                </div>
                <span className="pend-go">Resolver ›</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
