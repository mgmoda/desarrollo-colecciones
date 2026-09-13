import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadPedidoDetalle, dbLoadPedidosResumen, dbLoadPedidosSync } from '../lib/db.js'
import { formatPrice } from '../lib/constants.js'

// ════════════════════════════════════════════════════════════════════════
// PEDIDOS — lo que los clientes tienen pedido y pendiente por despachar.
// ────────────────────────────────────────────────────────────────────────
// Sale del informe "Pendientes por Clientes y Referencias" de SYD, que el
// servidor genera y sube cada 2 minutos (E:\factorysync\ps.ps1). Acá solo se
// lee: un renglón por pedido en la tabla y, al abrirlo, el detalle por
// referencia, color y talla. Primera versión: la organización final la
// define Diego viendo los datos.
// ════════════════════════════════════════════════════════════════════════

const num = (n) => Number(n || 0).toLocaleString('es-CO')
const TALLAS = ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24']

function fechaHora(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
function haceMin(iso) {
  if (!iso) return null
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000)
}

// Marca por la letra de la referencia, como en Cartera: C = Casania, M = Mariset.
function marcaDe(ref) {
  const l = String(ref || '').trim().charAt(0).toUpperCase()
  return l === 'C' ? 'Casania' : l === 'M' ? 'Mariset' : 'Otra'
}

