import Modal from './Modal.jsx'
import ProcesosTags from './ProcesosTags.jsx'
import { AREAS, ORIGENES, formatDate } from '../lib/constants.js'
import { estadoConjunto, orderArea } from '../lib/domain.js'

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

function PrendaCard({ orden, ficha, lado, onViewImage }) {
  return (
    <div className={'topv-card topv-' + lado}>
      <div className="topv-card-tag">{(ficha && ficha.tipo) || 'Prenda'}</div>
      <div className="conj-card-top">
        {ficha && ficha.image ? (
          <img className="conj-foto" src={ficha.image} alt={orden.referencia}
            title="Ampliar foto"
            onClick={() => onViewImage && onViewImage(ficha.image)} />
        ) : (
          <span className="conj-foto conj-foto-vacia">＋</span>
        )}
        <div>
          <p className="topv-card-ref">{orden.referencia}</p>
          <p className="conj-desc">
            {(ficha && ficha.descripcion) || <span className="muted">Sin descripción</span>}
          </p>
        </div>
      </div>
      <dl className="topv-card-datos">
        <dt>Orden</dt><dd className="mono">{orden.orden}</dd>
        <dt>Cantidad</dt><dd>{cantDe(orden) || '—'}</dd>
        <dt>Taller</dt><dd>{tallerDe(orden) || <span className="muted">Aún sin enviar</span>}</dd>
        <dt>Va en</dt><dd className="strong">{etapaActual(orden)}</dd>
      </dl>
      <p className="conj-procesos"><ProcesosTags refRow={ficha} vacio="Sin procesos especiales" /></p>
    </div>
  )
}

/**
 * Las dos prendas de un conjunto, enfrentadas: dónde va cada una, en qué
 * taller y si están entrando a ensamble a la par —que es lo que hay que
 * cuidar, porque el conjunto se despacha completo—.
 */
export default function ConjuntoModal({
  orden, vinculo, refMap, onViewImage, onClose,
}) {
  const abierto = !!(orden && vinculo && vinculo.pareja)
  if (!abierto) return <Modal open={false} onClose={onClose} />

  const pareja = vinculo.pareja
  const fichaA = refMap.get(orden.referencia)
  const fichaB = vinculo.ficha || refMap.get(pareja.referencia)
  const est = estadoConjunto(orden, pareja)

  let veredicto
  if (est.dias != null) {
    veredicto = est.dias === 0
      ? { tono: 'ok', texto: 'Las dos prendas entraron a ensamble el mismo día.' }
      : {
        tono: est.dias > 7 ? 'mal' : 'aviso',
        texto: `Entraron a ensamble con ${est.dias} ${est.dias === 1 ? 'día' : 'días'} de diferencia.`,
      }
  } else if (est.juntas) {
    veredicto = { tono: 'ok', texto: `Las dos van juntas en ${AREAS[est.area] ? AREAS[est.area].label : 'la misma etapa'}.` }
  } else {
    veredicto = {
      tono: 'mal',
      texto: `Van desfasadas: ${(fichaA && fichaA.tipo) || orden.referencia} en ${etapaActual(orden)}`
        + ` y ${(fichaB && fichaB.tipo) || pareja.referencia} en ${etapaActual(pareja)}.`,
    }
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="modal-head">
        <div>
          <h2>Conjunto</h2>
          <p className="modal-sub">
            {ORIGENES[orden.origen] || orden.origen}
            <span className="modal-sub-sep"> · </span>
            se despacha completo, las dos prendas deben entrar a la par
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="modal-body">
        <p className={'conj-veredicto conj-' + veredicto.tono}>{veredicto.texto}</p>

        <div className="topv-cards">
          <PrendaCard orden={orden} ficha={fichaA} lado="prenda" onViewImage={onViewImage} />
          <PrendaCard orden={pareja} ficha={fichaB} lado="top" onViewImage={onViewImage} />
        </div>

        <table className="topv-fechas">
          <thead>
            <tr>
              <th>Etapa</th>
              <th className="topv-th-prenda">{(fichaA && fichaA.tipo) || 'Prenda 1'}</th>
              <th className="topv-th-top">{(fichaB && fichaB.tipo) || 'Prenda 2'}</th>
            </tr>
          </thead>
          <tbody>
            {ETAPAS.map(([k, label]) => {
              const fa = (orden.stages[k] || {}).fecha
              const fb = (pareja.stages[k] || {}).fecha
              return (
                <tr key={k} className={fa || fb ? '' : 'topv-fila-pend'}>
                  <th scope="row">{label}</th>
                  <td className="mono">{fa ? formatDate(fa) : '—'}</td>
                  <td className="mono">{fb ? formatDate(fb) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {vinculo.aviso && <p className="topv-aviso">⚠ {vinculo.aviso}</p>}
      </div>

      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
