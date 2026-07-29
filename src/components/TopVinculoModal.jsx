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

// Ficha de una orden: dónde va, en qué taller y las fechas de cada etapa.
function OrdenPanel({ orden, titulo }) {
  const taller = ((orden.stages && orden.stages.envioEnsamble) || {}).taller || ''
  return (
    <div className="topv-panel">
      <div className="topv-panel-head">
        <span className="topv-panel-tit">{titulo}</span>
        <span className="strong">{orden.referencia}</span>
      </div>
      <div className="topv-datos">
        <div><span className="muted">Orden</span><b className="mono">{orden.orden}</b></div>
        <div><span className="muted">Fase</span><b>{ORIGENES[orden.origen] || orden.origen}</b></div>
        <div><span className="muted">Cantidad</span><b>{cantDe(orden) || '—'}</b></div>
        <div><span className="muted">Etapa actual</span><b>{etapaActual(orden)}</b></div>
        <div className="topv-ancho">
          <span className="muted">Taller</span><b>{taller || 'Aún sin enviar'}</b>
        </div>
      </div>
      <ul className="topv-linea">
        {ETAPAS.map(([k, label]) => {
          const s = (orden.stages && orden.stages[k]) || {}
          return (
            <li key={k} className={s.fecha ? 'ok' : ''}>
              <span>{label}</span>
              <span className="mono">{s.fecha ? formatDate(s.fecha) : '—'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Muestra dónde va el top de una prenda (o, desde la fila del top, a qué
 * prenda y lote pertenece) y permite corregir el vínculo a mano.
 */
export default function TopVinculoModal({ orden, orders, topLinks, onVincular, onClose }) {
  const [eligiendo, setEligiendo] = useState(false)
  const abierto = !!orden
  const esTop = abierto && esOrdenTop(orden)
  const clave = abierto ? claveOrden(orden) : ''
  const vinculo = abierto
    ? (esTop ? topLinks.porTop.get(clave) : topLinks.porBase.get(clave))
    : null
  const pareja = vinculo ? (esTop ? vinculo.base : vinculo.top) : null

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
    const claveTop = esTop ? clave : claveOrden(otra)
    const claveBase = esTop ? claveOrden(otra) : clave
    onVincular(claveTop, claveBase)
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
            <h2>{esTop ? 'Prenda de este top' : 'Top de esta prenda'}</h2>
            <button className="icon-btn" onClick={cerrar} title="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            <div className="topv-grid">
              <OrdenPanel orden={orden} titulo={esTop ? 'Top' : 'Prenda'} />
              {pareja ? (
                <OrdenPanel orden={pareja} titulo={esTop ? 'Prenda' : 'Top'} />
              ) : (
                <div className="topv-panel topv-vacio">
                  <p className="strong">
                    {esTop ? 'Sin prenda vinculada' : 'Top aún no programado'}
                  </p>
                  <p className="muted">
                    {esTop
                      ? 'No se encontró la orden de la prenda a la que pertenece este top.'
                      : 'Esta prenda lleva top incluido, pero todavía no hay una orden de corte para el top de este lote.'}
                  </p>
                </div>
              )}
            </div>

            {vinculo && vinculo.aMano && (
              <p className="topv-manual">Vínculo puesto a mano.</p>
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
                  <p className="muted">No hay órdenes {esTop ? 'de esta prenda' : 'de top para esta referencia'}.</p>
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
