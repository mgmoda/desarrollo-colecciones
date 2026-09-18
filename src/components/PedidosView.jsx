import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadPedidosDeCliente, dbLoadPedidosClientes, dbLoadPedidosObservaciones, dbLoadPedidosSync } from '../lib/db.js'
import { CATEGORIAS, agruparEspeciales, categoriaDe, esPedidoEspecial, especialesPorCliente } from '../lib/pedidos.js'
import { formatPrice } from '../lib/constants.js'
import DespachosView from './DespachosView.jsx'

// ════════════════════════════════════════════════════════════════════════
// PEDIDOS — lo que los clientes tienen pedido y pendiente por despachar.
// ────────────────────────────────────────────────────────────────────────
// Sale del informe "Pendientes por Clientes y Referencias" de SYD, que el
// servidor genera y sube cada 2 minutos (E:\factorysync\ps.ps1). Acá solo se
// lee: un renglón por CLIENTE en la tabla (todos sus pedidos sumados) y, al
// abrirlo, el detalle por referencia, color y talla, con el pedido de cada una. Primera versión: la organización final la
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

export default function PedidosView({
  stamp, stampDespachos, usuario, refMap, onViewImage, onOpenRef,
  // Inyectables para probar la vista con datos fijos, sin sesión.
  cargar = {},
}) {
  const cargarClientes = cargar.clientes || dbLoadPedidosClientes
  const cargarSync = cargar.sync || dbLoadPedidosSync
  const cargarObs = cargar.observaciones || dbLoadPedidosObservaciones
  const cargarDetalle = cargar.detalle || dbLoadPedidosDeCliente
  // Dos formas de mirar lo mismo: los pedidos tal como vienen de SYD, o el
  // tablero de despachos (separado, facturado, faltante) por cliente.
  const [vista, setVista] = useState('pedidos')
  const [filas, setFilas] = useState(null)
  // Líneas con pedido especial (cinturón, sin fajón, top…) por cliente.
  const [especiales, setEspeciales] = useState(new Map())
  const [soloEspeciales, setSoloEspeciales] = useState(false)
  const [sync, setSync] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(null) // fila del cliente abierto
  const [detalle, setDetalle] = useState(null)
  const [qRef, setQRef] = useState('') // buscador dentro del detalle del cliente
  const [catRef, setCatRef] = useState('') // categoría dentro del detalle
  const { sortKey, sortDir, toggle } = useSort('total', 'desc')

  // Se carga al entrar y cada vez que el servidor sube un informe nuevo (la
  // marca "pedidos" en dev_sync se mueve y App la pasa como `stamp`).
  useEffect(() => {
    let vivo = true
    Promise.all([cargarClientes(), cargarSync(), cargarObs()])
      .then(([f, s, o]) => { if (vivo) { setFilas(f); setSync(s); setEspeciales(especialesPorCliente(o)); setError('') } })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [stamp])

  useEffect(() => {
    setQRef(''); setCatRef('')
    if (!abierto) { setDetalle(null); return undefined }
    let vivo = true
    cargarDetalle(abierto.cliente)
      .then((d) => { if (vivo) setDetalle(d) })
      .catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [abierto])

  const kpi = useMemo(() => {
    const l = filas || []
    return {
      pedidos: l.reduce((n, f) => n + (Number(f.pedidos) || 0), 0),
      clientes: l.length,
      unidades: l.reduce((n, f) => n + (Number(f.unidades) || 0), 0),
      total: l.reduce((n, f) => n + (Number(f.total) || 0), 0),
      inactivos: l.filter((f) => f.inactiva).length,
    }
  }, [filas])

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase()
    let l = filas || []
    if (soloEspeciales) l = l.filter((f) => especiales.has(f.cliente))
    if (term) {
      l = l.filter((f) => [f.lista_pedidos, f.cliente, f.ciudad, f.codigo_cliente]
        .some((v) => String(v || '').toLowerCase().includes(term)))
    }
    const accessors = {
      pedidos: (f) => Number(f.pedidos) || 0,
      cliente: (f) => f.cliente,
      ciudad: (f) => f.ciudad || '',
      referencias: (f) => Number(f.referencias) || 0,
      unidades: (f) => Number(f.unidades) || 0,
      total: (f) => Number(f.total) || 0,
      especiales: (f) => (especiales.get(f.cliente) || []).reduce((n, e) => n + (Number(e.unid) || 0), 0),
    }
    if (soloEspeciales && !['cliente', 'ciudad', 'especiales'].includes(sortKey)) {
      return sortRows(l, accessors.especiales, 'desc')
    }
    return sortRows(l, accessors[sortKey] || accessors.total, sortDir)
  }, [filas, q, soloEspeciales, especiales, sortKey, sortDir])

  // Detalle agrupado por referencia, con sus colores debajo.
  const porRef = useMemo(() => {
    if (!detalle) return []
    const m = new Map()
    detalle.forEach((r) => {
      if (!m.has(r.referencia)) m.set(r.referencia, { referencia: r.referencia, descripcion: r.descripcion, tipo: r.tipo, colores: [], unid: 0, total: 0, pedidos: new Set() })
      m.get(r.referencia).pedidos.add(r.pedido)
      const g = m.get(r.referencia)
      g.colores.push(r)
      g.unid += Number(r.unid) || 0
      g.total += Number(r.total) || 0
    })
    // Por marca (Casania, Mariset) y dentro de cada una por referencia
    // ascendente: así se lee como el catálogo.
    const orden = { Casania: 0, Mariset: 1, Otra: 2 }
    const term = qRef.trim().toLowerCase()
    return [...m.values()]
      .map((g) => ({ ...g, categoria: categoriaDe(g.descripcion) }))
      .filter((g) => !catRef || g.categoria.key === catRef)
      .filter((g) => !term || g.referencia.toLowerCase().includes(term)
        || (g.descripcion || '').toLowerCase().includes(term)
        || g.categoria.label.toLowerCase().includes(term)
        || g.colores.some((r) => String(r.color || '').toLowerCase().includes(term)))
      .sort((a, b) => (orden[marcaDe(a.referencia)] - orden[marcaDe(b.referencia)])
        || a.referencia.localeCompare(b.referencia, 'es', { numeric: true }))
  }, [detalle, qRef, catRef])

  const catsDetalle = useMemo(() => {
    const porRefCat = new Map()
    ;(detalle || []).forEach((r) => { if (!porRefCat.has(r.referencia)) porRefCat.set(r.referencia, categoriaDe(r.descripcion).key) })
    const n = {}
    porRefCat.forEach((k) => { n[k] = (n[k] || 0) + 1 })
    return n
  }, [detalle])

  const tallasDetalle = useMemo(() => {
    const s = new Set()
    ;(detalle || []).forEach((r) => Object.keys(r.tallas || {}).forEach((t) => s.add(t)))
    return TALLAS.filter((t) => s.has(t))
  }, [detalle])

  const minutos = sync ? haceMin(sync.creado_en) : null      // última novedad (cambio real)
  const minRev = sync ? haceMin(sync.revisado_en) : null     // última revisión del servidor
  const haceTxt = (m) => (m == null ? '' : m <= 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`)
  const thProps = { sortKey, sortDir, onSort: toggle }

  // Clic en una referencia: la foto grande si la ficha la tiene; si no, la ficha.
  function verReferencia(ref) {
    const ficha = refMap && refMap.get(ref)
    if (ficha && ficha.image && onViewImage) onViewImage(ficha.image)
    else if (onOpenRef) onOpenRef(ref)
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Pedidos</h1>
          <p className="view-sub">{vista === 'despachos'
            ? 'Despachos — qué tiene separado cada cliente y qué le falta'
            : 'Pendientes por cliente y referencia — SYD'}</p>
        </div>
        <div className="view-actions">
          {/* El conmutador va solo en la cabecera, siempre en el mismo sitio:
              los filtros de cada vista van abajo, en su propia fila, para que
              al cambiar de vista no se mueva nada de arriba. */}
          <div className="ped-vista" role="tablist">
            <button type="button" role="tab" aria-selected={vista === 'pedidos'}
              className={vista === 'pedidos' ? 'on' : ''} onClick={() => setVista('pedidos')}>Pedidos</button>
            <button type="button" role="tab" aria-selected={vista === 'despachos'}
              className={vista === 'despachos' ? 'on' : ''} onClick={() => setVista('despachos')}>Despachos</button>
          </div>
        </div>
      </div>

      {error && <div className="ct-error">{error}</div>}

      <div className="ct-sync">
        <div>
          <div className="ct-sync-t">
            {sync ? <>Revisado {haceTxt(minRev)}
              <span className={'ct-frescura ' + (minRev <= 5 ? 'ok' : minRev <= 30 ? 'warn' : 'bad')}
                title="Cada 2 minutos el servidor genera el informe en SYD y lo compara con el anterior">
                {minRev <= 5 ? 'al día' : minRev <= 30 ? 'se atrasó' : 'servidor sin revisar'}
              </span>
              <span className="muted"> · última novedad {fechaHora(sync.creado_en)} ({haceTxt(minutos)})</span>
            </> : 'Sin sincronizaciones todavía'}
          </div>
          <div className="ct-sync-s">
            {sync
              ? `SYD · ${sync.archivo} — ${num(sync.filas)} renglones · ${num(sync.pedidos)} pedidos · ${num(sync.clientes)} clientes. Solo se vuelve a subir cuando el informe cambia.`
              : 'El servidor genera el informe de SYD y lo sube cada 2 minutos.'}
          </div>
        </div>
        <div className="ct-sync-sp" />
        <span className="ct-live"><i />Revisa cada 2 min</span>
      </div>

      {vista === 'despachos' && (
        <DespachosView stamp={stamp} stampDespachos={stampDespachos} usuario={usuario} refMap={refMap} onViewImage={onViewImage} onOpenRef={onOpenRef} />
      )}
      {vista === 'despachos' ? null : <>

      <div className="prog-kpis">
        <div className="prog-kpi"><span>Clientes</span><b>{num(kpi.clientes)}</b><em>{num(kpi.pedidos)} pedidos</em></div>
        <div className="prog-kpi"><span>Unidades pendientes</span><b>{num(kpi.unidades)}</b><em>por despachar</em></div>
        <div className="prog-kpi"><span>Valor</span><b>{formatPrice(kpi.total) || '$ 0'}</b><em>a precio de lista</em></div>
        <div className="prog-kpi"><span>Clientes inactivos</span><b>{num(kpi.inactivos)}</b><em>marcados inactivos en SYD</em></div>
      </div>

      <div className="view-actions" style={{ marginBottom: 12 }}>
        <div className="dis-filtros">
          <button type="button" className={'proc-f-btn' + (!soloEspeciales ? ' on' : '')}
            onClick={() => setSoloEspeciales(false)}>Todos <b>{(filas || []).length}</b></button>
          <button type="button" className={'proc-f-btn' + (soloEspeciales ? ' on' : '')}
            title="Clientes con alguna línea que pide algo distinto al color: cinturón, sin fajón, top…"
            onClick={() => setSoloEspeciales(true)}>Pedidos especiales <b>{especiales.size}</b></button>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Pedido, cliente o ciudad…" />
      </div>

      {filas === null ? (
        <div className="empty-state"><p>Cargando los pedidos…</p></div>
      ) : lista.length === 0 ? (
        <div className="empty-state"><p>{filas.length ? 'Ningún pedido coincide con la búsqueda.' : 'Todavía no hay pedidos sincronizados.'}</p></div>
      ) : (
        soloEspeciales ? (
        <div className="table-wrap">
          <table className="data-table ped-esp-tabla">
            <thead>
              <tr>
                <SortTh label="Cliente" col="cliente" {...thProps} />
                <SortTh label="Ciudad" col="ciudad" {...thProps} />
                <th>Referencia</th>
                <th>Modificación</th>
                <th>Colores y unidades</th>
                <SortTh label="Unid." col="especiales" className="num" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const grupos = agruparEspeciales(especiales.get(f.cliente))
                const totalEsp = grupos.reduce((n, g) => n + g.unid, 0)
                return grupos.map((g, i) => (
                  <tr key={f.cliente + g.referencia + g.observacion}
                    className={'row-click' + (i === 0 ? ' ped-esp-inicio' : '')}
                    onClick={() => setAbierto(f)} title="Ver todo el pedido del cliente">
                    <td className="strong ped-esp-cli">{i === 0 ? f.cliente : ''}</td>
                    <td className="muted">{i === 0 ? (f.ciudad || '—') : ''}</td>
                    <td>
                      <button type="button" className="ped-ref ped-esp-ref"
                        onClick={(e) => { e.stopPropagation(); verReferencia(g.referencia) }}
                        title="Ver la foto de la referencia">
                        <b>{g.referencia}</b>
                        <span className="ped-desc">{g.descripcion}</span>
                      </button>
                    </td>
                    <td><span className="tag ped-esp">{g.observacion}</span></td>
                    <td className="ped-esp-col">
                      {g.colores.map((c, j) => (
                        <span key={c.color}>{j > 0 && <i>·</i>}{c.color} <b>{num(c.unid)}</b></span>
                      ))}
                    </td>
                    <td className="num strong">{i === 0 ? num(totalEsp) : ''}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{num(lista.length)} clientes con pedido especial</span>
            <span><b>{num(lista.reduce((n, f) => n + (especiales.get(f.cliente) || []).reduce((m, e) => m + (Number(e.unid) || 0), 0), 0))}</b> unidades con alguna modificación</span>
          </div>
        </div>
        ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="Cliente" col="cliente" {...thProps} />
                <SortTh label="Ciudad" col="ciudad" {...thProps} />
                <SortTh label="Pedidos" col="pedidos" {...thProps} />
                <SortTh label="Referencias" col="referencias" className="num" {...thProps} />
                <SortTh label="Unidades" col="unidades" className="num" {...thProps} />
                <SortTh label="Valor" col="total" className="num" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.cliente} className={'row-click' + (f.inactiva ? ' ct-espera' : '')}
                  onClick={() => setAbierto(f)} title="Ver las referencias que tiene pedidas">
                  <td className="strong">{f.cliente}{f.inactiva && <span className="tag tag-warn" style={{ marginLeft: 6 }}>Inactivo</span>}</td>
                  <td className="muted">{f.ciudad || '—'}</td>
                  <td className="mono" title={f.lista_pedidos}>{Number(f.pedidos) === 1 ? f.lista_pedidos : `${f.pedidos} · ${f.lista_pedidos}`}</td>
                  <td className="num">{num(f.referencias)}</td>
                  <td className="num strong">{num(f.unidades)}</td>
                  <td className="num">{formatPrice(f.total) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ct-foot">
            <span>{num(lista.length)} de {num((filas || []).length)} clientes</span>
            <span><b>{num(lista.reduce((n, f) => n + (Number(f.unidades) || 0), 0))}</b> unidades · <b>{formatPrice(lista.reduce((n, f) => n + (Number(f.total) || 0), 0)) || '$ 0'}</b></span>
          </div>
        </div>
        )
      )}

      {abierto && (
        <Modal open onClose={() => setAbierto(null)} size="xl">
          <div className="modal-head">
            <div>
              <h2 className="modal-title">{abierto.cliente}</h2>
              <p className="eb-meta">
                {abierto.ciudad ? `${abierto.ciudad} · ` : ''}{Number(abierto.pedidos) === 1 ? 'pedido ' : 'pedidos '}{abierto.lista_pedidos} · {num(abierto.referencias)} referencias · {num(abierto.unidades)} unidades · {formatPrice(abierto.total) || '$ 0'}
                {especiales.has(abierto.cliente) ? <span className="tag ped-esp" style={{ marginLeft: 8 }}>{especiales.get(abierto.cliente).length} pedido{especiales.get(abierto.cliente).length === 1 ? '' : 's'} especial{especiales.get(abierto.cliente).length === 1 ? '' : 'es'}</span> : ''}
              </p>
            </div>
            <button className="icon-btn" onClick={() => setAbierto(null)} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body tal-modal-body">
            {!detalle ? <div className="empty-state"><p>Cargando…</p></div> : (
              <>
              <div className="dsp-tool">
                <SearchInput value={qRef} onChange={setQRef} placeholder="Referencia, categoría, descripción o color…" className="dsp-buscar" />
                <div className="dis-filtros dsp-cats">
                  {CATEGORIAS.map((k) => (catsDetalle[k.key] ? (
                    <button key={k.key} type="button" className={'proc-f-btn' + (catRef === k.key ? ' on' : '')}
                      onClick={() => setCatRef(catRef === k.key ? '' : k.key)}>{k.label} <b>{catsDetalle[k.key]}</b></button>
                  ) : null))}
                </div>
                <span className="dsp-ley"><span className="dsp-ley-n" style={{ border: 0, padding: 0 }}>{porRef.length} referencias{qRef ? ' encontradas' : ''}</span></span>
              </div>
              <div className="med-wrap ped-scroll">
                <table className="med-tabla ped-det">
                  <thead>
                    <tr>
                      <th>Foto</th><th>Referencia</th><th>Pedido</th><th>Color</th>
                      {tallasDetalle.map((t) => <th key={t} className="num">{t}</th>)}
                      <th className="num">Unid</th><th className="num">Precio</th><th className="num">Total</th><th>Observación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porRef.map((g, gi) => [
                      (gi === 0 || marcaDe(porRef[gi - 1].referencia) !== marcaDe(g.referencia)) && (
                        <tr key={'m' + g.referencia} className="ped-marca">
                          <td colSpan={7 + tallasDetalle.length}>
                            {marcaDe(g.referencia)}
                            <span className="muted"> · {porRef.filter((x) => marcaDe(x.referencia) === marcaDe(g.referencia)).length} referencias · {num(porRef.filter((x) => marcaDe(x.referencia) === marcaDe(g.referencia)).reduce((n, x) => n + x.unid, 0))} unidades</span>
                          </td>
                        </tr>
                      ),
                      ...g.colores.map((r, i) => (
                      <tr key={r.id} className={i === 0 ? 'ped-ref-inicio' : ''}>
                        <td className="ped-foto">
                          {i === 0 && (() => {
                            const ficha = refMap && refMap.get(g.referencia)
                            const img = ficha && ficha.image
                            return img
                              ? <img src={img} alt={g.referencia} className="thumb" title="Ampliar foto"
                                onClick={() => onViewImage && onViewImage(img)} />
                              : <span className="thumb empty" title="Sin foto en la ficha">—</span>
                          })()}
                        </td>
                        <td>
                          {i === 0 ? (
                            <button type="button" className="ped-ref" onClick={() => onOpenRef && onOpenRef(g.referencia)}
                              title="Abrir la ficha de la referencia">
                              <b>{g.referencia}<span className={'dsp-cat c-' + g.categoria.key}>{g.categoria.label}</span></b>
                              <span className="ped-desc">{g.descripcion}{g.tipo ? ` · ${g.tipo}` : ''} · {marcaDe(g.referencia)}</span>
                            </button>
                          ) : ''}
                        </td>
                        <td className="mono muted">{r.pedido}</td>
                        <td>{r.color}</td>
                        {tallasDetalle.map((t) => (
                          <td key={t} className="num">{r.tallas && r.tallas[t] ? r.tallas[t] : <span className="muted">·</span>}</td>
                        ))}
                        <td className="num strong">{num(r.unid)}</td>
                        <td className="num muted">{formatPrice(r.precio) || '—'}</td>
                        <td className="num">{formatPrice(r.total) || '—'}</td>
                        <td className="ped-obs-cel">
                          {r.observacion
                            ? <span className={esPedidoEspecial(r.observacion) ? 'tag ped-esp' : 'ped-obs-txt'}>{r.observacion}</span>
                            : ''}
                        </td>
                      </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </Modal>
      )}
      </>}
    </div>
  )
}
