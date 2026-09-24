import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadPedidosTodos, dbLoadDespachos, dbUpsertDespacho } from '../lib/db.js'
import DespacharModal from './DespacharModal.jsx'
import { dbInsertGuia, dbLoadCiudadesDane, dbLoadCiudadSyd, dbLoadGuias, dbLoadLibreta, dbUpsertLibreta } from '../lib/db.js'
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
const CHIP_DECISION = { despachar: 'verde', parcial: 'ambar', no: 'rojo', completo: 'azul', esperar: '' }
const ETIQUETA_LINEA = {
  cerrada: ['', 'Producción cerrada'], facturado: ['azul', 'Facturado'],
  separado: ['verde', 'Separado'], porSeparar: ['ambar', 'Por separar'],
}

export default function DespachosView({
  stamp, stampDespachos, usuario, refMap, onViewImage, onOpenRef, cerradas, onCerrarRef,
  // Inyectables para probar la vista con datos fijos, sin sesión.
  cargarPedidos = dbLoadPedidosTodos, cargarDespachos = dbLoadDespachos, guardarDespacho = dbUpsertDespacho,
}) {
  const [filas, setFilas] = useState(null)
  const [registros, setRegistros] = useState(null)
  // Coordinadora: libreta de destinatarios, guías generadas y ciudades DANE.
  const [libreta, setLibreta] = useState({})
  const [guias, setGuias] = useState([])
  const [ciudadesDane, setCiudadesDane] = useState([])
  const [danePorCiudad, setDanePorCiudad] = useState({})
  const [despachando, setDespachando] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.all([dbLoadLibreta(), dbLoadGuias()]).then(([l, g]) => { if (vivo) { setLibreta(l); setGuias(g) } }).catch((e) => console.error('Coordinadora:', e))
    return () => { vivo = false }
  }, [stampDespachos])
  useEffect(() => {
    dbLoadCiudadesDane().then(setCiudadesDane).catch(() => {})
    dbLoadCiudadSyd().then(setDanePorCiudad).catch(() => {})
  }, [])
  const guiaDe = useMemo(() => { const m = {}; guias.forEach((g) => { if (!m[g.cliente_key]) m[g.cliente_key] = g }); return m }, [guias])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null) // nombre del cliente abierto
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

  const clientes = useMemo(() => armarDespachos(filas || [], registros || {}, cerradas), [filas, registros, cerradas])
  const ciudades = useMemo(() => [...new Set(clientes.map((c) => c.ciudad).filter(Boolean))].sort(), [clientes])

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase()
    const fn = (FILTROS.find((f) => f.key === filtro) || FILTROS[0]).f
    let l = clientes.filter(fn)
    if (ciudad) l = l.filter((c) => c.ciudad === ciudad)
    if (term) l = l.filter((c) => [c.cliente, c.ciudad, c.codigo].some((v) => String(v || '').toLowerCase().includes(term)))
    const accessors = {
      cliente: (c) => c.cliente, ciudad: (c) => c.ciudad || '',
      vendido: (c) => c.vendido, separadoVig: (c) => c.separadoVig, facturado: (c) => c.facturado,
      pendiente: (c) => c.pendiente, faltante: (c) => c.faltante, valorFalt: (c) => c.valorFalt,
      decision: (c) => c.decision.label,
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

      <div className="prog-kpis dsp-kpis">
        <div className="prog-kpi"><span>Pendiente por despachar</span><b>{num(tot.pendiente)}</b><em>{num(tot.vendido)} vendidas · {num(tot.facturado)} facturadas</em></div>
        <div className="prog-kpi"><span>Separado vigente</span><b className="dsp-sep">{num(tot.separadoVig)}</b><em>en bodega con nombre de cliente</em></div>
        <div className="prog-kpi alerta"><span>Faltante real</span><b>{num(tot.faltante)}</b><em>{formatPrice(tot.valorFalt) || '$ 0'} · sin contar cerradas</em></div>
        <div className="prog-kpi"><span>Cerrado sin cubrir</span><b>{num(tot.cerrado)}</b><em>referencias que no salen</em></div>
        <div className="prog-kpi dsp-ok"><span>Listos para despachar</span><b>{num(tot.listos)}</b><em>clientes con todo lo abierto separado</em></div>
      </div>

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
                  <td className="num"><Cel n={c.separadoVig} cls="dsp-sep" /></td>
                  <td className="num"><Cel n={c.facturado} /></td>
                  <td className="num strong" title="vendido − facturado">{num(c.pendiente)}</td>
                  <td className="num"><Cel n={c.faltante} cls="dsp-falt" /></td>
                  <td className="num muted">{c.faltante ? formatPrice(c.valorFalt) : <span className="dsp-cero">·</span>}</td>
                  <td className="dsp-decision">
                    <span className={'tag dsp-tag ' + (CHIP_DECISION[c.decision.key] || '')}>{c.decision.label}</span>
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
            <span><b>{num(totLista.separadoVig)}</b> separadas · <b>{num(totLista.faltante)}</b> faltante real · {formatPrice(totLista.valorFalt) || '$ 0'}</span>
          </div>
        </div>
      )}

      <div className="dsp-leyenda">
        <span><b>Separado</b> = separado − facturado del mismo color, referencia por referencia (nunca negativo).</span>
        <span><b>Pendiente</b> = vendido − facturado.</span>
        <span><b>Faltante real</b> = separado por facturar + abierto real; lo cerrado ("no sale") no cuenta.</span>
      </div>

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
          onGuardar={guardar} refMap={refMap} onViewImage={onViewImage} onOpenRef={onOpenRef} onClose={() => setAbierto(null)} />
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
function partesDe(l, t) {
  const v = l.tallas[t] || 0
  const f = Math.min(v, l.factTallas[t] || 0)
  const sp = Math.max(0, Math.min(v, l.sepTallas[t] || 0) - f)
  return { v, f, s: sp, p: v - f - sp }
}

function ClienteModal({ cliente: c, usuario, registros, onGuardar, onCerrarRef, refMap, onViewImage, onOpenRef, onClose }) {
  const [nota, setNota] = useState(c.novedadNota || '')
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
                            <b>{r.ref}</b>
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
    </Modal>
  )
}
