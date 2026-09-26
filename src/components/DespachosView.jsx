import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadPedidosTodos, dbLoadDespachos, dbUpsertDespacho } from '../lib/db.js'
import DespacharModal from './DespacharModal.jsx'
import ProduccionPanel, { LotesDeRef } from './ProduccionPanel.jsx'
import { createPortal } from 'react-dom'
import { dbInsertGuia, dbLoadCiudadesDane, dbLoadCiudadSyd, dbLoadGuias, dbLoadLibreta, dbLoadTarifas, dbUpsertLibreta, dbUpsertTarifa } from '../lib/db.js'
import { coordinadora } from '../lib/coordinadora.js'
import { FILTROS_FLETE, UMBRAL, claveTarifa, decisionConFlete, empaqueCorto, empaqueMinimo, fleteDe, tarifasPendientes } from '../lib/flete.js'
import { DONDE, FILTROS_FALTAS, decisionConFaltas, faltasSeparado } from '../lib/faltasSeparado.js'
import { formatPrice } from '../lib/constants.js'
import { nombreDe } from '../lib/procesos.js'
import { CATEGORIAS, categoriaDe, esPedidoEspecial } from '../lib/pedidos.js'
import {
  FILTROS, NOVEDAD_NO_RECIBE, TALLAS, armarDespachos, idCliente, idRef, marcaDe, sumaTallas, totales,
} from '../lib/despachos.js'

// ════════════════════════════════════════════════════════════════════════
// DESPACHOS — segunda vista de Pedidos. Una fila por cliente con vendido,
// separado, facturado, pendiente y faltante real; clic abre el detalle por
// referencia y color, donde se registra lo separado y lo facturado.
// Las cuentas están en lib/despachos.js.
// ════════════════════════════════════════════════════════════════════════

