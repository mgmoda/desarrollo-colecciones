import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import CarteraCliente from './CarteraCliente.jsx'
import CarteraContacto from './CarteraContacto.jsx'
import {
  ESPERA_DIAS, cargarCartera, compromisoActivo, compromisoVencido, contactosSemana,
  etiquetaResultado, marcarSeguimiento, recaudoDelMes, resultadoDe,
} from '../lib/cartera.js'
import { formatPrice } from '../lib/constants.js'

// ════════════════════════════════════════════════════════════════════════
// CARTERA — seguimiento de recaudo
// ────────────────────────────────────────────────────────────────────────
// Reemplaza la app aparte de cobranza (Flask + Postgres local, puerto 5075).
// Las facturas las sube solo el servidor de SYD cada 30 minutos; acá se leen
// de `cartera_facturas` y se agrupan por cliente.
//
// Diseño aprobado: public/mockups/cartera-v1.html
// ════════════════════════════════════════════════════════════════════════

// Cifra abreviada para las columnas por colección: son comparativas y son
// varias. El "Total debe" va completo — es sobre lo que se decide.
function corto(v) {
  if (!v) return null
  if (v >= 1e6) return '$ ' + (v / 1e6).toFixed(1).replace('.', ',') + 'M'
  return '$ ' + Math.round(v / 1000) + 'K'
}

const nivelDias = (d) => (d >= 90 ? 'flag-no' : d >= 60 ? 'flag-warn' : 'flag-yes')
const nivelPago = (d) => (d > 45 ? 'bad' : d > 20 ? 'mid' : 'ok')

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" del mes en curso y del anterior, en hora local. */
function mesesDeCorte() {
  const h = new Date()
  const yy = h.getFullYear()
  const mm = h.getMonth()
  const clave = (a, m) => `${a}-${String(m + 1).padStart(2, '0')}`
  return {
    actual: clave(yy, mm),
    anterior: mm === 0 ? clave(yy - 1, 11) : clave(yy, mm - 1),
    nombreActual: MESES_LARGO[mm],
    nombreAnterior: MESES_LARGO[mm === 0 ? 11 : mm - 1],
    diaDelMes: h.getDate(),
  }
}
function fechaCorta(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  const esteAnio = String(new Date().getFullYear()) === a
  return `${Number(d)} ${MESES[Number(m) - 1]}${esteAnio ? '' : ' ' + a.slice(2)}`
}
/** "8 de septiembre" — la fecha a la que están los saldos. */
function fechaLarga(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-')
  const anio = String(new Date().getFullYear()) === a ? '' : ` de ${a}`
  return `${Number(d)} de ${MESES_LARGO[Number(m) - 1]}${anio}`
}
function horaCorta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
}
/**
 * Qué tan viejo es el informe. Importa: si el servidor deja de sincronizar,
 * la cartera se queda quieta y nada en pantalla lo delata — pasó el 7-sep,
 * quince horas con datos viejos sin que se notara.
 */
function frescuraDe(corte) {
  if (!corte) return null
  const [a, m, d] = corte.slice(0, 10).split('-').map(Number)
  const h = new Date()
  const dias = Math.round(
    (Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) - Date.UTC(a, m - 1, d)) / 86400000)
  if (dias <= 0) return { texto: 'al día', tono: 'ok' }
  if (dias === 1) return { texto: 'informe de ayer', tono: 'warn' }
  return { texto: `hace ${dias} días`, tono: 'bad' }
}
function fechaHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-CO', {
    day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  })
}

