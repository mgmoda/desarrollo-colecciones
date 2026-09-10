import { useMemo, useState } from 'react'
import { aIso, duracion, estaAndando, estaListo, horaProc } from '../lib/procesos.js'
import { formatDate } from '../lib/constants.js'

// Qué se tendió y qué se cortó un día: las referencias, sus cantidades y, en
// el corte, quién lo hizo. Se navega de a un día (hoy, ayer, cualquier fecha).
// Una etapa cuenta en el día en que se CERRÓ; las que siguen abiertas ese día
// se listan aparte como "en proceso" para que no se pierdan.

const num = (n) => Number(n || 0).toLocaleString('es-CO')
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function etiquetaDia(iso, hoy) {
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1)
  if (iso === hoy) return 'Hoy'
  if (iso === aIso(ayer.getTime())) return 'Ayer'
  const [a, m, d] = iso.split('-').map(Number)
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${formatDate(iso)}`
}

function mover(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  const x = new Date(a, m - 1, d + n)
  return aIso(x.getTime())
}

export default function DiaCorte({ orders, procesos, onVerCurva }) {
  const hoy = aIso(Date.now())
  const [dia, setDia] = useState(hoy)

  const porOrden = useMemo(() => {
    const m = new Map()
    ;(orders || []).forEach((o) => m.set(String(o.orden), o))
    return m
  }, [orders])

  const datos = useMemo(() => {
    const cant = (o) => Number(((o && o.stages && (o.stages.alistamiento || o.stages.ordenCorte)) || {}).cant) || 0
    const fila = (orden, et, etapa) => {
      const o = porOrden.get(String(orden)) || {}
      const d = duracion(et)
      return {
        orden, etapa,
        referencia: o.referencia || `Orden ${orden}`,
        producto: o.producto || '',
        cant: cant(o),
        quien: et.quien || '',
        externo: !!et.externo,
        desde: et.desde, hasta: et.hasta,
        tiempo: d ? d.texto : '',
        abierta: !et.hasta,
      }
    }
    const tendidas = []
    const cortadas = []
    const tendiendo = []
    const cortando = []
    Object.entries(procesos || {}).forEach(([orden, proc]) => {
      const db = (proc || {}).doblado
      const co = (proc || {}).corte
      if (estaListo(db) && aIso(db.hasta) === dia) tendidas.push(fila(orden, db, 'doblado'))
      else if (estaAndando(db) && aIso(db.desde) <= dia && dia === hoy) tendiendo.push(fila(orden, db, 'doblado'))
      if (estaListo(co) && aIso(co.hasta) === dia) cortadas.push(fila(orden, co, 'corte'))
      else if (estaAndando(co) && aIso(co.desde) <= dia && dia === hoy) cortando.push(fila(orden, co, 'corte'))
    })
    const porHora = (a, b) => (a.hasta || a.desde) - (b.hasta || b.desde)
    tendidas.sort(porHora); cortadas.sort(porHora)
    // Por cortador: cuántas órdenes y unidades cortó cada uno ese día.
    const cortadores = new Map()
    cortadas.forEach((f) => {
      const k = f.externo ? `${f.quien} (externo)` : (f.quien || 'Sin cortador')
      if (!cortadores.has(k)) cortadores.set(k, { quien: k, n: 0, unid: 0 })
      const g = cortadores.get(k); g.n += 1; g.unid += f.cant
    })
    return {
      tendidas, cortadas, tendiendo, cortando,
      unidTendidas: tendidas.reduce((n, f) => n + f.cant, 0),
      unidCortadas: cortadas.reduce((n, f) => n + f.cant, 0),
      cortadores: [...cortadores.values()].sort((a, b) => b.unid - a.unid),
    }
  }, [procesos, porOrden, dia, hoy])

  const Tabla = ({ filas, conQuien, vacio }) => (
    filas.length === 0 ? <div className="ct-empty">{vacio}</div> : (
      <table className="data-table dc-tabla">
        <thead>
          <tr>
            <th>Referencia</th><th>Producto</th><th># Orden</th><th className="num">Cant</th>
            {conQuien && <th>Cortador</th>}
            <th>Horas</th><th className="num">Tardó</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etapa + f.orden} className={onVerCurva ? 'row-click' : ''}
              onClick={() => onVerCurva && onVerCurva(porOrden.get(String(f.orden)))}>
              <td className="strong">{f.referencia}</td>
              <td className="muted">{f.producto}</td>
              <td className="mono">{f.orden}</td>
              <td className="num">{num(f.cant)}</td>
              {conQuien && <td>{f.externo ? <span className="tag tag-ext">{f.quien}</span> : (f.quien || <span className="muted">—</span>)}</td>}
              <td className="muted">
                {horaProc(f.desde)}{f.hasta ? ` → ${horaProc(f.hasta)}` : ' → en proceso'}
                {f.hasta && aIso(f.desde) !== aIso(f.hasta) ? ` (desde el ${formatDate(aIso(f.desde))})` : ''}
              </td>
              <td className="num strong">{f.tiempo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  )

  return (
    <div className="dc-wrap">
      <div className="rend-barra">
        <div className="rend-nav">
          <button type="button" className="icon-btn" aria-label="Día anterior" onClick={() => setDia(mover(dia, -1))}>‹</button>
          <span className="rend-periodo">{etiquetaDia(dia, hoy)}</span>
          <button type="button" className="icon-btn" aria-label="Día siguiente" disabled={dia >= hoy}
            onClick={() => setDia(mover(dia, 1))}>›</button>
        </div>
        <div className="dis-filtros">
          <button type="button" className={'proc-f-btn' + (dia === hoy ? ' on' : '')} onClick={() => setDia(hoy)}>Hoy</button>
          <button type="button" className={'proc-f-btn' + (dia === mover(hoy, -1) ? ' on' : '')} onClick={() => setDia(mover(hoy, -1))}>Ayer</button>
          <input type="date" className="input dc-fecha" value={dia} max={hoy} onChange={(e) => e.target.value && setDia(e.target.value)} />
        </div>
      </div>

      <div className="prog-kpis">
        <div className="prog-kpi"><span>Tendidas</span><b>{datos.tendidas.length}</b>
          <em>{num(datos.unidTendidas)} unidades{datos.tendiendo.length ? ` · ${datos.tendiendo.length} en proceso` : ''}</em></div>
        <div className="prog-kpi"><span>Cortadas</span><b>{datos.cortadas.length}</b>
          <em>{num(datos.unidCortadas)} unidades{datos.cortando.length ? ` · ${datos.cortando.length} en proceso` : ''}</em></div>
        {datos.cortadores.slice(0, 2).map((c) => (
          <div className="prog-kpi" key={c.quien}><span>{c.quien}</span><b>{num(c.unid)}</b>
            <em>{c.n} {c.n === 1 ? 'orden cortada' : 'órdenes cortadas'}</em></div>
        ))}
        {datos.cortadores.length === 0 && (
          <div className="prog-kpi"><span>Por cortador</span><b>—</b><em>nadie cerró un corte este día</em></div>
        )}
      </div>

      <div className="rend-card">
        <div className="rend-card-h"><h2>Tendidas {etiquetaDia(dia, hoy).toLowerCase()}</h2>
          <span className="rend-nota">Doblado cerrado ese día</span></div>
        <div className="table-wrap ct-plano">
          <Tabla filas={datos.tendidas} conQuien={false} vacio="No se cerró ningún doblado este día." />
        </div>
        {datos.tendiendo.length > 0 && (
          <>
            <div className="rend-card-h" style={{ marginTop: 12 }}><h2>Tendiendo ahora</h2></div>
            <div className="table-wrap ct-plano"><Tabla filas={datos.tendiendo} conQuien={false} vacio="" /></div>
          </>
        )}
      </div>

      <div className="rend-card">
        <div className="rend-card-h"><h2>Cortadas {etiquetaDia(dia, hoy).toLowerCase()}</h2>
          <span className="rend-nota">
            {datos.cortadores.length ? datos.cortadores.map((c) => `${c.quien} ${num(c.unid)}`).join(' · ') : 'Corte cerrado ese día'}
          </span></div>
        <div className="table-wrap ct-plano">
          <Tabla filas={datos.cortadas} conQuien vacio="No se cerró ningún corte este día." />
        </div>
        {datos.cortando.length > 0 && (
          <>
            <div className="rend-card-h" style={{ marginTop: 12 }}><h2>Cortando ahora</h2></div>
            <div className="table-wrap ct-plano"><Tabla filas={datos.cortando} conQuien vacio="" /></div>
          </>
        )}
      </div>
    </div>
  )
}