const num = (n) => Number(n || 0).toLocaleString('es-CO')
const fechaHora = (ts) => {
  const d = new Date(Number(ts) || 0)
  return isNaN(d) || !ts ? '' : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
const Cel = ({ n, cls }) => (n ? <span className={cls || ''}>{num(n)}</span> : <span className="dsp-cero">·</span>)
const CHIP_DECISION = { despachar: 'verde', flete: 'verde', completar: 'verde', parcial: 'ambar', faltaPoco: 'ambar', faltaTalla: 'ambar', no: 'rojo', completo: 'azul', esperar: '' }
const CLASE_FLETE = { ok: 'ok', amb: 'amb', no: 'no' }
const ETIQUETA_LINEA = {
  cerrada: ['', 'Producción cerrada'], facturado: ['azul', 'Facturado'],
  separado: ['verde', 'Separado'], porSeparar: ['ambar', 'Por separar'],
}

export default function DespachosView({
  stamp, stampDespachos, usuario, refMap, onViewImage, onOpenRef, cerradas, onCerrarRef,
  // Para el panel "en qué va" de una referencia: órdenes de Factory, fichas
  // (conjuntos y códigos), programaciones (estado de tela) y procesos (cortador).
  orders, refs, programaciones, procesos,
  // Inyectables para probar la vista con datos fijos, sin sesión.
  cargarPedidos = dbLoadPedidosTodos, cargarDespachos = dbLoadDespachos, guardarDespacho = dbUpsertDespacho,
  cargarTarifas = dbLoadTarifas, guardarTarifa = dbUpsertTarifa, llamar = coordinadora,
  cargarLibreta = dbLoadLibreta, cargarCiudadSyd = dbLoadCiudadSyd,
}) {
  const [filas, setFilas] = useState(null)
  // Tarifas de Coordinadora por ciudad y empaque (flete por unidad).
  const [tarifas, setTarifas] = useState({})
  const [cotizando, setCotizando] = useState(0)
  const cotizandoRef = useRef(false)
  useEffect(() => {
    let vivo = true
    cargarTarifas().then((t) => { if (vivo) setTarifas(t || {}) }).catch((e) => console.error('Tarifas:', e))
    return () => { vivo = false }
  }, [cargarTarifas])
  const [registros, setRegistros] = useState(null)
  // Coordinadora: libreta de destinatarios, guías generadas y ciudades DANE.
  const [libreta, setLibreta] = useState({})
  const [guias, setGuias] = useState([])
  const [ciudadesDane, setCiudadesDane] = useState([])
  const [danePorCiudad, setDanePorCiudad] = useState({})
  const [despachando, setDespachando] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.all([cargarLibreta(), dbLoadGuias().catch(() => [])]).then(([l, g]) => { if (vivo) { setLibreta(l || {}); setGuias(g || []) } }).catch((e) => console.error('Coordinadora:', e))
    return () => { vivo = false }
  }, [stampDespachos, cargarLibreta])
  useEffect(() => {
    dbLoadCiudadesDane().then(setCiudadesDane).catch(() => {})
    cargarCiudadSyd().then(setDanePorCiudad).catch(() => {})
  }, [cargarCiudadSyd])
  const guiaDe = useMemo(() => { const m = {}; guias.forEach((g) => { if (!m[g.cliente_key]) m[g.cliente_key] = g }); return m }, [guias])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null) // nombre del cliente abierto
  const [faltaDe, setFaltaDe] = useState(null) // { cliente, i }: panel de la talla que falta
  const { sortKey, sortDir, toggle } = useSort('pendiente', 'desc')

  useEffect(() => {
    let vivo = true
    cargarPedidos()
      .then((f) => { if (vivo) { setFilas(f); setError('') } })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [stamp, cargarPedidos])

  useEffect(() => {
    let vivo = true
    cargarDespachos()
      .then((r) => { if (vivo) setRegistros(r) })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [stampDespachos, cargarDespachos])

  const clientesBase = useMemo(() => armarDespachos(filas || [], registros || {}, cerradas), [filas, registros, cerradas])
  // El DANE del cliente: el de su libreta, o el de su ciudad de SYD.
  const daneDe = (c) => (libreta[c.cliente] && libreta[c.cliente].dane) || danePorCiudad[c.ciudad] || ''
  // Con el flete por unidad de lo separado encima, y la decisión ajustada.
  // Separado incompleto: tallas que faltan en líneas ya separadas y dónde
  // están (libre, taller, corte, por programar, cerrada). Se arma una vez por
  // carga; necesita las órdenes y fichas que llegan por `produccion`.
  const faltas = useMemo(() => faltasSeparado(clientesBase, { filasSyd: filas || [], orders: orders || [], refs: refs || [], programaciones: programaciones || [], procesos: procesos || {}, cerradas }),
    [clientesBase, filas, orders, refs, programaciones, procesos, cerradas])
  const clientes = useMemo(() => clientesBase.map((c) => {
    const flete = fleteDe(c.lineas, daneDe(c), tarifas)
    const f = faltas.get(c.cliente) || null
    return { ...c, flete, faltas: f, decision: decisionConFaltas(decisionConFlete(c.decision, flete, formatPrice), f) }
  }), [clientesBase, libreta, danePorCiudad, tarifas, faltas])

  // Cotiza en segundo plano las ciudades con separado que no tienen tarifa
  // (o la tienen vieja): una vez por ciudad y empaque, de a dos a la vez, y
  // guarda cada una apenas llega para que la tabla se vaya pintando. La cola
  // vive en un ref para que un refresco de la tabla (cada 2 min) no la
  // cancele ni la duplique; lo ya pedido no se vuelve a pedir en la sesión.
  const colaRef = useRef({ pendientes: new Map(), pedidas: new Set(), corriendo: false, vivo: true })
  const [errorCot, setErrorCot] = useState('')
  useEffect(() => { const q = colaRef.current; q.vivo = true; return () => { q.vivo = false } }, [])
  useEffect(() => {
    const q = colaRef.current
    if (q.parada) return // Coordinadora no está cotizando: se reintenta al recargar la página.
    tarifasPendientes(clientesBase, daneDe, tarifas).forEach((p) => {
      const k = claveTarifa(p.dane, p.empaque.key)
      if (!q.pendientes.has(k) && !q.pedidas.has(k)) q.pendientes.set(k, p)
    })
    if (q.corriendo || !q.pendientes.size) return
    q.corriendo = true
    setCotizando(q.pendientes.size)
    const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
    const una = async () => {
      while (q.pendientes.size && q.vivo) {
        const [k, { dane, empaque: e }] = q.pendientes.entries().next().value
        q.pendientes.delete(k); q.pedidas.add(k)
        // De a una y con pausa: el cotizador de Coordinadora rechaza las
        // ráfagas. Si responde "isError" se reintenta una vez.
        for (let intento = 0; intento < 2 && q.vivo; intento++) {
          let r = null
          try {
            r = await llamar('cotizar', { destino: dane, valoracion: e.valor, detalle: [{ alto: e.alto, ancho: e.ancho, largo: e.largo, peso: e.peso, unidades: 1 }] })
          } catch (err) {
            console.error('Cotizar', dane, e.key, err)
            if (q.vivo) setErrorCot(`No se pudo cotizar ${dane} (${e.label}): ${err.message || err}`)
            r = { ok: false, data: { error: String(err.message || err) } }
          }
          const d = r && r.data && r.data.data
          if (r && r.ok && d && Number(d.flete_total) > 0) {
            const fila = { dane, empaque: e.key, fijo: Math.round(Number(d.flete_fijo) || 0), variable: Math.round(Number(d.flete_variable) || 0), flete: Math.round(Number(d.flete_total) || 0), valoracion: e.valor, dias: Number(d.dias_entrega) || null, peso_liquidado: Number(d.peso_liquidado) || null, ambiente: r.ambiente || '', raw: r.data }
            await guardarTarifa(fila).catch((err) => { console.error('Tarifa:', err); setErrorCot('No se pudo guardar la tarifa: ' + (err.message || err)) })
            if (q.vivo) setTarifas((t) => ({ ...t, [k]: { ...fila, at: new Date().toISOString() } }))
            q.seguidos = 0
            break
          }
          const msg = r && r.data ? (r.data.error?.message || r.data.error || r.data.message || JSON.stringify(r.data).slice(0, 200)) : 'sin respuesta'
          console.error('Cotizar', dane, e.key, msg)
          if (intento === 0) { await pausa(1500); continue }
          if (q.vivo) setErrorCot(`Coordinadora no cotizó ${dane} (${e.label}): ${msg}`)
          // El rechazo también se guarda (flete 0) para poder leer el motivo
          // exacto; se vuelve a intentar pasada una hora.
          await guardarTarifa({ dane, empaque: e.key, fijo: 0, variable: 0, flete: 0, valoracion: e.valor, dias: null, peso_liquidado: null, ambiente: (r && r.ambiente) || '', raw: r && r.data }).catch(() => {})
          // Tres rechazos seguidos con el mismo motivo: el cotizador está
          // caído para la cuenta, no para una ciudad. Se para la cola y se
          // avisa una sola vez; al recargar la página se vuelve a intentar.
          q.seguidos = (q.ultimoError === msg ? (q.seguidos || 0) : 0) + 1
          q.ultimoError = msg
          if (q.seguidos >= 3) {
            q.pendientes.clear()
            q.parada = true
            if (q.vivo) setErrorCot(`Coordinadora no está cotizando ahora (${msg}). Se dejó de pedir; al recargar la página se vuelve a intentar.`)
          }
        }
        if (q.vivo) setCotizando(q.pendientes.size + (q.corriendo ? 1 : 0))
        await pausa(400)
      }
    }
    una().finally(() => { q.corriendo = false; if (q.vivo) setCotizando(0) })
  }, [clientesBase, libreta, danePorCiudad, tarifas]) // eslint-disable-line react-hooks/exhaustive-deps
  // Lo que el panel de producción de una referencia necesita; se arma una
  // sola vez para que el panel no recalcule con cada pintada.
  const produccion = useMemo(() => ({ filasSyd: filas || [], orders: orders || [], refs: refs || [], programaciones: programaciones || [], procesos: procesos || {} }),
    [filas, orders, refs, programaciones, procesos])
  const ciudades = useMemo(() => [...new Set(clientes.map((c) => c.ciudad).filter(Boolean))].sort(), [clientes])

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase()
    const fn = ([...FILTROS, ...FILTROS_FALTAS, ...FILTROS_FLETE].find((f) => f.key === filtro) || FILTROS[0]).f
    let l = clientes.filter(fn)
    if (ciudad) l = l.filter((c) => c.ciudad === ciudad)
    if (term) l = l.filter((c) => [c.cliente, c.ciudad, c.codigo].some((v) => String(v || '').toLowerCase().includes(term)))
    const accessors = {
      cliente: (c) => c.cliente, ciudad: (c) => c.ciudad || '',
      vendido: (c) => c.vendido, separadoVig: (c) => c.separadoVig, facturado: (c) => c.facturado,
      pendiente: (c) => c.pendiente, faltante: (c) => c.faltante, valorFalt: (c) => c.valorFalt,
      decision: (c) => c.decision.label,
      flete: (c) => (c.flete && c.flete.mejor ? c.flete.mejor.porUnidad : 9e9),
    }
    return sortRows(l, accessors[sortKey] || accessors.pendiente, sortDir)
  }, [clientes, filtro, ciudad, q, sortKey, sortDir])

  const tot = useMemo(() => totales(clientes), [clientes])
  const totLista = useMemo(() => totales(lista), [lista])
  const thProps = { sortKey, sortDir, onSort: toggle }
  const clienteAbierto = abierto ? clientes.find((c) => c.cliente === abierto) : null

  // Se pinta de una y se guarda detrás; si falla, se avisa y la marca de
  // dev_sync vuelve a traer lo que de verdad quedó.
  function guardar(id, data) {
    setRegistros((r) => ({ ...(r || {}), [id]: data }))
    guardarDespacho(id, data).catch((e) => { console.error(e); setError('No se pudo guardar: ' + (e.message || e)) })
  }

  return (
    <>
      {error && <div className="ct-error">{error}</div>}

      <KpisDespachos tot={tot} />

      <div className="view-actions" style={{ marginBottom: 12 }}>
        <div className="dis-filtros">
          {FILTROS.map((f) => {
            const n = clientes.filter(f.f).length
            if (!n && filtro !== f.key && f.key !== 'todos') return null
            return (
              <button key={f.key} type="button" className={'proc-f-btn' + (filtro === f.key ? ' on' : '')}
                onClick={() => setFiltro(f.key)}>{f.label} <b>{n}</b></button>
            )
          })}
          <span className="dsp-f-sep" />
          {FILTROS_FALTAS.map((f) => {
            const n = clientes.filter(f.f).length
            if (!n && filtro !== f.key) return null
            return (
              <button key={f.key} type="button" className={'proc-f-btn dsp-f-' + f.clase + (filtro === f.key ? ' on' : '')}
                title={f.key === 'incompleto' ? 'Líneas separadas a las que les falta alguna talla' : 'La talla que falta está libre en bodega'}
                onClick={() => setFiltro(f.key)}><i />{f.label} <b>{n}</b></button>
            )
          })}
          <span className="dsp-f-sep" />
          {FILTROS_FLETE.map((f) => {
            const n = clientes.filter(f.f).length
            if (!n && filtro !== f.key) return null
            return (
              <button key={f.key} type="button" className={'proc-f-btn dsp-f-' + f.clase + (filtro === f.key ? ' on' : '')}
                onClick={() => setFiltro(f.key)}><i />{f.label} <b>{n}</b></button>
            )
          })}
          {cotizando > 0 && <span className="muted dsp-cotizando" title="Pidiendo a Coordinadora la tarifa de las ciudades que faltan">cotizando {cotizando}…</span>}
          {errorCot && <span className="dsp-cotizando dsp-err" title={errorCot}>{errorCot.length > 120 ? errorCot.slice(0, 118) + '…' : errorCot}</span>}
        </div>
        <select className="input dsp-ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} title="Filtrar por ciudad">
          <option value="">Todas las ciudades</option>
          {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <SearchInput value={q} onChange={setQ} placeholder="Cliente, ciudad o código…" />
      </div>

      {filas === null || registros === null ? (
        <div className="empty-state"><p>Cargando los despachos…</p></div>
      ) : lista.length === 0 ? (
        <div className="empty-state"><p>{clientes.length ? 'Ningún cliente coincide con el filtro.' : 'Todavía no hay pedidos sincronizados.'}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table dsp-tabla">
            <thead>
              <tr>
                <SortTh label="Cliente" col="cliente" {...thProps} />
                <SortTh label="Ciudad" col="ciudad" {...thProps} />
                <SortTh label="Vendido" col="vendido" className="num" {...thProps} />
                <SortTh label="Separado" col="separadoVig" className="num" {...thProps} />
                <SortTh label="Flete por unidad · caja / paq 5 kg / paq 1–2 kg" col="flete" {...thProps} />
                <SortTh label="Facturado" col="facturado" className="num" {...thProps} />
                <SortTh label="Pendiente" col="pendiente" className="num" {...thProps} />
                <SortTh label="Faltante real" col="faltante" className="num" {...thProps} />
                <SortTh label="Valor faltante" col="valorFalt" className="num" {...thProps} />
                <SortTh label="Decisión" col="decision" {...thProps} />
                <th className="dsp-th-guia">Guía</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.cliente} className="row-click" onClick={() => setAbierto(c.cliente)} title="Ver el detalle por referencia y color">
                  <td className="strong dsp-cli">
                    {c.cliente}
                    {c.novedad && <span className="tag dsp-tag rojo">{c.novedad}</span>}
                    {c.inactiva && <span className="tag tag-warn dsp-tag">Inactivo</span>}
                  </td>
                  <td className="muted dsp-ciu">{c.ciudad || '—'}</td>
                  <td className="num">{num(c.vendido)}</td>
                  <td className="num dsp-sep-cel">
                    {c.faltas && <span className={'dsp-falta-pt' + (c.faltas.todasLibres ? ' ok' : '')} title={(c.faltas.nTallas === 1 ? 'Falta 1 talla: ' : `Faltan ${c.faltas.nTallas} tallas: `) + c.faltas.faltas.map((x) => `${x.ref} ${x.color} talla ${x.talla} · ${DONDE[x.donde].label}`).join(' · ')} />}
                    <Cel n={c.separadoVig} cls="dsp-sep" />
                  </td>
                  <td className="dsp-fl"><FleteCel c={c} /></td>
                  <td className="num"><Cel n={c.facturado} /></td>
                  <td className="num strong" title="vendido − facturado">{num(c.pendiente)}</td>
                  <td className="num"><Cel n={c.faltante} cls="dsp-falt" /></td>
                  <td className="num muted">{c.faltante ? formatPrice(c.valorFalt) : <span className="dsp-cero">·</span>}</td>
                  <td className="dsp-decision">
                    {c.faltas && (c.decision.key === 'faltaTalla' || c.decision.key === 'completar')
                      ? <button type="button" className={'tag dsp-tag dsp-tag-btn ' + (CHIP_DECISION[c.decision.key] || '')} title="Ver la referencia y los lotes que traen la talla que falta"
                        onClick={(e) => { e.stopPropagation(); setFaltaDe({ cliente: c.cliente, i: 0 }) }}>{c.decision.label} ›</button>
                      : <span className={'tag dsp-tag ' + (CHIP_DECISION[c.decision.key] || '')}>{c.decision.label}</span>}
                    <span className="muted dsp-motivo">{c.decision.motivo}</span>
                  </td>
                  <td className="dsp-guia" onClick={(e) => e.stopPropagation()}>
                    {guiaDe[c.cliente]
                      ? <><b>{guiaDe[c.cliente].guia}</b><span className="muted dsp-motivo">{String(guiaDe[c.cliente].at || '').slice(0, 10)} · {guiaDe[c.cliente].ambiente === 'test' ? 'prueba' : guiaDe[c.cliente].estado}</span></>
                      : <button type="button" className="btn dsp-btn-desp" onClick={() => setDespachando(c)}>Despachar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{num(lista.length)} de {num(clientes.length)} clientes</span>
            <span><b>{num(totLista.vendido)}</b> vendidas · <b>{num(totLista.facturado)}</b> facturadas · <b>{num(totLista.faltanteVF)}</b> faltante · {formatPrice(totLista.valorFaltVF) || '$ 0'} · <b>{num(totLista.separadoVig)}</b> separadas</span>
          </div>
        </div>
      )}

      <div className="dsp-leyenda">
        <span><b>Flete por unidad</b> = flete de Coordinadora de lo separado ÷ unidades, en cada empaque; verde hasta {formatPrice(UMBRAL.sale)}, ámbar hasta {formatPrice(UMBRAL.faltaPoco)}, tachado si no cabe; el recuadro marca el más barato de los que caben.</span>
        <span><b>Separado</b> = separado − facturado del mismo color, referencia por referencia (nunca negativo).</span>
        <span><b>Pendiente</b> = vendido − facturado.</span>
        <span><b>Faltante real</b> = separado por facturar + abierto real; lo cerrado ("no sale") no cuenta.</span>
      </div>

      {faltaDe && produccion && (() => {
        const cf = clientes.find((x) => x.cliente === faltaDe.cliente)
        return cf && cf.faltas ? (
          <FaltaPanel c={cf} elegida={faltaDe.i} onElegir={(i) => setFaltaDe({ cliente: cf.cliente, i })}
            refMap={refMap} onViewImage={onViewImage} produccion={produccion} onClose={() => setFaltaDe(null)} />
        ) : null
      })()}

      {despachando && (
        <DespacharModal cliente={despachando.cliente} ciudadSyd={despachando.ciudad} usuario={usuario}
          pedidos={[...new Set(despachando.lineas.flatMap((l) => l.pedidos || []))].sort()} unidades={despachando.separadoVig}
          libreta={libreta[despachando.cliente]} ciudades={ciudadesDane} danePorCiudad={danePorCiudad}
          onGuardarLibreta={async (d) => { const fila = { ...d, origen: libreta[d.cliente_key] ? (libreta[d.cliente_key].origen || 'manual') : 'manual', usuario }; await dbUpsertLibreta(fila); setLibreta((l) => ({ ...l, [d.cliente_key]: { ...(l[d.cliente_key] || {}), ...fila } })) }}
          onGuiaGenerada={async (g) => { await dbInsertGuia(g); setGuias((l) => [g, ...l]) }}
          onClose={() => setDespachando(null)} />
      )}

      {clienteAbierto && (
        <ClienteModal cliente={clienteAbierto} usuario={usuario} registros={registros || {}} onCerrarRef={onCerrarRef}
          onGuardar={guardar} refMap={refMap} onViewImage={onViewImage} onOpenRef={onOpenRef} onClose={() => setAbierto(null)}
          produccion={produccion} />
      )}
    </>
  )
}

