import { useEffect, useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import Modal from './Modal.jsx'
import PhotoDropzone from './PhotoDropzone.jsx'
import DateField from './DateField.jsx'
import { AREAS, formatDate, formatPrice } from '../lib/constants.js'
import { orderArea } from '../lib/domain.js'
import { generateGeodesicaPDF } from '../lib/geodesicaPdf.js'
import { generateListaFotosPDF } from '../lib/listaFotosPdf.js'
import DisenosView from './DisenosView.jsx'
import { dbLoadDisenos } from '../lib/db.js'

const AREA_LABEL = { trazos: 'Trazos', corte: 'Corte', enviar: 'Por enviar', talleres: 'En talleres', entrega: 'Entrega ensamble' }

// Días desde hoy hasta la fecha dada (positivo = futuro, negativo = pasado).
// Devuelve null si la fecha no es parseable.
function diasHasta(fechaStr) {
  if (!fechaStr) return null
  const parts = String(fechaStr).split('-')
  if (parts.length !== 3) return null
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  if (isNaN(d.getTime())) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - hoy.getTime()) / 86400000)
}

// Vista dedicada a Geodésica: agrupa las órdenes por referencia, muestra
// la etapa actual, permite editar precio, marcar como despachada y
// exportar a PDF las seleccionadas.
export default function GeodesicaView({ refs, orders, refMap, onViewImage, onOpenRef, onSetField, onSetFields }) {
  const [q, setQ] = useState('')
  const [areaF, setAreaF] = useState('')
  // 'porProgramar' | 'pendientes' | 'despachadas' | 'todas'
  const [estado, setEstado] = useState('porProgramar')
  const [disenos, setDisenos] = useState([])
  const [disenosCargando, setDisenosCargando] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [busyPdf, setBusyPdf] = useState(false)
  const [preOrderOpen, setPreOrderOpen] = useState(false)
  const [editingPre, setEditingPre] = useState(null) // ref existente o null si es nueva

  // Set de refIds que YA tienen órdenes Geodésica importadas (para excluir del "Por programar").
  const importedRefIds = useMemo(() => {
    const s = new Set()
    orders.forEach((o) => { if (o.origen === 'geodesica') s.add(o.referencia) })
    return s
  }, [orders])

  // Preórdenes: refs con geodesicaPreOrder=true y aún NO importadas.
  const preOrders = useMemo(() => {
    return (refs || []).filter((r) => r.geodesicaPreOrder && !importedRefIds.has(r.id))
      .sort((a, b) => (Number(b.geodesicaPreOrderAt) || 0) - (Number(a.geodesicaPreOrderAt) || 0))
  }, [refs, importedRefIds])

  const items = useMemo(() => {
    const AREA_RANK = { trazos: 0, corte: 1, enviar: 2, talleres: 3, entrega: 4 }
    const map = new Map()
    orders.filter((o) => o.origen === 'geodesica').forEach((o) => {
      const refId = o.referencia
      if (!map.has(refId)) {
        map.set(refId, {
          refId, producto: o.producto || refId, empresa: o.empresa || '',
          taller: '', cantidadTotal: 0, area: null, areaRank: -1, ordenes: 0,
        })
      }
      const it = map.get(refId)
      it.ordenes += 1
      const cant = Number((o.stages && o.stages.ordenCorte && o.stages.ordenCorte.cant) || 0)
        || Number((o.stages && o.stages.trazo && o.stages.trazo.cant) || 0)
        || Number((o.stages && o.stages.entregaCorte && o.stages.entregaCorte.cant) || 0)
        || Number((o.stages && o.stages.envioEnsamble && o.stages.envioEnsamble.cant) || 0)
        || Number((o.stages && o.stages.entregaEnsamble && o.stages.entregaEnsamble.cant) || 0)
        || 0
      it.cantidadTotal += cant
      const t = (o.stages && o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || ''
      if (t && !it.taller) it.taller = t
      const a = orderArea(o)
      const rank = a ? AREA_RANK[a] : -1
      if (rank > it.areaRank) { it.area = a; it.areaRank = rank }
    })
    const out = [...map.values()].map((it) => {
      const ref = refMap.get(it.refId)
      return {
        ...it,
        image: ref && ref.image ? ref.image : '',
        precio: ref && ref.costo ? Number(ref.costo) || 0 : 0,
        maquila: !!(ref && ref.geodesicaMaquila),
        despachada: !!(ref && ref.geodesicaDespachada),
        despachadaAt: (ref && ref.geodesicaDespachadaAt) || null,
      }
    })
    return out.sort((a, b) => a.refId.localeCompare(b.refId))
  }, [orders, refMap])

  // Conteos generales por estado.
  const conteo = useMemo(() => ({
    porProgramar: preOrders.length,
    pendientes: items.filter((x) => !x.despachada).length,
    despachadas: items.filter((x) => x.despachada).length,
    todas: items.length,
  }), [items, preOrders])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((it) => {
      if (estado === 'pendientes' && it.despachada) return false
      if (estado === 'despachadas' && !it.despachada) return false
      if (areaF && it.area !== areaF) return false
      if (term) {
        const hay = (it.refId + ' ' + it.producto + ' ' + it.empresa + ' ' + it.taller
          + (it.maquila ? ' maquila' : '')).toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [items, q, areaF, estado])

  // Conteos por etapa (sobre items del estado actual + búsqueda — pero sin filtro de área).
  const porEtapa = useMemo(() => {
    const m = { trazos: 0, corte: 0, enviar: 0, talleres: 0, entrega: 0 }
    const term = q.trim().toLowerCase()
    items.forEach((it) => {
      if (estado === 'pendientes' && it.despachada) return
      if (estado === 'despachadas' && !it.despachada) return
      if (term) {
        const hay = (it.refId + ' ' + it.producto + ' ' + it.empresa + ' ' + it.taller).toLowerCase()
        if (!hay.includes(term)) return
      }
      if (it.area && m[it.area] != null) m[it.area]++
    })
    return m
  }, [items, q, estado])

  // Los diseños se cargan solo al entrar a su pestaña (y sin imágenes).
  function cargarDisenos() {
    setDisenosCargando(true)
    dbLoadDisenos()
      .then(setDisenos)
      .catch((e) => { console.error('Cargar diseños:', e); setDisenos([]) })
      .finally(() => setDisenosCargando(false))
  }
  useEffect(() => {
    if (estado === 'disenos' && disenos.length === 0 && !disenosCargando) cargarDisenos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])

  function toggleSel(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allFiltVisible = filtrados.length > 0 && filtrados.every((it) => selected.has(it.refId))
  function toggleAll() {
    setSelected((s) => {
      if (allFiltVisible) {
        const n = new Set(s); filtrados.forEach((it) => n.delete(it.refId)); return n
      }
      const n = new Set(s); filtrados.forEach((it) => n.add(it.refId)); return n
    })
  }
  function clearSel() { setSelected(new Set()) }

  const seleccionados = useMemo(() => filtrados.filter((it) => selected.has(it.refId)), [filtrados, selected])
  const totalSel = seleccionados.reduce((s, it) => s + (it.cantidadTotal * it.precio), 0)
  const totalUnitsSel = seleccionados.reduce((s, it) => s + it.cantidadTotal, 0)

  // Para la lista de fotos se toma TODO lo marcado, sin importar en qué
  // pestaña se marcó: así se pueden mezclar pendientes con preórdenes.
  const seleccionFotos = useMemo(() => {
    const out = []
    items.forEach((it) => {
      if (!selected.has(it.refId)) return
      out.push({
        referencia: it.refId,
        producto: it.producto,
        image: it.image,
        etapa: it.despachada ? 'Despachada'
          : it.area ? AREA_LABEL[it.area] : 'Sin iniciar',
        // El taller solo importa mientras la prenda está allá.
        taller: it.area === 'talleres' ? (it.taller || '') : '',
        maquila: it.maquila,
      })
    })
    preOrders.forEach((r) => {
      if (!selected.has(r.id)) return
      out.push({
        referencia: r.referencia || r.id,
        producto: r.geodesicaProducto || '',
        image: r.image || '',
        etapa: 'Por programar',
        taller: '',
        maquila: !!r.geodesicaMaquila,
      })
    })
    return out.sort((a, b) => a.referencia.localeCompare(b.referencia))
  }, [items, preOrders, selected])

  async function generarPdfFotos() {
    if (seleccionFotos.length === 0) return
    setBusyPdf(true)
    try { await generateListaFotosPDF(seleccionFotos) } finally { setBusyPdf(false) }
  }

  async function generarPdf() {
    if (seleccionados.length === 0) return
    setBusyPdf(true)
    try {
      const payload = seleccionados.map((it) => ({
        referencia: it.refId,
        producto: it.producto,
        cantidad: it.cantidadTotal,
        precio: it.precio,
        subtotal: it.cantidadTotal * it.precio,
        image: it.image,
      }))
      await generateGeodesicaPDF(payload)
    } finally {
      setBusyPdf(false)
    }
  }

  function marcarDespachadas(despachada) {
    if (seleccionados.length === 0 || !onSetFields) return
    const ahora = Date.now()
    seleccionados.forEach((it) => {
      onSetFields(it.refId, {
        geodesicaDespachada: !!despachada,
        geodesicaDespachadaAt: despachada ? ahora : null,
      })
    })
    // Si las refs salen del filtro actual, limpia su selección.
    clearSel()
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Geodésica</h1>
          <p className="view-sub">
            Ensamble externo · {conteo.pendientes} pendientes
            {conteo.despachadas > 0 && <span className="muted"> · {conteo.despachadas} despachadas</span>}
          </p>
        </div>
        <div className="view-actions">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia, producto…" />
        </div>
      </div>

      {/* Toggle de estado: por programar / pendientes / despachadas / todas */}
      <div className="opt-group" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" className={'opt-btn' + (estado === 'porProgramar' ? ' on' : '')}
          onClick={() => { setEstado('porProgramar') }}
          title="Preórdenes ingresadas manualmente que aún no llegan en el Excel">
          🗒 Por programar <span className="muted">({conteo.porProgramar})</span>
        </button>
        <button type="button" className={'opt-btn' + (estado === 'pendientes' ? ' on' : '')}
          onClick={() => { setEstado('pendientes') }}>
          Pendientes <span className="muted">({conteo.pendientes})</span>
        </button>
        <button type="button" className={'opt-btn' + (estado === 'despachadas' ? ' on' : '')}
          onClick={() => { setEstado('despachadas') }}>
          Despachadas <span className="muted">({conteo.despachadas})</span>
        </button>
        <button type="button" className={'opt-btn' + (estado === 'todas' ? ' on' : '')}
          onClick={() => { setEstado('todas') }}>
          Todas <span className="muted">({conteo.todas})</span>
        </button>
        <button type="button" className={'opt-btn' + (estado === 'disenos' ? ' on' : '')}
          onClick={() => { setEstado('disenos') }}
          title="Diseños que envía Geodésica para desarrollar">
          🎨 Diseños{disenos.length > 0 && <span className="muted"> ({disenos.length})</span>}
        </button>
      </div>

      {/* Filtros por etapa (no aplican al tablero de diseños) */}
      {estado !== 'disenos' && (
      <div className="opt-group" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" className={'opt-btn' + (!areaF ? ' on' : '')} onClick={() => setAreaF('')}>
          Todas las etapas
        </button>
        {Object.entries(AREA_LABEL).map(([k, lbl]) => (
          <button key={k} type="button" className={'opt-btn' + (areaF === k ? ' on' : '')}
            onClick={() => setAreaF(areaF === k ? '' : k)}>
            {lbl} <span className="muted">({porEtapa[k] || 0})</span>
          </button>
        ))}
      </div>
      )}

      {/* Lista para la sesión de fotos: junta lo marcado en cualquier pestaña */}
      {estado !== 'disenos' && seleccionFotos.length > 0 && (
        <div className="geo-fotosbar">
          <span>
            📸 <strong>{seleccionFotos.length}</strong> {seleccionFotos.length === 1 ? 'prenda marcada' : 'prendas marcadas'} para fotos
            <span className="muted"> · puedes marcar en Pendientes y en Por programar</span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={clearSel}>Limpiar</button>
            <button className="btn btn-primary" disabled={busyPdf} onClick={generarPdfFotos}>
              {busyPdf ? 'Generando…' : 'PDF para fotos'}
            </button>
          </div>
        </div>
      )}

      {estado === 'disenos' ? (
        <DisenosView
          disenos={disenos}
          loading={disenosCargando}
          onReload={cargarDisenos}
          onViewImage={onViewImage} />
      ) : estado === 'porProgramar' ? (
        <PorProgramarView
          preOrders={preOrders}
          selected={selected}
          onToggleSel={toggleSel}
          q={q}
          onNueva={() => { setEditingPre(null); setPreOrderOpen(true) }}
          onEditar={(r) => { setEditingPre(r); setPreOrderOpen(true) }}
          onEliminar={(r) => {
            if (!window.confirm(`¿Eliminar la preorden ${r.referencia}?`)) return
            onSetFields && onSetFields(r.id, {
              geodesicaPreOrder: false,
              geodesicaPreOrderAt: '',
              geodesicaProducto: '',
              geodesicaFechaEntrega: '',
              geodesicaMaquila: false,
            })
          }}
          onViewImage={onViewImage} />
      ) : (
      <>
      {/* Barra de acción: seleccionados + acciones */}
      <div className="geo-actionbar">
        <div>
          <strong>{seleccionados.length}</strong> seleccionadas
          {seleccionados.length > 0 && (
            <span className="muted">
              {' '}· {totalUnitsSel} unidades · {formatPrice(totalSel)} total
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {seleccionados.length > 0 && (
            <button className="btn btn-ghost" onClick={clearSel}>Limpiar</button>
          )}
          {estado !== 'pendientes' && (
            <button className="btn btn-ghost" disabled={seleccionados.length === 0}
              onClick={() => marcarDespachadas(false)} title="Devolver a Pendientes">
              ← Devolver a Pendientes
            </button>
          )}
          {estado !== 'despachadas' && (
            <button className="btn" style={{ background: '#1f7a44', color: '#fff', borderColor: '#1f7a44' }}
              disabled={seleccionados.length === 0}
              onClick={() => marcarDespachadas(true)} title="Marcar como despachadas (salen de Pendientes)">
              ✓ Marcar como despachadas
            </button>
          )}
          <button className="btn btn-primary" disabled={seleccionados.length === 0 || busyPdf}
            onClick={generarPdf}>
            {busyPdf ? 'Generando…' : 'Generar PDF de precios'}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Aún no hay referencias de Geodésica.</p>
          <p className="muted">Importa el archivo desde el botón "Importar" en la cabecera.</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="empty-state">
          <p>No hay referencias que coincidan con este filtro.</p>
          {estado === 'pendientes' && conteo.despachadas > 0 && (
            <p className="muted">Tienes {conteo.despachadas} despachadas — cambia a "Despachadas" o "Todas" para verlas.</p>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-check">
                  <input type="checkbox" checked={allFiltVisible} onChange={toggleAll} title="Seleccionar todo lo visible" />
                </th>
                <th>Foto</th>
                <th>Referencia</th>
                <th>Producto</th>
                <th>Empresa</th>
                <th>Taller</th>
                <th>Etapa actual</th>
                <th className="num">Cant. total</th>
                <th>Precio unit.</th>
                <th className="num">Subtotal</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((it) => {
                const ref = refMap.get(it.refId)
                const sub = it.cantidadTotal * it.precio
                return (
                  <tr key={it.refId}
                    className={(selected.has(it.refId) ? 'row-sel' : '') + (it.despachada ? ' geo-despachada' : '')}>
                    <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(it.refId)} onChange={() => toggleSel(it.refId)} />
                    </td>
                    <td className="cell-photo">
                      {it.image ? (
                        <img src={it.image} alt={it.refId} className="thumb" title="Ampliar foto"
                          onClick={() => onViewImage(it.image)} />
                      ) : (
                        <span className="thumb empty" title="Sin foto — agrégala desde la ficha">＋</span>
                      )}
                    </td>
                    <td className="strong" style={{ cursor: onOpenRef ? 'pointer' : 'default' }}
                      onClick={() => onOpenRef && ref && onOpenRef(ref)}
                      title={onOpenRef ? 'Abrir ficha (foto, costo, etc.)' : ''}>
                      {it.refId}
                    </td>
                    <td>{it.producto}</td>
                    <td>{it.empresa}</td>
                    <td>
                      {it.taller || <span className="muted">—</span>}
                      {it.maquila && <span className="tag-maquila" title="Se ensambla en maquila">🧵 Maquila</span>}
                    </td>
                    <td>
                      {it.area ? <span className="tag">{AREA_LABEL[it.area]}</span> : <span className="muted">Sin orden</span>}
                    </td>
                    <td className="num strong">{it.cantidadTotal}</td>
                    <td>
                      <PrecioInput value={it.precio}
                        onCommit={(v) => onSetField && onSetField(it.refId, 'costo', v)} />
                    </td>
                    <td className="num strong">{sub > 0 ? formatPrice(sub) : <span className="muted">—</span>}</td>
                    <td>
                      {it.despachada
                        ? <span className="tag tag-ok" title={it.despachadaAt ? new Date(it.despachadaAt).toLocaleDateString('es-CO') : ''}>✓ Despachada</span>
                        : <span className="muted">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {/* Modal para crear/editar preorden */}
      <PreOrderModal
        open={preOrderOpen}
        onClose={() => { setPreOrderOpen(false); setEditingPre(null) }}
        editing={editingPre}
        existing={preOrders}
        onSave={(payload) => {
          const { id, ...rest } = payload
          onSetFields && onSetFields(id, {
            geodesicaPreOrder: true,
            geodesicaPreOrderAt: Date.now(),
            ...rest,
          })
          setPreOrderOpen(false); setEditingPre(null)
        }} />
    </div>
  )
}

// Sub-vista: preórdenes de Geodésica aún no importadas.
function PorProgramarView({ preOrders, q, onNueva, onEditar, onEliminar, onViewImage, selected, onToggleSel }) {
  const term = q.trim().toLowerCase()
  const filtradas = term
    ? preOrders.filter((r) => (r.referencia + ' ' + (r.geodesicaProducto || '')).toLowerCase().includes(term))
    : preOrders
  const normales = filtradas.filter((r) => !r.geodesicaMaquila)
  const maquilas = filtradas.filter((r) => r.geodesicaMaquila)
  const sumUnits = (list) => list.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
  const sumValor = (list) => list.reduce((s, r) => s + ((Number(r.cantidad) || 0) * (Number(r.costo) || 0)), 0)

  const totalUnits = sumUnits(filtradas)
  const totalValor = sumValor(filtradas)

  function renderRow(r) {
    const cant = Number(r.cantidad) || 0
    const precio = Number(r.costo) || 0
    const sub = cant * precio
    const fecha = r.geodesicaPreOrderAt
      ? new Date(Number(r.geodesicaPreOrderAt)).toLocaleDateString('es-CO')
      : '—'
    return (
      <tr key={r.id} className={selected && selected.has(r.id) ? 'row-sel' : ''}>
        <td className="cell-check">
          <input type="checkbox" checked={!!(selected && selected.has(r.id))}
            onChange={() => onToggleSel && onToggleSel(r.id)}
            title="Marcar para la lista de fotos" />
        </td>
        <td className="cell-photo">
          {r.image ? (
            <img src={r.image} alt={r.referencia} className="thumb" title="Ampliar foto"
              onClick={() => onViewImage && onViewImage(r.image)} />
          ) : (
            <span className="thumb empty">—</span>
          )}
        </td>
        <td className="strong">{r.referencia}</td>
        <td className="muted">{r.geodesicaProducto || '—'}</td>
        <td className="num strong">{cant || '—'}</td>
        <td className="num">{precio > 0 ? formatPrice(precio) : '—'}</td>
        <td className="num strong">{sub > 0 ? formatPrice(sub) : '—'}</td>
        <td>
          {r.geodesicaFechaEntrega ? (
            <span title={'Compromiso: ' + formatDate(r.geodesicaFechaEntrega)}>
              {formatDate(r.geodesicaFechaEntrega)}
              {(() => {
                const dias = diasHasta(r.geodesicaFechaEntrega)
                if (dias == null) return null
                const cls = dias < 0 ? 'tag tag-warn' : (dias <= 3 ? 'tag tag-warn' : 'tag')
                const txt = dias < 0 ? `${Math.abs(dias)}d vencida` : (dias === 0 ? 'hoy' : `en ${dias}d`)
                return <span className={cls} style={{ marginLeft: 6 }}>{txt}</span>
              })()}
            </span>
          ) : <span className="muted">—</span>}
        </td>
        <td className="muted">{fecha}</td>
        <td>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" onClick={() => onEditar(r)}>Editar</button>
            <button className="btn btn-ghost" onClick={() => onEliminar(r)}
              style={{ color: '#b23121' }}>Eliminar</button>
          </div>
        </td>
      </tr>
    )
  }

  function renderTable(list, titulo, subtitulo, emptyMsg) {
    const uN = sumUnits(list); const uV = sumValor(list)
    return (
      <div className="aut-block">
        <h3 className={'aut-block-title ex'}>
          {titulo}
          <span className="muted">
            · {list.length} preórden{list.length === 1 ? '' : 'es'}
            {uN > 0 ? ` · ${uN} unidades · ${formatPrice(uV)} total` : ''}
          </span>
        </h3>
        {subtitulo && <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>{subtitulo}</p>}
        {list.length === 0 ? (
          <div className="empty-state">
            <p className="muted">{emptyMsg}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="cell-check"></th>
                  <th>Foto</th>
                  <th>Referencia</th>
                  <th>Producto</th>
                  <th className="num">Cant. estimada</th>
                  <th className="num">Precio unit.</th>
                  <th className="num">Subtotal</th>
                  <th>Entrega</th>
                  <th>Ingresada</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{list.map(renderRow)}</tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="geo-actionbar">
        <div>
          <strong>{filtradas.length}</strong> preórdenes
          {totalUnits > 0 && (
            <span className="muted">
              {' '}· {totalUnits} unidades estimadas · {formatPrice(totalValor)} total estimado
            </span>
          )}
          {(normales.length > 0 || maquilas.length > 0) && (
            <span className="muted">
              {' '}· {normales.length} preórden · {maquilas.length} maquila
            </span>
          )}
        </div>
        <div>
          <button className="btn btn-primary" onClick={onNueva}>+ Nueva preorden</button>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="empty-state">
          <p>No hay preórdenes registradas.</p>
          <p className="muted">
            Cuando Geodésica te envíe un pedido, entra sus datos aquí. Al importar el Excel con esa referencia, la preorden se "gradúa" y aparece automáticamente en Pendientes.
          </p>
        </div>
      ) : (
        <>
          {renderTable(
            normales,
            'Preórdenes',
            'Refs que Geodésica pidió y aún no llegan en el Excel.',
            'No hay preórdenes normales con este filtro.'
          )}
          {renderTable(
            maquilas,
            '🧵 Maquila',
            'Preórdenes marcadas como maquila.',
            'No hay preórdenes de maquila con este filtro.'
          )}
        </>
      )}
    </>
  )
}

// Modal para crear/editar preorden Geodésica.
function PreOrderModal({ open, onClose, editing, existing, onSave }) {
  const [refCode, setRefCode] = useState('')
  const [producto, setProducto] = useState('')
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [image, setImage] = useState(null)
  const [maquila, setMaquila] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setRefCode(editing.referencia || editing.id || '')
      setProducto(editing.geodesicaProducto || '')
      setPrecio(editing.costo ? String(editing.costo) : '')
      setCantidad(editing.cantidad ? String(editing.cantidad) : '')
      setFechaEntrega(editing.geodesicaFechaEntrega || '')
      setImage(editing.image || null)
      setMaquila(!!editing.geodesicaMaquila)
    } else {
      setRefCode(''); setProducto(''); setPrecio(''); setCantidad('')
      setFechaEntrega(''); setImage(null); setMaquila(false)
    }
    setErr('')
  }, [open, editing])

  if (!open) return null

  function save() {
    const id = refCode.trim().toUpperCase()
    if (!id) { setErr('La referencia es obligatoria'); return }
    if (!editing && existing.some((r) => r.id === id)) {
      setErr(`Ya existe una preorden con referencia ${id}`); return
    }
    const precioNum = Number(precio.replace(/\D/g, '')) || 0
    const cantidadNum = Number(cantidad.replace(/\D/g, '')) || 0
    onSave({
      id,
      referencia: id,
      image: image || '',
      costo: precioNum || '',
      cantidad: cantidadNum || '',
      geodesicaProducto: producto.trim(),
      geodesicaFechaEntrega: fechaEntrega || '',
      geodesicaMaquila: !!maquila,
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{editing ? 'Editar preorden' : 'Nueva preorden Geodésica'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <div className="field-row">
          <div className="field" style={{ flex: '0 0 auto' }}>
            <label className="field-label">Foto</label>
            <PhotoDropzone value={image} onChange={setImage} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <div className="field">
              <label className="field-label">Referencia *</label>
              <input className="input" value={refCode} disabled={!!editing}
                onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                placeholder="Ej: S06301" />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label className="field-label">Producto (opcional)</label>
              <input className="input" value={producto}
                onChange={(e) => setProducto(e.target.value)}
                placeholder="Ej: CAMISETA MODELIA" />
            </div>
            <div className="field-row" style={{ marginTop: 10 }}>
              <div className="field">
                <label className="field-label">Precio unitario *</label>
                <input className="input" value={precio}
                  onChange={(e) => setPrecio(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="22500" />
              </div>
              <div className="field">
                <label className="field-label">Cant. estimada (opcional)</label>
                <input className="input" value={cantidad}
                  onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="60" />
              </div>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label className="field-label">Fecha de entrega (compromiso a Geodésica)</label>
              <DateField value={fechaEntrega} onChange={setFechaEntrega} />
            </div>
            <label className={'check check-lg' + (maquila ? ' on' : '')} style={{ marginTop: 12 }}>
              <input type="checkbox" checked={maquila}
                onChange={(e) => setMaquila(e.target.checked)} />
              <span>🧵 Maquila (aparece en la tabla de maquila)</span>
            </label>
          </div>
        </div>
        {err && <p style={{ color: '#b23121', fontSize: 13, marginTop: 10 }}>{err}</p>}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>
          {editing ? 'Guardar cambios' : 'Crear preorden'}
        </button>
      </div>
    </Modal>
  )
}

function PrecioInput({ value, onCommit }) {
  const [val, setVal] = useState(value ? String(value) : '')

  function commit() {
    const num = Number(val.replace(/\D/g, '')) || 0
    if (num === value) return
    onCommit(num === 0 ? '' : num)
  }

  return (
    <input
      className="input geo-precio-input"
      value={val}
      placeholder="0"
      onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur() } }}
    />
  )
}
