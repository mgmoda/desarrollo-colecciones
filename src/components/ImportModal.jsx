import { useState } from 'react'
import Modal from './Modal.jsx'
import PhotoImport from './PhotoImport.jsx'
import { parseProductionFile } from '../lib/import.js'
import { ORIGENES } from '../lib/constants.js'

function Slot({ origen, label, onImported }) {
  const [status, setStatus] = useState(null) // {ok, msg}
  const [busy, setBusy] = useState(false)

  async function handle(file) {
    if (!file) return
    setBusy(true)
    setStatus(null)
    try {
      const { orders, skipped, error } = await parseProductionFile(file, origen)
      if (error) {
        setStatus({ ok: false, msg: error })
      } else {
        await onImported(origen, orders)
        setStatus({
          ok: true,
          msg: `${orders.length} órdenes importadas${skipped ? ` · ${skipped} omitidas` : ''}.`,
        })
      }
    } catch (e) {
      setStatus({ ok: false, msg: e.message || 'Error al leer el archivo.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="import-slot">
      <div className="import-slot-head">
        <span className="import-slot-title">{label}</span>
        {busy && <span className="import-slot-busy">Procesando…</span>}
      </div>
      <label className="import-drop">
        <input
          type="file"
          accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => handle(e.target.files && e.target.files[0])}
        />
        <span>Elegir archivo {label.toLowerCase()}…</span>
      </label>
      {status && (
        <p className={'import-slot-msg' + (status.ok ? ' ok' : ' err')}>
          {status.msg}
        </p>
      )}
    </div>
  )
}

export default function ImportModal({ open, onClose, onImported, refIds, onAssignPhoto }) {
  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">Importar del sistema</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="import-hint">
          Descarga los archivos del sistema de producción y cárgalos aquí. Cada
          archivo reemplaza los datos anteriores de ese tipo. Se lee la primera
          hoja del archivo (formato del sistema).
        </p>
        <div className="import-grid">
          <Slot origen="premuestra" label={ORIGENES.premuestra} onImported={onImported} />
          <Slot origen="muestra" label={ORIGENES.muestra} onImported={onImported} />
          <Slot origen="produccion" label={ORIGENES.produccion} onImported={onImported} />
          <PhotoImport refIds={refIds || []} onAssignPhoto={onAssignPhoto} />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onClose}>Listo</button>
      </div>
    </Modal>
  )
}
