import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadDespachos, dbLoadPedidosTodos, dbUpsertDespacho } from '../lib/db.js'
import { formatDate } from '../lib/constants.js'
import { FILTROS_REF, armarPorReferencia, calcularLibres, totalesRef } from '../lib/porReferencia.js'
import { idCliente } from '../lib/despachos.js'

// ════════════════════════════════════════════════════════════════════════
// POR REFERENCIA — tercera vista de Pedidos. Una fila por referencia: lo que
// entró a bodega, el pedido, lo separado, lo libre y lo que falta producir.
// Al abrirla: a qué clientes se les separó y a cuáles les falta.
// Las cuentas están en lib/porReferencia.js.
// ════════════════════════════════════════════════════════════════════════

const num = (n) => Number(n || 0).toLocaleString('es-CO')
const diaMes = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

export default function PorReferenciaView({
  stamp, stampDespachos, usuario, orders, refs, refMap, onViewImage, onOpenRef,
  // Inyectables para probar sin sesión.
  cargarPedidos = dbLoadPedidosTodos, cargarDespachos = dbLoadDespachos, guardarDespacho = dbUpsertDespacho,
}) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('entrada')
  const [abierta, setAbierta] = useState(null)
  const [libresDe, setLibresDe] = useState(null) // referencia con la ventana de libres abierta
  // Prioridad (★) por cliente: vive en dev_despachos, en el renglón c|CLIENTE.
  const [registros, setRegistros] = useState({})
  // Globo con los lotes de entrada: va con posición fija para que el borde
  // de la tabla (que desplaza a lo ancho) no lo recorte.
  const [lotes, setLotes] = useState(null) // { ref, x, y, arriba }
  const [foto, setFoto] = useState(null) // { src, ref, x, y }: vista rápida al pasar el mouse por la referencia
  const { sortKey, sortDir, toggle } = useSort('ref', 'asc')

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
      .then((r) => { if (vivo) setRegistros(r || {}) })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [stampDespachos, cargarDespachos])

  const prioridades = useMemo(() => {
    const st = new Set()
    Object.entries(registros).forEach(([id, d]) => { if (id.startsWith('c|') && d && d.prioridad) st.add(id.slice(2)) })
    return st
  }, [registros])
  const esPrioridad = (cliente) => prioridades.has(idCliente(cliente).slice(2))
  function alternarPrioridad(cliente) {
    const id = idCliente(cliente)
    const data = { ...(registros[id] || {}), prioridad: !esPrioridad(cliente), usuario, at: Date.now() }
    setRegistros((r) => ({ ...r, [id]: data }))
    guardarDespacho(id, data).catch((e) => { console.error(e); setError('No se pudo guardar: ' + (e.message || e)) })
  }

  const todas = useMemo(() => armarPorReferencia(filas || [], orders, refs), [filas, orders, refs])
  const conEntrada = useMemo(() => todas.filter((r) => r.entro > 0), [todas])
  const tot = useMemo(() => totalesRef(conEntrada), [conEntrada])

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase()
    const fn = (FILTROS_REF.find((f) => f.key === filtro) || FILTROS_REF[0]).f
    let l = todas.filter(fn)
    if (term) l = l.filter((r) => r.ref.toLowerCase().includes(term) || (r.descripcion || '').toLowerCase().includes(term) || r.categoria.label.toLowerCase().includes(term))
    const acc = {
      ref: (r) => r.ref, entro: (r) => r.entro, pedido: (r) => r.pedido, separado: (r) => r.separado,
      libre: (r) => r.libre, falta: (r) => r.faltaProducir, clientes: (r) => r.nConSeparado,
    }
    return sortRows(l, acc[sortKey] || acc.ref, sortDir)
  }, [todas, filtro, q, sortKey, sortDir])

  function abrirLotes(e, r) {
    const b = e.currentTarget.getBoundingClientRect()
    const alto = 34 + r.ordenes.length * 24
    const arriba = b.bottom + alto + 12 > window.innerHeight
    setLotes({ ref: r.ref, x: Math.min(b.left, window.innerWidth - 270), y: arriba ? b.top - alto - 6 : b.bottom + 6 })
  }
  // Foto al pasar el mouse: caja fija (no la recorta la tabla) debajo de la
  // fila, o encima si no cabe. Sin foto no se muestra nada.
  function abrirFoto(e, r) {
    const ficha = refMap && refMap.get(r.ref)
    const src = ficha && ficha.image
    if (!src) return
    const b = e.currentTarget.getBoundingClientRect()
    const alto = 300
    const arriba = b.bottom + alto + 10 > window.innerHeight
    setFoto({ src, ref: r.ref, x: b.left + 175, y: arriba ? Math.max(8, b.top - alto - 4) : b.bottom + 4 })
  }
  useEffect(() => {
    if (!foto) return undefined
    const cerrar = () => setFoto(null)
    window.addEventListener('scroll', cerrar, true)
    return () => window.removeEventListener('scroll', cerrar, true)
  }, [foto])
  const refLotes = lotes ? todas.find((r) => r.ref === lotes.ref) : null

  const thProps = { sortKey, sortDir, onSort: toggle }
  const ref = abierta ? todas.find((r) => r.ref === abierta) : null

  return (
    <>
      {error && <div className="ct-error">{error}</div>}

      <div className="prog-kpis dsp-kpis">
        <div className="prog-kpi"><span>Entró a bodega</span><b>{num(tot.entro)}</b><em>{num(tot.refs)} referencias con pedido</em></div>
        <div className="prog-kpi"><span>Separado</span><b className="dsp-sep">{num(tot.separado)}</b><em>con nombre de cliente</em></div>
        <div className="prog-kpi dsp-ok"><span>Libre en bodega</span><b>{num(tot.libre)}</b><em>entró y no está separado</em></div>
        <div className="prog-kpi"><span>Pedido de esas referencias</span><b>{num(tot.pedido)}</b><em>unidades vendidas</em></div>
        <div className="prog-kpi alerta"><span>Falta producir</span><b>{num(tot.faltaProducir)}</b><em>pedido que aún no entra</em></div>
      </div>

      <div className="view-actions" style={{ marginBottom: 12 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Referencia, categoría o descripción…" />
        <div className="dis-filtros">
          {FILTROS_REF.map((f) => (
            <button key={f.key} type="button" className={'proc-f-btn' + (filtro === f.key ? ' on' : '')}
              onClick={() => setFiltro(f.key)}>{f.label} <b>{todas.filter(f.f).length}</b></button>
          ))}
        </div>
        <span className="dsp-ley pr-ley">
          <span><i className="pr-s" />separado</span><span><i className="pr-l" />libre en bodega</span><span><i className="pr-f" />falta producir</span>
        </span>
      </div>

      {filas === null ? (
        <div className="empty-state"><p>Cargando…</p></div>
      ) : lista.length === 0 ? (
        <div className="empty-state"><p>Ninguna referencia en este filtro.</p></div>
      ) : (
        <div className="table-wrap" onScroll={() => { setLotes(null); setFoto(null) }}>
          <table className="data-table dsp-tabla pr-tabla">
            <thead>
              <tr>
                <SortTh label="Referencia" col="ref" {...thProps} />
                <SortTh label="Entró a bodega" col="entro" {...thProps} />
                <SortTh label="Pedido" col="pedido" className="num" {...thProps} />
                <SortTh label="Separado" col="separado" className="num" {...thProps} />
                <SortTh label="Libre en bodega" col="libre" className="num" {...thProps} />
                <SortTh label="Falta producir" col="falta" className="num" {...thProps} />
                <th>Pedido cubierto</th>
                <SortTh label="Clientes" col="clientes" className="num" {...thProps} />
                <th>Qué hacer</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => {
                const base = Math.max(r.pedido, r.entro, 1)
                const w = (x) => `${Math.round((x / base) * 100)}%`
                const ult = r.ordenes[0]
                return (
                  <tr key={r.ref} className="row-click" onClick={() => setAbierta(r.ref)} title="Ver a qué clientes se les separó">
                    <td className="dsp-cli" title="" onMouseEnter={(e) => abrirFoto(e, r)} onMouseLeave={() => setFoto(null)}>
                      <b>{r.ref}</b>
                      <span className={'dsp-cat c-' + r.categoria.key}>{r.categoria.label}</span>
                      <span className="pr-desc">{r.descripcion}</span>
                    </td>
                    <td className="pr-entro">
                      {!r.entro ? <span className="dsp-cero">—</span> : r.ordenes.length <= 1 ? (
                        <><b>{num(r.entro)}</b><span className="muted"> · {diaMes(r.fechaEntrada)}{ult ? ` · orden ${ult.orden}` : ''}</span></>
                      ) : (
                        // Varios lotes: el total, la fecha del último y una pastilla;
                        // el detalle sale al pasar el mouse o al tocarla.
                        <>
                          <b>{num(r.entro)}</b><span className="muted"> · último {diaMes(r.fechaEntrada)}</span>
                          <span className={'pr-lotes' + (lotes && lotes.ref === r.ref ? ' on' : '')} tabIndex={0}
                            onMouseEnter={(e) => abrirLotes(e, r)} onMouseLeave={() => setLotes(null)}
                            onFocus={(e) => abrirLotes(e, r)} onBlur={() => setLotes(null)}
                            onClick={(e) => { e.stopPropagation(); abrirLotes(e, r) }}>
                            {r.ordenes.length} lotes
                          </span>
                        </>
                      )}
                    </td>
                    <td className="num">{num(r.pedido)}</td>
                    <td className="num">{r.separado ? <span className="dsp-sep">{num(r.separado)}</span> : <span className="dsp-cero">·</span>}</td>
                    <td className="num">
                      {r.entro ? (r.libre ? (
                        <button type="button" className="pr-libre-btn" title="Ver las libres por talla y color, y a quién se le pueden asignar"
                          onClick={(e) => { e.stopPropagation(); setLibresDe(r.ref) }}>{num(r.libre)} ↗</button>
                      ) : <span className="dsp-cero">·</span>) : <span className="dsp-cero">—</span>}
                    </td>
                    <td className="num">{r.entro ? <span className="dsp-falt">{num(r.faltaProducir)}</span> : <span className="dsp-cero">—</span>}</td>
                    <td>
                      <div className="pr-bar" title={`${num(r.separado)} separadas · ${num(r.libre)} libres · ${num(r.entro ? r.faltaProducir : 0)} por producir`}>
                        <b className="pr-s" style={{ width: w(r.separado) }} />
                        <b className="pr-l" style={{ width: w(r.libre) }} />
                        <b className="pr-f" style={{ width: w(r.entro ? r.faltaProducir : 0) }} />
                      </div>
                    </td>
                    <td className="num">{num(r.nConSeparado)} <span className="muted">de {num(r.nClientes)}</span></td>
                    <td>
                      {!r.entro ? <span className="tag dsp-tag">Sin entrada registrada</span>
                        : r.libre > 0 ? <span className="tag dsp-tag verde">Separar {num(r.libre)}</span>
                          : <span className="tag dsp-tag azul">Todo separado</span>}
                      {r.sinEntradaSuficiente && <span className="tag dsp-tag ambar" title="Hay más separado que lo que figura entrado a bodega: la entrada de Factory va atrasada">Revisar entrada</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{num(lista.length)} de {num(todas.length)} referencias</span>
            <span><b>{num(lista.reduce((n, r) => n + r.libre, 0))}</b> libres · <b>{num(lista.reduce((n, r) => n + r.separado, 0))}</b> separadas</span>
          </div>
        </div>
      )}

      {foto && !abierta && !libresDe && (
        <div className="pr-foto-caja" style={{ left: foto.x, top: foto.y }}>
          <img src={foto.src} alt={foto.ref} />
        </div>
      )}

      {refLotes && (
        <div className="pr-lotes-caja" style={{ left: lotes.x, top: lotes.y }}>
          {refLotes.ordenes.map((o) => (
            <span key={o.orden} className="pr-lote">
              <span className="muted">{diaMes(o.fecha)}</span>
              <span>orden {o.orden}{o.muestra ? ' · muestra' : ''}</span>
              <b>{num(o.cant)}</b>
            </span>
          ))}
          <span className="pr-lote pr-lote-tot"><span /><span>Total</span><b>{num(refLotes.entro)}</b></span>
        </div>
      )}

      <div className="dsp-leyenda">
        <span><b>Libre en bodega</b> = lo que entró menos lo separado y lo facturado.</span>
        <span><b>Falta producir</b> = pedido menos lo que ya entró.</span>
        <span>Los conjuntos toman la entrada de la prenda que menos ha entrado.</span>
      </div>

      {libresDe && todas.find((r) => r.ref === libresDe) && (
        <LibresModal r={todas.find((r) => r.ref === libresDe)} prioridades={prioridades}
          esPrioridad={esPrioridad} onPrioridad={alternarPrioridad}
          refMap={refMap} onViewImage={onViewImage} onClose={() => setLibresDe(null)} />
      )}

      {ref && (
        <Modal open onClose={() => setAbierta(null)} size="xl">
          <div className="modal-head">
            <div className="pr-mh">
              {(() => {
                const ficha = refMap && refMap.get(ref.ref)
                const img = ficha && ficha.image
                return img
                  ? <img src={img} alt={ref.ref} className="pr-foto" title="Ampliar foto" onClick={() => onViewImage && onViewImage(img)} />
                  : <span className="pr-foto empty">—</span>
              })()}
              <div>
                <h2 className="modal-title">{ref.ref} <span className={'dsp-cat c-' + ref.categoria.key}>{ref.categoria.label}</span></h2>
                <p className="eb-meta">
                  {ref.descripcion} · {ref.marca}
                  {ref.esConjunto ? ` · conjunto de ${ref.piezas.join(' + ')}` : ''}
                </p>
                <p className="eb-meta">
                  Entró <b>{num(ref.entro)}</b>
                  {ref.ordenes.length > 0 && <> ({ref.ordenes.map((o) => `orden ${o.orden}: ${num(o.cant)} el ${formatDate(o.fecha)}${o.muestra ? ' · muestra' : ''}`).join(' · ')})</>}
                </p>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setAbierta(null)} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body tal-modal-body">
            <div className="dsp-resumen pr-resumen">
              <div><span>Pedido</span><b>{num(ref.pedido)}</b><em>{num(ref.nClientes)} clientes</em></div>
              <div><span>Entró a bodega</span><b>{num(ref.entro)}</b><em>{ref.fechaEntrada ? formatDate(ref.fechaEntrada) : 'sin entrada'}</em></div>
              <div><span>Separado</span><b className="dsp-sep">{num(ref.separado)}</b><em>{num(ref.nConSeparado)} clientes</em></div>
              <div><span>Libre en bodega</span><b className="pr-libre">{num(ref.libre)}</b><em>sin cliente</em></div>
              <div><span>Falta producir</span><b className="dsp-falt">{num(ref.faltaProducir)}</b><em>pedido − entró</em></div>
            </div>
            <div className="med-wrap ped-scroll">
              <table className="med-tabla pr-det">
                <thead>
                  <tr><th>Cliente</th><th>Ciudad</th><th>Pedido</th><th>Colores</th><th className="num">Pidió</th><th className="num">Separado</th><th className="num">Le falta</th></tr>
                </thead>
                <tbody>
                  {[...ref.clientes].sort((a, b) => (b.separado - a.separado) || (b.pidio - a.pidio)).map((c) => (
                    <tr key={c.cliente}>
                      <td><Estrella on={esPrioridad(c.cliente)} onClick={() => alternarPrioridad(c.cliente)} /><b>{c.cliente}</b></td>
                      <td className="muted pr-corta" title={c.ciudad || ''}>{c.ciudad || '—'}</td>
                      <td className="mono muted">{c.pedidos.join(', ')}</td>
                      <td className="muted pr-corta" title={c.colores.join(' · ')}>{c.colores.join(' · ')}</td>
                      <td className="num">{num(c.pidio)}</td>
                      <td className="num">{c.separado ? <span className="dsp-sep">{num(c.separado)}</span> : <span className="dsp-cero">·</span>}</td>
                      <td className="num">{c.falta ? <span className="dsp-falt">{num(c.falta)}</span> : <span className="tag dsp-tag azul">completo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {onOpenRef && (
              <div className="dsp-acciones">
                <button type="button" className="btn" onClick={() => onOpenRef(ref.ref)}>Ver ficha</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

function Estrella({ on, onClick }) {
  return (
    <button type="button" className={'pr-estrella' + (on ? ' on' : '')}
      title={on ? 'Cliente con prioridad: va primero en el reparto. Clic para quitarla.' : 'Dar prioridad a este cliente en el reparto'}
      onClick={(e) => { e.stopPropagation(); onClick() }}>★</button>
  )
}

// ── Libres de una referencia: se lee de arriba abajo como una cuenta.
//    Lo que hay libre por color y talla − lo que se le puede dar a cada
//    cliente en curva completa = lo que de verdad sobra. ─────────────────
function LibresModal({ r, prioridades, esPrioridad, onPrioridad, refMap, onViewImage, onClose }) {
  // Las prioridades llegan normalizadas (como en el id c|CLIENTE); el cálculo
  // compara por nombre de cliente, así que se arma el conjunto con los nombres.
  const conPrioridad = useMemo(() => new Set(r.clientes.filter((c) => esPrioridad(c.cliente)).map((c) => c.cliente)), [r, prioridades])
  const L = useMemo(() => calcularLibres(r, conPrioridad), [r, conPrioridad])
  const ficha = refMap && refMap.get(r.ref)
  const img = ficha && ficha.image
  const nombreColor = (c) => c.charAt(0) + c.slice(1).toLowerCase()
  const tono = (c) => 'pr-tono-' + (Math.max(0, L.coloresHoja.indexOf(c)) % 5)
  const [bloque, setBloque] = useState('todos')
  const [q, setQ] = useState('')
  const T = L.tallasHoja
  const nCols = T.length + 7
  const cuenta = (e) => L.hoja.filter((c) => c.estado === e)
  const BLOQUES = [
    { id: 'separado', titulo: 'Ya separado', chip: 'Ya separado', nota: (cs) => `${num(cs.length)} clientes · ${num(cs.reduce((n, c) => n + c.n, 0))} unidades` },
    { id: 'separar', titulo: 'Se pueden separar en curva completa', chip: 'Se pueden separar', nota: (cs) => `${num(cs.length)} clientes · ${num(cs.reduce((n, c) => n + c.n, 0))} unidades · en orden de turno` },
    { id: 'espera', titulo: 'Esperan', chip: 'Esperan', nota: (cs) => `${num(cs.length)} clientes · con lo libre no les sale completo` },
  ]
  const busca = q.trim().toUpperCase()
  const pasa = (c) => !busca || c.cliente.toUpperCase().includes(busca) || (c.ciudad || '').toUpperCase().includes(busca) || c.lineas.some((l) => String(l.pedido).toUpperCase().includes(busca))
  const filaColor = (mapa, c) => T.map((t) => <td key={t}>{mapa[c + '|' + t] ? <b>{mapa[c + '|' + t]}</b> : <span className="pr-h-0">0</span>}</td>)
  function celda(x, t) {
    if (!x) return <td key={t} />
    const cls = x.falta ? 'r' : x.cambio.length ? 'a' : x.dar ? 'v' : x.ya ? 's' : ''
    const tip = x.falta ? `Pidió ${x.n}; no alcanza lo libre${x.falta < x.n ? ` (faltan ${x.falta})` : ''}`
      : x.cambio.length ? `Pidió ${x.n}; se le da en ${x.cambio.map(nombreColor).join(' y ')}, misma talla (va surtido)`
      : x.dar ? `Pidió ${x.n}; se le puede separar${x.ya ? ` (ya tiene ${x.ya})` : ''}`
      : x.ya ? `Pidió ${x.n}; ya separado ${x.ya}` : `Pidió ${x.n}`
    return <td key={t} className={cls} title={tip}>{x.ya && x.ya < x.n && !x.dar ? `${x.ya}/${x.n}` : x.n}</td>
  }

  function texto() {
    const lineas = [`${r.ref} · ${r.descripcion} — libres en bodega: ${L.totalLibre}`, '']
    L.asignables.forEach((a) => lineas.push(`${a.cliente} (${a.ciudad}, pedido ${a.pedidos.join(', ')}) — separar ${a.n}: ${a.dar.map((x) => `${nombreColor(x.color)} ${x.talla}${x.n > 1 ? ' x' + x.n : ''}`).join(', ')}`))
    if (L.totalQueda) lineas.push('', `Quedarían libres ${L.totalQueda}: ${Object.entries(L.queda).map(([k, v]) => `${nombreColor(k.split('|')[0])} ${k.split('|')[1]} x${v}`).join(', ')}`)
    return lineas.join('\n')
  }
  function copiar() { if (navigator.clipboard) navigator.clipboard.writeText(texto()) }
  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<pre style="font:14px/1.5 -apple-system,Helvetica,Arial,sans-serif;white-space:pre-wrap;padding:24px">${texto().replace(/</g, '&lt;')}</pre>`)
    w.document.close(); w.focus(); w.print()
  }

  return (
    <Modal open onClose={onClose} size="xl">
      <div className="modal-head">
        <div className="pr-mh">
          {img
            ? <img src={img} alt={r.ref} className="pr-foto" title="Ampliar foto" onClick={() => onViewImage && onViewImage(img)} />
            : <span className="pr-foto empty">—</span>}
          <div>
            <h2 className="modal-title">{r.ref} · libres en bodega</h2>
            <p className="eb-meta">
              {r.descripcion} · {r.marca} · entraron {num(r.entro)} · {num(r.separado)} ya separadas · {num(r.libre)} libres{L.totalLibre !== r.libre ? ` (${num(L.totalLibre)} por talla)` : ''} · {num(L.hoja.length)} clientes la pidieron
            </p>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body tal-modal-body">
        {L.avisos.length > 0 && <div className="dsp-nota"><b>Revisar:</b> {L.avisos.join(' · ')}.</div>}
        <div className="pr-h-barra">
          <button type="button" className={'pr-h-chip' + (bloque === 'todos' ? ' on' : '')} onClick={() => setBloque('todos')}>Todos <b>{num(L.hoja.length)}</b></button>
          {BLOQUES.map((b) => (
            <button key={b.id} type="button" className={'pr-h-chip' + (bloque === b.id ? ' on' : '')} onClick={() => setBloque(b.id)}>{b.chip} <b>{num(cuenta(b.id).length)}</b></button>
          ))}
          <span className="pr-h-busca"><SearchInput value={q} onChange={setQ} placeholder="Buscar cliente o pedido…" /></span>
        </div>
        <div className="pr-hoja-wrap">
          <table className="pr-hoja">
            <colgroup>
              <col className="pr-h-cl" /><col className="pr-h-ciu" /><col className="pr-h-ped" /><col className="pr-h-col" /><col className="pr-h-obs" />
              {T.map((t) => <col key={t} />)}<col className="pr-h-tot" /><col className="pr-h-est" />
            </colgroup>
            <thead>
              <tr><th className="l">Cliente</th><th className="l">Ciudad</th><th>Pedido</th><th className="l">Color</th><th className="l">Obs.</th>{T.map((t) => <th key={t}>{t}</th>)}<th>Total</th><th>Estado</th></tr>
            </thead>
            <tbody>
              <tr className="pr-h-band"><td colSpan={nCols}>Libres en bodega</td></tr>
              {L.colores.length === 0 && <tr><td colSpan={nCols} className="pr-h-mas">No hay unidades libres por talla: todo lo que entró ya tiene nombre.</td></tr>}
              {L.colores.map((c, i) => (
                <tr key={c}>
                  {i === 0 && <td colSpan={3} rowSpan={L.colores.length} />}
                  <td className="l"><span className={'pr-punto ' + tono(c)} />{c}</td><td />
                  {filaColor(L.libre, c)}
                  <td><b>{num(T.reduce((n, t) => n + (L.libre[c + '|' + t] || 0), 0))}</b></td><td />
                </tr>
              ))}
              {L.colores.length > 0 && (
                <tr className="pr-h-tot-f">
                  <td className="l" colSpan={5}>TOTAL LIBRES</td>
                  {T.map((t) => <td key={t}>{num(L.colores.reduce((n, c) => n + (L.libre[c + '|' + t] || 0), 0))}</td>)}
                  <td>{num(L.totalLibre)}</td><td />
                </tr>
              )}
              {BLOQUES.filter((b) => bloque === 'todos' || bloque === b.id).map((b) => {
                const todos = cuenta(b.id)
                const cs = todos.filter(pasa)
                return [
                  <tr key={b.id} className="pr-h-band"><td colSpan={nCols}>{b.titulo} <small>· {b.nota(todos)}</small></td></tr>,
                  cs.length === 0 && <tr key={b.id + '-0'}><td colSpan={nCols} className="pr-h-mas">{todos.length ? 'Ningún cliente coincide con la búsqueda.' : 'Ninguno.'}</td></tr>,
                  ...cs.flatMap((c) => c.lineas.map((l, i) => (
                    <tr key={b.id + c.cliente + i} className={i === 0 ? 'pr-h-c1' : ''}>
                      {i === 0 && (
                        <td className="l pr-h-nom" rowSpan={c.lineas.length} title={c.cliente}>
                          <Estrella on={esPrioridad(c.cliente)} onClick={() => onPrioridad(c.cliente)} />{c.cliente}
                        </td>
                      )}
                      {i === 0 && <td className="l m" rowSpan={c.lineas.length} title={c.ciudad}>{c.ciudad}</td>}
                      <td>{l.pedido}</td>
                      <td className="l" title={l.color}><span className={'pr-punto ' + tono(l.color)} />{l.color}</td>
                      {l.observacion ? <td className="l m" title={l.observacion}>{l.observacion}</td> : <td className="l sur">{l.surtido ? 'surtido' : ''}</td>}
                      {T.map((t) => celda(l.celdas[t], t))}
                      <td><b>{num(l.total)}</b></td>
                      {i === 0 && (
                        <td rowSpan={c.lineas.length} className={c.estado === 'separado' ? 's' : c.estado === 'separar' ? 'v' : 'r'}>
                          {c.estado === 'espera' ? 'espera' : `${c.estado} ${num(c.n)}`}
                        </td>
                      )}
                    </tr>
                  ))),
                ]
              })}
              {bloque === 'todos' && L.colores.length > 0 && <tr className="pr-h-band"><td colSpan={nCols}>Quedarían libres después de separar <small>· {num(L.totalQueda)} unidades</small></td></tr>}
              {bloque === 'todos' && L.colores.map((c, i) => (
                <tr key={'q' + c}>
                  {i === 0 && <td colSpan={3} rowSpan={L.colores.length} />}
                  <td className="l"><span className={'pr-punto ' + tono(c)} />{c}</td><td />
                  {filaColor(L.queda, c)}
                  <td><b>{num(T.reduce((n, t) => n + (L.queda[c + '|' + t] || 0), 0))}</b></td><td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pr-h-ley">
          <span><i className="s" />ya separado en SYD</span>
          <span><i className="v" />se le puede separar</span>
          <span><i className="a" />se le da en otro color, misma talla (solo surtidos)</span>
          <span><i className="r" />no alcanza: por eso espera</span>
          <span><i />pedido, sin mover</span>
        </div>
        <div className="dsp-acciones">
          <span className="pr-pie-txt">El número es lo que pidió; el color de la casilla dice qué pasa con esa unidad. Se separa solo si el pedido de esta referencia <b>queda completo</b>. Turno: ★ → más cerca de completar su despacho → pedido más antiguo. La separación se hace en SYD.</span>
          <span className="dsp-ultimo">
            <button type="button" className="btn" onClick={imprimir}>Imprimir para bodega</button>{' '}
            <button type="button" className="btn btn-primary" onClick={copiar}>Copiar lista</button>
          </span>
        </div>
      </div>
    </Modal>
  )
}
