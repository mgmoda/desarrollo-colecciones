import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { parseDateLoose } from '../lib/dates.js'
import { periodRange, shiftPeriod, periodLabel, startOfDay } from '../lib/periods.js'

const MODES = [
  { v: 'dia', l: 'Día' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
]

const DOW_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function dayKey(d) {
  // YYYY-MM-DD local — no toISOString para evitar el corrimiento de zona.
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function sameDay(a, b) { return dayKey(a) === dayKey(b) }
function dowMonFirst(d) { return (d.getDay() + 6) % 7 } // 0=Lun ... 6=Dom
function fmtDayLong(d) { return `${DOW_SHORT[dowMonFirst(d)]} ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}` }

// Reporte de ensamble: calendario por día con detalle de unidades, referencias
// y talleres. Clic en un día abre un modal con el desglose completo.
export default function EnsambleView({ orders, refMap, onViewImage, onOpenRef }) {
  const [mode, setMode] = useState('semana')
  const [anchor, setAnchor] = useState(() => new Date())
  const [tallerSel, setTallerSel] = useState('')
  const [dayDrill, setDayDrill] = useState(null) // Date | null

  // Eventos crudos derivados del import: cada entrega de ensamble cuenta como
  // una recepción con (fecha, cantidad, referencia, taller).
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

  // Filtra al período seleccionado y agrega un objeto Date listo para usar.
  const enRango = useMemo(() => {
    const a = range.start.getTime(); const b = range.end.getTime()
    const out = []
    recepciones.forEach((e) => {
      const d = parseDateLoose(e.fecha)
      if (d && d.getTime() >= a && d.getTime() < b) out.push({ ...e, _d: startOfDay(d) })
    })
    return out
  }, [recepciones, range])

  // Agrupación por día: clave YYYY-MM-DD → { total, talleres, refs, fecha }
  const porDia = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => {
      const key = dayKey(e._d)
      if (!map.has(key)) map.set(key, { date: e._d, total: 0, talleres: new Map(), refs: new Map() })
      const x = map.get(key)
      x.total += e.cantidad
      x.talleres.set(e.taller, (x.talleres.get(e.taller) || 0) + e.cantidad)
      x.refs.set(e.referencia, (x.refs.get(e.referencia) || 0) + e.cantidad)
    })
    return map
  }, [enRango])

  // Calendario: lista de celdas (días) según el modo. En mes, se pre/postpone
  // con días de meses vecinos para alinear lunes–domingo.
  const calendario = useMemo(() => {
    const cells = []
    if (mode === 'dia') return cells
    const start = new Date(range.start)
    const end = new Date(range.end)
    if (mode === 'mes') {
      const padStart = dowMonFirst(start)
      for (let i = padStart; i > 0; i--) {
        const d = new Date(start); d.setDate(d.getDate() - i)
        cells.push({ date: d, inRange: false })
      }
    }
    const cur = new Date(start)
    while (cur.getTime() < end.getTime()) {
      cells.push({ date: new Date(cur), inRange: true })
      cur.setDate(cur.getDate() + 1)
    }
    if (mode === 'mes') {
      while (cells.length % 7 !== 0) {
        const last = cells[cells.length - 1].date
        const d = new Date(last); d.setDate(d.getDate() + 1)
        cells.push({ date: d, inRange: false })
      }
    }
    return cells
  }, [mode, range])

  // Ranking de talleres del período (con filtro opcional por taller).
  const porTaller = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => { map.set(e.taller, (map.get(e.taller) || 0) + e.cantidad) })
    return [...map.entries()].map(([taller, unidades]) => ({ taller, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
  }, [enRango])

  const maxTaller = porTaller.length ? porTaller[0].unidades : 0
  const total = porTaller.reduce((s, t) => s + t.unidades, 0)

  // Referencias del período (filtradas por taller si hay selección).
  const porRef = useMemo(() => {
    const map = new Map()
    enRango.filter((e) => !tallerSel || e.taller === tallerSel).forEach((e) => {
      map.set(e.referencia, (map.get(e.referencia) || 0) + e.cantidad)
    })
    return [...map.entries()].map(([referencia, unidades]) => ({ referencia, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
  }, [enRango, tallerSel])

  const totalRefs = porRef.length
  const totalTalleres = porTaller.length
  const diasConActividad = porDia.size

  // KPI de la cabecera.
  const hoy = new Date()

  // Datos del día abierto en el modal.
  const dayDetail = useMemo(() => {
    if (!dayDrill) return null
    const key = dayKey(dayDrill)
    const data = porDia.get(key)
    if (!data) return { date: dayDrill, total: 0, talleres: [], refs: [] }
    const talleres = [...data.talleres.entries()].map(([taller, unidades]) => ({ taller, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
    // Para cada ref, calcular taller(es) que la entregaron ese día.
    const refMap2 = new Map() // ref -> { unidades, talleres: Map }
    enRango.filter((e) => sameDay(e._d, dayDrill)).forEach((e) => {
      if (!refMap2.has(e.referencia)) refMap2.set(e.referencia, { unidades: 0, talleres: new Map() })
      const x = refMap2.get(e.referencia)
      x.unidades += e.cantidad
      x.talleres.set(e.taller, (x.talleres.get(e.taller) || 0) + e.cantidad)
    })
    const refs = [...refMap2.entries()].map(([referencia, x]) => ({
      referencia,
      unidades: x.unidades,
      talleres: [...x.talleres.entries()].map(([t, u]) => ({ taller: t, unidades: u }))
        .sort((a, b) => b.unidades - a.unidades),
    })).sort((a, b) => b.unidades - a.unidades)
    return { date: dayDrill, total: data.total, talleres, refs }
  }, [dayDrill, porDia, enRango])

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Ensamble</h1>
          <p className="view-sub">Calendario de recepciones por día, taller y referencia</p>
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
      </div>

      {/* KPIs del período */}
      <div className="ens-kpis">
        <div className="ens-kpi"><span className="ens-kpi-num">{total}</span><span className="ens-kpi-lbl">unidades</span></div>
        <div className="ens-kpi"><span className="ens-kpi-num">{totalRefs}</span><span className="ens-kpi-lbl">referencias</span></div>
        <div className="ens-kpi"><span className="ens-kpi-num">{totalTalleres}</span><span className="ens-kpi-lbl">talleres</span></div>
        <div className="ens-kpi"><span className="ens-kpi-num">{diasConActividad}</span><span className="ens-kpi-lbl">días con actividad</span></div>
      </div>

      {/* Calendario */}
      {mode === 'dia' ? (
        <DayCard date={range.start} data={porDia.get(dayKey(range.start))} isToday={sameDay(range.start, hoy)}
          onOpen={() => setDayDrill(range.start)} />
      ) : (
        <div className={'ens-cal ens-cal-' + mode}>
          <div className="ens-cal-head">
            {DOW_SHORT.map((d) => (<div key={d} className="ens-cal-head-cell">{d}</div>))}
          </div>
          <div className="ens-cal-grid">
            {calendario.map((cell, i) => {
              const key = dayKey(cell.date)
              const data = porDia.get(key)
              const isToday = sameDay(cell.date, hoy)
              return (
                <button key={i} type="button"
                  className={'ens-cal-cell'
                    + (cell.inRange ? '' : ' off')
                    + (data ? ' has' : '')
                    + (isToday ? ' today' : '')}
                  onClick={() => cell.inRange && data && setDayDrill(cell.date)}
                  disabled={!cell.inRange || !data}
                  title={data ? `${data.total} unidades · ${data.refs.size} refs · ${data.talleres.size} taller(es)` : 'Sin actividad'}>
                  <div className="ens-cal-cell-date">{cell.date.getDate()}</div>
                  {data && (
                    <>
                      <div className="ens-cal-cell-units">{data.total} <span>u</span></div>
                      <div className="ens-cal-cell-meta">
                        <span>{data.refs.size} ref{data.refs.size === 1 ? '' : 's'}</span>
                        <span>·</span>
                        <span>{data.talleres.size} taller{data.talleres.size === 1 ? '' : 'es'}</span>
                      </div>
                      <div className="ens-cal-cell-talleres">
                        {[...data.talleres.entries()].slice(0, 3).map(([t, u]) => (
                          <span key={t} className="ens-cal-taller-chip" title={`${t}: ${u}`}>
                            {t.split(' ').slice(0, 2).map((s) => s.charAt(0)).join('')} {u}
                          </span>
                        ))}
                        {data.talleres.size > 3 && (
                          <span className="ens-cal-taller-chip more">+{data.talleres.size - 3}</span>
                        )}
                      </div>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumen del período: ranking de talleres + lista de referencias */}
      {total === 0 ? (
        <div className="empty-state">
          <p>Sin recepciones de ensamble en este período.</p>
          <p className="muted">Se basa en la fecha de "Entrega ensamble" del archivo importado.</p>
        </div>
      ) : (
        <div className="ens-cols">
          <div className="ens-card">
            <div className="ens-card-head">Talleres del período <span>{porTaller.length}</span></div>
            <div className="ens-ranking">
              {porTaller.map((t, i) => {
                const pct = maxTaller ? Math.round((t.unidades / maxTaller) * 100) : 0
                const active = tallerSel === t.taller
                return (
                  <button key={t.taller}
                    className={'ens-rank' + (active ? ' active' : '') + (i === 0 ? ' top' : '')}
                    onClick={() => setTallerSel(active ? '' : t.taller)}
                    title="Filtrar referencias por este taller">
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

          <div className="ens-card">
            <div className="ens-card-head">
              {tallerSel ? `Referencias · ${tallerSel}` : 'Referencias del período (todos los talleres)'}
              {tallerSel && <button className="link-btn" onClick={() => setTallerSel('')}>ver todos</button>}
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Foto</th><th>Referencia</th><th>Unidades</th></tr></thead>
                <tbody>
                  {porRef.map((r) => {
                    const rec = refMap.get(r.referencia)
                    return (
                      <tr key={r.referencia} className={onOpenRef ? 'row-click' : ''}
                        onClick={() => onOpenRef && rec && onOpenRef(rec)}>
                        <td className="cell-photo">
                          {rec && rec.image ? (
                            <img src={rec.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                              onClick={(e) => { e.stopPropagation(); onViewImage(rec.image) }} />
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

      {/* Modal con el desglose completo del día */}
      <Modal open={!!dayDrill} onClose={() => setDayDrill(null)} size="lg">
        {dayDetail && (
          <>
            <div className="modal-head">
              <h2 className="modal-title">{fmtDayLong(dayDetail.date)} <span className="muted" style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 500 }}>· {dayDetail.total} unidades</span></h2>
              <button className="icon-btn" onClick={() => setDayDrill(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              <div className="ens-day-grid">
                <div className="ens-card">
                  <div className="ens-card-head">Talleres <span>{dayDetail.talleres.length}</span></div>
                  <div className="ens-ranking">
                    {dayDetail.talleres.map((t, i) => {
                      const max = dayDetail.talleres[0].unidades
                      const pct = max ? Math.round((t.unidades / max) * 100) : 0
                      return (
                        <div key={t.taller} className={'ens-rank' + (i === 0 ? ' top' : '')}>
                          <span className="ens-rank-pos">{i + 1}</span>
                          <span className="ens-rank-body">
                            <span className="ens-rank-name">{t.taller}</span>
                            <span className="ens-rank-bar"><span className="ens-rank-fill" style={{ width: pct + '%' }} /></span>
                          </span>
                          <span className="ens-rank-num">{t.unidades}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="ens-card">
                  <div className="ens-card-head">Referencias <span>{dayDetail.refs.length}</span></div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Foto</th><th>Referencia</th><th>Taller</th><th>Unidades</th></tr></thead>
                      <tbody>
                        {dayDetail.refs.map((r) => {
                          const rec = refMap.get(r.referencia)
                          return (
                            <tr key={r.referencia} className={onOpenRef ? 'row-click' : ''}
                              onClick={() => { if (onOpenRef && rec) { setDayDrill(null); onOpenRef(rec) } }}>
                              <td className="cell-photo">
                                {rec && rec.image ? (
                                  <img src={rec.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                                    onClick={(e) => { e.stopPropagation(); onViewImage(rec.image) }} />
                                ) : <span className="thumb empty">—</span>}
                              </td>
                              <td className="strong">{r.referencia}</td>
                              <td className="muted">{r.talleres.map((t) => `${t.taller} (${t.unidades})`).join(' · ')}</td>
                              <td className="num strong">{r.unidades}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

// Tarjeta grande del modo "Día" — muestra todo el detalle del único día visible.
function DayCard({ date, data, isToday, onOpen }) {
  const hasData = !!data
  return (
    <div className={'ens-day-card' + (isToday ? ' today' : '') + (hasData ? '' : ' empty')}>
      <div className="ens-day-card-head">
        <div>
          <h3>{fmtDayLong(date)}</h3>
          {isToday && <span className="ens-today-tag">HOY</span>}
        </div>
        {hasData && (
          <button className="btn btn-ghost" onClick={onOpen}>Ver desglose completo →</button>
        )}
      </div>
      {hasData ? (
        <div className="ens-day-card-body">
          <div className="ens-day-stat"><span className="num">{data.total}</span><span className="lbl">unidades</span></div>
          <div className="ens-day-stat"><span className="num">{data.refs.size}</span><span className="lbl">referencias</span></div>
          <div className="ens-day-stat"><span className="num">{data.talleres.size}</span><span className="lbl">talleres</span></div>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Sin recepciones en este día.</p>
      )}
    </div>
  )
}
