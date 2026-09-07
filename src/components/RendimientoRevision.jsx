import { useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { ETAPAS_REVISION, duracion, estaListo, fechaHoraProc, horaProc } from '../lib/procesos.js'
import { periodRange, periodLabel, shiftPeriod } from '../lib/periods.js'
import { formatDate } from '../lib/constants.js'

const MODOS = [
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'todo', label: 'Todo' },
]

const fecha = (ts) => formatDate(new Date(Number(ts) || 0))
const num = (n) => Math.round(n).toLocaleString('es-CO')
const dec1 = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 })

// Horas de reloj de una etapa cerrada, dichas como se dicen: "3 h 10 min",
// "45 min", "2 d 4 h".
function horasTxt(ms) {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`
  const d = Math.floor(h / 24)
  return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`
}

// Rendimiento de la revisión: cuánto se revisó en el período, en cuánto
// tiempo, quién lo hizo y cuánto se fue a arreglos. Las unidades por hora
// comparan parejo entre personas: no es lo mismo revisar 40 en dos horas
// que 140 en cinco.
export default function RendimientoRevision({ orders, procesos }) {
  const [modo, setModo] = useState('semana')
  const [ancla, setAncla] = useState(() => new Date())
  const [etapaF, setEtapaF] = useState('')
  const { sortKey, sortDir, toggle } = useSort('hasta', 'desc')

  const rango = useMemo(
    () => (modo === 'todo' ? null : periodRange(modo, ancla)),
    [modo, ancla],
  )

  const porOrden = useMemo(() => {
    const m = new Map()
    ;(orders || []).forEach((o) => m.set(String(o.orden), o))
    return m
  }, [orders])

  // Una fila por etapa cerrada en el período.
  const cerradas = useMemo(() => {
    const out = []
    Object.entries(procesos || {}).forEach(([orden, proc]) => {
      const o = porOrden.get(String(orden))
      ETAPAS_REVISION.forEach((e) => {
        const et = (proc || {})[e.key]
        if (!estaListo(et)) return
        if (rango && (et.hasta < rango.start.getTime() || et.hasta >= rango.end.getTime())) return
        const d = duracion(et)
        const st = (o && o.stages) || {}
        const recibido = Number((st.entregaEnsamble || st.ordenCorte || {}).cant) || 0
        const unid = e.key === 'arreglos' ? (Number(et.unid) || 0) : recibido
        const ms = Math.max(0, et.hasta - et.desde)
        out.push({
          id: orden + '-' + e.key,
          orden,
          etapa: e.key,
          etapaLabel: e.listo,
          referencia: (o && o.referencia) || `Orden ${orden}`,
          producto: (o && o.producto) || '',
          unid,
          quien: et.quien || '',
          dias: d.dias,
          ms,
          tiempo: e.key === 'arreglos' ? d.texto : horasTxt(ms),
          // Menos de cinco minutos no es una revisión medida: sin ritmo, para
          // que un cierre inmediato no dispare miles de unidades por hora.
          ritmo: unid && ms >= 5 * 60000 ? unid / (ms / 3600000) : 0,
          desde: et.desde,
          hasta: et.hasta,
          limite: e.limite,
          conArreglos: !!((proc || {}).arreglos && (proc || {}).arreglos.desde),
          unidArreglo: Number(((proc || {}).arreglos || {}).unid) || 0,
        })
      })
    })
    return out
  }, [procesos, porOrden, rango])

  // Quién revisa, comparado en unidades por hora.
  const personas = useMemo(() => {
    const m = new Map()
    cerradas.filter((c) => c.etapa === 'revision').forEach((c) => {
      const k = c.quien || '—'
      if (!m.has(k)) m.set(k, { quien: k, n: 0, unid: 0, ms: 0, conArreglos: 0, unidArreglo: 0 })
      const g = m.get(k)
      g.n += 1
      g.unid += c.unid
      g.ms += c.ms
      if (c.conArreglos) { g.conArreglos += 1; g.unidArreglo += c.unidArreglo }
    })
    return [...m.values()]
      .map((g) => ({
        ...g,
        promedio: g.n ? g.ms / g.n : 0,
        ritmo: g.ms ? g.unid / (g.ms / 3600000) : 0,
      }))
      .sort((a, b) => b.ritmo - a.ritmo)
  }, [cerradas])

  const tot = useMemo(() => {
    const rev = cerradas.filter((c) => c.etapa === 'revision')
    const arr = cerradas.filter((c) => c.etapa === 'arreglos')
    const ms = rev.reduce((n, c) => n + c.ms, 0)
    return {
      rev: rev.length,
      unid: rev.reduce((n, c) => n + c.unid, 0),
      promedio: rev.length ? ms / rev.length : 0,
      ritmo: ms ? rev.reduce((n, c) => n + c.unid, 0) / (ms / 3600000) : 0,
      arr: arr.length,
      unidArr: arr.reduce((n, c) => n + c.unid, 0),
      diasArr: arr.length ? arr.reduce((n, c) => n + Math.max(1, c.dias), 0) / arr.length : 0,
    }
  }, [cerradas])

  const rows = useMemo(() => {
    const list = etapaF ? cerradas.filter((c) => c.etapa === etapaF) : cerradas
    const accessors = {
      referencia: (c) => c.referencia,
      unid: (c) => c.unid,
      etapa: (c) => c.etapaLabel,
      quien: (c) => c.quien,
      tiempo: (c) => c.ms,
      ritmo: (c) => c.ritmo,
      hasta: (c) => c.hasta,
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [cerradas, etapaF, sortKey, sortDir])

  function bajarCsv() {
    const cab = ['Referencia', 'Orden', 'Producto', 'Unidades', 'Etapa', 'Quien', 'Tiempo',
      'Und por hora', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Horas']
    const linea = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const cuerpo = rows.map((c) => [
      c.referencia, c.orden, c.producto, c.unid, c.etapaLabel, c.quien || '',
      c.tiempo, dec1(c.ritmo),
      fecha(c.desde), horaProc(c.desde), fecha(c.hasta), horaProc(c.hasta),
      dec1(c.ms / 3600000),
    ].map(linea).join(';'))
    const csv = '﻿' + [cab.map(linea).join(';'), ...cuerpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rendimiento-revision-${modo === 'todo' ? 'todo' : periodLabel(modo, rango)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const thProps = { sortKey, sortDir, onSort: toggle }
  const pocos = personas.length > 0 && personas.some((p) => p.n < 5)

  return (
    <>
      <div className="rend-barra">
        <div className="dis-filtros">
          {MODOS.map((m) => (
            <button key={m.key} type="button"
              className={'proc-f-btn' + (modo === m.key ? ' on' : '')}
              onClick={() => { setModo(m.key); setAncla(new Date()) }}>
              {m.label}
            </button>
          ))}
        </div>
        {modo !== 'todo' && (
          <div className="rend-nav">
            <button type="button" className="icon-btn" aria-label="Anterior"
              onClick={() => setAncla((a) => shiftPeriod(modo, a, -1))}>‹</button>
            <span className="rend-periodo">{periodLabel(modo, rango)}</span>
            <button type="button" className="icon-btn" aria-label="Siguiente"
              onClick={() => setAncla((a) => shiftPeriod(modo, a, 1))}>›</button>
          </div>
        )}
        <div className="dis-filtros" style={{ marginLeft: 'auto' }}>
          {ETAPAS_REVISION.map((e) => {
            const n = cerradas.filter((c) => c.etapa === e.key).length
            const on = etapaF === e.key
            return (
              <button key={e.key} type="button" className={'proc-f-btn' + (on ? ' on' : '')}
                onClick={() => setEtapaF(on ? '' : e.key)}>
                {e.listo} <b>{n}</b>
              </button>
            )
          })}
          <button type="button" className="proc-f-btn" onClick={bajarCsv} disabled={!rows.length}>
            ↓ Excel
          </button>
        </div>
      </div>

      <div className="prog-kpis">
        <div className="prog-kpi">
          <span>Órdenes revisadas</span>
          <b>{tot.rev}</b>
          <em>{num(tot.unid)} unidades</em>
        </div>
        <div className="prog-kpi">
          <span>Tiempo promedio</span>
          <b>{tot.rev ? horasTxt(tot.promedio) : '—'}</b>
          <em>por orden revisada</em>
        </div>
        <div className="prog-kpi">
          <span>Unidades por hora</span>
          <b>{tot.rev ? dec1(tot.ritmo) : '—'}</b>
          <em>de revisión</em>
        </div>
        <div className={'prog-kpi' + (tot.arr ? ' alerta' : '')}>
          <span>Arreglos de vuelta</span>
          <b>{tot.arr}</b>
          <em>{tot.arr ? `${num(tot.unidArr)} unid · ${dec1(tot.diasArr)} d afuera en promedio` : 'ninguno en el período'}</em>
        </div>
      </div>

      {personas.length > 0 && (
        <div className="rend-card">
          <div className="rend-card-h">
            <h2>Quién revisa</h2>
            <span className="rend-nota">
              Las unidades por hora comparan parejo: no es lo mismo revisar 40 en dos horas que 140 en cinco
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="num">Órdenes</th>
                  <th className="num">Unidades</th>
                  <th className="num">Tiempo promedio</th>
                  <th className="num">Con arreglos</th>
                  <th className="num">Unid a arreglo</th>
                  <th>Unidades por hora</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => (
                  <tr key={p.quien}>
                    <td className="strong">{p.quien}</td>
                    <td className="num">{p.n}</td>
                    <td className="num">{num(p.unid)}</td>
                    <td className="num">{horasTxt(p.promedio)}</td>
                    <td className="num">{p.conArreglos || <span className="muted">—</span>}</td>
                    <td className="num">{p.unidArreglo || <span className="muted">—</span>}</td>
                    <td>
                      <div className="rend-fila">
                        <div className="rend-barra-bg">
                          <span style={{ width: Math.round(100 * p.ritmo / (personas[0].ritmo || 1)) + '%' }} />
                        </div>
                        <span className="rend-val">{dec1(p.ritmo)} u/h</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pocos && (
            <p className="rend-aviso">
              Con pocas revisiones cerradas los promedios se mueven mucho. Empiezan a
              significar algo desde unas 15 o 20 por persona.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No se cerró ninguna etapa {modo === 'todo' ? 'todavía' : 'en este período'}.</p>
          <p className="muted">
            Cada revisión o arreglo que se cierre en la tabla de órdenes entra aquí con su tiempo.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Unid" col="unid" className="num" {...thProps} />
                <SortTh label="Etapa" col="etapa" {...thProps} />
                <SortTh label="Quién" col="quien" {...thProps} />
                <SortTh label="Tardó" col="tiempo" className="num" {...thProps} />
                <SortTh label="Und/hora" col="ritmo" className="num" {...thProps} />
                <SortTh label="Fechas" col="hasta" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="strong">{c.referencia}</td>
                  <td className="num">{c.unid || <span className="muted">—</span>}</td>
                  <td><span className={'tag et-tag-' + c.etapa}>{c.etapaLabel}</span></td>
                  <td>{c.quien || <span className="muted">—</span>}</td>
                  <td className={'num strong' + (c.dias > c.limite ? ' prog-falta' : '')}>{c.tiempo}</td>
                  <td className="num">
                    {c.etapa === 'revision' && c.unid ? dec1(c.ritmo) : <span className="muted">—</span>}
                  </td>
                  <td className="muted rend-fechas"
                    title={`Empezó ${fechaHoraProc(c.desde)} · terminó ${fechaHoraProc(c.hasta)}`}>
                    {fecha(c.desde)} <b>{horaProc(c.desde)}</b>
                    {' → '}
                    {fecha(c.hasta)} <b>{horaProc(c.hasta)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