// ── Detalle del cliente: tabla densa, una fila por referencia y color.
//    La celda de cada talla dice en qué va esa unidad: azul separada, verde
//    facturada, sin color pendiente; si la talla está repartida, la celda se
//    parte. Buscador y chips arriba; las acciones (separar por talla, ficha,
//    no sale) van en el menú ⋯ de cada fila. ─────────────────────────────
const FILTROS_REF = [
  { key: 'todas', label: 'Todas', f: () => true },
  { key: 'Casania', label: 'Casania', f: (r) => r.marca === 'Casania' },
  { key: 'Mariset', label: 'Mariset', f: (r) => r.marca === 'Mariset' },
  { key: 'conSep', label: 'Con separado', f: (r) => r.separado > 0 },
  { key: 'porSep', label: 'Por separar', f: (r) => !r.cerrada && r.pendSinSep > 0 },
  { key: 'noSale', label: 'Producción cerrada', f: (r) => r.cerrada },
]

// Cómo se reparte lo vendido de una talla: facturado, separado vigente (lo
// separado que aún no se factura) y pendiente sin separar.
// Los cuatro KPIs de Despachos (pedidos por Diego, 26-sep-2026): vendido −
// facturado = faltante, del cual una parte ya está separada en bodega. Cada
// uno en unidades y en valor a precio de lista, con la barra de avance.
const pct = (n, d) => (d > 0 ? (Math.round((n / d) * 1000) / 10).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '—')
function KpisDespachos({ tot }) {
  const v = tot.vendido || 0
  const pFact = v ? (tot.facturado / v) * 100 : 0
  const pSep = v ? (tot.separadoVig / v) * 100 : 0
  const pPor = Math.max(0, 100 - pFact - pSep)
  return (
    <div className="dsp-kp">
      <div className="dsp-kp-cards">
        <div className="dsp-kp-card vend">
          <span className="dsp-kp-t">Vendido</span>
          <b className="dsp-kp-u">{num(tot.vendido)}<small>unid</small></b>
          <span className="dsp-kp-v">{formatPrice(tot.valorVend) || '$ 0'}</span>
          <em>{num(tot.pedidos)} pedidos · {num(tot.clientes)} clientes</em>
        </div>
        <div className="dsp-kp-card fact">
          <i className="dsp-kp-op" title="menos">−</i>
          <span className="dsp-kp-t">Facturado</span>
          <b className="dsp-kp-u">{num(tot.facturado)}<small>unid</small></b>
          <span className="dsp-kp-v">{formatPrice(tot.valorFact) || '$ 0'}</span>
          <em>{pct(tot.facturado, v)} de lo vendido</em>
        </div>
        <div className="dsp-kp-card falt">
          <i className="dsp-kp-op" title="igual a">=</i>
          <span className="dsp-kp-t">Faltante</span>
          <b className="dsp-kp-u">{num(tot.faltanteVF)}<small>unid</small></b>
          <span className="dsp-kp-v">{formatPrice(tot.valorFaltVF) || '$ 0'}</span>
          <em>vendido − facturado · {pct(tot.faltanteVF, v)}{tot.cerrado ? ` · ${num(tot.cerrado)} en referencias cerradas` : ''}</em>
        </div>
        <div className="dsp-kp-card sepv">
          <i className="dsp-kp-op" title="parte del faltante">⊂</i>
          <span className="dsp-kp-t">Separado vigente</span>
          <b className="dsp-kp-u">{num(tot.separadoVig)}<small>unid</small></b>
          <span className="dsp-kp-v">{formatPrice(tot.valorSep) || '$ 0'}</span>
          <em>{pct(tot.separadoVig, tot.faltanteVF)} del faltante ya está en bodega · {num(tot.porSeparar)} por separar</em>
        </div>
      </div>
      <div className="dsp-kp-bar" title="Proporción sobre lo vendido">
        <span className="f" style={{ width: pFact + '%' }} />
        <span className="s" style={{ width: pSep + '%' }} />
        <span className="p" style={{ width: pPor + '%' }} />
      </div>
      <div className="dsp-kp-leg">
        <span><i className="f" /><b>Facturado</b> {num(tot.facturado)} · {pct(tot.facturado, v)}</span>
        <span><i className="s" /><b>Separado vigente</b> {num(tot.separadoVig)} · {pct(tot.separadoVig, v)}</span>
        <span><i className="p" /><b>Por separar</b> {num(tot.porSeparar)} · {pct(tot.porSeparar, v)}</span>
        <span className="dsp-kp-de">de <b>{num(tot.vendido)}</b> vendidas</span>
      </div>
    </div>
  )
}

