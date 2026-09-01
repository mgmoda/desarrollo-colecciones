import { Fragment, useEffect, useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import SortTh from './SortTh.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadAsistencia } from '../lib/db.js'
import { periodRange, periodLabel, shiftPeriod } from '../lib/periods.js'
import { isoLocal } from '../lib/dates.js'

// Asistencia del huellero, solo MARISET-CASANIA. Sirve para dos cosas: ver
// quién llega tarde y sacar la nómina. Por eso cada día trae entrada, salida,
// tiempo en planta y minutos de tardanza, y cada persona sus totales.
//
// El lector no distingue entrada de salida —todo lo graba igual—, así que la
// ENTRADA es la primera marcación del día y la salida la última, si está a
// media hora o más. Dos marcaciones seguidas cuentan como una. Eso lo resuelve
// el sync del servidor, que junta lo que el programa ya descargó con lo que
// lee directo del lector cada 10 minutos.

// El turno de producción tal como está en el huellero (turno "7am-4.45pm").
// A la gente de MARISET-CASANIA la tienen en un horario vacío, así que el
// ZKTeco no les calcula tardanza: se calcula aquí con este turno.
const TURNO = { entrada: '07:00', salida: '16:45', tolerancia: 2, sabado: { entrada: '07:00', salida: '11:30' } }

const MODOS = [{ key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }]
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const aMin = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}
// Se redondea el total ANTES de partirlo: redondeando el resto salían "06:60".
const deMin = (min) => {
  const t = Math.round(min)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
const horasTxt = (min) => {
  if (min == null) return '—'
  const t = Math.round(min)
  return `${Math.floor(t / 60)}h ${String(t % 60).padStart(2, '0')}m`
}
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const diaSemana = (iso) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7
const num = (n) => Math.round(n).toLocaleString('es-CO')

// Lo que se deriva de un día: minutos en planta y minutos de tardanza contra
// el turno. El domingo no hay turno, así que no hay tardanza.
function calcularDia(f) {
  const e = aMin(f.entrada)
  const s = aMin(f.salida)
  const ds = diaSemana(f.fecha)
  const turnoEntrada = ds === 5 ? TURNO.sabado.entrada : TURNO.entrada
  const limite = aMin(turnoEntrada) + TURNO.tolerancia
  const tarde = ds === 6 || e == null || e <= limite ? 0 : e - aMin(turnoEntrada)
  return { ...f, min: e, horas: e != null && s != null && s > e ? s - e : null, tarde }
}

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
      .then((l) => { if (vivo) setFilas(l.map(calcularDia)) })
      .catch((e) => { console.error('Asistencia:', e); if (vivo) setFilas([]) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [desde, hasta, stamp])

  // Una fila por persona con sus días y sus totales del período.
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
      const mins = ds.map((d) => d.min).filter((v) => v != null)
      const conHoras = ds.filter((d) => d.horas != null)
      return {
        ...p,
        n: ds.length,
        horas: conHoras.reduce((a, d) => a + d.horas, 0),
        diasConHoras: conHoras.length,
        promedio: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
        tardes: ds.filter((d) => d.tarde > 0).length,
        minTarde: ds.reduce((a, d) => a + d.tarde, 0),
        sinSalida: ds.filter((d) => !d.salida).length,
      }
    })
    if (term) list = list.filter((p) => (p.nombre + ' ' + p.badge).toLowerCase().includes(term))
    const acc = {
      nombre: (p) => p.nombre,
      n: (p) => p.n,
      horas: (p) => p.horas,
      promedio: (p) => p.promedio,
      tardes: (p) => p.tardes,
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
    const conHoras = filas.filter((f) => f.horas != null)
    return {
      incluyeHoy: hoy >= desde && hoy <= hasta,
      hoy: deHoy.length,
      hoyTarde: deHoy.filter((f) => f.tarde > 0).length,
      horas: conHoras.reduce((a, f) => a + f.horas, 0),
      tardes: filas.filter((f) => f.tarde > 0).length,
      sinSalida: filas.filter((f) => !f.salida).length,
      personas: personas.length,
    }
  }, [filas, personas, hoy, desde, hasta])

  function bajarCsv() {
    const linea = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const cab = ['Fecha', 'Dia', 'Nombre', 'Carne', 'Entrada', 'Salida', 'Horas en planta', 'Minutos tarde', 'Marcaciones']
    const cuerpo = [...filas]
      .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha))
      .map((f) => [
        f.fecha, DIAS[diaSemana(f.fecha)], f.nombre, f.badge, f.entrada, f.salida || '',
        f.horas == null ? '' : (f.horas / 60).toFixed(2).replace('.', ','),
        f.tarde || 0, (f.marcas || []).join(' '),
      ].map(linea).join(';'))
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
  const actualizado = stamp ? new Date(stamp) : null

  const Entrada = ({ d }) => (
    <span className={'asis-ent' + (d.tarde > 0 ? ' tarde' : '')}
      title={d.tarde > 0 ? `Llegó ${d.tarde} min después de las ${TURNO.entrada}` : `Turno ${TURNO.entrada}`}>
      {d.entrada}{d.tarde > 0 && <small>+{d.tarde}</small>}
    </span>
  )

  const Detalle = ({ dias }) => (
    <table className="data-table">
      <thead>
        <tr>
          <th>Fecha</th><th className="num">Entrada</th><th className="num">Salida</th>
          <th className="num">En planta</th><th className="num">Tarde</th><th>Marcaciones</th>
        </tr>
      </thead>
      <tbody>
        {dias.map((d) => (
          <tr key={d.fecha}>
            <td>{DIAS[diaSemana(d.fecha)]} {dm(d.fecha)}</td>
            <td className="num"><Entrada d={d} /></td>
            <td className="num">{d.salida || <span className="muted">—</span>}</td>
            <td className="num strong">{horasTxt(d.horas)}</td>
            <td className={'num' + (d.tarde ? ' prog-falta strong' : ' muted')}>{d.tarde ? `${d.tarde} min` : '—'}</td>
            <td className="muted">{(d.marcas || []).join(' · ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Asistencia</h1>
          <p className="view-sub">
            MARISET-CASANIA · turno {TURNO.entrada}–{TURNO.salida}, tolerancia {TURNO.tolerancia} min
            {actualizado && !isNaN(actualizado) && (
              <> · lector leído a las {String(actualizado.getHours()).padStart(2, '0')}:{String(actualizado.getMinutes()).padStart(2, '0')}</>
            )}
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
          <div className={'prog-kpi' + (tot.hoyTarde ? ' alerta' : '')}>
            <span>Hoy</span><b>{tot.hoy}</b>
            <em>{tot.hoy ? `${tot.hoy === 1 ? 'llegó' : 'llegaron'} · ${tot.hoyTarde} tarde` : 'todavía nadie ha marcado'}</em>
          </div>
        ) : (
          <div className="prog-kpi"><span>Personas</span><b>{tot.personas}</b><em>marcaron en el período</em></div>
        )}
        <div className="prog-kpi"><span>Horas en planta</span><b>{horasTxt(tot.horas)}</b><em>suma del período</em></div>
        <div className={'prog-kpi' + (tot.tardes ? ' alerta' : '')}>
          <span>Llegadas tarde</span><b>{tot.tardes}</b>
          <em>después de las {deMin(aMin(TURNO.entrada) + TURNO.tolerancia)}</em>
        </div>
        <div className="prog-kpi">
          <span>Sin salida</span><b>{tot.sinSalida}</b>
          <em>{tot.sinSalida ? 'marcaron una sola vez ese día' : 'todos con entrada y salida'}</em>
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
                <SortTh label="Horas" col="horas" className="num" {...thProps} />
                <SortTh label="Tarde" col="tardes" className="num" {...thProps} />
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
                            <Entrada d={d} />
                            <span className="asis-sal">{d.salida || '·'}</span>
                            <span className="asis-h">{d.horas != null ? horasTxt(d.horas) : ''}</span>
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                    )
                  })}
                  <td className="num strong">{horasTxt(p.horas)}</td>
                  <td className={'num' + (p.tardes ? ' prog-falta strong' : ' muted')}>{p.tardes || '—'}</td>
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
                <SortTh label="Horas en planta" col="horas" className="num" {...thProps} />
                <SortTh label="Entrada promedio" col="promedio" className="num" {...thProps} />
                <SortTh label="Llegadas tarde" col="tardes" className="num" {...thProps} />
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
                      <td className="num strong" title={p.diasConHoras < p.n ? `Sobre ${p.diasConHoras} días con salida` : ''}>
                        {horasTxt(p.horas)}
                      </td>
                      <td className="num">{hora(p.promedio)}</td>
                      <td className={'num' + (p.tardes ? ' prog-falta strong' : ' muted')}>
                        {p.tardes ? `${p.tardes} (${p.minTarde} min)` : '—'}
                      </td>
                      <td className={'num' + (p.sinSalida ? '' : ' muted')}>{p.sinSalida || '—'}</td>
                    </tr>
                    {on && (
                      <tr className="tela-detalle"><td colSpan={7}><Detalle dias={dias} /></td></tr>
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
