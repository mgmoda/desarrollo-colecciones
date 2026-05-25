import { useMemo } from 'react'
import { AREAS } from '../lib/constants.js'
import { areaCounts } from '../lib/domain.js'

export default function DashboardView({ orders, refs, onGoArea, onGoTab, onImport, onShowPendientes }) {
  const counts = useMemo(() => areaCounts(orders), [orders])
  const pendientes = useMemo(() => refs.filter((r) => r.pendiente), [refs])

  const totalRefs = refs.length
  const conCosto = refs.filter((r) => Number(r.costo) > 0).length
  const conFoto = refs.filter((r) => r.image).length
  const sinFoto = totalRefs - conFoto

  const kpis = [
    { label: 'Referencias', value: totalRefs, sub: 'en desarrollo' },
    { label: 'Órdenes activas', value: orders.length, sub: 'importadas del sistema' },
    { label: 'Con costo', value: conCosto, sub: `${totalRefs - conCosto} sin costo` },
    { label: 'Con foto', value: conFoto, sub: `${sinFoto} sin foto` },
  ]

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Inicio</h1>
          <p className="view-sub">Panorama del desarrollo de colecciones</p>
        </div>
        <button className="btn btn-primary" onClick={onImport}>Importar del sistema</button>
      </div>

      {pendientes.length > 0 && (
        <button className="pend-banner" onClick={onShowPendientes}>
          <span className="pend-title">⚠ Pendientes por resolver</span>
          <span className="pend-count">{pendientes.length}</span>
          <span className="pend-go">Ver lista ›</span>
        </button>
      )}

      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <span className="kpi-value">{k.value}</span>
            <span className="kpi-label">{k.label}</span>
            <span className="kpi-sub">{k.sub}</span>
          </div>
        ))}
      </div>

      <h2 className="section-title">Flujo de producción</h2>
      <div className="area-grid">
        {Object.entries(AREAS).map(([key, area]) => (
          <button className="area-card" key={key} onClick={() => onGoArea(key)}>
            <span className="area-count">{counts[key]}</span>
            <span className="area-name">{area.label}</span>
            {area.responsable && <span className="area-resp">{area.responsable}</span>}
          </button>
        ))}
        {counts.sinIniciar > 0 && (
          <div className="area-card done">
            <span className="area-count">{counts.sinIniciar}</span>
            <span className="area-name">Sin orden de corte</span>
          </div>
        )}
      </div>

      <div className="dash-links">
        <button className="btn btn-ghost" onClick={() => onGoTab('resumen')}>Ver resumen de producción ›</button>
        <button className="btn btn-ghost" onClick={() => onGoTab('costos')}>Ir a costos ›</button>
      </div>
    </div>
  )
}
