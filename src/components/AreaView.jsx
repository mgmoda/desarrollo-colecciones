import { useEffect, useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { AREAS, formatDate, ORIGENES, ORIGEN_ABBR, TOP_LABEL, procesoColor } from '../lib/constants.js'
import { ordersForArea, refProcesos, claveOrden, esOrdenTop } from '../lib/domain.js'
import { diasDesde } from '../lib/dates.js'
import { generateAreaPDF } from '../lib/areaPdf.js'
import TopVinculoModal from './TopVinculoModal.jsx'
import AreaKpis from './AreaKpis.jsx'

const STAGE_LABEL = {
  ordenCorte: 'Orden corte', trazo: 'Trazo', entregaCorte: 'Corte',
  alistamiento: 'Alistamiento', envioEnsamble: 'Envío a taller',
  entregaEnsamble: 'Entrega ensamble', revisado: 'Revisado', entradaBodega: 'Entrada bodega',
}

// Procesos especiales de la referencia (recuadros, tintorería, bordado…),
// para que en el taller sepan qué lleva la prenda.
function ProcesosCell({ refRow }) {
  const lista = refProcesos(refRow)
  if (!lista.length) return <span className="muted">—</span>
  return (
    <span className="proc-cell">
      {lista.map((p) => {
        const c = procesoColor(p)
        return (
          <span key={p} className="proc-tag proc-tag-ro" title={p}
            style={{ background: c.bg, color: c.fg, borderColor: c.bd }}>{p}</span>
        )
      })}
    </span>
  )
}

// Celda Top/Forro. Si la prenda lleva top incluido —o si la fila ES un top—
// se puede abrir para ver dónde va la otra orden y en qué taller está.
function TopCell({ orden, refRow, topLinks, onAbrir }) {
  const esTop = esOrdenTop(orden)
  const marca = refRow && refRow.topIncluido
  if (!esTop && !marca) return <span className="muted">—</span>
  if (!esTop && marca !== 'top') {
    return <span className="tag">{TOP_LABEL[marca] || marca}</span>
  }
  const clave = claveOrden(orden)
  const v = esTop ? topLinks.porTop.get(clave) : topLinks.porBase.get(clave)
  const pareja = v && (esTop ? v.base : v.top)
  const etiqueta = esTop ? 'Top de prenda' : (TOP_LABEL[marca] || marca)
  return (
    <button type="button"
      className={'tag tag-link' + (pareja ? '' : ' tag-link-vacio')}
      onClick={() => onAbrir(orden)}
      title={pareja
        ? `${esTop ? 'Prenda' : 'Top'}: orden ${pareja.orden} — clic para ver dónde va`
        : `${esTop ? 'Sin prenda vinculada' : 'Top aún no programado'} — clic para vincular a mano`}>
      {etiqueta}
      <span className="tag-link-sig">{pareja ? `#${pareja.orden}` : '—'}</span>
    </button>
  )
}

export default function AreaView({ areaKey, orders, refMap, onViewImage, onOpenRef, fasesOcultas, onToggleFase, topLinks, onVincularTop }) {
  const [topDe, setTopDe] = useState(null) // orden cuyo vínculo de top se está viendo
  const ocultas = fasesOcultas || new Set()
  const area = AREAS[areaKey]
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const { sortKey, sortDir, toggle } = useSort('orden', 'asc')

  // Limpia la selección al cambiar de área.
  useEffect(() => { setSelected(new Set()) }, [areaKey])

  function toggleSel(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const baseStage = area.base
  const showTaller = areaKey === 'talleres' || areaKey === 'enviar'
  const showAtraso = areaKey !== 'entrega' // en entrega ya ingresó: no hay atraso
  const pendienteLabel = area.next ? STAGE_LABEL[area.next] : 'Recibido'

  // Las fases apagadas no cuentan en ninguna parte: ni en la tabla ni en los
  // KPIs. La semana mira todas las órdenes, no solo las de esta etapa, porque
  // lo ya trazado hoy salió de Trazos.
  const visibles = useMemo(() => orders.filter((o) => !ocultas.has(o.origen)), [orders, ocultas])
  const enEtapa = useMemo(() => ordersForArea(visibles, areaKey), [visibles, areaKey])

  const rows = useMemo(() => {
    let list = enEtapa
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((o) =>
        [o.referencia, o.producto, o.empresa, o.orden,
          refProcesos(refMap.get(o.referencia)).join(' ')]
          .some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      fase: (o) => o.origen,
      orden: (o) => o.orden,
      referencia: (o) => o.referencia,
      producto: (o) => o.producto,
      empresa: (o) => o.empresa,
      taller: (o) => (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || '',
      procesos: (o) => refProcesos(refMap.get(o.referencia)).join(', '),
      topForro: (o) => (refMap.get(o.referencia) || {}).topIncluido || '',
      fecha: (o) => (o.stages[baseStage] || {}).fecha,
      cant: (o) => Number((o.stages[baseStage] || {}).cant),
      atraso: (o) => diasDesde((o.stages[baseStage] || {}).fecha),
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [enEtapa, q, sortKey, sortDir, baseStage, refMap])

  const thProps = { sortKey, sortDir, onSort: toggle }

  const allSelected = rows.length > 0 && rows.every((o) => selected.has(o.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((o) => o.id)))
  }

  function generatePdf() {
    const chosen = rows.filter((o) => selected.has(o.id))
    if (!chosen.length) return
    const items = chosen.map((o) => {
      const base = o.stages[baseStage] || {}
      const ref = refMap.get(o.referencia)
      return {
        referencia: o.referencia,
        producto: o.producto,
        empresa: o.empresa,
        baseLabel: STAGE_LABEL[baseStage],
        fecha: formatDate(base.fecha),
        atraso: showAtraso ? diasDesde(base.fecha) : null,
        pendienteLabel,
        image: ref && ref.image ? ref.image : null,
      }
    })
    generateAreaPDF(area.label, items)
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{area.label}</h1>
          <p className="view-sub">
            {area.responsable ? `Responsable: ${area.responsable} · ` : ''}
            {rows.length} {rows.length === 1 ? 'orden' : 'órdenes'} en esta etapa
          </p>
        </div>
        <div className="view-actions">
          <div className="fase-toggles" title="Apaga una fase para que deje de aparecer en todas las etapas">
            {Object.entries(ORIGENES).map(([key, label]) => {
              const apagada = ocultas.has(key)
              return (
                <button key={key} type="button"
                  className={'fase-toggle' + (apagada ? ' off' : '')}
                  onClick={() => onToggleFase && onToggleFase(key, !apagada)}
                  title={apagada ? `Volver a mostrar ${label}` : `Ocultar ${label} en todas las etapas`}>
                  <span className="fase-toggle-luz" aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>
          {selected.size > 0 && (
            <button className="btn btn-primary" onClick={generatePdf}>
              Generar PDF ({selected.size})
            </button>
          )}
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia, producto…" />
        </div>
      </div>

      <AreaKpis areaKey={areaKey} orders={visibles} enEtapa={enEtapa} />

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No hay órdenes en esta etapa.</p>
          <p className="muted">Importa los archivos del sistema para ver datos aquí.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Seleccionar todo" />
                </th>
                <th>Foto</th>
                <SortTh label="Fase" col="fase" {...thProps} />
                <SortTh label="# Orden" col="orden" {...thProps} />
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Producto" col="producto" {...thProps} />
                <SortTh label="Procesos" col="procesos" {...thProps} />
                <SortTh label="Top/Forro" col="topForro" {...thProps} />
                <SortTh label="Empresa" col="empresa" {...thProps} />
                {showTaller && <SortTh label="Taller" col="taller" {...thProps} />}
                <SortTh label={STAGE_LABEL[baseStage]} col="fecha" {...thProps} />
                <SortTh label="Cant" col="cant" {...thProps} />
                {showAtraso && <SortTh label="Atraso" col="atraso" {...thProps} />}
                <th>Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const ref = refMap.get(o.referencia)
                const base = o.stages[baseStage] || {}
                const taller = (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || ''
                const atraso = diasDesde(base.fecha)
                const canOpen = !!(onOpenRef && ref)
                return (
                  <tr key={o.id}
                    className={(selected.has(o.id) ? 'row-sel' : '') + (canOpen ? ' row-click' : '')}
                    onClick={() => canOpen && onOpenRef(ref)}
                    title={canOpen ? 'Abrir ficha de la referencia (foto, costo, telas, etc.)' : undefined}>
                    <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSel(o.id)} />
                    </td>
                    <td className="cell-photo">
                      {ref && ref.image ? (
                        <img src={ref.image} alt={o.referencia} className="thumb"
                          title="Ampliar foto"
                          onClick={(e) => { e.stopPropagation(); onViewImage(ref.image) }} />
                      ) : (
                        <span className="thumb empty" title={canOpen ? 'Sin foto — clic en la fila para agregar' : ''}>＋</span>
                      )}
                    </td>
                    <td><span className={'origen-chip o-' + o.origen}>{ORIGEN_ABBR[o.origen] || o.origen}</span></td>
                    <td className="mono">{o.orden}</td>
                    <td className="strong">{o.referencia}</td>
                    <td>{o.producto}</td>
                    <td><ProcesosCell refRow={ref} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <TopCell orden={o} refRow={ref} topLinks={topLinks} onAbrir={setTopDe} />
                    </td>
                    <td>{o.empresa}</td>
                    {showTaller && <td>{taller}</td>}
                    <td>{formatDate(base.fecha)}</td>
                    <td className="num">{base.cant}</td>
                    {showAtraso && (
                      <td className="num">
                        {atraso == null ? '' : (
                          <span className={'tag' + (atraso >= 15 ? ' tag-warn' : '')}>{atraso} d</span>
                        )}
                      </td>
                    )}
                    <td><span className="tag">{pendienteLabel}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <TopVinculoModal orden={topDe} orders={orders} refMap={refMap} topLinks={topLinks}
        onVincular={onVincularTop} onClose={() => setTopDe(null)} />
    </div>
  )
}