// La lista abre en "Para llamar hoy": nadie los ha contactado en los últimos
// días o su promesa venció sin abono. Los contactados hace poco quedan "en
// espera" para que la otra persona no los vuelva a llamar.
const CHIPS = [
  { key: 'llamar', label: 'Para llamar hoy', tono: 'bad' },
  { key: 'espera', label: 'En espera' },
  { key: 'promesa', label: 'Con promesa' },
  { key: 'critico', label: 'Crítico +90d' },
  { key: 'sinpago', label: 'Sin pago +30d' },
  { key: 'seguidos', label: '★ Seguimiento' },
  { key: 'todos', label: 'Todos' },
]
const haceTxt = (d) => (d == null ? '' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} d`)

export default function CarteraView({ usuario, cargarDatos = cargarCartera }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [seguidos, setSeguidos] = useState(() => new Set())

  const [q, setQ] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [coleccion, setColeccion] = useState('')
  const [chip, setChip] = useState('llamar')
  const [sortKey, setSortKey] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  const [abierto, setAbierto] = useState(null)   // cliente_key del detalle
  const [contactoDe, setContactoDe] = useState(null) // cliente_key del "Contacté"

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const d = await cargarDatos()
      setDatos(d)
      setSeguidos(d.seguidos)
    } catch (e) {
      setError(String((e && e.message) || e))
    } finally {
      setCargando(false)
    }
  }, [cargarDatos])

  useEffect(() => { cargar() }, [cargar])

  // Refresco solo. El servidor sube el informe cada 30 minutos, pero la vista
  // cargaba una única vez: una pestaña abierta desde ayer mostraba datos de
  // ayer sin nada que lo delatara (pasó el 8-sep). Se vuelve a mirar cada 5
  // minutos y al volver a la pestaña. No se refresca con el detalle abierto:
  // reordenaría la lista debajo de quien está leyendo.
  const detalleAbierto = useRef(false)
  detalleAbierto.current = abierto !== null || contactoDe !== null
  useEffect(() => {
    const refrescar = () => { if (!detalleAbierto.current) cargar() }
    const reloj = setInterval(refrescar, 5 * 60 * 1000)
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(reloj)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  const clientes = datos ? datos.clientes : []

  // ── Columnas por colección ───────────────────────────────────────────
  // Se muestran las dos colecciones más recientes; todo lo anterior se suma
  // en "Antes". Con seis columnas la tabla no cabía sin scroll horizontal, y
  // el desglose completo está en el detalle del cliente.
  const cols = useMemo(() => {
    const ps = datos ? datos.periodos : []
    const ultimas = ps.slice(-2)
    const viejas = ps.slice(0, Math.max(0, ps.length - 2)).map((p) => p.key)
    return { ultimas, viejas, corteLabel: ultimas.length ? ultimas[0].key.split('-')[0] : '' }
  }, [datos])

  const antesDe = useCallback(
    (c) => cols.viejas.reduce((a, k) => a + (c.periodos[k] || 0), 0),
    [cols.viejas],
  )

  // ── Totales ──────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total = clientes.reduce((a, c) => a + c.total, 0)
    const t1 = clientes.reduce((a, c) => a + c.t1, 0)
    const t2 = clientes.reduce((a, c) => a + c.t2, 0)
    let vencido = 0
    let fxVencidas = 0
    let nfx = 0
    for (const c of clientes) {
      for (const f of c.facturas) {
        nfx += 1
        if (f.dias > 60) { vencido += f.valor; fxVencidas += 1 }
      }
    }
    // Recaudo del mes: se suman los abonos por su FECHA, no por cuándo los
    // vimos. Va sobre `pagosTodos` —el universo completo, con los clientes que
    // ya cancelaron— y no sobre los clientes con saldo: si no, el total del mes
    // iría bajando a medida que la gente termina de pagar.
    const m = mesesDeCorte()
    const universo = (datos && datos.pagosTodos) || []
    const rec = recaudoDelMes(universo, m.actual)
    const recPrev = recaudoDelMes(universo, m.anterior)

    return {
      total, t1, t2, vencido, fxVencidas, nfx,
      mes: m,
      recMes: rec.total, recAnt: recPrev.total,
      nRecMes: rec.n, nClientesPagaron: rec.clientes,
      criticos: clientes.filter((c) => c.dias_max > 90).length,
      sinPago: clientes.filter((c) => c.dias_ult_pago === null || c.dias_ult_pago > 30).length,
      compromisos: clientes.filter((c) => compromisoVencido(c)).length,
      compromisosValor: clientes.filter((c) => compromisoVencido(c)).reduce((a, c) => a + c.total, 0),
      conAcuerdo: clientes.filter((c) => compromisoActivo(c)).length,
      conPromesa: clientes.filter((c) => c.promesa && !c.promesa.cumplida).length,
      paraLlamar: clientes.filter((c) => c.para_llamar).length,
      enEspera: clientes.filter((c) => c.en_espera).length,
      noLlamar: clientes.filter((c) => c.no_llamar).length,
      semana: contactosSemana(clientes),
    }
  }, [clientes, datos])

  const frescura = datos && datos.sync ? frescuraDe(datos.sync.corte) : null

  const ciudades = useMemo(
    () => [...new Set(clientes.map((c) => c.ciudad).filter(Boolean))].sort(),
    [clientes],
  )

  // ── Filtro + orden ───────────────────────────────────────────────────
  const filas = useMemo(() => {
    const texto = q.trim().toLowerCase()
    const out = clientes.filter((c) => {
      if (texto && !(
        c.cliente.toLowerCase().includes(texto) ||
        (c.ciudad || '').toLowerCase().includes(texto)
      )) return false
      if (ciudad && c.ciudad !== ciudad) return false
      if (coleccion === '1' && c.t1 <= 0) return false
      if (coleccion === '2' && c.t2 <= 0) return false
      if (chip === 'llamar' && !c.para_llamar) return false
      if (chip === 'espera' && !c.en_espera) return false
      if (chip === 'promesa' && !(c.promesa && !c.promesa.cumplida)) return false
      if (chip === 'critico' && c.dias_max <= 90) return false
      if (chip === 'sinpago' && !(c.dias_ult_pago === null || c.dias_ult_pago > 30)) return false
      if (chip === 'seguidos' && !seguidos.has(c.cliente_key)) return false
      return true
    })

    const valor = (c) => {
      if (sortKey === 'cliente') return c.cliente
      if (sortKey === 'ciudad') return c.ciudad || ''
      if (sortKey === 'antes') return antesDe(c)
      if (sortKey === 'dias_max') return c.dias_max
      // Sin pagos va al final en descendente: es lo más grave, no lo menos.
      if (sortKey === 'dias_ult') return c.dias_ult_pago === null ? Infinity : c.dias_ult_pago
      // Sin contacto va al final en descendente: es lo que más urge.
      if (sortKey === 'contacto') return c.dias_contacto === null ? Infinity : c.dias_contacto
      if (sortKey.startsWith('per:')) return c.periodos[sortKey.slice(4)] || 0
      return c.total
    }
    const signo = sortDir === 'asc' ? 1 : -1
    return [...out].sort((a, b) => {
      // En "Para llamar hoy" las promesas vencidas van primero: son lo más
      // urgente, sin importar el monto.
      if (chip === 'llamar' && sortKey === 'total' && a.promesa_vencida !== b.promesa_vencida) {
        return a.promesa_vencida ? -1 : 1
      }
      const va = valor(a), vb = valor(b)
      if (typeof va === 'string') return signo * va.localeCompare(vb, 'es')
      return signo * (va - vb)
    })
  }, [clientes, q, ciudad, coleccion, chip, seguidos, sortKey, sortDir, antesDe])

  const totalFiltrado = filas.reduce((a, c) => a + c.total, 0)

  function ordenar(col) {
    if (col === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir(col === 'cliente' || col === 'ciudad' ? 'asc' : 'desc') }
  }

  async function alternarSeguimiento(c, ev) {
    ev.stopPropagation()
    const activo = seguidos.has(c.cliente_key)
    const copia = new Set(seguidos)
    if (activo) copia.delete(c.cliente_key); else copia.add(c.cliente_key)
    setSeguidos(copia)               // optimista: la ★ responde al instante
    try {
      await marcarSeguimiento(c, !activo)
    } catch (e) {
      setSeguidos(seguidos)          // se revierte si la nube dijo que no
      setError('No se pudo guardar el seguimiento: ' + ((e && e.message) || e))
    }
  }

  const cliente = abierto ? clientes.find((c) => c.cliente_key === abierto) : null
  const clienteContacto = contactoDe ? clientes.find((c) => c.cliente_key === contactoDe) : null

  if (cargando && !datos) {
    return (
      <>
        <div className="view-head">
          <div><div className="view-title">Cartera</div>
            <div className="view-sub">Seguimiento de recaudo — MG MODA S.A.S.</div></div>
        </div>
        <div className="empty-state"><p>Cargando la cartera…</p></div>
      </>
    )
  }

  return (
    <>
      <div className="view-head">
        <div>
          <div className="view-title">Cartera</div>
          <div className="view-sub">Seguimiento de recaudo — MG MODA S.A.S.</div>
        </div>
        <div className="ct-head-btns">
          <button className="btn btn-ghost" onClick={cargar} disabled={cargando}>
            {cargando ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && <div className="ct-error">{error}</div>}

      {datos && datos.faltanTablas && (
        <div className="ct-alert">
          <span>
            Falta correr <b>supabase_cartera.sql</b> en el SQL Editor: la gestión de
            cobro y las marcas de seguimiento todavía no se pueden guardar.
          </span>
        </div>
      )}

      <div className="ct-sync">
        <div className="ct-sync-ic" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 16.6A4.5 4.5 0 0 0 17.5 8h-1.3A7 7 0 1 0 5 15.3" />
            <path d="M12 12v9" /><path d="m8.5 17.5 3.5-3.5 3.5 3.5" />
          </svg>
        </div>
        <div>
          <div className="ct-sync-t">
            {datos && datos.sync
              ? <>
                  Cartera al {datos.sync.corte
                    ? fechaLarga(datos.sync.corte)
                    : fechaHora(datos.sync.creado_en)}
                  {frescura && <span className={'ct-frescura ' + frescura.tono}>{frescura.texto}</span>}
                </>
              : 'Sin sincronizaciones todavía'}
          </div>
          <div className="ct-sync-s">
            {datos && datos.sync
              ? `SYD · ${datos.sync.archivo} — ${kpi.nfx} facturas · ${clientes.length} clientes`
                + ` · traído a las ${horaCorta(datos.sync.creado_en)}`
              : 'El servidor sube el informe del SYD cada 30 minutos.'}
          </div>
        </div>
        <div className="ct-sync-sp" />
        <span className="ct-live"><i />Sincroniza sola cada 30 min</span>
      </div>

      {kpi.compromisos > 0 && (
        <div className="ct-alert">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <span>
            Promesas de pago: <b>{kpi.compromisos} vencidas</b> sin abono
            {kpi.compromisosValor ? <> · {formatPrice(kpi.compromisosValor)} en cartera</> : null}.
          </span>
          <span className="sp" />
          <button className="btn btn-ghost ct-btn-sm" onClick={() => setChip('llamar')}>
            Ver en "Para llamar hoy"
          </button>
        </div>
      )}

      {/* KPIs — mismo patrón que Corte y Por alistar (AreaKpis) */}
      <div className="kpi-wrap ct-kpis">
        <div className="kpi-grid">
          <div className="kpi-nums">
            <div className="kpi-card">
              <p className="kpi-label">Cartera total</p>
              <p className="kpi-cifra">{formatPrice(kpi.total) || '$ 0'}</p>
              <p className="kpi-unidad">{clientes.length} clientes</p>
              <div className="ct-kpi-split">
                <i style={{ width: (kpi.total ? (kpi.t1 / kpi.total) * 100 : 0) + '%', background: 'var(--ink)' }} />
                <i style={{ width: (kpi.total ? (kpi.t2 / kpi.total) * 100 : 0) + '%', background: '#b9b3a3' }} />
              </div>
              <ul className="kpi-marcas ct-lista">
                <li><span>Madres <i>Ene–May</i></span><b>{formatPrice(kpi.t1) || '—'}</b></li>
                <li><span>Diciembre <i>Jun–Dic</i></span><b>{formatPrice(kpi.t2) || '—'}</b></li>
              </ul>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Recaudado en {kpi.mes.nombreActual}</p>
              <p className="kpi-cifra ok">{formatPrice(kpi.recMes) || '$ 0'}</p>
              <p className="kpi-unidad">
                {kpi.nRecMes} {kpi.nRecMes === 1 ? 'abono' : 'abonos'}
                {' de '}{kpi.nClientesPagaron}
                {kpi.nClientesPagaron === 1 ? ' cliente' : ' clientes'}
              </p>
              <p className="kpi-desglose">
                {kpi.recAnt > 0 ? (
                  <>
                    {kpi.mes.nombreAnterior}: {formatPrice(kpi.recAnt)}
                    {' · '}
                    <b className={kpi.recMes >= kpi.recAnt ? 'ct-sube' : 'ct-baja'}>
                      {kpi.recMes >= kpi.recAnt ? '▲' : '▼'}
                      {' '}
                      {Math.abs(Math.round(((kpi.recMes - kpi.recAnt) / kpi.recAnt) * 100))}%
                    </b>
                  </>
                ) : `sin comparación con ${kpi.mes.nombreAnterior}`}
              </p>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Vencida +60 días</p>
              <p className="kpi-cifra bad">{formatPrice(kpi.vencido) || '$ 0'}</p>
              <p className="kpi-unidad">
                {kpi.total ? Math.round((kpi.vencido / kpi.total) * 100) : 0}% del total
              </p>
              <p className="kpi-desglose">{kpi.fxVencidas} facturas por encima del plazo</p>
            </div>
          </div>

          <div className="kpi-card">
            <p className="kpi-label">Cobro de hoy</p>
            <ul className="kpi-marcas ct-lista ct-lista-top">
              <li className="ct-bad"><span>Para llamar hoy <i>sin contacto en {ESPERA_DIAS} días o promesa vencida</i></span><b>{kpi.paraLlamar}</b></li>
              <li><span>En espera <i>contactados hace poco</i></span><b>{kpi.enEspera}</b></li>
              <li className="ct-warn"><span>Promesas vencidas <i>sin abono</i></span><b>{kpi.compromisos}</b></li>
              <li><span>Contactos esta semana
                <i>{Object.entries(kpi.semana.por).map(([q, n]) => `${q} ${n}`).join(' · ') || '—'}</i></span>
                <b>{kpi.semana.n}</b></li>
              <li className="kpi-suma"><span>Clientes con saldo <i>{kpi.noLlamar ? `${kpi.noLlamar} sin llamar` : ''}</i></span><b>{clientes.length}</b></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="ct-filters">
        <SearchInput value={q} onChange={setQ} placeholder="Cliente o ciudad…" className="ct-search" />
        <select className="input select ct-select" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input select ct-select" value={coleccion} onChange={(e) => setColeccion(e.target.value)}>
          <option value="">Ambas colecciones</option>
          <option value="1">Madres (Ene–May)</option>
          <option value="2">Diciembre (Jun–Dic)</option>
        </select>
        <div className="ct-chips">
          {CHIPS.map((ch) => {
            const n = ch.key === 'todos' ? clientes.length
              : ch.key === 'llamar' ? kpi.paraLlamar
              : ch.key === 'espera' ? kpi.enEspera
              : ch.key === 'promesa' ? kpi.conPromesa
              : ch.key === 'critico' ? kpi.criticos
              : ch.key === 'sinpago' ? kpi.sinPago
              : seguidos.size
            return (
              <button key={ch.key} type="button"
                className={'ct-chip' + (chip === ch.key ? ' on' : '') + (ch.tono ? ' ' + ch.tono : '')}
                onClick={() => setChip(ch.key)}>
                {ch.label} <span className="n">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabla */}
      {filas.length === 0 ? (
        <div className="empty-state">
          <p>Ningún cliente coincide con el filtro.</p>
          <p className="muted">Prueba quitando la ciudad o el chip activo.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="Cliente" col="cliente" sortKey={sortKey} sortDir={sortDir} onSort={ordenar} />
                {cols.viejas.length > 0 && (
                  <SortTh className="num ct-per-h" col="antes" sortKey={sortKey} sortDir={sortDir} onSort={ordenar}
                    label={<>Antes<span>&lt; {cols.corteLabel}</span></>} />
                )}
                {cols.ultimas.map((p) => (
                  <SortTh key={p.key} className="num ct-per-h" col={'per:' + p.key}
                    sortKey={sortKey} sortDir={sortDir} onSort={ordenar}
                    label={<>{p.key}<span>{p.sub}</span></>} />
                ))}
                <SortTh label="Total debe" col="total" className="num" sortKey={sortKey} sortDir={sortDir} onSort={ordenar} />
                <SortTh label="Antigüedad" col="dias_max" className="num" sortKey={sortKey} sortDir={sortDir} onSort={ordenar} />
                <SortTh label="Últ. pago" col="dias_ult" className="num" sortKey={sortKey} sortDir={sortDir} onSort={ordenar} />
                <SortTh label="Último contacto" col="contacto" sortKey={sortKey} sortDir={sortDir} onSort={ordenar} />
                <th>Promesa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => {
                const antes = antesDe(c)
                const g = c.ult_contacto
                const res = g ? resultadoDe(g) : ''
                const inicial = g && g.autor ? g.autor.charAt(0).toUpperCase() : ''
                return (
                  <tr key={c.cliente_key}
                    className={'row-click' + (c.en_espera || c.no_llamar ? ' ct-espera' : '')}
                    onClick={() => setAbierto(c.cliente_key)}>
                    <td>
                      <div className="ct-cli">
                        <button type="button"
                          className={'ct-star' + (seguidos.has(c.cliente_key) ? ' on' : '')}
                          onClick={(e) => alternarSeguimiento(c, e)}
                          title="Incluir en el correo diario de seguimiento">★</button>
                        <span>
                          <span className="ct-cli-n">{c.cliente}</span>
                          <span className="ct-cli-ciu">{c.ciudad || '—'}</span>
                        </span>
                      </div>
                    </td>
                    {cols.viejas.length > 0 && (
                      <td className="num ct-per" title={antes ? formatPrice(antes) : ''}>
                        {corto(antes) || <span className="ct-dash">—</span>}
                      </td>
                    )}
                    {cols.ultimas.map((p) => {
                      const v = c.periodos[p.key] || 0
                      return (
                        <td key={p.key} className="num ct-per" title={v ? formatPrice(v) : ''}>
                          {corto(v) || <span className="ct-dash">—</span>}
                        </td>
                      )
                    })}
                    <td className="num strong">{formatPrice(c.total) || '—'}</td>
                    <td className="num">
                      <span className={'flag ' + nivelDias(c.dias_max)}>{c.dias_max} d</span>
                    </td>
                    <td className="num">
                      {c.ult_pago ? (
                        <span className="ct-ult">
                          {fechaCorta(c.ult_pago)} · <b className={nivelPago(c.dias_ult_pago)}>{c.dias_ult_pago}d</b>
                        </span>
                      ) : <span className="ct-dash">sin pagos</span>}
                    </td>
                    <td title={g ? `${g.autor || '—'} · ${etiquetaResultado(res)}${g.canal ? ' · ' + g.canal : ''}${g.texto && g.texto !== etiquetaResultado(res) ? ' · ' + g.texto : ''}` : 'Nunca se ha contactado'}>
                      {g ? (
                        <>
                          <span className="ct-uc">
                            <span className={'ct-av' + (inicial === 'K' ? ' k' : '')}>{inicial || '?'}</span>
                            {haceTxt(c.dias_contacto)}
                          </span>
                          <span className="ct-uc-s">
                            {etiquetaResultado(res)}{g.canal ? ` · ${g.canal}` : ''}
                            {g.texto && g.texto !== etiquetaResultado(res) ? ` · "${g.texto}"` : ''}
                          </span>
                        </>
                      ) : <span className="ct-res r-no_llamar" style={{ background: '#fbeceb' }}>Sin contacto</span>}
                    </td>
                    <td>
                      {c.promesa && !c.promesa.cumplida ? (
                        <>
                          <span className={'ct-prom ' + (c.promesa.vencida ? 'ven' : 'vig')}>
                            {c.promesa.vencida ? 'Venció el ' : ''}{fechaCorta(c.promesa.fecha)}
                          </span>
                          <span className="ct-uc-s">
                            {c.promesa.monto ? formatPrice(c.promesa.monto) : 'abono'}{c.promesa.vencida ? ' · sin abono' : ''}
                          </span>
                        </>
                      ) : c.promesa && c.promesa.cumplida ? (
                        <span className="ct-prom cum" title="Llegó el abono después de la promesa">Cumplida</span>
                      ) : <span className="ct-dash">—</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {c.no_llamar ? (
                        <button type="button" className="btn ct-btn-contacto espera"
                          title="Marcado como no volver a llamar; registrar un contacto lo reactiva"
                          onClick={() => setContactoDe(c.cliente_key)}>No llamar</button>
                      ) : (
                        <button type="button"
                          className={'btn ct-btn-contacto' + (c.en_espera ? ' espera' : ' btn-primary')}
                          title={c.en_espera ? `Contactado ${haceTxt(c.dias_contacto)} por ${g && g.autor}; se puede registrar otro contacto igual` : 'Registrar el contacto de hoy'}
                          onClick={() => setContactoDe(c.cliente_key)}>
                          {c.en_espera ? 'En espera' : 'Contacté'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{filas.length} de {clientes.length} clientes</span>
            <span><b>{formatPrice(totalFiltrado) || '$ 0'}</b> en cartera</span>
          </div>
        </div>
      )}

      <CarteraCliente
        cliente={cliente}
        usuario={usuario}
        onClose={() => setAbierto(null)}
        onGuardado={cargar}
      />
      {clienteContacto && (
        <CarteraContacto cliente={clienteContacto} usuario={usuario}
          onClose={() => setContactoDe(null)} onGuardado={cargar} />
      )}
    </>
  )
}
