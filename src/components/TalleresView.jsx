import { Fragment, useEffect, useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import { dbLoadTalleresHist } from '../lib/db.js'
import { fotoFactoryUrl } from '../lib/supabase.js'
import { formatDate } from '../lib/constants.js'
import { diasEntre } from '../lib/dates.js'

// Directorio de talleres por temporada: a cuáles talleres buenos no les he
// mandado nada esta temporada. Una fila por taller, una columna por cada una
// de las últimas cuatro temporadas con las unidades que ensambló, y al tocar
// una cifra se despliega debajo lo que hizo, con foto.
//
// Las temporadas son las de Cartera: Madres (enero–mayo) y Diciembre
// (junio–diciembre). Solo entran talleres con trabajo en los últimos dos años.

const MESES_2A = 24
// Una salida de 15 unidades o menos es una muestra, no trabajo de taller: no
// cuenta ni en las cifras ni en el detalle.
const MIN_UNID = 16

function temporadaDe(iso) {
  const [a, m] = String(iso || '').split('-').map(Number)
  if (!a || !m) return ''
  return m <= 5 ? `M${a}` : `D${a}`
}
const etiqueta = (key) => (key.startsWith('M') ? `Madres ${key.slice(1)}` : `Diciembre ${key.slice(1)}`)
const rango = (key) => (key.startsWith('M') ? 'ene–may' : 'jun–dic')

// Todas las temporadas desde Madres 2023 hasta la actual, la actual primero.
// Se ven de a cuatro y con las flechas se corre la ventana hacia atrás.
const DESDE_ANIO = 2023
const VENTANA = 4
function todasTemporadas(hoy) {
  const out = []
  let a = hoy.getFullYear()
  let madres = hoy.getMonth() + 1 <= 5
  while (a >= DESDE_ANIO) {
    out.push(madres ? `M${a}` : `D${a}`)
    if (madres) { a -= 1; madres = false } else { madres = true }
  }
  return out
}

// Tipo de prenda: por la letra del código interno (MG-B = blusa…) y, si no,
// por la palabra que traiga el nombre.
const TIPOS = [
  ['B', /BLUSA/, 'Blusas'], ['V', /VESTIDO/, 'Vestidos'], ['P', /PANTAL/, 'Pantalones'],
  ['F', /FALDA/, 'Faldas'], ['S', /SHORT/, 'Shorts'], ['E', /ENTERIZO/, 'Enterizos'],
  ['J', /CHAQUETA|JACKET/, 'Chaquetas'], ['T', /\bTOP\b/, 'Tops'], ['C', /CONJUNTO/, 'Conjuntos'],
]
function tipoDe(fila) {
  const n = String(fila.nombre || '').toUpperCase()
  const m = n.match(/^MG-([A-Z])/)
  if (m) { const t = TIPOS.find((x) => x[0] === m[1]); if (t) return t[2] }
  const r = String(fila.ref || '').toUpperCase()
  const t = TIPOS.find((x) => x[1].test(n) || x[1].test(r))
  // Los códigos viejos o de terceros (5046, S06202…) no dicen qué prenda son:
  // mejor nada que un "Otras" que no aporta.
  return t ? t[2] : ''
}

const num = (n) => Number(n || 0).toLocaleString('es-CO')

export default function TalleresView({ onViewImage, cargar = dbLoadTalleresHist }) {
  const [hist, setHist] = useState(null)
  const [error, setError] = useState('')
  // Abre en "Todos" para que se vea de una la temporada en curso; el filtro
  // "Sin enviar" está a un clic.
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(null) // { taller, temporada }
  const [desdeTemp, setDesdeTemp] = useState(0) // dónde empieza la ventana de temporadas

  useEffect(() => {
    let vivo = true
    cargar()
      .then((h) => { if (vivo) setHist((h || []).filter((f) => (Number(f.cant) || 0) >= MIN_UNID)) })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [cargar])

  const hoy = useMemo(() => new Date(), [])
  const todas = useMemo(() => todasTemporadas(hoy), [hoy])
  const actual = todas[0]
  const temporadas = todas.slice(desdeTemp, desdeTemp + VENTANA)
  const puedeAtras = desdeTemp + VENTANA < todas.length
  const puedeAdelante = desdeTemp > 0
  const desde2a = useMemo(() => {
    const d = new Date(hoy); d.setMonth(d.getMonth() - MESES_2A)
    return d.toISOString().slice(0, 10)
  }, [hoy])

  const talleres = useMemo(() => {
    const m = new Map()
    ;(hist || []).forEach((f) => {
      if (!m.has(f.taller)) m.set(f.taller, { taller: f.taller, porTemp: {}, total2a: 0, tipos: {}, ultima: '' })
      const t = m.get(f.taller)
      const k = temporadaDe(f.fecha)
      const cant = Number(f.cant) || 0
      t.porTemp[k] = (t.porTemp[k] || 0) + cant
      if (f.fecha >= desde2a) {
        t.total2a += cant
        const tipo = tipoDe(f)
        if (tipo) t.tipos[tipo] = (t.tipos[tipo] || 0) + cant
      }
      if (f.fecha > t.ultima) t.ultima = f.fecha
    })
    return [...m.values()]
      .filter((t) => t.total2a > 0)
      .map((t) => ({
        ...t,
        prendas: Object.entries(t.tipos).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k).join(' · '),
        enActual: (t.porTemp[actual] || 0) > 0,
      }))
      .sort((a, b) => b.total2a - a.total2a)
  }, [hist, desde2a, actual])

  const conteos = useMemo(() => ({
    sin: talleres.filter((t) => !t.enActual).length,
    con: talleres.filter((t) => t.enActual).length,
    todos: talleres.length,
  }), [talleres])

  const filas = useMemo(() => {
    let l = talleres
    if (filtro === 'sin') l = l.filter((t) => !t.enActual)
    if (filtro === 'con') l = l.filter((t) => t.enActual)
    const term = q.trim().toLowerCase()
    if (term) l = l.filter((t) => t.taller.toLowerCase().includes(term) || t.prendas.toLowerCase().includes(term))
    return l
  }, [talleres, filtro, q])

  // Lo que hizo el taller abierto en la temporada abierta, más reciente primero.
  const detalle = useMemo(() => {
    if (!abierta || !hist) return null
    const lista = hist
      .filter((f) => f.taller === abierta.taller && temporadaDe(f.fecha) === abierta.temporada)
      .map((f) => ({ ...f, dias: f.entrega ? diasEntre(f.fecha, f.entrega) : null }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    const unid = lista.reduce((n, f) => n + (Number(f.cant) || 0), 0)
    const conDias = lista.filter((f) => f.dias != null && f.dias >= 0)
    const prom = conDias.length ? Math.round(conDias.reduce((n, f) => n + f.dias, 0) / conDias.length) : null
    return { lista, unid, prom, ordenes: new Set(lista.map((f) => f.orden)).size }
  }, [abierta, hist])

  function toggle(taller, temporada) {
    setAbierta((a) => (a && a.taller === taller && a.temporada === temporada ? null : { taller, temporada }))
  }

  if (error) return <div className="empty-state"><p>No se pudo cargar el historial de talleres.</p><p className="muted">{error}</p></div>
  if (!hist) return <div className="empty-state"><p>Cargando el historial de talleres…</p></div>
  if (!hist.length) {
    return (
      <div className="empty-state">
        <p>Todavía no hay historial de talleres.</p>
        <p className="muted">El servidor lo trae de Factory; aparece en la siguiente sincronización.</p>
      </div>
    )
  }

  const FILTROS = [
    { key: 'sin', label: 'Sin enviar esta temporada', n: conteos.sin },
    { key: 'con', label: 'Con trabajo', n: conteos.con },
    { key: 'todos', label: 'Todos (2 años)', n: conteos.todos },
  ]

  return (
    <>
      <div className="dis-filtros tal-filtros">
        {FILTROS.map((f) => (
          <button key={f.key} type="button" className={'proc-f-btn' + (filtro === f.key ? ' on' : '')}
            onClick={() => setFiltro(f.key)}>
            {f.label} <b>{f.n}</b>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <div className="rend-nav" title="Correr las temporadas">
          <button type="button" className="icon-btn" aria-label="Temporadas anteriores"
            disabled={!puedeAtras} onClick={() => setDesdeTemp((d) => Math.min(d + 1, todas.length - VENTANA))}>‹</button>
          <span className="rend-periodo">{etiqueta(temporadas[temporadas.length - 1])} – {etiqueta(temporadas[0])}</span>
          <button type="button" className="icon-btn" aria-label="Temporadas siguientes"
            disabled={!puedeAdelante} onClick={() => setDesdeTemp((d) => Math.max(d - 1, 0))}>›</button>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar taller o prenda…" />
      </div>

      {filas.length === 0 ? (
        <div className="empty-state"><p>Ningún taller con ese filtro.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table tal-tabla">
            <thead>
              <tr>
                <th>Taller</th>
                {temporadas.map((k) => (
                  <th key={k} className="tal-c">
                    {etiqueta(k)}
                    <span className="tal-rango">{k === actual ? 'en curso' : rango(k)}</span>
                  </th>
                ))}
                <th className="num">2 años</th>
                <th>Prendas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => (
                <Fragment key={t.taller}>
                  <tr className={abierta && abierta.taller === t.taller ? 'tal-abierta' : ''}>
                    <td className="strong tal-nom" title={`Última orden: ${formatDate(t.ultima)}`}>{t.taller}</td>
                    {temporadas.map((k) => {
                      const v = t.porTemp[k] || 0
                      const sel = abierta && abierta.taller === t.taller && abierta.temporada === k
                      if (!v) {
                        return (
                          <td key={k} className="tal-c">
                            <span className={'tal-cel ' + (k === actual ? 'hoy' : 'no')}>—</span>
                          </td>
                        )
                      }
                      return (
                        <td key={k} className="tal-c">
                          <button type="button" className={'tal-cel si' + (sel ? ' sel' : '')}
                            title={`Ver lo que hizo en ${etiqueta(k)}`}
                            onClick={() => toggle(t.taller, k)}>
                            {num(v)}
                          </button>
                        </td>
                      )
                    })}
                    <td className="num strong">{num(t.total2a)}</td>
                    <td className="muted tal-prendas">{t.prendas || '—'}</td>
                  </tr>
                  {abierta && abierta.taller === t.taller && detalle && (
                    <tr className="tal-detalle">
                      <td colSpan={temporadas.length + 3}>
                        <div className="tal-det-h">
                          <b>{etiqueta(abierta.temporada)}</b>
                          <span className="muted">
                            {detalle.ordenes} {detalle.ordenes === 1 ? 'orden' : 'órdenes'} · {num(detalle.unid)} unidades
                            {detalle.prom != null ? ` · promedio ${detalle.prom} días en taller` : ''}
                          </span>
                          <button type="button" className="tal-cerrar" onClick={() => setAbierta(null)}>✕ cerrar</button>
                        </div>
                        <table className="tal-lista">
                          <thead>
                            <tr>
                              <th />
                              <th>Referencia</th>
                              <th>Prenda</th>
                              <th>Orden</th>
                              <th className="num">Unid</th>
                              <th>Enviada</th>
                              <th>Entregada</th>
                              <th className="num">Días</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detalle.lista.map((f) => (
                              <tr key={f.salida + '_' + f.orden}>
                                <td>
                                  {f.foto ? (
                                    <img src={fotoFactoryUrl(f.producto)} alt="" className="tal-foto"
                                      loading="lazy"
                                      onClick={(e) => { if (!e.currentTarget.classList.contains('sin') && onViewImage) onViewImage(fotoFactoryUrl(f.producto)) }}
                                      // La foto existe en Factory pero el servidor todavía no la
                                      // sube (van de a 120 por corrida): recuadro vacío mientras tanto.
                                      onError={(e) => { e.currentTarget.classList.add('sin'); e.currentTarget.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }} />
                                  ) : <span className="tal-foto sin" title="Sin foto en Factory" />}
                                </td>
                                <td className="strong">{f.ref || f.nombre}</td>
                                <td className="muted">{f.ref && f.nombre && f.ref !== f.nombre ? f.nombre : (tipoDe(f) || '—')}</td>
                                <td className="mono">{f.orden}</td>
                                <td className="num">{num(f.cant)}</td>
                                <td>{formatDate(f.fecha)}</td>
                                <td>{f.entrega ? formatDate(f.entrega) : <span className="muted">—</span>}</td>
                                <td className="num">{f.dias != null && f.dias >= 0 ? f.dias : <span className="muted">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tal-nota">
        Un guion es una temporada sin órdenes; en rojo, la actual sin enviar. Se ordena por las unidades de los últimos dos años.
        Solo cuentan salidas de más de 15 unidades: las muestras no.
      </p>
    </>
  )
}
