import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { parseDateLoose } from '../lib/dates.js'
import { periodRange, shiftPeriod, periodLabel, startOfDay } from '../lib/periods.js'
import { ORIGEN_ABBR, ORIGENES } from '../lib/constants.js'

const MODES = [
  { v: 'dia', l: 'Día' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
]

// Dos sub-reportes: Corte (origen como agrupación) y Ensamble (taller como agrupación).
const REPORTS = [
  { v: 'corte', l: 'Corte' },
  { v: 'ensamble', l: 'Ensamble' },
]

const ORIGEN_ORDER = ['premuestra', 'muestra', 'produccion', 'geodesica']

const DOW_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function dayKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function sameDay(a, b) { return dayKey(a) === dayKey(b) }
function dowMonFirst(d) { return (d.getDay() + 6) % 7 }
function fmtDayLong(d) { return `${DOW_SHORT[dowMonFirst(d)]} ${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]}` }

function shortTaller(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  if (parts.length === 1) return cap(parts[0])
  const first = cap(parts[0])
  const apellido = parts.length >= 3 ? parts[1] : parts[parts.length - 1]
  return `${first} ${apellido.charAt(0).toUpperCase()}.`
}

// Seguimiento de producción: calendario combinado de Corte y Ensamble.
// - Corte: usa la fecha de "Entrega corte" del archivo importado.
// - Ensamble: usa la fecha de "Entrega ensamble" del archivo importado.
// Cada celda muestra unidades, refs y un desglose por origen (Pre/Mue/Pro)
// y en Ensamble también por taller.
export default function SeguimientoView({ orders, refMap, onViewImage, onOpenRef }) {
  const [report, setReport] = useState('corte')
  const [mode, setMode] = useState('mes')
  const [anchor, setAnchor] = useState(() => new Date())
  const [grupoSel, setGrupoSel] = useState('') // taller (ensamble) o origen (corte)
  const [origenSel, setOrigenSel] = useState('') // filtro adicional por origen (ambos reportes)
  const [dayDrill, setDayDrill] = useState(null)

  useEffect(() => { setGrupoSel(''); setOrigenSel('') }, [report])

  // Eventos crudos: cada orden con fecha de cierre de la etapa relevante.
  const recepciones = useMemo(() => {
    if (report === 'ensamble') {
      return orders
        .filter((o) => o.stages && o.stages.entregaEnsamble && o.stages.entregaEnsamble.fecha)
        .map((o) => ({
          fecha: o.stages.entregaEnsamble.fecha,
          cantidad: Number(o.stages.entregaEnsamble.cant) || 0,
          referencia: o.referencia,
          taller: (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || 'Sin taller',
          origen: o.origen,
        }))
    }
    // CORTE: cuando se cierra "Entrega corte" (cantidades cortadas ese día)
    return orders
      .filter((o) => o.stages && o.stages.entregaCorte && o.stages.entregaCorte.fecha)
      .map((o) => ({
        fecha: o.stages.entregaCorte.fecha,
        cantidad: Number(o.stages.entregaCorte.cant) || 0,
        referencia: o.referencia,
        taller: '', // no aplica en corte
        origen: o.origen,
      }))
  }, [orders, report])

  const range = useMemo(() => periodRange(mode, anchor), [mode, anchor])

  const enRango = useMemo(() => {
    const a = range.start.getTime(); const b = range.end.getTime()
    const out = []
    recepciones.forEach((e) => {
      const d = parseDateLoose(e.fecha)
      if (d && d.getTime() >= a && d.getTime() < b) out.push({ ...e, _d: startOfDay(d) })
    })
    return out
  }, [recepciones, range])

  // Agrupación por día con desglose por origen y por taller.
  const porDia = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => {
      const key = dayKey(e._d)
      if (!map.has(key)) {
        map.set(key, {
          date: e._d, total: 0,
          origenes: { premuestra: 0, muestra: 0, produccion: 0, geodesica: 0 },
          talleres: new Map(),
          refs: new Map(),
        })
      }
      const x = map.get(key)
      x.total += e.cantidad
      if (e.origen && x.origenes[e.origen] != null) x.origenes[e.origen] += e.cantidad
      if (report === 'ensamble') {
        x.talleres.set(e.taller, (x.talleres.get(e.taller) || 0) + e.cantidad)
      }
      x.refs.set(e.referencia, (x.refs.get(e.referencia) || 0) + e.cantidad)
    })
    return map
  }, [enRango, report])

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

  // Filtros aplicables a la lista de refs y al ranking lateral.
  const eventosFiltrados = useMemo(() => {
    return enRango.filter((e) => {
      if (origenSel && e.origen !== origenSel) return false
      if (grupoSel) {
        if (report === 'ensamble' && e.taller !== grupoSel) return false
        if (report === 'corte' && e.origen !== grupoSel) return false
      }
      return true
    })
  }, [enRango, origenSel, grupoSel, report])

  // Ranking principal: en Ensamble = talleres ; en Corte = origenes.
  const ranking = useMemo(() => {
    const map = new Map()
    enRango.forEach((e) => {
      if (origenSel && e.origen !== origenSel) return
      const key = report === 'ensamble' ? e.taller : (e.origen || 'sin')
      map.set(key, (map.get(key) || 0) + e.cantidad)
    })
    let arr = [...map.entries()].map(([k, unidades]) => ({ k, unidades }))
    if (report === 'corte') {
      // Orden fijo: Pre, Mue, Pro
      arr.sort((a, b) => ORIGEN_ORDER.indexOf(a.k) - ORIGEN_ORDER.indexOf(b.k))
    } else {
      arr.sort((a, b) => b.unidades - a.unidades)
    }
    return arr
  }, [enRango, report, origenSel])

  const maxRank = ranking.reduce((m, r) => Math.max(m, r.unidades), 0)
  const total = ranking.reduce((s, r) => s + r.unidades, 0)

  const porRef = useMemo(() => {
    const map = new Map()
    eventosFiltrados.forEach((e) => {
      if (!map.has(e.referencia)) map.set(e.referencia, { unidades: 0, origenes: new Set() })
      const x = map.get(e.referencia)
      x.unidades += e.cantidad
      if (e.origen) x.origenes.add(e.origen)
    })
    return [...map.entries()].map(([referencia, x]) => ({
      referencia,
      unidades: x.unidades,
      origenes: [...x.origenes],
    })).sort((a, b) => b.unidades - a.unidades)
  }, [eventosFiltrados])

  // Totales globales para KPIs.
  const kpiOrigenes = useMemo(() => {
    const o = { premuestra: 0, muestra: 0, produccion: 0, geodesica: 0 }
    enRango.forEach((e) => { if (e.origen && o[e.origen] != null) o[e.origen] += e.cantidad })
    return o
  }, [enRango])

  const totalRefs = porRef.length
  const totalGrupos = ranking.length
  const diasConActividad = porDia.size

  const hoy = new Date()

  // Datos del día abierto en el modal.
  const dayDetail = useMemo(() => {
    if (!dayDrill) return null
    const key = dayKey(dayDrill)
    const data = porDia.get(key)
    if (!data) return { date: dayDrill, total: 0, talleres: [], refs: [], origenes: { premuestra: 0, muestra: 0, produccion: 0, geodesica: 0 } }
    const talleres = [...data.talleres.entries()].map(([taller, unidades]) => ({ taller, unidades }))
      .sort((x, y) => y.unidades - x.unidades)
    const refMap2 = new Map()
    enRango.filter((e) => sameDay(e._d, dayDrill)).forEach((e) => {
      if (!refMap2.has(e.referencia)) refMap2.set(e.referencia, { unidades: 0, talleres: new Map(), origenes: new Set() })
      const x = refMap2.get(e.referencia)
      x.unidades += e.cantidad
      if (report === 'ensamble') x.talleres.set(e.taller, (x.talleres.get(e.taller) || 0) + e.cantidad)
      if (e.origen) x.origenes.add(e.origen)
    })
    const refs = [...refMap2.entries()].map(([referencia, x]) => ({
      referencia,
      unidades: x.unidades,
      talleres: [...x.talleres.entries()].map(([t, u]) => ({ taller: t, unidades: u }))
        .sort((a, b) => b.unidades - a.unidades),
      origenes: [...x.origenes],
    })).sort((a, b) => b.unidades - a.unidades)
    return { date: dayDrill, total: data.total, talleres, refs, origenes: data.origenes }
  }, [dayDrill, porDia, enRango, report])

  const rankingLabel = report === 'ensamble' ? 'Talleres del período' : 'Origen (cortes del período)'
  const refsLabel = (function () {
    if (grupoSel) {
      const lbl = report === 'ensamble' ? grupoSel : (ORIGENES[grupoSel] || grupoSel)
      return `Referencias · ${lbl}`
    }
    return `Referencias del período${report === 'ensamble' ? ' (todos los talleres)' : ''}`
  })()

  function rankingLabelOf(k) {
    if (report === 'ensamble') return k
    return ORIGENES[k] || k
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Seguimiento</h1>
          <p className="view-sub">
            Calendario de {report === 'ensamble' ? 'recepciones de ensamble' : 'cortes'} por día
            {report === 'ensamble' ? ', taller y referencia' : ', origen y referencia'}
          </p>
        </div>
        <div className="view-actions">
          <div className="opt-group">
            {REPORTS.map((r) => (
              <button key={r.v} type="button" className={'opt-btn' + (report === r.v ? ' on' : '')}
                onClick={() => setReport(r.v)}>{r.l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Controles de período + filtro por origen */}
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
        <div className="opt-group" style={{ marginLeft: 'auto' }}>
          <button type="button" className={'opt-btn' + (!origenSel ? ' on' : '')} onClick={() => setOrigenSel('')}>Todo</button>
          {ORIGEN_ORDER.map((o) => (
            <button key={o} type="button" className={'opt-btn' + (origenSel === o ? ' on' : '')}
              onClick={() => setOrigenSel(origenSel === o ? '' : o)}>{ORIGEN_ABBR[o]}</button>
          ))}
        </div>
      </div>

      {/* KPIs del período */}
      <div className="ens-kpis">
        <div className="ens-kpi"><span className="ens-kpi-num">{total}</span><span className="ens-kpi-lbl">unidades</span></div>
        <div className="ens-kpi"><span className="ens-kpi-num">{totalRefs}</span><span className="ens-kpi-lbl">referencias</span></div>
        <div className="ens-kpi">
          <span className="ens-kpi-num">{totalGrupos}</span>
          <span className="ens-kpi-lbl">{report === 'ensamble' ? 'talleres' : 'orígenes'}</span>
        </div>
        <div className="ens-kpi"><span className="ens-kpi-num">{diasConActividad}</span><span className="ens-kpi-lbl">días con actividad</span></div>
      </div>

      {/* Chips de origen siempre visibles (totales del período) */}
      <div className="seg-origenes">
        {ORIGEN_ORDER.map((o) => (
          <span key={o} className={'seg-orig-chip o-' + o}>
            <strong>{ORIGEN_ABBR[o]}</strong> {kpiOrigenes[o]}
          </span>
        ))}
      </div>

      {/* Calendario */}
      {mode === 'dia' ? (
        <DayCard date={range.start} data={porDia.get(dayKey(range.start))} isToday={sameDay(range.start, hoy)}
          onOpen={() => setDayDrill(range.start)} report={report} />
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
                  title={data ? `${data.total} unidades · ${data.refs.size} refs` : 'Sin actividad'}>
                  <div className="ens-cal-cell-date">{cell.date.getDate()}</div>
                  {data && (
                    <>
                      <div className="ens-cal-cell-units">{data.total} <span>u</span></div>
                      <div className="ens-cal-cell-meta">
                        <span>{data.refs.size} ref{data.refs.size === 1 ? '' : 's'}</span>
                        {report === 'ensamble' && data.talleres.size > 0 && (
                          <>
                            <span>·</span>
                            <span>{data.talleres.size} taller{data.talleres.size === 1 ? '' : 'es'}</span>
                          </>
                        )}
                      </div>
                      {/* Desglose por origen — siempre visible */}
                      <div className="ens-cal-origenes">
                        {ORIGEN_ORDER.map((o) => (
                          data.origenes[o] > 0 && (
                            <span key={o} className={'ens-orig-chip o-' + o} title={`${ORIGENES[o]}: ${data.origenes[o]}`}>
                              {ORIGEN_ABBR[o]} {data.origenes[o]}
                            </span>
                          )
                        ))}
                      </div>
                      {/* Talleres (solo en Ensamble) */}
                      {report === 'ensamble' && data.talleres.size > 0 && (
                        <ul className="ens-cal-cell-talleres-list">
                          {[...data.talleres.entries()]
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([t, u]) => (
                              <li key={t} title={`${t}: ${u} unidad${u === 1 ? '' : 'es'}`}>
                                <span className="ens-cal-taller-name">{shortTaller(t)}</span>
                                <span className="ens-cal-taller-units">{u}</span>
                              </li>
                            ))}
                          {data.talleres.size > 3 && (
                            <li className="more">+{data.talleres.size - 3} más</li>
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Resumen lateral */}
      {total === 0 ? (
        <div className="empty-state">
          <p>Sin {report === 'ensamble' ? 'recepciones de ensamble' : 'cortes'} en este período.</p>
          <p className="muted">Se basa en la fecha de "{report === 'ensamble' ? 'Entrega ensamble' : 'Entrega corte'}" del archivo importado.</p>
        </div>
      ) : (
        <div className="ens-cols">
          <div className="ens-card">
            <div className="ens-card-head">{rankingLabel} <span>{ranking.length}</span></div>
            <div className="ens-ranking">
              {ranking.map((t, i) => {
                const pct = maxRank ? Math.round((t.unidades / maxRank) * 100) : 0
                const active = grupoSel === t.k
                const cls = report === 'corte' ? ' rank-orig o-' + t.k : ''
                return (
                  <button key={t.k}
                    className={'ens-rank' + (active ? ' active' : '') + (i === 0 ? ' top' : '') + cls}
                    onClick={() => setGrupoSel(active ? '' : t.k)}
                    title="Filtrar referencias">
                    <span className="ens-rank-pos">{i + 1}</span>
                    <span className="ens-rank-body">
                      <span className="ens-rank-name">{rankingLabelOf(t.k)}</span>
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
              {refsLabel}
              {grupoSel && <button className="link-btn" onClick={() => setGrupoSel('')}>ver todos</button>}
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Foto</th><th>Referencia</th><th>Origen</th><th>Unidades</th></tr></thead>
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
                        <td>
                          {r.origenes.map((o) => (
                            <span key={o} className={'ens-orig-chip o-' + o}>{ORIGEN_ABBR[o]}</span>
                          ))}
                        </td>
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

      {/* Modal del día */}
      <Modal open={!!dayDrill} onClose={() => setDayDrill(null)} size="lg">
        {dayDetail && (
          <>
            <div className="modal-head">
              <h2 className="modal-title">
                {fmtDayLong(dayDetail.date)}
                <span className="muted" style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 500 }}> · {dayDetail.total} unidades</span>
              </h2>
              <button className="icon-btn" onClick={() => setDayDrill(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              <div className="seg-origenes" style={{ marginBottom: 12 }}>
                {ORIGEN_ORDER.map((o) => (
                  <span key={o} className={'seg-orig-chip o-' + o}>
                    <strong>{ORIGEN_ABBR[o]}</strong> {dayDetail.origenes[o] || 0}
                  </span>
                ))}
              </div>
              <div className={'ens-day-grid' + (report === 'corte' ? ' single' : '')}>
                {report === 'ensamble' && (
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
                )}
                <div className="ens-card">
                  <div className="ens-card-head">Referencias <span>{dayDetail.refs.length}</span></div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Foto</th>
                          <th>Referencia</th>
                          <th>Origen</th>
                          {report === 'ensamble' && <th>Taller</th>}
                          <th>Unidades</th>
                        </tr>
                      </thead>
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
                              <td>
                                {r.origenes.map((o) => (
                                  <span key={o} className={'ens-orig-chip o-' + o}>{ORIGEN_ABBR[o]}</span>
                                ))}
                              </td>
                              {report === 'ensamble' && (
                                <td className="muted">{r.talleres.map((t) => `${t.taller} (${t.unidades})`).join(' · ')}</td>
                              )}
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

function DayCard({ date, data, isToday, onOpen, report }) {
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
        <>
          <div className="ens-day-card-body">
            <div className="ens-day-stat"><span className="num">{data.total}</span><span className="lbl">unidades</span></div>
            <div className="ens-day-stat"><span className="num">{data.refs.size}</span><span className="lbl">referencias</span></div>
            {report === 'ensamble' && (
              <div className="ens-day-stat"><span className="num">{data.talleres.size}</span><span className="lbl">talleres</span></div>
            )}
          </div>
          <div className="seg-origenes" style={{ marginTop: 14 }}>
            {ORIGEN_ORDER.map((o) => (
              <span key={o} className={'seg-orig-chip o-' + o}>
                <strong>{ORIGEN_ABBR[o]}</strong> {data.origenes[o] || 0}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Sin recepciones en este día.</p>
      )}
    </div>
  )
}
