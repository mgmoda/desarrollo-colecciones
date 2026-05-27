import { useMemo, useState } from 'react'
import DateField from './DateField.jsx'
import { newId } from '../lib/storage.js'
import { normRef, formatDate } from '../lib/constants.js'
import { parseDateLoose } from '../lib/dates.js'
import { periodRange, shiftPeriod, periodLabel } from '../lib/periods.js'

function hoyStr() {
  return new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const MODES = [
  { v: 'dia', l: 'Día' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
]

export default function EnsambleView({ entries, refIds, refMap, onAdd, onDelete, onViewImage }) {
  const [fecha, setFecha] = useState(hoyStr())
  const [ref, setRef] = useState('')
  const [cant, setCant] = useState('')

  const [mode, setMode] = useState('semana')
  const [anchor, setAnchor] = useState(() => new Date())

  const range = useMemo(() => periodRange(mode, anchor), [mode, anchor])

  // Entradas del período seleccionado.
  const enRango = useMemo(() => {
    const a = range.start.getTime(); const b = range.end.getTime()
    return entries.filter((e) => {
      const d = parseDateLoose(e.fecha)
      return d && d.getTime() >= a && d.getTime() < b
    })
  }, [entries, range])

  // Totales por referencia en el período.
  const porRef = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => { map.set(e.referencia, (map.get(e.referencia) || 0) + (Number(e.cantidad) || 0)) })
    return [...map.entries()].map(([referencia, unidades]) => ({ referencia, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
  }, [enRango])

  const totalPeriodo = porRef.reduce((s, r) => s + r.unidades, 0)

  function agregar() {
    const r = normRef(ref)
    const n = Number(cant)
    if (!r || !(n > 0) || !fecha) return
    onAdd({ id: newId(), fecha, referencia: r, cantidad: n, createdAt: Date.now() })
    setRef(''); setCant('')
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Ensamble</h1>
          <p className="view-sub">Unidades ensambladas por referencia</p>
        </div>
      </div>

      {/* Registrar */}
      <div className="ens-form">
        <div className="field">
          <label className="field-label">Fecha</label>
          <DateField value={fecha} onChange={setFecha} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label className="field-label">Referencia</label>
          <input className="input" list="ens-refs" value={ref}
            onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="MG-B705" />
          <datalist id="ens-refs">{refIds.map((id) => <option key={id} value={id} />)}</datalist>
        </div>
        <div className="field" style={{ width: 110 }}>
          <label className="field-label">Cantidad</label>
          <input className="input" type="number" min="1" value={cant}
            onChange={(e) => setCant(e.target.value)} placeholder="0"
            onKeyDown={(e) => { if (e.key === 'Enter') agregar() }} />
        </div>
        <button className="btn btn-primary" onClick={agregar}>Agregar</button>
      </div>

      {/* Período */}
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

      {/* Reporte por referencia */}
      {porRef.length === 0 ? (
        <div className="empty-state"><p>Sin registros en este período.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Foto</th><th>Referencia</th><th>Unidades</th></tr>
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
                    <td className="num strong">{r.unidades}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalle de movimientos del período */}
      {enRango.length > 0 && (
        <>
          <h2 className="section-title">Registros del período</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Referencia</th><th>Unidades</th><th></th></tr></thead>
              <tbody>
                {[...enRango].sort((a, b) => (parseDateLoose(b.fecha) || 0) - (parseDateLoose(a.fecha) || 0)).map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.fecha)}</td>
                    <td className="strong">{e.referencia}</td>
                    <td className="num">{e.cantidad}</td>
                    <td className="muted">
                      <button className="link-btn danger" onClick={() => onDelete(e.id)}>Eliminar</button>
                    </td>
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
