import { useMemo } from 'react'
import Modal from './Modal.jsx'
import ProcesosTags from './ProcesosTags.jsx'
import { ORIGENES, ORIGEN_ABBR, TOP_LABEL } from '../lib/constants.js'
import { etiquetaDiaLargo } from '../lib/dates.js'

/**
 * Lo que se hizo un día en un área, en cuadrícula: una fila por referencia con
 * foto, códigos, fase, marca, procesos y cantidad.
 *
 * Cuando el día mide el paso por taller, la columna Taller va combinada como en
 * una hoja de cálculo: una sola celda por taller, con su total, abarcando las
 * filas que se le despacharon.
 */
export default function DiaProduccionModal({
  dia, detalle, titulo, refMap, onViewImage, onOpenRef, onClose, porTaller,
}) {
  const abierto = !!(dia && detalle)
  const refs = abierto ? detalle.refs : []

  // Solo se agrupa cuando el día mide el paso por taller. En Corte o Trazos la
  // prenda puede tener taller de un envío posterior, y agrupar por eso ahí
  // sería agrupar por un dato que no tiene que ver con lo que se está viendo.
  const grupos = useMemo(() => {
    if (!porTaller || !refs.some((r) => r.taller)) return null
    const m = new Map()
    refs.forEach((r) => {
      const t = r.taller || 'Sin taller asignado'
      const g = m.get(t) || { taller: t, unidades: 0, refs: [] }
      g.unidades += r.cant
      g.refs.push(r)
      m.set(t, g)
    })
    return [...m.values()].sort((a, b) => b.unidades - a.unidades)
  }, [refs, porTaller])

  const conTaller = !!grupos

  function Fila({ r, primeraDelGrupo, grupo }) {
    const ficha = refMap && refMap.get(r.referencia)
    const abrible = !!(onOpenRef && ficha)
    return (
      <tr className={(abrible ? 'row-click' : '') + (primeraDelGrupo ? ' dia-fila-corte' : '')}
        onClick={() => abrible && onOpenRef(ficha)}
        title={abrible ? 'Abrir la ficha de la referencia' : undefined}>
        <td className="cell-photo">
          {ficha && ficha.image ? (
            <img src={ficha.image} alt={r.referencia} className="thumb" title="Ampliar foto"
              onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(ficha.image) }} />
          ) : (
            <span className="thumb empty">＋</span>
          )}
        </td>
        <td>
          <span className={'origen-chip o-' + r.origen} title={ORIGENES[r.origen] || r.origen}>
            {ORIGEN_ABBR[r.origen] || r.origen}
          </span>
        </td>
        <td className="strong">{r.referencia}</td>
        <td className="dia-desc-cel">
          {(ficha && (ficha.descripcion || ficha.tipo)) || <span className="muted">—</span>}
        </td>
        <td className="mono">{r.orden}</td>
        <td>{(ficha && ficha.marca) || <span className="muted">—</span>}</td>
        <td>
          <ProcesosTags refRow={ficha} vacio="—" />
          {ficha && ficha.topIncluido && (
            <span className="tag">{TOP_LABEL[ficha.topIncluido] || ficha.topIncluido}</span>
          )}
        </td>
        {conTaller && primeraDelGrupo && (
          <td className="dia-taller-cel" rowSpan={grupo.refs.length}>
            <b>{grupo.taller}</b>
            <span>{grupo.unidades.toLocaleString('es-CO')} und · {grupo.refs.length}
              {grupo.refs.length === 1 ? ' ref' : ' refs'}</span>
          </td>
        )}
        <td className="num strong">{r.cant}</td>
      </tr>
    )
  }

  const columnas = conTaller ? 8 : 7

  return (
    <Modal open={abierto} onClose={onClose} size="lg">
      {abierto && (
        <>
          <div className="modal-head">
            <div>
              <h2>{etiquetaDiaLargo(dia)}</h2>
              <p className="modal-sub">
                {titulo}
                <span className="modal-sub-sep"> · </span>
                <b>{detalle.unidades.toLocaleString('es-CO')}</b> unidades en {refs.length}
                {refs.length === 1 ? ' referencia' : ' referencias'}
                {conTaller && (
                  <>
                    <span className="modal-sub-sep"> · </span>
                    {grupos.length} {grupos.length === 1 ? 'taller' : 'talleres'}
                  </>
                )}
              </p>
            </div>
            <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
          </div>

          <div className="modal-body">
            <div className="table-wrap">
              <table className="data-table dia-tabla">
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Fase</th>
                    <th>Referencia</th>
                    <th>Descripción</th>
                    <th># Orden</th>
                    <th>Marca</th>
                    <th>Procesos</th>
                    {conTaller && <th>Taller</th>}
                    <th className="num">Cant</th>
                  </tr>
                </thead>
                <tbody>
                  {conTaller
                    ? grupos.map((g) => g.refs.map((r, i) => (
                      <Fila key={r.id} r={r} grupo={g} primeraDelGrupo={i === 0} />
                    )))
                    : refs.map((r) => <Fila key={r.id} r={r} />)}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={columnas}>Total del día</th>
                    <td className="num strong">{detalle.unidades.toLocaleString('es-CO')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="modal-foot">
            <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        </>
      )}
    </Modal>
  )
}