// El flete por unidad de lo separado en los tres empaques, en una celda.
function FleteCel({ c }) {
  const f = c.flete
  if (!f) return <span className="dsp-cero">·</span>
  if (f.estado === 'sinCiudad') return <span className="muted dsp-fl-nota">sin ciudad con código DANE</span>
  return (
    <div className="dsp-emp">
      {f.opciones.map((o) => (
        <div key={o.key} className={(o.sinTarifa ? 'nt' : !o.cabe ? 'nc' : CLASE_FLETE[o.estado]) + (f.mejor && f.mejor.key === o.key ? ' mejor' : '')}
          title={o.sinTarifa ? 'Sin tarifa todavía' : `${o.label}${o.cajas > 1 ? ` × ${o.cajas}` : ''}: flete ${formatPrice(o.flete)} = fijo ${formatPrice(o.fijo)} + 1 % de ${formatPrice(o.valoracion)} declarados · ${o.cabe ? `cabe (hasta ${o.capacidad} und)` : `no cabe (hasta ${o.capacidad} und)`}${o.faltan ? ` · con ${o.faltan} más saldría a ${formatPrice(o.alcanzaria)}` : ''}`}>
          <small>{empaqueMinimo(o)}</small>
          <b>{o.sinTarifa ? '…' : formatPrice(o.porUnidad)}</b>
        </div>
      ))}
    </div>
  )
}

