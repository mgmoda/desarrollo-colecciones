import Modal from './Modal.jsx'
import { AREAS, ORIGENES, formatDate } from '../lib/constants.js'
import { areaBaseFecha, orderArea, medicionInfo } from '../lib/domain.js'
import { diasDesde, diasEntre } from '../lib/dates.js'

const TIMELINE = [
  { key: 'ordenCorte', label: 'Orden corte' },
  { key: 'trazo', label: 'Trazo' },
  { key: 'entregaCorte', label: 'Corte' },
  { key: 'envioEnsamble', label: 'Envío a taller', taller: true },
  { key: 'entregaEnsamble', label: 'Entrega ensamble' },
]

function areaLabel(area) {
  return area ? AREAS[area].label : 'Sin iniciar'
}

function OrderTimeline({ order }) {
  const atraso = order && order._area !== 'entrega' ? diasDesde(areaBaseFecha(order)) : null
  return (
    <div className="track">
      <div className="track-head">
        <span className="track-orden">Orden #{order.orden || '—'}</span>
        <span className={'flag flag-area area-' + (order._area || 'none')}>
          {areaLabel(order._area)}
        </span>
        {atraso != null && (
          <span className={'tag' + (atraso >= 15 ? ' tag-warn' : '')}>{atraso} días</span>
        )}
      </div>
      <ol className="timeline">
        {TIMELINE.map((st) => {
          const s = order.stages[st.key] || {}
          const done = !!s.fecha
          const current = order._area && AREAS[order._area].next === st.key
          return (
            <li key={st.key} className={'tl-step' + (done ? ' done' : '') + (current ? ' current' : '')}>
              <span className="tl-dot" />
              <span className="tl-label">{st.label}</span>
              <span className="tl-date">
                {done ? formatDate(s.fecha) : current ? 'Pendiente' : '—'}
              </span>
              {st.taller && s.taller && <span className="tl-taller">{s.taller}</span>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function RefDetail({ open, refId, refRecord, tracks, onClose, onOpenFicha, onOpenDetail }) {
  if (!open || !refId) return null

  const hasTracks = tracks && tracks.length > 0

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="modal-head">
        <h2 className="modal-title">{refId}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      <div className="modal-body ref-detail">
        <div className="ref-detail-photo">
          {refRecord && refRecord.image ? (
            <img src={refRecord.image} alt={refId} className="ref-detail-img" />
          ) : (
            <div className="ref-detail-noimg">Sin foto</div>
          )}
          {refRecord && (refRecord.tipo || refRecord.tela) && (
            <p className="ref-detail-meta">
              {[refRecord.tipo, refRecord.tela].filter(Boolean).join(' · ')}
            </p>
          )}
          {refRecord && refRecord.conjunto && refRecord.conjuntoRef && (
            <button type="button" className="conj-line"
              onClick={() => onOpenDetail && onOpenDetail(refRecord.conjuntoRef)}
              title="Ver la prenda del conjunto">
              ⇄ En conjunto con <b>{refRecord.conjuntoRef}</b>
            </button>
          )}
        </div>

        <div className="ref-detail-tracks">
          {!hasTracks ? (
            <div className="empty-state">
              <p>Esta referencia no tiene órdenes importadas.</p>
              <p className="muted">Existe como ficha manual (resumen/costos).</p>
            </div>
          ) : (
            tracks.map((track) => (
              <div className="track-group" key={track.origen}>
                <h3 className="track-origen">{ORIGENES[track.origen]}</h3>
                {track.orders.map((o) => (
                  <OrderTimeline key={o.id} order={{ ...o, _area: orderArea(o) }} />
                ))}
              </div>
            ))
          )}

          {refRecord && (refRecord.mediciones || []).length > 0 && (() => {
            const info = medicionInfo(refRecord)
            return (
              <div className="med-detail">
                <h3 className="track-origen">Medición</h3>
                <p className="med-summary">
                  {info.estado === 'aprobada'
                    ? `Aprobada${info.dias != null ? ` en ${info.dias} días` : ''}${info.repeticiones ? ` · ${info.repeticiones} repetición(es)` : ''}`
                    : `En repetición${info.diasRepeticion != null ? ` hace ${info.diasRepeticion} días` : ''}${info.repeticiones ? ` · ${info.repeticiones} repetición(es)` : ''}`}
                </p>
                <ol className="med-detail-list">
                  {refRecord.mediciones.map((m, i) => {
                    let durTxt = ''
                    if (m.resultado === 'repeticion') {
                      const next = refRecord.mediciones[i + 1]
                      if (next) { const d = diasEntre(m.fecha, next.fecha); if (d != null) durTxt = `cerrada · tardó ${d} d` }
                      else { const d = diasDesde(m.fecha); if (d != null) durTxt = `abierta · lleva ${d} d` }
                    }
                    return (
                      <li className="med-detail-item" key={i}>
                        <span className="color-row-num">{i + 1}</span>
                        <span className="med-detail-fecha">{m.fecha || '—'}</span>
                        <span className={'flag ' + (m.resultado === 'aprobada' ? 'flag-yes' : 'flag-no')}>
                          {m.resultado === 'aprobada' ? 'Aprobada' : 'Repetición'}
                        </span>
                        {durTxt && <span className="med-detail-dur">{durTxt}</span>}
                        {m.nota && <span className="med-detail-nota">{m.nota}</span>}
                      </li>
                    )
                  })}
                </ol>
              </div>
            )
          })()}
        </div>
      </div>

      <div className="modal-foot spread">
        <span />
        <div className="foot-right">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={() => onOpenFicha(refId)}>Abrir ficha</button>
        </div>
      </div>
    </Modal>
  )
}
