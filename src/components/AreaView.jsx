import { useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { AREAS, formatDate } from '../lib/constants.js'
import { ordersForArea } from '../lib/domain.js'
import { diasDesde } from '../lib/dates.js'

const STAGE_LABEL = {
  ordenCorte: 'Orden corte', trazo: 'Trazo', entregaCorte: 'Corte',
  alistamiento: 'Alistamiento', envioEnsamble: 'Envío a taller',
  entregaEnsamble: 'Entrega ensamble', revisado: 'Revisado', entradaBodega: 'Entrada bodega',
}

export default function AreaView({ areaKey, orders, refMap, onViewImage }) {
  const area = AREAS[areaKey]
  const [q, setQ] = useState('')
  const { sortKey, sortDir, toggle } = useSort('orden', 'asc')

  const baseStage = area.base
  const showTaller = areaKey === 'talleres' || areaKey === 'enviar'
  const showAtraso = areaKey !== 'entrega' // en entrega ya ingresó: no hay atraso
  const pendienteLabel = area.next ? STAGE_LABEL[area.next] : 'Recibido'

  const rows = useMemo(() => {
    let list = ordersForArea(orders, areaKey)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((o) =>
        [o.referencia, o.producto, o.empresa, o.orden]
          .some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      orden: (o) => o.orden,
      referencia: (o) => o.referencia,
      producto: (o) => o.producto,
      empresa: (o) => o.empresa,
      taller: (o) => (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || '',
      fecha: (o) => (o.stages[baseStage] || {}).fecha,
      cant: (o) => Number((o.stages[baseStage] || {}).cant),
      atraso: (o) => diasDesde((o.stages[baseStage] || {}).fecha),
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [orders, areaKey, q, sortKey, sortDir, baseStage])

  const thProps = { sortKey, sortDir, onSort: toggle }

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
        <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia, producto…" />
      </div>

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
                <th>Foto</th>
                <SortTh label="# Orden" col="orden" {...thProps} />
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Producto" col="producto" {...thProps} />
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
                return (
                  <tr key={o.id}>
                    <td className="cell-photo">
                      {ref && ref.image ? (
                        <img src={ref.image} alt={o.referencia} className="thumb"
                          title="Ampliar foto" onClick={() => onViewImage(ref.image)} />
                      ) : (
                        <span className="thumb empty">—</span>
                      )}
                    </td>
                    <td className="mono">{o.orden}</td>
                    <td className="strong">{o.referencia}</td>
                    <td>{o.producto}</td>
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
    </div>
  )
}
