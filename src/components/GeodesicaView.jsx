import { useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import { AREAS, formatPrice } from '../lib/constants.js'
import { orderArea } from '../lib/domain.js'
import { generateGeodesicaPDF } from '../lib/geodesicaPdf.js'

const AREA_LABEL = { trazos: 'Trazos', corte: 'Corte', enviar: 'Por enviar', talleres: 'En talleres', entrega: 'Entrega ensamble' }

// Vista dedicada a Geodésica: agrupa las órdenes por referencia, muestra
// la etapa actual, permite editar precio, marcar como despachada y
// exportar a PDF las seleccionadas.
export default function GeodesicaView({ orders, refMap, onViewImage, onOpenRef, onSetField, onSetFields }) {
  const [q, setQ] = useState('')
  const [areaF, setAreaF] = useState('')
  const [estado, setEstado] = useState('pendientes') // 'pendientes' | 'despachadas' | 'todas'
  const [selected, setSelected] = useState(() => new Set())
  const [busyPdf, setBusyPdf] = useState(false)

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
        despachada: !!(ref && ref.geodesicaDespachada),
        despachadaAt: (ref && ref.geodesicaDespachadaAt) || null,
      }
    })
    return out.sort((a, b) => a.refId.localeCompare(b.refId))
  }, [orders, refMap])

  // Conteos generales por estado.
  const conteo = useMemo(() => ({
    pendientes: items.filter((x) => !x.despachada).length,
    despachadas: items.filter((x) => x.despachada).length,
    todas: items.length,
  }), [items])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((it) => {
      if (estado === 'pendientes' && it.despachada) return false
      if (estado === 'despachadas' && !it.despachada) return false
      if (areaF && it.area !== areaF) return false
      if (term) {
        const hay = (it.refId + ' ' + it.producto + ' ' + it.empresa + ' ' + it.taller).toLowerCase()
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

      {/* Toggle de estado: pendientes / despachadas / todas */}
      <div className="opt-group" style={{ marginBottom: 10 }}>
        <button type="button" className={'opt-btn' + (estado === 'pendientes' ? ' on' : '')}
          onClick={() => { setEstado('pendientes'); clearSel() }}>
          Pendientes <span className="muted">({conteo.pendientes})</span>
        </button>
        <button type="button" className={'opt-btn' + (estado === 'despachadas' ? ' on' : '')}
          onClick={() => { setEstado('despachadas'); clearSel() }}>
          Despachadas <span className="muted">({conteo.despachadas})</span>
        </button>
        <button type="button" className={'opt-btn' + (estado === 'todas' ? ' on' : '')}
          onClick={() => { setEstado('todas'); clearSel() }}>
          Todas <span className="muted">({conteo.todas})</span>
        </button>
      </div>

      {/* Filtros por etapa */}
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
                    <td>{it.taller || <span className="muted">—</span>}</td>
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
    </div>
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
