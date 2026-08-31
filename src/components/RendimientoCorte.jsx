import { useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { ETAPAS_PROC, duracion, estaListo, fechaHoraProc, horaProc } from '../lib/procesos.js'
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

// Unidades por día de una etapa cerrada. Un trabajo que sale el mismo día
// cuenta como un día: decir que hizo 143 unidades en un día se entiende, y
// repartirlo en fracciones de día infla el número sin que signifique más.
const porDia = (unid, dias) => unid / Math.max(1, dias)

// Rendimiento de doblado y corte: qué se cerró en el período, cuánto tardó
// cada uno, y cuál de los dos cortadores rinde más.
//
// El promedio de días solo engaña —no es lo mismo cortar 59 en un día que 193
// en cuatro—, así que la comparación se hace en unidades por día.
export default function RendimientoCorte({ orders, procesos }) {
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

  // Una fila por etapa cerrada, con lo que hay que saber de ella.
  const cerradas = useMemo(() => {
    const out = []
    Object.entries(procesos || {}).forEach(([orden, proc]) => {
      const o = porOrden.get(String(orden))
      ETAPAS_PROC.forEach((e) => {
        const et = (proc || {})[e.key]
        if (!estaListo(et)) return
        if (rango && (et.hasta < rango.start.getTime() || et.hasta >= rango.end.getTime())) return
        const d = duracion(et)
        const unid = Number(((o && o.stages && o.stages.ordenCorte) || {}).cant) || 0
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
          tiempo: d.texto,
          ritmo: unid ? porDia(unid, d.dias) : 0,
          desde: et.desde,
          hasta: et.hasta,
          limite: e.limite,
        })
      })
    })
    return out
  }, [procesos, porOrden, rango])

  // Los dos cortadores, comparados en lo que de verdad se puede comparar.
  const cortadores = useMemo(() => {
    const m = new Map()
    cerradas.filter((c) => c.etapa === 'corte' && c.quien).forEach((c) => {
      if (!m.has(c.quien)) m.set(c.quien, { quien: c.quien, cortes: 0, unid: 0, dias: 0 })
      const g = m.get(c.quien)
      g.cortes += 1
      g.unid += c.unid
      g.dias += Math.max(1, c.dias)
    })
    return [...m.values()]
      .map((g) => ({
        ...g,
        promedio: g.dias / g.cortes,
        ritmo: g.dias ? g.unid / g.dias : 0,
        lote: g.cortes ? g.unid / g.cortes : 0,
      }))
      .sort((a, b) => b.ritmo - a.ritmo)
  }, [cerradas])

  const tot = useMemo(() => {
    const de = (k) => cerradas.filter((c) => c.etapa === k)
    const prom = (l) => (l.length ? l.reduce((n, c) => n + Math.max(1, c.dias), 0) / l.length : 0)
    return {
      doblado: { n: de('doblado').length, prom: prom(de('doblado')) },
      corte: { n: de('corte').length, prom: prom(de('corte')) },
      unid: de('corte').reduce((n, c) => n + c.unid, 0),
    }
  }, [cerradas])

  const rows = useMemo(() => {
    const list = etapaF ? cerradas.filter((c) => c.etapa === etapaF) : cerradas
    const accessors = {
      referencia: (c) => c.referencia,
      unid: (c) => c.unid,
      etapa: (c) => c.etapaLabel,
      quien: (c) => c.quien,
      dias: (c) => c.dias,
      ritmo: (c) => c.ritmo,
      hasta: (c) => c.hasta,
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [cerradas, etapaF, sortKey, sortDir])

  // El mejor solo se corona cuando hay con qué: con dos o tres cierres el
  // número se mueve demasiado para llamarlo rendimiento.
  const mejor = cortadores.length > 1 && cortadores[0].cortes >= 3 && cortadores[1].cortes >= 3
    ? cortadores[0]
    : null
  const pocos = cortadores.length > 0 && cortadores.some((c) => c.cortes < 5)

  function bajarCsv() {
    const cab = ['Referencia', 'Orden', 'Producto', 'Cantidad', 'Etapa', 'Quien', 'Dias',
      'Und por dia', 'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Horas']
    const linea = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const cuerpo = rows.map((c) => [
      c.referencia, c.orden, c.producto, c.unid, c.etapaLabel, c.quien || '',
      Math.max(1, c.dias), Math.round(c.ritmo),
      fecha(c.desde), horaProc(c.desde), fecha(c.hasta), horaProc(c.hasta),
      Math.round((c.hasta - c.desde) / 3600000),
    ].map(linea).join(';'))
    const csv = '﻿' + [cab.map(linea).join(';'), ...cuerpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rendimiento-corte-${modo === 'todo' ? 'todo' : periodLabel(modo, rango)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const thProps = { sortKey, sortDir, onSort: toggle }

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
          {ETAPAS_PROC.map((e) => {
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
          <span>Doblado · promedio</span>
          <b>{tot.doblado.n ? dec1(tot.doblado.prom) + ' d' : '—'}</b>
          <em>{tot.doblado.n} {tot.doblado.n === 1 ? 'cerrado' : 'cerrados'}</em>
        </div>
        <div className="prog-kpi">
          <span>Corte · promedio</span>
          <b>{tot.corte.n ? dec1(tot.corte.prom) + ' d' : '—'}</b>
          <em>{tot.corte.n} {tot.corte.n === 1 ? 'cerrado' : 'cerrados'}</em>
        </div>
        <div className="prog-kpi">
          <span>Unidades cortadas</span>
          <b>{num(tot.unid)}</b>
          <em>en el período</em>
        </div>
        <div className="prog-kpi">
          <span>Etapas cerradas</span>
          <b>{cerradas.length}</b>
          <em>doblado y corte</em>
        </div>
      </div>

      {cortadores.length > 0 && (
        <div className="rend-card">
          <div className="rend-card-h">
            <h2>Cortadores</h2>
            <span className="rend-nota">
              El ritmo compara parejo: no es lo mismo cortar 59 en un día que 193 en cuatro
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cortador</th>
                  <th className="num">Cortes</th>
                  <th className="num">Unidades</th>
                  <th className="num">Lote promedio</th>
                  <th className="num">Días promedio</th>
                  <th>Ritmo</th>
                </tr>
              </thead>
              <tbody>
                {cortadores.map((c) => (
                  <tr key={c.quien}>
                    <td className="strong">
                      {c.quien}
                      {mejor && mejor.quien === c.quien && (
                        <span className="rend-mejor" title="Más unidades por día en este período">
                          Mejor ritmo
                        </span>
                      )}
                    </td>
                    <td className="num">{c.cortes}</td>
                    <td className="num">{num(c.unid)}</td>
                    <td className="num muted">{num(c.lote)}</td>
                    <td className="num">{dec1(c.promedio)} d</td>
                    <td>
                      <div className="rend-fila">
                        <div className="rend-barra-bg">
                          <span style={{ width: Math.round(100 * c.ritmo / (cortadores[0].ritmo || 1)) + '%' }} />
                        </div>
                        <span className="rend-val">{num(c.ritmo)} u/d</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pocos && (
            <p className="rend-aviso">
              Con pocos cortes cerrados los promedios se mueven mucho. Empiezan a
              significar algo desde unos 15 o 20 por persona.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No se cerró ninguna etapa {modo === 'todo' ? 'todavía' : 'en este período'}.</p>
          <p className="muted">
            Cada doblado o corte que se cierre en la tabla de órdenes entra aquí con su tiempo.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Cant" col="unid" className="num" {...thProps} />
                <SortTh label="Etapa" col="etapa" {...thProps} />
                <SortTh label="Quién" col="quien" {...thProps} />
                <SortTh label="Tardó" col="dias" className="num" {...thProps} />
                <SortTh label="Und/día" col="ritmo" className="num" {...thProps} />
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
                  <td className="num">{c.unid ? num(c.ritmo) : <span className="muted">—</span>}</td>
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
