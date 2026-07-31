import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SearchInput from './SearchInput.jsx'
import { dbLoadLog } from '../lib/db.js'
import { nombreDeSesion } from '../lib/usuarios.js'

const TONO = {
  crear: 'act-crear',
  editar: 'act-editar',
  corregir: 'act-editar',
  registrar: 'act-crear',
  importar: 'act-import',
  eliminar: 'act-borrar',
  'borrar proceso': 'act-borrar',
}

function cuando(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  if (mismoDia) return `Hoy ${hora}`
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hora}`
  return `${d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })} ${hora}`
}

// "Costo: 185.900 → 210.900"
function Cambios({ detalle }) {
  const cambios = (detalle && detalle.cambios) || null
  if (!cambios || !Object.keys(cambios).length) return null
  return (
    <ul className="act-cambios">
      {Object.entries(cambios).map(([campo, [antes, despues]]) => (
        <li key={campo}>
          <span className="act-campo">{campo}</span>
          <span className="act-antes">{antes}</span>
          <span className="act-flecha">→</span>
          <span className="act-despues">{despues}</span>
        </li>
      ))}
    </ul>
  )
}

export default function ActividadModal({ onClose }) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let vivo = true
    dbLoadLog(300)
      .then((r) => { if (vivo) setFilas(r) })
      .catch((e) => { if (vivo) { console.error(e); setError(e.message || 'No se pudo cargar') } })
    return () => { vivo = false }
  }, [])

  const vistas = useMemo(() => {
    if (!filas) return []
    const t = q.trim().toLowerCase()
    if (!t) return filas
    return filas.filter((f) => [f.usuario, f.accion, f.entidad, f.clave, JSON.stringify(f.detalle)]
      .some((v) => String(v || '').toLowerCase().includes(t)))
  }, [filas, q])

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="modal-head">
        <div>
          <h2>Actividad</h2>
          <p className="modal-sub">Quién cambió qué y cuándo</p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="modal-body">
        <div className="act-buscar">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar usuario, referencia…" />
        </div>

        {error ? (
          <p className="field-error">{error}</p>
        ) : filas === null ? (
          <p className="muted">Cargando…</p>
        ) : vistas.length === 0 ? (
          <p className="muted">
            {filas.length === 0
              ? 'Todavía no hay movimientos registrados.'
              : 'Nada coincide con la búsqueda.'}
          </p>
        ) : (
          <ul className="act-lista">
            {vistas.map((f) => (
              <li key={f.id} className="act-item">
                <span className={'act-accion ' + (TONO[f.accion] || '')}>{f.accion}</span>
                <div className="act-cuerpo">
                  <p className="act-linea">
                    <b>{nombreDeSesion({ email: f.usuario })}</b>
                    {' '}{f.entidad || ''}
                    {f.clave && <span className="act-clave">{f.clave}</span>}
                    {f.detalle && f.detalle.proceso && (
                      <span className="act-extra">{f.detalle.proceso}</span>
                    )}
                    {f.detalle && f.detalle.ordenes != null && (
                      <span className="act-extra">{f.detalle.ordenes} órdenes</span>
                    )}
                  </p>
                  <Cambios detalle={f.detalle} />
                </div>
                <span className="act-fecha">{cuando(f.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