export default function PedidosView({ stamp, onOpenRef }) {
  const [filas, setFilas] = useState(null)
  const [sync, setSync] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(null) // { pedido, cliente, ... }
  const [detalle, setDetalle] = useState(null)
  const { sortKey, sortDir, toggle } = useSort('total', 'desc')

  // Se carga al entrar y cada vez que el servidor sube un informe nuevo (la
  // marca "pedidos" en dev_sync se mueve y App la pasa como `stamp`).
  useEffect(() => {
    let vivo = true
    Promise.all([dbLoadPedidosResumen(), dbLoadPedidosSync()])
      .then(([f, s]) => { if (vivo) { setFilas(f); setSync(s); setError('') } })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [stamp])

  useEffect(() => {
    if (!abierto) { setDetalle(null); return undefined }
    let vivo = true
    dbLoadPedidoDetalle(abierto.pedido)
      .then((d) => { if (vivo) setDetalle(d) })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [abierto])

  const kpi = useMemo(() => {
    const l = filas || []
    return {
      pedidos: l.length,
      clientes: new Set(l.map((f) => f.cliente)).size,
      unidades: l.reduce((n, f) => n + (Number(f.unidades) || 0), 0),
      total: l.reduce((n, f) => n + (Number(f.total) || 0), 0),
      inactivos: l.filter((f) => f.inactiva).length,
    }
  }, [filas])

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase()
    let l = filas || []
    if (term) {
      l = l.filter((f) => [f.pedido, f.cliente, f.ciudad, f.codigo_cliente]
        .some((v) => String(v || '').toLowerCase().includes(term)))
    }
    const accessors = {
      pedido: (f) => Number(f.pedido) || f.pedido,
      cliente: (f) => f.cliente,
      ciudad: (f) => f.ciudad || '',
      referencias: (f) => Number(f.referencias) || 0,
      unidades: (f) => Number(f.unidades) || 0,
      total: (f) => Number(f.total) || 0,
    }
    return sortRows(l, accessors[sortKey] || accessors.total, sortDir)
  }, [filas, q, sortKey, sortDir])

  // Detalle agrupado por referencia, con sus colores debajo.
  const porRef = useMemo(() => {
    if (!detalle) return []
    const m = new Map()
    detalle.forEach((r) => {
      if (!m.has(r.referencia)) m.set(r.referencia, { referencia: r.referencia, descripcion: r.descripcion, tipo: r.tipo, colores: [], unid: 0, total: 0 })
      const g = m.get(r.referencia)
      g.colores.push(r)
      g.unid += Number(r.unid) || 0
      g.total += Number(r.total) || 0
    })
    return [...m.values()].sort((a, b) => b.unid - a.unid)
  }, [detalle])

  const tallasDetalle = useMemo(() => {
    const s = new Set()
    ;(detalle || []).forEach((r) => Object.keys(r.tallas || {}).forEach((t) => s.add(t)))
    return TALLAS.filter((t) => s.has(t))
  }, [detalle])

  const minutos = sync ? haceMin(sync.creado_en) : null
  const thProps = { sortKey, sortDir, onSort: toggle }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Pedidos</h1>
          <p className="view-sub">Pendientes por cliente y referencia — SYD</p>
        </div>
        <div className="view-actions">
          <SearchInput value={q} onChange={setQ} placeholder="Pedido, cliente o ciudad…" />
        </div>
      </div>

      {error && <div className="ct-error">{error}</div>}

      <div className="ct-sync">
        <div>
          <div className="ct-sync-t">
            {sync ? <>Informe traído {fechaHora(sync.creado_en)}
              {minutos != null && (
                <span className={'ct-frescura ' + (minutos <= 10 ? 'ok' : minutos <= 60 ? 'warn' : 'bad')}>
                  {minutos <= 1 ? 'ahora mismo' : minutos < 60 ? `hace ${minutos} min` : `hace ${Math.round(minutos / 60)} h`}
                </span>
              )}
            </> : 'Sin sincronizaciones todavía'}
          </div>
          <div className="ct-sync-s">
            {sync
              ? `SYD · ${sync.archivo} — ${num(sync.filas)} renglones · ${num(sync.pedidos)} pedidos · ${num(sync.clientes)} clientes`
              : 'El servidor genera el informe de SYD y lo sube cada 2 minutos.'}
          </div>
        </div>
        <div className="ct-sync-sp" />
        <span className="ct-live"><i />Sincroniza sola cada 2 min</span>
      </div>

      <div className="prog-kpis">
        <div className="prog-kpi"><span>Pedidos</span><b>{num(kpi.pedidos)}</b><em>{num(kpi.clientes)} clientes</em></div>
        <div className="prog-kpi"><span>Unidades pendientes</span><b>{num(kpi.unidades)}</b><em>por despachar</em></div>
        <div className="prog-kpi"><span>Valor</span><b>{formatPrice(kpi.total) || '$ 0'}</b><em>a precio de lista</em></div>
        <div className="prog-kpi"><span>Clientes inactivos</span><b>{num(kpi.inactivos)}</b><em>pedidos marcados inactivos en SYD</em></div>
      </div>

      {filas === null ? (
        <div className="empty-state"><p>Cargando los pedidos…</p></div>
      ) : lista.length === 0 ? (
        <div className="empty-state"><p>{filas.length ? 'Ningún pedido coincide con la búsqueda.' : 'Todavía no hay pedidos sincronizados.'}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="Pedido" col="pedido" {...thProps} />
                <SortTh label="Cliente" col="cliente" {...thProps} />
                <SortTh label="Ciudad" col="ciudad" {...thProps} />
                <SortTh label="Referencias" col="referencias" className="num" {...thProps} />
                <SortTh label="Unidades" col="unidades" className="num" {...thProps} />
                <SortTh label="Valor" col="total" className="num" {...thProps} />
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.pedido} className={'row-click' + (f.inactiva ? ' ct-espera' : '')}
                  onClick={() => setAbierto(f)} title="Ver el detalle del pedido">
                  <td className="mono">{f.pedido}</td>
                  <td className="strong">{f.cliente}{f.inactiva && <span className="tag tag-warn" style={{ marginLeft: 6 }}>Inactivo</span>}</td>
                  <td className="muted">{f.ciudad || '—'}</td>
                  <td className="num">{num(f.referencias)}</td>
                  <td className="num strong">{num(f.unidades)}</td>
                  <td className="num">{formatPrice(f.total) || '—'}</td>
                  <td className="muted ped-obs" title={f.observacion || ''}>{f.observacion || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{num(lista.length)} de {num((filas || []).length)} pedidos</span>
            <span><b>{num(lista.reduce((n, f) => n + (Number(f.unidades) || 0), 0))}</b> unidades · <b>{formatPrice(lista.reduce((n, f) => n + (Number(f.total) || 0), 0)) || '$ 0'}</b></span>
          </div>
        </div>
      )}

      {abierto && (
        <Modal open onClose={() => setAbierto(null)} size="xl">
          <div className="modal-head">
            <div>
              <h2 className="modal-title">Pedido {abierto.pedido} · {abierto.cliente}</h2>
              <p className="eb-meta">
                {abierto.ciudad ? `${abierto.ciudad} · ` : ''}{num(abierto.referencias)} referencias · {num(abierto.unidades)} unidades · {formatPrice(abierto.total) || '$ 0'}
                {abierto.observacion ? ` · "${abierto.observacion}"` : ''}
              </p>
            </div>
            <button className="icon-btn" onClick={() => setAbierto(null)} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body tal-modal-body">
            {!detalle ? <div className="empty-state"><p>Cargando…</p></div> : (
              <div className="med-wrap">
                <table className="med-tabla ped-det">
                  <thead>
                    <tr>
                      <th>Referencia</th><th>Color</th>
                      {tallasDetalle.map((t) => <th key={t} className="num">{t}</th>)}
                      <th className="num">Unid</th><th className="num">Precio</th><th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porRef.map((g) => g.colores.map((r, i) => (
                      <tr key={r.id} className={i === 0 ? 'ped-ref-inicio' : ''}>
                        <td>
                          {i === 0 ? (
                            <button type="button" className="ped-ref" onClick={() => onOpenRef && onOpenRef(g.referencia)}
                              title={onOpenRef ? 'Abrir la ficha de la referencia' : ''}>
                              <b>{g.referencia}</b>
                              <span className="ped-desc">{g.descripcion}{g.tipo ? ` · ${g.tipo}` : ''} · {marcaDe(g.referencia)}</span>
                            </button>
                          ) : ''}
                        </td>
                        <td>{r.color}</td>
                        {tallasDetalle.map((t) => (
                          <td key={t} className="num">{r.tallas && r.tallas[t] ? r.tallas[t] : <span className="muted">·</span>}</td>
                        ))}
                        <td className="num strong">{num(r.unid)}</td>
                        <td className="num muted">{formatPrice(r.precio) || '—'}</td>
                        <td className="num">{formatPrice(r.total) || '—'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
