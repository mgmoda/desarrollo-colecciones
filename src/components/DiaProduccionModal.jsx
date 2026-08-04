import { useMemo } from 'react'
import Modal from './Modal.jsx'
import ProcesosTags from './ProcesosTags.jsx'
import { ORIGENES, ORIGEN_ABBR, TOP_LABEL, formatDate } from '../lib/constants.js'
import { etiquetaDiaLargo } from '../lib/dates.js'

/**
 * Lo que se hizo un día en un área, referencia por referencia: foto, códigos,
 * fase, cantidad, procesos especiales y acabado del top.
 *
 * Cuando lo del día pasó por taller —lo enviado y lo recibido— las referencias
 * van agrupadas por taller, de mayor a menor despacho, para leer de una qué se
 * le mandó a cada uno sin tener que cruzar la lista a mano.
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

  function Item({ r }) {
    const ficha = refMap && refMap.get(r.referencia)
    const abrible = !!(onOpenRef && ficha)
    return (
      <li className={'dia-item' + (abrible ? ' dia-item-click' : '')}
        onClick={() => abrible && onOpenRef(ficha)}
        title={abrible ? 'Abrir la ficha de la referencia' : undefined}>
        {ficha && ficha.image ? (
          <img className="dia-foto" src={ficha.image} alt={r.referencia}
            title="Ampliar foto"
            onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(ficha.image) }} />
        ) : (
          <span className="dia-foto dia-foto-vacia">＋</span>
        )}

        <div className="dia-info">
          <p className="dia-ref">
            {r.referencia}
            <span className={'origen-chip o-' + r.origen}
              title={ORIGENES[r.origen] || r.origen}>
              {ORIGEN_ABBR[r.origen] || r.origen}
            </span>
          </p>
          <p className="dia-desc">
            {(ficha && (ficha.descripcion || ficha.tipo)) || <span className="muted">Sin descripción</span>}
          </p>
          <p className="dia-meta">
            <span>Orden <b className="mono">{r.orden}</b></span>
            {ficha && ficha.marca && <span>{ficha.marca}</span>}
            {ficha && ficha.tela && <span>{ficha.tela}</span>}
            {r.fecha && <span>{formatDate(r.fecha)}</span>}
          </p>
          <p className="dia-procesos">
            <ProcesosTags refRow={ficha} vacio="Sin procesos especiales" />
            {ficha && ficha.topIncluido && (
              <span className="tag">{TOP_LABEL[ficha.topIncluido] || ficha.topIncluido}</span>
            )}
          </p>
        </div>

        <div className="dia-cant">
          <b>{r.cant}</b>
          <span>und</span>
        </div>
      </li>
    )
  }

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
                {grupos && (
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
            {grupos ? grupos.map((g) => (
              <section key={g.taller} className="dia-grupo">
                <p className="dia-grupo-tit">
                  <span className="dia-grupo-taller">{g.taller}</span>
                  <span className="dia-grupo-cifra">
                    {g.unidades.toLocaleString('es-CO')} und · {g.refs.length}
                    {g.refs.length === 1 ? ' referencia' : ' referencias'}
                  </span>
                </p>
                <ul className="dia-lista">
                  {g.refs.map((r) => <Item key={r.id} r={r} />)}
                </ul>
              </section>
            )) : (
              <ul className="dia-lista">
                {refs.map((r) => <Item key={r.id} r={r} />)}
              </ul>
            )}
          </div>

          <div className="modal-foot">
            <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        </>
      )}
    </Modal>
  )
}
