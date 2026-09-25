import { useEffect, useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import DespacharModal from './DespacharModal.jsx'
import { armarDespachos } from '../lib/despachos.js'
import { abrirEtiqueta, coordinadora, empaqueDe, estadoDe } from '../lib/coordinadora.js'
import { formatPrice } from '../lib/constants.js'
import {
  dbInsertGuia, dbLoadCiudadesDane, dbLoadCiudadSyd, dbLoadDespachos, dbLoadGuias, dbLoadLibreta, dbLoadPedidosTodos, dbUpsertLibreta,
} from '../lib/db.js'

// ════════════════════════════════════════════════════════════════════════
// GUÍAS COORDINADORA — cuarta vista de Pedidos. Aquí se generan, se imprimen
// y se siguen las guías. Despachos solo conserva el atajo "Despachar".
// Estados: hoy solo "generada"; el rastreo llegará con la documentación de
// Coordinadora (lib/coordinadora.js → estadoDe).
// ════════════════════════════════════════════════════════════════════════
const num = (n) => Number(n || 0).toLocaleString('es-CO')
const ZONA = 'America/Bogota'
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA })   // aaaa-mm-dd local
const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-CO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
const tituloDia = (d) => {
  const t = new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const hoyLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
const fleteDe = (g) => Number(g.cotizacion && g.cotizacion.data && g.cotizacion.data.flete_total) || 0

const FILTROS = [
  { key: 'todas', label: 'Todas', f: () => true },
  { key: 'hoy', label: 'Hoy', f: (g) => diaDe(g.at) === hoyLocal() },
  { key: 'generada', label: 'Generadas', f: (g) => estadoDe(g).key === 'generada' },
  { key: 'ruta', label: 'En ruta', f: (g) => estadoDe(g).key === 'ruta' },
  { key: 'novedad', label: 'Con novedad', f: (g) => estadoDe(g).key === 'novedad' },
  { key: 'entregada', label: 'Entregadas', f: (g) => estadoDe(g).key === 'entregada' },
]

export default function GuiasView({
  stamp, stampDespachos, usuario,
  // Inyectables para probar la vista con datos fijos, sin sesión.
  cargarPedidos = dbLoadPedidosTodos, cargarDespachos = dbLoadDespachos, cargarGuias = dbLoadGuias, cargarLibreta = dbLoadLibreta,
  cargarCiudades = dbLoadCiudadesDane, cargarCiudadSyd = dbLoadCiudadSyd, guardarLibreta = dbUpsertLibreta, guardarGuia = dbInsertGuia, llamar = coordinadora,
}) {
  const [filas, setFilas] = useState(null)
  const [registros, setRegistros] = useState({})
  const [guias, setGuias] = useState(null)
  const [libreta, setLibreta] = useState({})
  const [ciudades, setCiudades] = useState([])
  const [danePorCiudad, setDanePorCiudad] = useState({})
  const [filtro, setFiltro] = useState('todas')
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [nueva, setNueva] = useState(false)
  const [despachando, setDespachando] = useState(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([cargarPedidos(), cargarDespachos()]).then(([f, r]) => { if (vivo) { setFilas(f); setRegistros(r || {}) } })
      .catch((e) => setError('No se pudieron cargar los pedidos: ' + (e.message || e)))
    return () => { vivo = false }
  }, [stamp])
  useEffect(() => {
    let vivo = true
    Promise.all([cargarGuias(), cargarLibreta()]).then(([g, l]) => { if (vivo) { setGuias(g); setLibreta(l) } })
      .catch((e) => setError('No se pudieron cargar las guías: ' + (e.message || e)))
    return () => { vivo = false }
  }, [stampDespachos])
  useEffect(() => {
    cargarCiudades().then(setCiudades).catch(() => {})
    cargarCiudadSyd().then(setDanePorCiudad).catch(() => {})
  }, [])

  const clientes = useMemo(() => armarDespachos(filas || [], registros || {}), [filas, registros])
  const ultimaDe = useMemo(() => { const m = {}; (guias || []).forEach((g) => { if (!m[g.cliente_key]) m[g.cliente_key] = g }); return m }, [guias])

  const lista = useMemo(() => {
    const fn = (FILTROS.find((f) => f.key === filtro) || FILTROS[0]).f
    const term = q.trim().toLowerCase()
    return (guias || []).filter(fn).filter((g) => !term || (g.cliente + ' ' + (g.guia || '') + ' ' + ciudadDe(g)).toLowerCase().includes(term))
  }, [guias, filtro, q, libreta])
  function ciudadDe(g) { const l = libreta[g.cliente_key]; return (l && l.ciudad_syd) || '' }
  function ciudadBonita(g) {
    const l = libreta[g.cliente_key]
    const c = l && l.dane && ciudades.find((x) => x.dane === l.dane)
    return c ? c.municipio.charAt(0) + c.municipio.slice(1).toLowerCase() : ciudadDe(g) || '—'
  }

  const porDia = useMemo(() => {
    const m = new Map()
    lista.forEach((g) => { const d = diaDe(g.at); if (!m.has(d)) m.set(d, []); m.get(d).push(g) })
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [lista])
  const kpi = useMemo(() => {
    const todas = guias || []
    const hoy = todas.filter((g) => diaDe(g.at) === hoyLocal())
    const mes = todas.filter((g) => diaDe(g.at).slice(0, 7) === hoyLocal().slice(0, 7))
    const suma = (l, k) => l.reduce((n, g) => n + (k === 'flete' ? fleteDe(g) : Number(g.cajas) || 0), 0)
    return {
      hoy: hoy.length, hoyCajas: suma(hoy, 'cajas'), hoyFlete: suma(hoy, 'flete'),
      mes: mes.length, mesCajas: suma(mes, 'cajas'), mesFlete: suma(mes, 'flete'),
      ruta: todas.filter((g) => estadoDe(g).key === 'ruta').length,
      novedad: todas.filter((g) => estadoDe(g).key === 'novedad').length,
      entregadas: mes.filter((g) => estadoDe(g).key === 'entregada').length,
    }
  }, [guias])
  const totLista = useMemo(() => ({ cajas: lista.reduce((n, g) => n + (Number(g.cajas) || 0), 0), flete: lista.reduce((n, g) => n + fleteDe(g), 0) }), [lista])

  // Buscador de "Nueva guía": clientes con lo que importa para decidir.
  const candidatos = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return []
    return clientes.filter((c) => (c.cliente + ' ' + (c.ciudad || '')).toLowerCase().includes(t)).slice(0, 8)
  }, [busca, clientes])

  async function etiqueta(g) {
    setAviso('')
    try { const r = await abrirEtiqueta(g.guia, llamar); if (r) setAviso(r) } catch (e) { setAviso(e.message || String(e)) }
  }
  const mesNombre = new Date().toLocaleDateString('es-CO', { month: 'long' })

  return (
    <>
      {error && <div className="ct-error">{error}</div>}
      <div className="prog-kpis dsp-kpis">
        <div className="prog-kpi"><span>Hoy</span><b>{num(kpi.hoy)}</b><em>{num(kpi.hoyCajas)} {kpi.hoyCajas === 1 ? 'caja' : 'cajas'} · flete {formatPrice(kpi.hoyFlete) || '$ 0'}</em></div>
        <div className="prog-kpi"><span>{mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)}</span><b>{num(kpi.mes)}</b><em>{num(kpi.mesCajas)} cajas · {formatPrice(kpi.mesFlete) || '$ 0'} en fletes</em></div>
        <div className="prog-kpi"><span>En ruta</span><b className="dsp-sep">{num(kpi.ruta)}</b><em>con rastreo de Coordinadora</em></div>
        <div className="prog-kpi alerta"><span>Con novedad</span><b>{num(kpi.novedad)}</b><em>requieren acción</em></div>
        <div className="prog-kpi dsp-ok"><span>Entregadas</span><b>{num(kpi.entregadas)}</b><em>este mes</em></div>
      </div>

      <div className="view-actions gu-barra">
        <div className="gu-nueva">
          <button type="button" className="btn btn-primary" onClick={() => { setNueva((v) => !v); setBusca('') }}>+ Nueva guía</button>
          {nueva && (
            <div className="gu-drop">
              <input className="input" autoFocus placeholder="Cliente o ciudad…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {candidatos.length === 0 && busca.trim() && <div className="gu-drop-vacio">Ningún cliente coincide.</div>}
              {candidatos.map((c) => {
                const u = ultimaDe[c.cliente]
                return (
                  <button type="button" key={c.cliente} className="gu-cand" onClick={() => { setDespachando(c); setNueva(false) }}>
                    <span><b>{c.cliente}</b><span className="gu-cand-s"> · {c.ciudad || '—'} · {num(c.separadoVig)} separadas</span></span>
                    <span className="muted">{u ? `guía ${diaDe(u.at) === hoyLocal() ? 'hoy' : diaDe(u.at)}` : 'sin guía'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="dis-filtros">
          {FILTROS.map((f) => {
            const n = (guias || []).filter(f.f).length
            if (!n && filtro !== f.key && f.key !== 'todas') return null
            return <button key={f.key} type="button" className={'proc-f-btn' + (filtro === f.key ? ' on' : '')} onClick={() => setFiltro(f.key)}>{f.label} <b>{n}</b></button>
          })}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Cliente, ciudad o número de guía…" />
      </div>
      {aviso && <div className="dsp-nota">{aviso}</div>}

      {guias === null ? (
        <div className="empty-state"><p>Cargando las guías…</p></div>
      ) : lista.length === 0 ? (
        <div className="empty-state"><p>{(guias || []).length ? 'Ninguna guía coincide con el filtro.' : 'Todavía no hay guías. Pulsa "Nueva guía" para generar la primera.'}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table gu-tabla">
            <thead>
              <tr><th>Hora</th><th>Cliente</th><th>Ciudad</th><th>Pedidos</th><th className="num">Cajas</th><th className="num">Flete</th><th>Guía</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {porDia.map(([dia, gs]) => [
                <tr key={'d' + dia} className="gu-dia"><td colSpan={9}>{tituloDia(dia)} <small>· {num(gs.length)} {gs.length === 1 ? 'guía' : 'guías'} · {(() => { const c = gs.reduce((n, g) => n + (Number(g.cajas) || 0), 0); return `${num(c)} ${c === 1 ? 'caja' : 'cajas'}` })()} · {formatPrice(gs.reduce((n, g) => n + fleteDe(g), 0)) || '$ 0'}</small></td></tr>,
                ...gs.map((g) => {
                  const e = estadoDe(g); const emp = empaqueDe(g.empaque)
                  const peds = (g.pedidos || []).join(', ')
                  return (
                    <tr key={g.id} className={dia === hoyLocal() ? 'gu-hoy' : ''}>
                      <td className="muted">{horaDe(g.at)}</td>
                      <td className="gu-cli" title={g.cliente}><b>{g.cliente}</b><span className="gu-s">{num(g.cajas)} {g.cajas === 1 ? 'caja' : 'cajas'} · {emp.peso} kg · {formatPrice(g.valor_declarado)} declarados</span></td>
                      <td className="muted gu-ciu" title={ciudadBonita(g)}>{ciudadBonita(g)}</td>
                      <td className="muted gu-ped" title={peds}>{peds || '—'}</td>
                      <td className="num">{num(g.cajas)}</td>
                      <td className="num">{formatPrice(fleteDe(g)) || <span className="dsp-cero">·</span>}</td>
                      <td className="gu-guia">{g.guia || <span className="muted">sin número</span>}{g.ambiente === 'test' && <span className="gu-s">prueba</span>}</td>
                      <td><span className={'tag dsp-tag ' + ({ v: 'verde', a: 'azul', m: 'ambar', r: 'rojo', g: '' })[e.cls]}>{e.label}</span>{e.detalle && <span className="gu-s" title={e.detalle}>{e.detalle}</span>}</td>
                      <td className="gu-acc">{g.guia && <button type="button" className="btn dsp-btn-sm" onClick={() => etiqueta(g)}>Etiqueta</button>}</td>
                    </tr>
                  )
                }),
              ])}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{num(lista.length)} {lista.length === 1 ? 'guía' : 'guías'}{(guias || []).some((g) => g.ambiente === 'test') ? ' · ambiente de pruebas' : ''}</span>
            <span><b>{num(totLista.cajas)}</b> cajas · <b>{formatPrice(totLista.flete) || '$ 0'}</b> en fletes cotizados</span>
          </div>
        </div>
      )}

      <details className="gu-pruebas">
        <summary>Pruebas de conexión con Coordinadora</summary>
        <PruebaCoordinadora llamar={llamar} />
      </details>

      {despachando && (
        <DespacharModal cliente={despachando.cliente} ciudadSyd={despachando.ciudad} usuario={usuario} llamar={llamar}
          pedidos={[...new Set(despachando.lineas.flatMap((l) => l.pedidos || []))].sort()} unidades={despachando.separadoVig}
          libreta={libreta[despachando.cliente]} ciudades={ciudades} danePorCiudad={danePorCiudad}
          onGuardarLibreta={async (d) => { const fila = { ...d, origen: libreta[d.cliente_key] ? (libreta[d.cliente_key].origen || 'manual') : 'manual', usuario }; await guardarLibreta(fila); setLibreta((l) => ({ ...l, [d.cliente_key]: { ...(l[d.cliente_key] || {}), ...fila } })) }}
          onGuiaGenerada={async (g) => { await guardarGuia(g); setGuias((l) => [g, ...(l || [])]) }}
          onClose={() => setDespachando(null)} />
      )}
    </>
  )
}

// Prueba de la conexión (ambiente de pruebas): pide un token y cotiza un
// envío de ejemplo desde Bucaramanga.
function PruebaCoordinadora({ llamar }) {
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState('')
  async function probar(tipo) {
    setBusy(tipo); setRes(null)
    try {
      if (tipo === 'ping') setRes(await llamar('ping'))
      else if (tipo === 'prod') setRes(await llamar('ping', { ambiente: 'prod' }))
      else if (tipo === 'cotprod') setRes(await llamar('cotizar', { ambiente: 'prod', destino: '11001000', valoracion: 832000, detalle: [{ alto: 40, ancho: 30, largo: 40, peso: 20, unidades: 1 }] }))
      else setRes(await llamar('cotizar', { destino: '11001000', valoracion: 832000, detalle: [{ alto: 40, ancho: 30, largo: 40, peso: 20, unidades: 1 }] }))
    } catch (e) { setRes({ error: e.message || String(e) }) }
    setBusy('')
  }
  return (
    <div className="dsp-nota" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn" disabled={!!busy} onClick={() => probar('ping')}>{busy === 'ping' ? 'Probando…' : 'Probar conexión'}</button>
      <button type="button" className="btn" disabled={!!busy} onClick={() => probar('cotizar')}>{busy === 'cotizar' ? 'Cotizando…' : 'Cotizar caja a Bogotá (prueba)'}</button>
      <button type="button" className="btn" disabled={!!busy} onClick={() => probar('prod')}>{busy === 'prod' ? 'Probando…' : 'Probar credenciales en PRODUCCIÓN'}</button>
      <button type="button" className="btn" disabled={!!busy} onClick={() => probar('cotprod')}>{busy === 'cotprod' ? 'Cotizando…' : 'Cotizar en PRODUCCIÓN (tarifa real)'}</button>
      {res && <code style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, maxWidth: 700 }}>{JSON.stringify(res, null, 1)}</code>}
    </div>
  )
}