// Ventana "Para completar lo separado" (chip "Falta N talla(s)" de la
// Decisión, o "Ver lotes" en la ventana del cliente). Arriba, las filas del
// cliente de las referencias incompletas, IGUAL que en su ventana (foto,
// referencia, color · pedido y casillas por talla: azul separado, verde
// facturado, blanco pendiente), con la casilla que falta marcada en ámbar.
// Abajo, los lotes de la referencia elegida con esa talla y color resaltados.
function FaltaPanel({ c, elegida, onElegir, refMap, onViewImage, produccion, onClose }) {
  const lista = c.faltas.faltas
  const sel = lista[elegida] || lista[0]
  const refsF = [...new Set(lista.map((x) => x.ref))]
  const lineasDe = (ref) => c.lineas.filter((l) => String(l.ref).toUpperCase() === ref)
  const tallas = TALLAS.filter((t) => refsF.some((ref) => lineasDe(ref).some((l) => Number((l.tallas || {})[t]) > 0)))
  const esFalta = (l, t) => lista.some((x) => x.ref === String(l.ref).toUpperCase() && x.color === String(l.color).toUpperCase() && x.talla === t)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.lightbox')) { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function celda(l, t) {
    const x = partesDe(l, t)
    const falta = esFalta(l, t)
    const cls = falta ? ' fp-falta' : ''
    if (!x.v) return <td key={t} className="num"><span className="dsp-cero">·</span></td>
    const titulo = falta ? `FALTA · ${x.p} por separar de ${x.v}` : `${x.v} vendidas · ${x.f} facturadas · ${x.s} separadas · ${x.p} pendientes`
    const estados = (x.f ? 1 : 0) + (x.s ? 1 : 0) + (x.p ? 1 : 0)
    if (estados === 1) return <td key={t} title={titulo} className={'num ' + (x.s ? 'dsp-c-sep' : x.f ? 'dsp-c-fact' : '') + cls}>{x.v}</td>
    return (
      <td key={t} className={'num' + cls} title={titulo}>
        <span className="dsp-mix">
          {x.f > 0 && <span className="f">{x.f}</span>}
          {x.s > 0 && <span className="s">{x.s}</span>}
          {x.p > 0 && <span className="p">{x.p}</span>}
        </span>
      </td>
    )
  }

  return createPortal(
    <div className="pp-raiz" onMouseDown={(e) => e.stopPropagation()}>
      <div className="pp-velo" onMouseDown={onClose} />
      <aside className="pp-panel fp-panel" role="dialog" aria-label={`Para completar lo separado de ${c.cliente}`}>
        <button type="button" className="icon-btn pp-x" onClick={onClose} aria-label="Cerrar">✕</button>
        <h3 className="modal-title pp-titulo">{c.cliente}</h3>
        <p className="eb-meta">
          {c.ciudad ? `${c.ciudad} · ` : ''}{num(c.separadoVig)} prendas separadas · para completarlo {c.faltas.nUnid === 1 ? 'falta' : 'faltan'}{' '}
          <b>{lista.map((x) => `${x.ref} ${x.color} talla ${x.talla}`).join(' · ')}</b>
        </p>

        <div className="med-wrap fp-wrap">
          <table className="med-tabla dsp-det dsp-densa fp-tabla">
            <thead>
              <tr>
                <th /><th>Referencia</th><th>Color</th>
                {tallas.map((t) => <th key={t} className="num">{t}</th>)}
                <th className="num">Unid</th><th className="num dsp-sep">Sep.</th><th className="num dsp-fact">Fact.</th><th className="num dsp-pend">Pend.</th>
              </tr>
            </thead>
            <tbody>
              {refsF.map((ref) => {
                const ls = lineasDe(ref)
                const ficha = refMap && refMap.get(ref)
                const img = ficha && ficha.image
                const cat = categoriaDe(ls[0] && ls[0].descripcion)
                const activa = ref === sel.ref
                const primera = lista.findIndex((x) => x.ref === ref)
                return ls.map((l, i) => (
                  <tr key={l.id} className={(i === 0 ? 'ped-ref-inicio ' : '') + 'fp-fila' + (activa ? ' fp-sel' : '')}
                    onClick={() => onElegir(primera)} title={activa ? '' : 'Ver los lotes de esta referencia'}>
                    <td className="dsp-foto">
                      {i === 0 && (img
                        ? <img src={img} alt={ref} className="thumb" title="Ampliar foto" onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(img) }} />
                        : <span className="thumb empty" title="Sin foto en la ficha">—</span>)}
                    </td>
                    <td className="dsp-refd">
                      {i === 0 && (
                        <>
                          <span className="dsp-punto ambar" />
                          <b>{ref}</b>
                          <span className={'dsp-cat c-' + cat.key}>{cat.label}</span>
                          <span className="dsp-refd-d" title={l.descripcion}>{l.descripcion}</span>
                        </>
                      )}
                    </td>
                    <td>{l.color}<span className="dsp-ped"> · {l.pedidos.join(', ')}</span></td>
                    {tallas.map((t) => celda(l, t))}
                    <td className="num">{num(l.vendido)}</td>
                    <td className="num"><Cel n={l.sepVig} cls="dsp-sep" /></td>
                    <td className="num"><Cel n={l.facturado} cls="dsp-fact" /></td>
                    <td className="num dsp-pend">{num(Math.max(l.vendido - l.facturado, 0))}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
        <div className="fp-ley">
          <span><i className="s" />separado</span><span><i className="f" />facturado</span><span><i className="p" />pendiente</span><span><i className="x" />la que falta</span>
          {refsF.length > 1 && <span className="muted">· toca una referencia para ver sus lotes</span>}
        </div>

        <p className="pp-tit fp-lotes-t">Lotes de {sel.ref} · <span className="fp-busca">{sel.color} talla {sel.talla}</span> resaltada</p>
        <LotesDeRef codigo={sel.ref} cerrada={c.lineas.some((l) => String(l.ref).toUpperCase() === sel.ref && l.cerrada)} datos={produccion} foco={sel} />
      </aside>
    </div>,
    document.body,
  )
}

// "Para completar lo separado": las tallas que faltan en las líneas ya
// separadas del cliente, dónde está cada una y qué hacer.
function ParaCompletar({ c, refMap, onVer }) {
  const f = c.faltas
  if (!f) return null
  return (
    <div className="dsp-comp">
      <div className="dsp-comp-cab">
        <b>Para completar lo separado</b> · {f.nTallas} {f.nTallas === 1 ? 'talla' : 'tallas'} · {num(f.nUnid)} {f.nUnid === 1 ? 'unidad' : 'unidades'}
        {f.todasLibres && <span className="tag dsp-tag verde">todo está libre en bodega</span>}
      </div>
      <table className="dsp-comp-t">
        <thead><tr><th>Referencia</th><th>Color</th><th className="num">Talla</th><th className="num">Falta</th><th className="num">Separado</th><th>Dónde está</th><th>Qué hacer</th></tr></thead>
        <tbody>
          {f.faltas.map((x, i) => {
            const ficha = refMap && refMap.get(x.ref)
            const d = DONDE[x.donde]
            return (
              <tr key={i}>
                <td><b>{x.ref}</b> <span className="muted dsp-comp-d" title={x.descripcion || (ficha && ficha.descripcion) || ''}>{x.descripcion || (ficha && ficha.descripcion) || ''}</span></td>
                <td>{x.color}</td>
                <td className="num">{x.talla}</td>
                <td className="num dsp-falt">{num(x.n)}</td>
                <td className="num" title="Separado de lo vendido en esta referencia y color"><span className="dsp-sep">{num(x.sepLinea)}</span><span className="muted"> de {num(x.vendLinea)}</span></td>
                <td><span className={'dsp-donde ' + d.clase}>{d.label}{x.detalle ? ` · ${x.detalle}` : ''}</span></td>
                <td className="muted dsp-comp-hacer">{d.hacer}{onVer && <button type="button" className="dsp-comp-ver" onClick={() => onVer(i)}>Ver lotes ›</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// La comparación completa de los tres empaques, en la ventana del cliente.
function FleteComparacion({ c }) {
  const f = c.flete
  if (!f) return null
  const cats = Object.entries(f.cats).map(([k, n]) => `${n} ${({ blusa: 'blusa', vestido: 'vestido', pantalon: 'pantalón', conjunto: 'conjunto', otros: 'otras' })[k] || k}${n > 1 && k !== 'otros' ? 's' : ''}`).join(', ')
  return (
    <div className="dsp-flcomp">
      <div className="dsp-flcomp-cab">
        <b>Flete de las {num(f.unid)} separadas</b> · {f.peso} kg estimados ({cats})
        {f.estado === 'sinCiudad' ? <span className="dsp-err"> · la ciudad no tiene código DANE: se asigna en Despachar</span>
          : f.estado === 'cotizando' ? <span className="muted"> · cotizando…</span>
            : f.mejor ? <span className="muted"> · mejor: {empaqueCorto(f.mejor)} a <b className={'dsp-fl-' + f.mejor.estado}>{formatPrice(f.mejor.porUnidad)}/und</b>{f.paraSalir ? ` · con ${f.paraSalir.faltan} más saldría a ${formatPrice(f.paraSalir.alcanzaria)} en ${empaqueCorto(f.paraSalir)}` : ''}</span> : null}
      </div>
      {f.estado !== 'sinCiudad' && (
        <table className="dsp-flcomp-t">
          <thead><tr><th>Empaque</th><th className="num">Cabe</th><th className="num">Fijo</th><th className="num">1 % declarado</th><th className="num">Flete</th><th className="num">Por unidad</th><th>Entrega</th><th>Para que salga a {formatPrice(UMBRAL.sale)}</th></tr></thead>
          <tbody>
            {f.opciones.map((o) => (
              <tr key={o.key} className={f.mejor && f.mejor.key === o.key ? 'mejor' : !o.cabe ? 'nc' : ''}>
                <td>{o.label} <span className="muted">· {o.nota}</span>{f.mejor && f.mejor.key === o.key && <span className="tag dsp-tag verde">mejor</span>}</td>
                <td className="num">{o.cabe ? (o.key === 'caja' && o.cajas > 1 ? `${o.cajas} cajas` : 'sí') : `no · hasta ${o.capacidad}`}</td>
                {o.sinTarifa ? <td colSpan={5} className="muted">sin tarifa todavía</td> : (
                  <>
                    <td className="num">{formatPrice(o.fijo)}</td>
                    <td className="num">{formatPrice(o.variable)} <span className="muted">({formatPrice(o.valoracion)})</span></td>
                    <td className="num">{formatPrice(o.flete)}</td>
                    <td className={'num strong dsp-fl-' + o.estado}>{formatPrice(o.porUnidad)}</td>
                    <td>{o.dias ? `${o.dias} ${o.dias === 1 ? 'día' : 'días'}` : '—'}</td>
                  </>
                )}
                <td className="muted">{o.sinTarifa ? '' : !o.cabe ? 'no cabe lo separado' : o.estado === 'ok' ? 'ya sale' : o.faltan ? `con ${o.faltan} más (${formatPrice(o.alcanzaria)})` : 'no alcanza en este empaque'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function partesDe(l, t) {
  const v = l.tallas[t] || 0
  const f = Math.min(v, l.factTallas[t] || 0)
  const sp = Math.max(0, Math.min(v, l.sepTallas[t] || 0) - f)
  return { v, f, s: sp, p: v - f - sp }
}

function ClienteModal({ cliente: c, usuario, registros, onGuardar, onCerrarRef, refMap, onViewImage, onOpenRef, onClose, produccion }) {
  const [nota, setNota] = useState(c.novedadNota || '')
  const [prodDe, setProdDe] = useState(null) // referencia con el panel "en qué va" abierto
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [cat, setCat] = useState('') // categoría: vestido, conjunto, pantalón, blusa
  const [menuDe, setMenuDe] = useState(null)   // id de la línea con el menú abierto
  const [editando, setEditando] = useState(null) // id de la línea en edición
  const [edit, setEdit] = useState({ sep: {}, fact: {} })
  const ultimo = c.lineas.map((l) => l.registro).filter((r) => r && r.at).sort((a, b) => b.at - a.at)[0]

  // Referencias con sus líneas y sus totales, por marca y código ascendente.
  const refs = useMemo(() => {
    const m = new Map()
    c.lineas.forEach((l) => {
      if (!m.has(l.ref)) m.set(l.ref, { ref: l.ref, descripcion: l.descripcion, categoria: categoriaDe(l.descripcion), marca: marcaDe(l.ref), cerrada: l.cerrada, lineas: [], vendido: 0, separado: 0, facturado: 0 })
      const r = m.get(l.ref)
      r.lineas.push(l); r.vendido += l.vendido; r.separado += l.separado; r.facturado += l.facturado
    })
    const orden = { Casania: 0, Mariset: 1, Otra: 2 }
    return [...m.values()].map((r) => {
      const sepVig = r.lineas.reduce((n, l) => n + l.sepVig, 0)
      const pend = Math.max(r.vendido - r.facturado, 0)
      return {
        ...r, sepVig, pend, pendSinSep: Math.max(pend - sepVig, 0),
        // Mismo código de color que las celdas: verde facturado, azul separado.
        punto: r.cerrada ? 'gris' : r.facturado >= r.vendido ? 'verde' : sepVig >= pend && sepVig > 0 ? 'azul' : r.separado > 0 ? 'ambar' : 'vacio',
      }
    }).sort((a, b) => (orden[a.marca] - orden[b.marca]) || a.ref.localeCompare(b.ref, 'es', { numeric: true }))
  }, [c.lineas])

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase()
    const fn = (FILTROS_REF.find((f) => f.key === filtro) || FILTROS_REF[0]).f
    return refs.filter(fn).filter((r) => !cat || r.categoria.key === cat).filter((r) => !term
      || r.ref.toLowerCase().includes(term) || (r.descripcion || '').toLowerCase().includes(term)
      || r.categoria.label.toLowerCase().includes(term)
      || r.lineas.some((l) => l.color.toLowerCase().includes(term)))
  }, [refs, q, filtro, cat])

  const tallas = useMemo(() => {
    const st = new Set()
    c.lineas.forEach((l) => Object.keys(l.tallas || {}).forEach((t) => st.add(t)))
    return TALLAS.filter((t) => st.has(t))
  }, [c.lineas])
  const pedidos = useMemo(() => [...new Set(c.lineas.flatMap((l) => l.pedidos))].sort(), [c.lineas])
  const valorTotal = c.lineas.reduce((n, l) => n + l.valor, 0)
  const nCols = 10 + tallas.length

  function empezar(l) {
    setMenuDe(null)
    setEditando(l.id)
    setEdit({ sep: { ...(l.sepTallas || {}) }, fact: { ...(l.factTallas || {}) } })
  }
  function poner(campo, talla, valor) {
    setEdit((e) => ({ ...e, [campo]: { ...e[campo], [talla]: Math.max(0, Math.round(Number(valor) || 0)) } }))
  }
  function guardarEdicion(l) {
    const limpiar = (t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v > 0))
    const sepTallas = limpiar(edit.sep), factTallas = limpiar(edit.fact)
    const previo = registros[l.id] || {}
    onGuardar(l.id, { ...previo, sepTallas, factTallas, separado: sumaTallas(sepTallas), facturado: sumaTallas(factTallas), usuario, at: Date.now() })
    setEditando(null)
  }
  function cerrarRef(ref, cerrada) {
    setMenuDe(null)
    // La marca vive en Programaciones (producción cerrada): un solo sitio.
    if (onCerrarRef) { onCerrarRef(ref, cerrada); return }
    const previo = registros[idRef(ref)] || {}
    onGuardar(idRef(ref), { ...previo, cerrada, usuario, at: Date.now() })
  }
  function novedad(valor) {
    const previo = registros[idCliente(c.cliente)] || {}
    onGuardar(idCliente(c.cliente), { ...previo, novedad: valor, nota: nota.trim(), usuario, at: Date.now() })
  }

  // La celda de una talla, pintada según en qué van sus unidades.
  function celdaTalla(l, t) {
    const x = partesDe(l, t)
    if (!x.v) return <td key={t} className="num"><span className="dsp-cero">·</span></td>
    const estados = (x.f ? 1 : 0) + (x.s ? 1 : 0) + (x.p ? 1 : 0)
    const titulo = `${x.v} vendidas · ${x.f} facturadas · ${x.s} separadas · ${x.p} pendientes`
    if (estados === 1) {
      return <td key={t} title={titulo} className={'num ' + (x.s ? 'dsp-c-sep' : x.f ? 'dsp-c-fact' : '')}>{x.v}</td>
    }
    return (
      <td key={t} className="num" title={titulo}>
        <span className="dsp-mix">
          {x.f > 0 && <span className="f">{x.f}</span>}
          {x.s > 0 && <span className="s">{x.s}</span>}
          {x.p > 0 && <span className="p">{x.p}</span>}
        </span>
      </td>
    )
  }

  // Fila de edición por talla (Separado o Facturado) de la línea abierta.
  function FilaEdicion({ l, etiqueta, campo, cls }) {
    return (
      <tr className="dsp-sub editando">
        <td /><td />
        <td className="dsp-sub-et"><span className={cls}>{etiqueta}</span></td>
        {tallas.map((t) => (
          <td key={t} className="num">
            {l.tallas[t] ? (
              <input type="number" min="0" max={l.tallas[t]} className="input dsp-in-t" value={edit[campo][t] || ''}
                placeholder="·" onChange={(e) => poner(campo, t, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(l); if (e.key === 'Escape') { e.stopPropagation(); setEditando(null) } }} />
            ) : <span className="dsp-cero">·</span>}
          </td>
        ))}
        <td className="num"><Cel n={sumaTallas(edit[campo])} cls={cls} /></td>
        <td colSpan={6} className="dsp-edit-acc">
          {campo === 'fact' && (
            <>
              <button type="button" className="btn btn-primary dsp-btn" onClick={() => guardarEdicion(l)}>Guardar</button>
              <button type="button" className="btn dsp-btn" onClick={() => setEditando(null)}>Cancelar</button>
            </>
          )}
        </td>
      </tr>
    )
  }

  let marcaPrevia = ''
  return (
    <Modal open onClose={onClose} size="xl">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">{c.cliente}</h2>
          <p className="eb-meta">
            {c.ciudad ? `${c.ciudad} · ` : ''}{pedidos.length === 1 ? 'pedido ' : 'pedidos '}{pedidos.join(', ')} · {c.refs} referencias · {num(c.vendido)} unidades · {formatPrice(valorTotal) || '$ 0'}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body tal-modal-body">
        {c.novedad && (
          <div className="dsp-nota">
            <b>{c.novedad}.</b> {c.novedadNota ? `"${c.novedadNota}" · ` : ''}
            {nombreDe(c.novedadReg.usuario)} · {fechaHora(c.novedadReg.at)}
          </div>
        )}
        <div className="dsp-resumen">
          <div><span>Pendiente</span><b>{num(c.pendiente)}</b><em>{num(c.vendido)} vend. − {num(c.facturado)} fact.</em></div>
          <div><span>Separado vigente</span><b className="dsp-sep">{num(c.separadoVig)}</b><em>listo en bodega</em></div>
          <div><span>Abierto real</span><b>{num(c.abierto)}</b><em>falta producir o separar</em></div>
          <div><span>Cerrado s/cubrir</span><b className="muted">{num(c.cerrado)}</b><em>no se persigue</em></div>
          <div><span>Faltante real</span><b className="dsp-falt">{num(c.faltante)}</b><em>{formatPrice(c.valorFalt) || '$ 0'}</em></div>
          <div><span>Decisión</span><b><span className={'tag dsp-tag ' + (CHIP_DECISION[c.decision.key] || '')}>{c.decision.label}</span></b><em>{c.decision.motivo}</em></div>
        </div>
        <FleteComparacion c={c} />
        <ParaCompletar c={c} refMap={refMap} onVer={(i) => setProdDe({ falta: i })} />

        <div className="dsp-tool">
          <SearchInput value={q} onChange={setQ} placeholder="Referencia, categoría, descripción o color…" className="dsp-buscar" />
          <div className="dis-filtros">
            {FILTROS_REF.map((f) => {
              const n = refs.filter(f.f).length
              if (!n && filtro !== f.key && f.key !== 'todas') return null
              return (
                <button key={f.key} type="button" className={'proc-f-btn' + (filtro === f.key ? ' on' : '')}
                  onClick={() => setFiltro(f.key)}>{f.label} <b>{n}</b></button>
              )
            })}
          </div>
          <div className="dis-filtros dsp-cats">
            {CATEGORIAS.map((k) => {
              const n = refs.filter((r) => r.categoria.key === k.key).length
              if (!n) return null
              return (
                <button key={k.key} type="button" className={'proc-f-btn' + (cat === k.key ? ' on' : '')}
                  onClick={() => setCat(cat === k.key ? '' : k.key)}>{k.label} <b>{n}</b></button>
              )
            })}
          </div>
          <span className="dsp-ley">
            <span><i className="s" />separado</span><span><i className="f" />facturado</span><span><i className="p" />pendiente</span>
            <span className="dsp-ley-n">{visibles.length} de {refs.length}</span>
          </span>
        </div>

        <div className="med-wrap dsp-scroll">
          <table className="med-tabla dsp-det dsp-densa">
            <thead>
              <tr>
                <th /><th>Referencia</th><th>Color</th>
                {tallas.map((t) => <th key={t} className="num">{t}</th>)}
                <th className="num">Unid</th><th className="num">Precio</th><th className="num">Total</th>
                <th className="num dsp-sep">Sep.</th><th className="num dsp-fact">Fact.</th><th className="num dsp-pend">Pend.</th><th />
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr><td colSpan={nCols} className="muted" style={{ padding: 18, textAlign: 'center' }}>Ninguna referencia coincide.</td></tr>
              )}
              {visibles.map((r) => {
                const filas = []
                if (r.marca !== marcaPrevia) {
                  marcaPrevia = r.marca
                  const delGrupo = visibles.filter((x) => x.marca === r.marca)
                  filas.push(
                    <tr key={'m' + r.marca} className="ped-marca">
                      <td colSpan={nCols}>{r.marca}<span className="muted"> · {delGrupo.length} referencias · {num(delGrupo.reduce((n, x) => n + x.vendido, 0))} unidades</span></td>
                    </tr>,
                  )
                }
                const ficha = refMap && refMap.get(r.ref)
                const img = ficha && ficha.image
                r.lineas.forEach((l, i) => {
                  filas.push(
                    <tr key={l.id} className={(i === 0 ? 'ped-ref-inicio' : '') + (r.cerrada ? ' dsp-cerrada' : '')}>
                      <td className="dsp-foto">
                        {i === 0 && (img
                          ? <img src={img} alt={r.ref} className="thumb" title="Ampliar foto" onClick={() => onViewImage && onViewImage(img)} />
                          : <span className="thumb empty" title="Sin foto en la ficha">—</span>)}
                      </td>
                      <td className="dsp-refd">
                        {i === 0 && (
                          <>
                            <span className={'dsp-punto ' + r.punto} title={{ gris: 'No sale', verde: 'Todo facturado', azul: 'Todo lo pendiente está separado', ambar: 'Separado en parte', vacio: 'Nada separado' }[r.punto]} />
                            <b className="dsp-ref-link" title="En qué va la producción de esta referencia" onClick={() => setProdDe(r.ref)}>{r.ref}</b>
                            <span className={'dsp-cat c-' + r.categoria.key}>{r.categoria.label}</span>
                            <span className="dsp-refd-d" title={r.descripcion}>{r.descripcion}</span>
                            {r.cerrada && <span className="tag dsp-tag">Producción cerrada</span>}
                          </>
                        )}
                      </td>
                      <td>
                        {l.color}<span className="dsp-ped"> · {l.pedidos.join(', ')}</span>
                        {l.obs && esPedidoEspecial(l.obs) && <span className="tag ped-esp dsp-tag" title="Pedido especial">{l.obs}</span>}
                      </td>
                      {tallas.map((t) => celdaTalla(l, t))}
                      <td className="num strong">{num(l.vendido)}</td>
                      <td className="num muted">{formatPrice(l.precio) || '—'}</td>
                      <td className="num">{formatPrice(l.valor) || '—'}</td>
                      <td className="num"><Cel n={l.sepVig} cls="dsp-sep" /></td>
                      <td className="num"><Cel n={l.facturado} cls="dsp-fact" /></td>
                      <td className="num dsp-pend">{num(Math.max(l.vendido - l.facturado, 0))}</td>
                      <td className="dsp-acc">
                        <button type="button" className="dsp-kebab" aria-label="Acciones" title="Separar por talla · ficha · no sale"
                          onClick={() => setMenuDe(menuDe === l.id ? null : l.id)}>⋯</button>
                        {menuDe === l.id && (
                          <>
                            <div className="dsp-menu-fondo" onClick={() => setMenuDe(null)} />
                            <div className="dsp-menu">
                              {!r.cerrada && !l.deSyd && <button type="button" onClick={() => empezar(l)}>Separar por talla…</button>}
                              {l.deSyd && <span className="dsp-menu-nota">Separado y facturado vienen de SYD</span>}
                              <button type="button" onClick={() => { setMenuDe(null); if (onOpenRef) onOpenRef(r.ref) }}>Ver ficha</button>
                              {img && <button type="button" onClick={() => { setMenuDe(null); if (onViewImage) onViewImage(img) }}>Ampliar foto</button>}
                              <button type="button" className="rojo" onClick={() => cerrarRef(r.ref, !r.cerrada)}>
                                {r.cerrada ? 'Reabrir producción' : 'Cerrar producción'}
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>,
                  )
                  if (editando === l.id) {
                    filas.push(<FilaEdicion key={l.id + 's'} l={l} etiqueta="Separado" campo="sep" cls="dsp-sep" />)
                    filas.push(<FilaEdicion key={l.id + 'f'} l={l} etiqueta="Facturado" campo="fact" cls="dsp-fact" />)
                  }
                })
                return filas
              })}
            </tbody>
          </table>
        </div>

        <div className="dsp-acciones">
          {c.novedad ? (
            <button type="button" className="btn" onClick={() => novedad('')}>Quitar "{c.novedad.toLowerCase()}"</button>
          ) : (
            <>
              <input className="input dsp-nota-in" value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Nota de la novedad (opcional)" />
              <button type="button" className="btn" onClick={() => novedad(NOVEDAD_NO_RECIBE)}>Marcar "no recibe más"</button>
            </>
          )}
          <span className="dsp-ultimo">
            {ultimo ? `Último registro: ${nombreDe(ultimo.usuario)} · ${fechaHora(ultimo.at)}` : 'Sin separado ni facturado registrado'}
          </span>
        </div>
      </div>
      {prodDe && produccion && typeof prodDe === 'object' && c.faltas && (
        <FaltaPanel c={c} elegida={prodDe.falta} onElegir={(i) => setProdDe({ falta: i })}
          refMap={refMap} onViewImage={onViewImage} produccion={produccion} onClose={() => setProdDe(null)} />
      )}
      {prodDe && produccion && typeof prodDe === 'string' && (() => {
        const r = refs.find((x) => x.ref === prodDe)
        return r ? (
          <ProduccionPanel codigo={r.ref} descripcion={r.descripcion} cliente={c.cliente} lineas={r.lineas} cerrada={r.cerrada}
            datos={produccion} onClose={() => setProdDe(null)} />
        ) : null
      })()}
    </Modal>
  )
}
