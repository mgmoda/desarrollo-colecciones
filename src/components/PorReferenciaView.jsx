import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadPedidosTodos } from '../lib/db.js'
import { formatDate } from '../lib/constants.js'
import { FILTROS_REF, armarPorReferencia, totalesRef } from '../lib/porReferencia.js'

// ════════════════════════════════════════════════════════════════════════
// POR REFERENCIA — tercera vista de Pedidos. Una fila por referencia: lo que
// entró a bodega, el pedido, lo separado, lo libre y lo que falta producir.
// Al abrirla: a qué clientes se les separó y a cuáles les falta.
// Las cuentas están en lib/porReferencia.js.
// ════════════════════════════════════════════════════════════════════════

const num = (n) => Number(n || 0).toLocaleString('es-CO')
const diaMes = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

export default function PorReferenciaView({
  stamp, orders, refs, refMap, onViewImage, onOpenRef,
  cargarPedidos = dbLoadPedidosTodos, // inyectable para probar sin sesión
}) {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('entrada')
  const [abierta, setAbierta] = useState(null)
  // Globo con los lotes de entrada: va con posición fija para que el borde
  // de la tabla (que desplaza a lo ancho) no lo recorte.
  const [lotes, setLotes] = useState(null) // { ref, x, y, arriba }
  const { sortKey, sortDir, toggle } = useSort('ref', 'asc')

  useEffect(() => {
    let vivo = true
    cargarPedidos()
      .then((f) => { if (vivo) { setFilas(f); setError('') } })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [stamp, cargarPedidos])

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
        <div className="table-wrap" onScroll={() => setLotes(null)}>
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
                    <td className="dsp-cli">
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
                    <td className="num">{r.entro ? (r.libre ? <span className="pr-libre">{num(r.libre)}</span> : <span className="dsp-cero">·</span>) : <span className="dsp-cero">—</span>}</td>
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
                      <td><b>{c.cliente}</b></td>
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
