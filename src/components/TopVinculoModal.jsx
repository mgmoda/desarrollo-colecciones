import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { AREAS, formatDate, ORIGENES } from '../lib/constants.js'
import {
  claveOrden, esOrdenTop, orderArea, refBaseDeTop,
} from '../lib/domain.js'

const ETAPAS = [
  ['ordenCorte', 'Orden corte'],
  ['trazo', 'Trazo'],
  ['alistamiento', 'Alistamiento'],
  ['entregaCorte', 'Entrega corte'],
  ['envioEnsamble', 'Envío a taller'],
  ['entregaEnsamble', 'Entrega ensamble'],
]

function etapaActual(o) {
  const a = orderArea(o)
  return a ? AREAS[a].label : 'Sin orden de corte'
}

function cantDe(o) {
  return ((o.stages && o.stages.ordenCorte) || {}).cant || ''
}

function tallerDe(o) {
  return ((o.stages && o.stages.envioEnsamble) || {}).taller || ''
}

function fechaEtapa(o, k) {
  return (o && o.stages && o.stages[k] && o.stages[k].fecha) || ''
}

// Tarjeta de una de las dos órdenes. `lado` ('prenda' | 'top') le pone el
// color y la etiqueta, para no confundir una con otra.
function OrdenCard({ orden, lado, etiqueta }) {
  return (
    <div className={'topv-card topv-' + lado}>
      <div className="topv-card-tag">{etiqueta}</div>
      <p className="topv-card-ref">{orden.referencia}</p>
      <dl className="topv-card-datos">
        <dt>Orden</dt><dd className="mono">{orden.orden}</dd>
        <dt>Taller</dt><dd>{tallerDe(orden) || <span className="muted">Aún sin enviar</span>}</dd>
        <dt>Va en</dt><dd className="strong">{etapaActual(orden)}</dd>
      </dl>
    </div>
  )
}

/**
 * Muestra dónde va el top de una prenda (o, desde la fila del top, a qué
 * prenda y lote pertenece) y permite corregir el vínculo a mano.
 */
