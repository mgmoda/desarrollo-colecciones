import { useMemo, useState } from 'react'
import { formatDate, ORIGEN_ABBR } from '../lib/constants.js'
import { parseDateLoose } from '../lib/dates.js'
import { periodRange, shiftPeriod, periodLabel } from '../lib/periods.js'

const MODES = [
  { v: 'dia', l: 'Día' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
]

// Reporte de ensamble basado en los datos importados:
//   fecha de recepción = Entrega ensamble (col. T), unidades = su cantidad,
//   taller = subcampo Taller del Envío a ensamble (col. Q).
export default function EnsambleView({ orders, refMap, onViewImage }) {
  const [mode, setMode] = useState('semana')
  const [anchor, setAnchor] = useState(() => new Date())
  const [tallerF, setTallerF] = useState('')

  // Recepciones de ensamble (órdenes con fecha de entrega ensamble).
  const recepciones = useMemo(() => {
    return orders
      .filter((o) => o.stages && o.stages.entregaEnsamble && o.stages.entregaEnsamble.fecha)
      .map((o) => ({
        id: o.id,
        fecha: o.stages.entregaEnsamble.fecha,
        cantidad: Number(o.stages.entregaEnsamble.cant) || 0,
        referencia: o.referencia,
        taller: (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || '—',
        origen: o.origen,
      }))
  }, [orders])

  const talleres = useMemo(
    () => [...new Set(recepciones.map((r) => r.taller).filter((t) => t && t !== '—'))].sort(),
    [recepciones],
  )

  const range = useMemo(() => periodRange(mode, anchor), [mode, anchor])

  const enRango = useMemo(() => {
    const a = range.start.getTime(); const b = range.end.getTime()
    return recepciones.filter((e) => {
      if (tallerF && e.taller !== tallerF) return false
      const d = parseDateLoose(e.fecha)
      return d && d.getTime() >= a && d.getTime() < b
    })
  }, [recepciones, range, tallerF])

  // Totales por referencia (con sus talleres).
  const porRef = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => {
      const cur = map.get(e.referencia) || { referencia: e.referencia, unidades: 0, talleres: new Set() }
      cur.unidades += e.cantidad
      if (e.taller && e.taller !== '—') cur.talleres.add(e.taller)
      map.set(e.referencia, cur)
    })
    return [...map.values()].sort((x, y) => y.unidades - x.unidades)
  }, [enRango])

  const totalPeriodo = porRef.reduce((s, r) => s + r.unidades, 0)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Ensamble</h1>
          <p className="view-sub">Unidades recibidas de ensamble (por fecha de recepción)</p>
        </div>
        <div className="select-wrap">
          <select className="input select" value={tallerF} onChange={(e) => setTallerF(e.target.value)}>
            <option value="">Todos los talleres</option>
            {talleres.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="select-caret" aria-hidden="true">▾</span>
        </div>
      </div>

      <div className="ens-period">
        <div className="opt-group">
          {MODES.map((m) => (
            <button key={m.v} type="button" className={'opt-btn' + (mode === m.v ? ' on' : '')}
              onClick={() => setMode(m.v)}>{m.l}</button>
          ))}
        </div>
        <div className="ens-nav">
          <button className="icon-btn" onClick={() => setAnchor(shiftPeriod(mode, anchor, -1))} title="Anterior">‹</button>
          <span className="ens-period-label">{periodLabel(mode, range)}</span>
          <button className="icon-btn" onClick={() => setAnchor(shiftPeriod(mode, anchor, 1))} title="Siguiente">›</button>
          <button className="btn btn-ghost" onClick={() => setAnchor(new Date())}>Hoy</button>
        </div>
        <div className="ens-total">{totalPeriodo} <span>unidades</span></div>
      </div>

      {porRef.length === 0 ? (
        <div className="empty-state">
          <p>Sin recepciones de ensamble en este período.</p>
          <p className="muted">Se basa en la fecha de "Entrega ensamble" de los archivos importados.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Foto</th><th>Referencia</th><th>Taller(es)</th><th>Unidades</th></tr>
            </thead>
            <tbody>
              {porRef.map((r) => {
                const rec = refMap.get(r.referencia)
                return (
                  <tr key={r.referencia}>
                    <td className="cell-photo">
                      {rec && rec.image ? (
                        <img src={rec.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                          onClick={() => onViewImage(rec.image)} />
                      ) : <span className="thumb empty">—</span>}
                    </td>
                    <td className="strong">{r.referencia}</td>
                    <td>{[...r.talleres].join(', ') || '—'}</td>
                    <td className="num strong">{r.unidades}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {enRango.length > 0 && (
        <>
          <h2 className="section-title">Recepciones del período</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Recibido</th><th>Fase</th><th>Referencia</th><th>Taller</th><th>Unidades</th></tr></thead>
              <tbody>
                {[...enRango].sort((a, b) => (parseDateLoose(b.fecha) || 0) - (parseDateLoose(a.fecha) || 0)).map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.fecha)}</td>
                    <td><span className={'origen-chip o-' + e.origen}>{ORIGEN_ABBR[e.origen] || e.origen}</span></td>
                    <td className="strong">{e.referencia}</td>
                    <td>{e.taller}</td>
                    <td className="num">{e.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
