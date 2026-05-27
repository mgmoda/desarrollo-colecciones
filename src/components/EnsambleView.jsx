import { useMemo, useState } from 'react'
import { parseDateLoose } from '../lib/dates.js'
import { periodRange, shiftPeriod, periodLabel } from '../lib/periods.js'

const MODES = [
  { v: 'dia', l: 'Día' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
]

// Reporte de ensamble (derivado del import): compara talleres por unidades
// recibidas (fecha "Entrega ensamble") en el día / semana / mes elegido.
export default function EnsambleView({ orders, refMap, onViewImage }) {
  const [mode, setMode] = useState('semana')
  const [anchor, setAnchor] = useState(() => new Date())
  const [tallerSel, setTallerSel] = useState('')

  const recepciones = useMemo(() => {
    return orders
      .filter((o) => o.stages && o.stages.entregaEnsamble && o.stages.entregaEnsamble.fecha)
      .map((o) => ({
        fecha: o.stages.entregaEnsamble.fecha,
        cantidad: Number(o.stages.entregaEnsamble.cant) || 0,
        referencia: o.referencia,
        taller: (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || 'Sin taller',
      }))
  }, [orders])

  const range = useMemo(() => periodRange(mode, anchor), [mode, anchor])

  const enRango = useMemo(() => {
    const a = range.start.getTime(); const b = range.end.getTime()
    return recepciones.filter((e) => {
      const d = parseDateLoose(e.fecha)
      return d && d.getTime() >= a && d.getTime() < b
    })
  }, [recepciones, range])

  const porTaller = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => { map.set(e.taller, (map.get(e.taller) || 0) + e.cantidad) })
    return [...map.entries()].map(([taller, unidades]) => ({ taller, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
  }, [enRango])

  const maxTaller = porTaller.length ? porTaller[0].unidades : 0
  const total = porTaller.reduce((s, t) => s + t.unidades, 0)

  const porRef = useMemo(() => {
    const map = new Map()
    enRango.filter((e) => !tallerSel || e.taller === tallerSel).forEach((e) => {
      map.set(e.referencia, (map.get(e.referencia) || 0) + e.cantidad)
    })
    return [...map.entries()].map(([referencia, unidades]) => ({ referencia, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
  }, [enRango, tallerSel])

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Ensamble</h1>
          <p className="view-sub">Comparativo de talleres por unidades recibidas</p>
        </div>
      </div>

      {/* Controles de período */}
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
        <div className="ens-total">{total} <span>unidades</span></div>
      </div>

      {porTaller.length === 0 ? (
        <div className="empty-state">
          <p>Sin recepciones de ensamble en este período.</p>
          <p className="muted">Se basa en la fecha de "Entrega ensamble" del archivo importado.</p>
        </div>
      ) : (
        <div className="ens-cols">
          {/* Ranking de talleres con barras */}
          <div className="ens-card">
            <div className="ens-card-head">Talleres <span>{porTaller.length}</span></div>
            <div className="ens-ranking">
              {porTaller.map((t, i) => {
                const pct = maxTaller ? Math.round((t.unidades / maxTaller) * 100) : 0
                const active = tallerSel === t.taller
                return (
                  <button key={t.taller}
                    className={'ens-rank' + (active ? ' active' : '') + (i === 0 ? ' top' : '')}
                    onClick={() => setTallerSel(active ? '' : t.taller)}
                    title="Ver sus referencias">
                    <span className="ens-rank-pos">{i + 1}</span>
                    <span className="ens-rank-body">
                      <span className="ens-rank-name">{t.taller}</span>
                      <span className="ens-rank-bar"><span className="ens-rank-fill" style={{ width: pct + '%' }} /></span>
                    </span>
                    <span className="ens-rank-num">{t.unidades}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Referencias (del taller seleccionado o de todos) */}
          <div className="ens-card">
            <div className="ens-card-head">
              {tallerSel ? `Referencias · ${tallerSel}` : 'Referencias (todos)'}
              {tallerSel && <button className="link-btn" onClick={() => setTallerSel('')}>ver todos</button>}
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Foto</th><th>Referencia</th><th>Unidades</th></tr></thead>
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
                        <td className="num strong">{r.unidades}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
