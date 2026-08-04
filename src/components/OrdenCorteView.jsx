import { useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import AreaKpis from './AreaKpis.jsx'
import ProcesosTags from './ProcesosTags.jsx'
import CurvaModal, { MEDIDA_DE_AREA } from './CurvaModal.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { AREAS, ORIGENES, ORIGEN_ABBR, TOP_LABEL, formatDate } from '../lib/constants.js'
import { desglosePorMarca, orderArea, ordenesEnRango, refProcesos } from '../lib/domain.js'
import { isoLocal, mesDe, nombreMes, rangoSemana, semanaDe } from '../lib/dates.js'

// La orden de corte es el arranque de todo: se emite y la prenda queda
// pendiente por trazar. Aquí no se mide lo que falta —de eso se encarga
// Trazos— sino cuánto se programa cada día.

const PERIODOS = [
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'todas', label: 'Todas' },
]

export default function OrdenCorteView({
  orders, refMap, fasesOcultas, onToggleFase, onViewImage, onOpenRef,
}) {
  const ocultas = fasesOcultas || new Set()
  const [q, setQ] = useState('')
  const [periodo, setPeriodo] = useState('semana')
  const [curvaDe, setCurvaDe] = useState(null)
  const { sortKey, sortDir, toggle } = useSort('fecha', 'desc')

  const hoy = isoLocal(new Date())
  const semana = useMemo(() => semanaDe(hoy), [hoy])
  const mes = useMemo(() => mesDe(hoy), [hoy])

  const visibles = useMemo(
    () => orders.filter((o) => !ocultas.has(o.origen)),
    [orders, ocultas],
  )

  // Tarjeta de la izquierda: todo lo programado desde que se importa el
  // archivo, no un mes suelto.
  const enTotal = useMemo(
    () => desglosePorMarca(visibles, refMap, 'ordenCorte'),
    [visibles, refMap],
  )

  const rows = useMemo(() => {
    let list
    if (periodo === 'semana') list = ordenesEnRango(visibles, 'ordenCorte', semana[0], semana[6])
    else if (periodo === 'mes') list = ordenesEnRango(visibles, 'ordenCorte', mes[0], mes[1])
    else list = ordenesEnRango(visibles, 'ordenCorte', '0000-01-01', '9999-12-31')

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
      procesos: (o) => refProcesos(refMap.get(o.referencia)).join(', '),
      topForro: (o) => (refMap.get(o.referencia) || {}).topIncluido || '',
      fecha: (o) => o.stages.ordenCorte.fecha,
      cant: (o) => Number((o.stages.ordenCorte || {}).cant),
      etapa: (o) => orderArea(o) || '',
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [visibles, periodo, semana, mes, q, sortKey, sortDir, refMap])

  const thProps = { sortKey, sortDir, onSort: toggle }
  const rotulo = periodo === 'semana'
    ? rangoSemana(semana)
    : periodo === 'mes' ? nombreMes(hoy) : 'todo el histórico'

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Orden de corte</h1>
          <p className="view-sub">
            Lo que se programa · {rows.length} {rows.length === 1 ? 'orden' : 'órdenes'} en {rotulo}
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
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia, producto…" />
        </div>
      </div>

      <AreaKpis areaKey="ordencorte" orders={visibles} enEtapa={[]}
        refMap={refMap} onViewImage={onViewImage} onOpenRef={onOpenRef}
        izquierda={{ ...enTotal, label: 'Programado en total' }} sinAcumulado />

      <div className="oc-periodos">
        {PERIODOS.map((p) => (
          <button key={p.key} type="button"
            className={'opt-btn' + (periodo === p.key ? ' on' : '')}
            onClick={() => setPeriodo(p.key)}>{p.label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No se programaron órdenes en {rotulo}.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Foto</th>
                <SortTh label="Fase" col="fase" {...thProps} />
                <SortTh label="# Orden" col="orden" {...thProps} />
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Producto" col="producto" {...thProps} />
                <SortTh label="Procesos" col="procesos" {...thProps} />
                <SortTh label="Top/Forro" col="topForro" {...thProps} />
                <SortTh label="Empresa" col="empresa" {...thProps} />
                <SortTh label="Orden corte" col="fecha" {...thProps} />
                <SortTh label="Cant" col="cant" className="num" {...thProps} />
                <SortTh label="Va en" col="etapa" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const ref = refMap.get(o.referencia)
                const oc = o.stages.ordenCorte || {}
                const area = orderArea(o)
                return (
                  <tr key={o.id} className="row-click"
                    onClick={() => setCurvaDe(o)}
                    title="Ver la curva de tallas y colores de esta orden">
                    <td className="cell-photo">
                      {ref && ref.image ? (
                        <img src={ref.image} alt={o.referencia} className="thumb" title="Ampliar foto"
                          onClick={(e) => { e.stopPropagation(); onViewImage(ref.image) }} />
                      ) : (
                        <span className="thumb empty">＋</span>
                      )}
                    </td>
                    <td><span className={'origen-chip o-' + o.origen}>{ORIGEN_ABBR[o.origen] || o.origen}</span></td>
                    <td className="mono">{o.orden}</td>
                    <td className="strong">{o.referencia}</td>
                    <td>{o.producto}</td>
                    <td><ProcesosTags refRow={ref} /></td>
                    <td>
                      {ref && ref.topIncluido
                        ? <span className="tag">{TOP_LABEL[ref.topIncluido] || ref.topIncluido}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>{o.empresa}</td>
                    <td>{formatDate(oc.fecha)}</td>
                    <td className="num">{oc.cant}</td>
                    <td>
                      <span className="tag">{area ? AREAS[area].label : 'Sin iniciar'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {curvaDe && (
        <CurvaModal orden={curvaDe} medidaInicial={MEDIDA_DE_AREA.ordencorte}
          refMap={refMap} onClose={() => setCurvaDe(null)}
          onOpenRef={onOpenRef} onViewImage={onViewImage} />
      )}
    </div>
  )
}