export default function TopVinculoModal({ orden, orders, refMap, topLinks, onVincular, onClose }) {
  const [eligiendo, setEligiendo] = useState(false)
  const abierto = !!orden
  const esTop = abierto && esOrdenTop(orden)
  const clave = abierto ? claveOrden(orden) : ''
  const vinculo = abierto
    ? (esTop ? topLinks.porTop.get(clave) : topLinks.porBase.get(clave))
    : null
  const pareja = vinculo ? (esTop ? vinculo.base : vinculo.top) : null

  // Siempre se pinta la prenda a la izquierda y el top a la derecha, sin
  // importar desde qué fila se haya abierto.
  const prenda = esTop ? pareja : orden
  const top = esTop ? orden : pareja

  const ficha = abierto && refMap
    ? (refMap.get(orden.referencia) || (pareja && refMap.get(pareja.referencia)))
    : null

  // Fase y cantidad se muestran arriba cuando las dos órdenes coinciden —que
  // es lo normal, porque el top se corta para el mismo lote—. Si no coinciden,
  // se muestran dentro de cada tarjeta y se advierte.
  const refOrden = prenda || top
  const mismaFase = !prenda || !top || prenda.origen === top.origen
  const mismaCant = !prenda || !top || cantDe(prenda) === cantDe(top)

  // Candidatos para vincular a mano: desde la prenda, los tops de esa misma
  // referencia; desde el top, las órdenes de la prenda.
  const candidatos = useMemo(() => {
    if (!abierto) return []
    if (esTop) {
      const raiz = refBaseDeTop(orden.referencia).toLowerCase()
      return orders.filter((o) => !esOrdenTop(o) && o.referencia.toLowerCase() === raiz)
    }
    const mia = orden.referencia.toLowerCase()
    return orders.filter((o) => esOrdenTop(o) && refBaseDeTop(o.referencia).toLowerCase() === mia)
  }, [abierto, esTop, orden, orders])

  function vincular(otra) {
    onVincular(esTop ? clave : claveOrden(otra), esTop ? claveOrden(otra) : clave)
    setEligiendo(false)
  }

  function desvincular() {
    onVincular(esTop ? clave : claveOrden(pareja), '')
    setEligiendo(false)
  }

  // Descarta la corrección manual y deja que el vínculo lo vuelva a deducir
  // el sistema (misma fase, misma cantidad, orden posterior).
  function volverAutomatico() {
    onVincular(esTop ? clave : claveOrden(pareja), null)
    setEligiendo(false)
  }

  function cerrar() { setEligiendo(false); onClose() }

  return (
    <Modal open={abierto} onClose={cerrar} size="lg">
      {abierto && (
        <>
          <div className="modal-head">
            <h2>Prenda y su top</h2>
            <button className="icon-btn" onClick={cerrar} title="Cerrar">✕</button>
          </div>

          <div className="modal-body">
            {/* Lo que las dos órdenes comparten: la prenda, el lote. */}
            <header className="topv-cab">
              {ficha && ficha.image
                ? <img className="topv-foto" src={ficha.image} alt="" />
                : <span className="topv-foto topv-foto-vacia">＋</span>}
              <div>
                <p className="topv-cab-ref">{refBaseDeTop((prenda || top).referencia)}</p>
                {ficha && ficha.descripcion && (
                  <p className="topv-cab-desc">{ficha.descripcion}</p>
                )}
                <p className="topv-cab-lote">
                  {mismaFase && <span className="tag">{ORIGENES[refOrden.origen] || refOrden.origen}</span>}
                  {mismaCant && cantDe(refOrden) && <span className="tag">{cantDe(refOrden)} unidades</span>}
                  {!mismaFase && <span className="tag tag-warn">Fases distintas</span>}
                  {!mismaCant && <span className="tag tag-warn">Cantidades distintas</span>}
                </p>
              </div>
            </header>

            <div className="topv-cards">
              {prenda
                ? <OrdenCard orden={prenda} lado="prenda" etiqueta="La prenda" />
                : (
                  <div className="topv-card topv-prenda topv-card-vacia">
                    <div className="topv-card-tag">La prenda</div>
                    <p className="strong">Sin prenda vinculada</p>
                    <p className="muted">No se encontró la orden a la que pertenece este top.</p>
                  </div>
                )}
              {top
                ? <OrdenCard orden={top} lado="top" etiqueta="Su top" />
                : (
                  <div className="topv-card topv-top topv-card-vacia">
                    <div className="topv-card-tag">Su top</div>
                    <p className="strong">Top aún no programado</p>
                    <p className="muted">Todavía no hay orden de corte para el top de este lote.</p>
                  </div>
                )}
            </div>

            {/* Las fechas enfrentadas: así se ve de un vistazo si el top va
                atrasado respecto a la prenda. */}
            <table className="topv-fechas">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th className="topv-th-prenda">Prenda</th>
                  <th className="topv-th-top">Top</th>
                </tr>
              </thead>
              <tbody>
                {ETAPAS.map(([k, label]) => {
                  const fp = fechaEtapa(prenda, k)
                  const ft = fechaEtapa(top, k)
                  return (
                    <tr key={k} className={fp || ft ? '' : 'topv-fila-pend'}>
                      <th scope="row">{label}</th>
                      <td className="mono">{fp ? formatDate(fp) : '—'}</td>
                      <td className="mono">{ft ? formatDate(ft) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {vinculo && vinculo.aMano && (
              <p className="topv-nota">Este vínculo se puso a mano.</p>
            )}
            {vinculo && vinculo.aviso && (
              <p className="topv-aviso">⚠ {vinculo.aviso}</p>
            )}

            {eligiendo && (
              <div className="topv-elegir">
                <p className="muted">
                  {esTop ? 'Elige la orden de la prenda:' : 'Elige la orden del top:'}
                </p>
                {candidatos.length === 0 ? (
                  <p className="muted">
                    No hay órdenes {esTop ? 'de esta prenda' : 'de top para esta referencia'}.
                  </p>
                ) : (
                  <ul className="topv-cand">
                    {candidatos.map((o) => (
                      <li key={o.id}>
                        <button className="btn" onClick={() => vincular(o)}>
                          <span className="mono">{o.orden}</span>
                          {' · '}{ORIGENES[o.origen] || o.origen}
                          {' · '}{cantDe(o) || '—'} und
                          {' · '}{etapaActual(o)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="modal-foot spread">
            <div className="topv-acciones">
              <button className="btn" onClick={() => setEligiendo(!eligiendo)}>
                {pareja ? 'Cambiar vínculo' : 'Vincular a mano'}
              </button>
              {pareja && (
                <button className="btn" onClick={desvincular} title="Declarar que no van juntos">
                  Quitar vínculo
                </button>
              )}
              {vinculo && vinculo.aMano && (
                <button className="btn" onClick={volverAutomatico}
                  title="Descartar la corrección y volver a deducirlo solo">
                  Volver al automático
                </button>
              )}
            </div>
            <button className="btn btn-primary" onClick={cerrar}>Cerrar</button>
          </div>
        </>
      )}
    </Modal>
  )
}
