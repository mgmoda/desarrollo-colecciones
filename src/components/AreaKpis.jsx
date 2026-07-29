import { useMemo, useState } from 'react'
import { ORIGENES, ORIGEN_ABBR } from '../lib/constants.js'
import { pendienteDeArea, produccionPorDia, totalSemana } from '../lib/domain.js'
import {
  etiquetaDia, etiquetaDiaLargo, isoLocal, rangoSemana, semanaAnteriorDe, semanaDe,
} from '../lib/dates.js'

// Cada área mide su propio trabajo por la etapa que ella cierra: Trazos el
// trazo, Corte la entrega de corte, Por enviar el envío al taller… En Entrega
// ensamble no hay etapa siguiente, así que se mide lo que va entrando.
const MEDIDA = {
  trazos: { etapa: 'trazo', pendiente: 'Pendiente por trazar', hecho: 'Trazado esta semana' },
  corte: { etapa: 'entregaCorte', pendiente: 'Pendiente por cortar', hecho: 'Cortado esta semana' },
  enviar: { etapa: 'envioEnsamble', pendiente: 'Pendiente por enviar', hecho: 'Enviado a taller esta semana' },
  talleres: { etapa: 'entregaEnsamble', pendiente: 'En talleres', hecho: 'Recibido de taller esta semana' },
  entrega: { etapa: 'entregaEnsamble', pendiente: 'En esta etapa', hecho: 'Recibido esta semana' },
}

export default function AreaKpis({ areaKey, orders, enEtapa }) {
  const [diaAbierto, setDiaAbierto] = useState('')
  const medida = MEDIDA[areaKey] || MEDIDA.trazos
  const hoy = isoLocal(new Date())

  const pendiente = useMemo(() => pendienteDeArea(enEtapa), [enEtapa])
  const dias = useMemo(() => semanaDe(hoy), [hoy])
  const porDia = useMemo(
    () => produccionPorDia(orders, medida.etapa, dias),
    [orders, medida.etapa, dias],
  )
  const total = useMemo(
    () => totalSemana(orders, medida.etapa, dias),
    [orders, medida.etapa, dias],
  )
  const previa = useMemo(
    () => totalSemana(orders, medida.etapa, semanaAnteriorDe(hoy)),
    [orders, medida.etapa, hoy],
  )

  const desglose = Object.entries(pendiente.porFase)
    .sort((a, b) => b[1].unidades - a[1].unidades)
  const detalle = diaAbierto ? porDia.get(diaAbierto) : null

  return (
    <div className="kpi-wrap">
      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">{medida.pendiente}</p>
          <p className="kpi-cifra">{pendiente.unidades.toLocaleString('es-CO')}</p>
          <p className="kpi-unidad">unidades</p>
          <p className="kpi-desglose">
            {pendiente.ordenes} {pendiente.ordenes === 1 ? 'orden' : 'órdenes'}
            {desglose.length > 0 && (
              <span className="kpi-fases">
                {desglose.map(([fase, d]) => (
                  <span key={fase} title={`${d.unidades} unidades`}>
                    {d.ordenes} {(ORIGENES[fase] || fase).toLowerCase()}
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>

        <div className="kpi-card">
          <div className="kpi-semana-head">
            <p className="kpi-label">{medida.hecho}</p>
            <p className="kpi-rango">{rangoSemana(dias)}</p>
          </div>

          <div className="kpi-dias">
            {dias.map((d) => {
              const info = porDia.get(d)
              const esHoy = d === hoy
              const futuro = d > hoy
              const abierto = d === diaAbierto
              const clase = ['kpi-dia',
                futuro ? 'kpi-dia-futuro' : '',
                esHoy ? 'kpi-dia-hoy' : '',
                abierto ? 'kpi-dia-abierto' : ''].filter(Boolean).join(' ')
              return (
                <button key={d} type="button" className={clase}
                  disabled={futuro || !info.refs.length}
                  onClick={() => setDiaAbierto(abierto ? '' : d)}
                  title={info.refs.length ? 'Ver las referencias del día' : ''}>
                  <span className="kpi-dia-fecha">{etiquetaDia(d)}</span>
                  <span className="kpi-dia-cifra">{futuro ? '·' : info.unidades}</span>
                  <span className="kpi-dia-refs">
                    {futuro ? '' : esHoy && !info.refs.length ? 'hoy' : `${info.refs.length} ref`}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="kpi-total">
            <span className="muted">Total de la semana</span>
            <b>{total.unidades.toLocaleString('es-CO')}</b>
            <span className="muted">
              unidades en {total.refs} {total.refs === 1 ? 'referencia' : 'referencias'}
            </span>
            <span className="kpi-previa">
              semana pasada {previa.unidades.toLocaleString('es-CO')}
            </span>
          </p>
        </div>
      </div>

      {detalle && (
        <div className="kpi-detalle">
          <p className="kpi-detalle-head">
            {etiquetaDiaLargo(diaAbierto)}
            <span className="muted"> · {detalle.unidades.toLocaleString('es-CO')} unidades</span>
            <button className="kpi-cerrar" onClick={() => setDiaAbierto('')} title="Cerrar">✕</button>
          </p>
          <div className="kpi-refs">
            {detalle.refs.map((r) => (
              <span key={r.id} className="kpi-ref" title={`Orden ${r.orden}`}>
                <span className={'origen-chip o-' + r.origen}>{ORIGEN_ABBR[r.origen] || r.origen}</span>
                {r.referencia}
                <b>{r.cant}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
