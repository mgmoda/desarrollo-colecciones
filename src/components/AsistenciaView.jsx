import { Fragment, useEffect, useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import SortTh from './SortTh.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadAsistencia } from '../lib/db.js'
import { periodRange, periodLabel, shiftPeriod } from '../lib/periods.js'
import { isoLocal } from '../lib/dates.js'

// Asistencia del huellero, solo MARISET-CASANIA.
//
// El lector no distingue entrada de salida —todo lo graba igual—, así que la
// ENTRADA es la primera marcación del día y la salida la última, si está a
// media hora o más. Dos marcaciones seguidas cuentan como una. Eso lo resuelve
// el sync del servidor; aquí solo se muestra, por semana o por mes, y se
// refresca solo cuando llega una marcación nueva.

const MODOS = [{ key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }]
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const aMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}
// Se redondea el total ANTES de partirlo en horas y minutos: redondeando el
// resto salían horas como "06:60".
const deMin = (min) => {
  const t = Math.round(min)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// `cargar` solo se reemplaza en pruebas; en la app es la base de siempre.
export default function AsistenciaView({ stamp, cargar = dbLoadAsistencia }) {
  const [modo, setModo] = useState('semana')
  const [ancla, setAncla] = useState(() => new Date())
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState('')
  const { sortKey, sortDir, toggle } = useSort('nombre', 'asc')

  const rango = useMemo(() => periodRange(modo, ancla), [modo, ancla])
  const desde = isoLocal(rango.start)
  const hasta = useMemo(() => {
    const u = new Date(rango.end); u.setDate(u.getDate() - 1); return isoLocal(u)
  }, [rango])
  const hoy = isoLocal(new Date())

  // Se pide solo el período que se está mirando, y se vuelve a pedir cuando
  // el servidor avisa que entró una marcación (stamp).
  useEffect(() => {
    let vivo = true
    setCargando(true)
    cargar(desde, hasta)
      .then((l) => { if (vivo) setFilas(l) })
      .catch((e) => { console.error('Asistencia:', e); if (vivo) setFilas([]) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [desde, hasta, stamp])

  // Una fila por persona con sus días del período.
  const personas = useMemo(() => {
    const m = new Map()
    filas.forEach((f) => {
      const k = String(f.userid)
      if (!m.has(k)) m.set(k, { userid: f.userid, nombre: f.nombre, badge: f.badge, dias: new Map() })
      m.get(k).dias.set(f.fecha, f)
    })
    const term = q.trim().toLowerCase()
    let list = [...m.values()].map((p) => {
      const ds = [...p.dias.values()]
      const mins = ds.map((d) => aMin(d.entrada)).filter((v) => v != null)
      return {
        ...p,
        n: ds.length,
        promedio: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
        temprana: mins.length ? Math.min(...mins) : null,
        tarde: mins.length ? Math.max(...mins) : null,
        sinSalida: ds.filter((d) => !d.salida).length,
      }
    })
    if (term) list = list.filter((p) => (p.nombre + ' ' + p.badge).toLowerCase().includes(term))
    const acc = {
      nombre: (p) => p.nombre,
      n: (p) => p.n,
      promedio: (p) => p.promedio,
      temprana: (p) => p.temprana,
      tarde: (p) => p.tarde,
      sinSalida: (p) => p.sinSalida,
    }
    return sortRows(list, acc[sortKey], sortDir)
  }, [filas, q, sortKey, sortDir])

  const columnasSemana = useMemo(() => {
    const out = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(rango.start); d.setDate(d.getDate() + i)
      out.push({ iso: isoLocal(d), nombre: DIAS[i], num: d.getDate() })
    }
    return out
  }, [rango])

  const tot = useMemo(() => {
    const deHoy = filas.filter((f) => f.fecha === hoy)
    const minsHoy = deHoy.map((f) => aMin(f.entrada)).filter((v) => v != null)
    const todos = filas.map((f) => aMin(f.entrada)).filter((v) => v != null)
    return {
      personas: personas.length,
      dias: filas.length,
      promedio: todos.length ? todos.reduce((a, b) => a + b, 0) / todos.length : null,
      hoy: deHoy.length,
      hoyPrimera: minsHoy.length ? Math.min(...minsHoy) : null,
      hoyUltima: minsHoy.length ? Math.max(...minsHoy) : null,
      incluyeHoy: hoy >= desde && hoy <= hasta,
      sinSalida: filas.filter((f) => !f.salida).length,
    }
  }, [filas, personas, hoy, desde, hasta])

  function bajarCsv() {
    const linea = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const cab = ['Fecha', 'Nombre', 'Carne', 'Entrada', 'Salida', 'Marcaciones']
    const cuerpo = [...filas]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre))
      .map((f) => [f.fecha, f.nombre, f.badge, f.entrada, f.salida || '', (f.marcas || []).join(' ')].map(linea).join(';'))
    const csv = '﻿' + [cab.map(linea).join(';'), ...cuerpo].join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `asistencia-${periodLabel(modo, rango).replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const thProps = { sortKey, sortDir, onSort: toggle }
  const hora = (min) => (min == null ? '—' : deMin(min))

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Asistencia</h1>
          <p className="view-sub">
            MARISET-CASANIA · la entrada es la primera marcación del día · {periodLabel(modo, rango)}
          </p>
        </div>
        <div className="view-actions">
          <div className="dis-filtros">
            {MODOS.map((m) => (
              <button key={m.key} type="button" className={'proc-f-btn' + (modo === m.key ? ' on' : '')}
                onClick={() => { setModo(m.key); setAncla(new Date()) }}>{m.label}</button>
            ))}
          </div>
          <div className="rend-nav">
            <button type="button" className="icon-btn" aria-label="Anterior"
              onClick={() => setAncla((a) => shiftPeriod(modo, a, -1))}>‹</button>
            <span className="rend-periodo">{periodLabel(modo, rango)}</span>
            <button type="button" className="icon-btn" aria-label="Siguiente"
              onClick={() => setAncla((a) => shiftPeriod(modo, a, 1))}>›</button>
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar persona…" />
          <button type="button" className="proc-f-btn" onClick={bajarCsv} disabled={!filas.length}>↓ Excel</button>
        </div>
      </div>

      <div className="prog-kpis">
        {tot.incluyeHoy ? (
          <div className="prog-kpi">
            <span>Hoy llegaron</span><b>{tot.hoy}</b>
            <em>{tot.hoy ? `primera ${hora(tot.hoyPrimera)} · última ${hora(tot.hoyUltima)}` : 'todavía nadie ha marcado'}</em>
          </div>
        ) : (
          <div className="prog-kpi"><span>Persona-días</span><b>{tot.dias}</b><em>en el período</em></div>
        )}
        <div className="prog-kpi"><span>Personas</span><b>{tot.personas}</b><em>que marcaron en el período</em></div>
        <div className="prog-kpi"><span>Entrada promedio</span><b>{hora(tot.promedio)}</b><em>de todas las marcaciones</em></div>
        <div className={'prog-kpi' + (tot.sinSalida ? ' alerta' : '')}>
          <span>Sin salida</span><b>{tot.sinSalida}</b>
          <em>{tot.sinSalida ? 'marcaron una sola vez ese día' : 'todos marcaron entrada y salida'}</em>
        </div>
      </div>

      {cargando && filas.length === 0 ? (
        <div className="empty-state"><p className="muted">Cargando…</p></div>
      ) : personas.length === 0 ? (
        <div className="empty-state">
          <p>Nadie marcó en {periodLabel(modo, rango)}.</p>
          <p className="muted">Las marcaciones llegan solas del huellero; solo se guardan los últimos dos meses.</p>
        </div>
      ) : modo === 'semana' ? (
        <div className="table-wrap">
          <table className="data-table asis-tabla">
            <thead>
              <tr>
                <SortTh label="Persona" col="nombre" {...thProps} />
                {columnasSemana.map((c) => (
                  <th key={c.iso} className={'num asis-dia' + (c.iso === hoy ? ' hoy' : '')}>
                    {c.nombre} <b>{c.num}</b>
                  </th>
                ))}
                <SortTh label="Días" col="n" className="num" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <tr key={p.userid}>
                  <td className="strong">{p.nombre}<span className="asis-carne">{p.badge}</span></td>
                  {columnasSemana.map((c) => {
                    const d = p.dias.get(c.iso)
                    return (
                      <td key={c.iso} className={'num asis-celda' + (c.iso === hoy ? ' hoy' : '')}
                        title={d ? `${d.n} ${d.n === 1 ? 'marcación' : 'marcaciones'}: ${(d.marcas || []).join(', ')}` : ''}>
                        {d ? (
                          <>
                            <b className="asis-ent">{d.entrada}</b>
                            <span className="asis-sal">{d.salida || '·'}</span>
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                    )
                  })}
                  <td className="num">{p.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <SortTh label="Persona" col="nombre" {...thProps} />
                <SortTh label="Días" col="n" className="num" {...thProps} />
                <SortTh label="Entrada promedio" col="promedio" className="num" {...thProps} />
                <SortTh label="Más temprano" col="temprana" className="num" {...thProps} />
                <SortTh label="Más tarde" col="tarde" className="num" {...thProps} />
                <SortTh label="Sin salida" col="sinSalida" className="num" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => {
                const on = abierta === String(p.userid)
                const dias = [...p.dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
                return (
                  <Fragment key={p.userid}>
                    <tr className={'tela-fila row-click' + (on ? ' abierta' : '')}
                      onClick={() => setAbierta(on ? '' : String(p.userid))}
                      title={on ? 'Cerrar' : 'Ver sus días'}>
                      <td className="tela-flecha">{on ? '▾' : '▸'}</td>
                      <td className="strong">{p.nombre}<span className="asis-carne">{p.badge}</span></td>
                      <td className="num">{p.n}</td>
                      <td className="num strong">{hora(p.promedio)}</td>
                      <td className="num">{hora(p.temprana)}</td>
                      <td className="num">{hora(p.tarde)}</td>
                      <td className={'num' + (p.sinSalida ? ' muted' : '')}>{p.sinSalida || '—'}</td>
                    </tr>
                    {on && (
                      <tr className="tela-detalle">
                        <td colSpan={7}>
                          <table className="data-table">
                            <thead>
                              <tr><th>Fecha</th><th className="num">Entrada</th><th className="num">Salida</th><th>Marcaciones</th></tr>
                            </thead>
                            <tbody>
                              {dias.map((d) => (
                                <tr key={d.fecha}>
                                  <td>{DIAS[(new Date(d.fecha + 'T12:00:00').getDay() + 6) % 7]} {dm(d.fecha)}</td>
                                  <td className="num strong">{d.entrada}</td>
                                  <td className="num">{d.salida || <span className="muted">—</span>}</td>
                                  <td className="muted">{(d.marcas || []).join(' · ')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
