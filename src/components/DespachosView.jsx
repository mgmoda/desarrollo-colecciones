import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { dbLoadPedidosTodos, dbLoadDespachos, dbUpsertDespacho } from '../lib/db.js'
import { formatPrice } from '../lib/constants.js'
import { nombreDe } from '../lib/procesos.js'
import {
  FILTROS, NOVEDAD_NO_RECIBE, TALLAS, armarDespachos, idCliente, idRef, totales,
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
  cerrada: ['', 'Cerrada · no sale'], facturado: ['azul', 'Facturado'],
  separado: ['verde', 'Separado'], porSeparar: ['ambar', 'Por separar'],
}

export default function DespachosView({
  stamp, stampDespachos, usuario, onOpenRef,
  // Inyectables para probar la vista con datos fijos, sin sesión.
  cargarPedidos = dbLoadPedidosTodos, cargarDespachos = dbLoadDespachos, guardarDespacho = dbUpsertDespacho,
}) {
  const [filas, setFilas] = useState(null)
  const [registros, setRegistros] = useState(null)
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

  const clientes = useMemo(() => armarDespachos(filas || [], registros || {}), [filas, registros])
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

      {clienteAbierto && (
        <ClienteModal cliente={clienteAbierto} usuario={usuario} registros={registros || {}}
          onGuardar={guardar} onOpenRef={onOpenRef} onClose={() => setAbierto(null)} />
      )}
    </>
  )
}

// ── Detalle del cliente: referencia × color, con lo separado y lo facturado
//    editables en la misma fila. ─────────────────────────────────────────
function ClienteModal({ cliente: c, usuario, registros, onGuardar, onOpenRef, onClose }) {
  const [nota, setNota] = useState(c.novedadNota || '')
  const tallasTxt = (t) => TALLAS.filter((x) => t[x]).map((x) => `${x}${t[x] > 1 ? '×' + t[x] : ''}`).join(' ')
  const ultimo = c.lineas.map((l) => l.registro).filter((r) => r && r.at).sort((a, b) => b.at - a.at)[0]

  function guardarLinea(l, campo, valor) {
    const v = Math.max(0, Math.min(l.vendido, Math.round(Number(valor) || 0)))
    const previo = registros[l.id] || {}
    if ((Number(previo[campo]) || 0) === v) return
    onGuardar(l.id, { ...previo, [campo]: v, usuario, at: Date.now() })
  }
  function cerrarRef(ref, cerrada) {
    const previo = registros[idRef(ref)] || {}
    onGuardar(idRef(ref), { ...previo, cerrada, usuario, at: Date.now() })
  }
  function novedad(valor) {
    const previo = registros[idCliente(c.cliente)] || {}
    onGuardar(idCliente(c.cliente), { ...previo, novedad: valor, nota: nota.trim(), usuario, at: Date.now() })
  }

  let refPrevia = ''
  return (
    <Modal open onClose={onClose} size="xl">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">{c.cliente}</h2>
          <p className="eb-meta">
            {c.ciudad ? `${c.ciudad} · ` : ''}{c.refs} referencias · {num(c.vendido)} vendidas · {num(c.pendiente)} pendientes
            {c.observacion ? ` · "${c.observacion}"` : ''}
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

        <div className="med-wrap dsp-scroll">
          <table className="med-tabla dsp-det">
            <thead>
              <tr>
                <th>Referencia</th><th>Color</th><th>Tallas vendidas</th>
                <th className="num">Vendido</th><th className="num">Separado</th><th className="num">Facturado</th>
                <th className="num">Sep. vigente</th><th className="num">Faltante</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {c.lineas.map((l) => {
                const primera = l.ref !== refPrevia
                refPrevia = l.ref
                const et = ETIQUETA_LINEA[l.estado]
                return (
                  <tr key={l.id} className={primera ? 'ped-ref-inicio' : ''}>
                    <td>
                      {primera && (
                        <div className="dsp-refcel">
                          <button type="button" className="ped-ref" onClick={() => onOpenRef && onOpenRef(l.ref)}
                            title={onOpenRef ? 'Abrir la ficha de la referencia' : ''}>
                            <b>{l.ref}</b>
                            <span className="ped-desc">{l.descripcion}</span>
                          </button>
                          <button type="button" className={'dsp-cerrar' + (l.cerrada ? ' on' : '')}
                            title={l.cerrada ? 'La referencia está cerrada (no sale). Clic para reabrirla.' : 'Cerrar la referencia: no sale, y lo vendido deja de contar como faltante'}
                            onClick={() => cerrarRef(l.ref, !l.cerrada)}>
                            {l.cerrada ? 'Reabrir' : 'No sale'}
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{l.color}</td>
                    <td className="dsp-tallas">{tallasTxt(l.tallas)}</td>
                    <td className="num">{num(l.vendido)}</td>
                    <td className="num">
                      <input type="number" min="0" max={l.vendido} className="input dsp-in" defaultValue={l.separado || ''}
                        key={'s' + l.id + l.separado} placeholder="·" disabled={l.cerrada}
                        onBlur={(e) => guardarLinea(l, 'separado', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} />
                    </td>
                    <td className="num">
                      <input type="number" min="0" max={l.vendido} className="input dsp-in" defaultValue={l.facturado || ''}
                        key={'f' + l.id + l.facturado} placeholder="·"
                        onBlur={(e) => guardarLinea(l, 'facturado', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} />
                    </td>
                    <td className="num"><Cel n={l.sepVig} cls="dsp-sep" /></td>
                    <td className="num"><Cel n={l.faltante} cls="dsp-falt" /></td>
                    <td>{et && <span className={'tag dsp-tag ' + et[0]}>{et[1]}</span>}</td>
                  </tr>
                )
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
