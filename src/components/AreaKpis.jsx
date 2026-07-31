import { useMemo, useState } from 'react'
import DiaProduccionModal from './DiaProduccionModal.jsx'
import {
  desglosePorMarca, ordenesConEtapa, produccionPorDia, totalSemana,
} from '../lib/domain.js'
import {
  etiquetaDia, isoLocal, rangoSemana, semanaAnteriorDe, semanaDe,
} from '../lib/dates.js'

// Cada área mide su propio trabajo por la etapa que ella cierra: Trazos el
// trazo, Corte la entrega de corte, Por enviar el envío al taller… En Entrega
// ensamble no hay etapa siguiente, así que se mide lo que va entrando.
const MEDIDA = {
  trazos: { etapa: 'trazo', pendiente: 'Pendiente por trazar', hecho: 'Trazado esta semana', verbo: 'Trazado' },
  corte: { etapa: 'entregaCorte', pendiente: 'Pendiente por cortar', hecho: 'Cortado esta semana', verbo: 'Cortado' },
  enviar: { etapa: 'envioEnsamble', pendiente: 'Pendiente por enviar', hecho: 'Enviado a taller esta semana', verbo: 'Enviado a taller' },
  talleres: { etapa: 'entregaEnsamble', pendiente: 'En talleres', hecho: 'Recibido de taller esta semana', verbo: 'Recibido de taller' },
  entrega: { etapa: 'entregaEnsamble', pendiente: 'En esta etapa', hecho: 'Recibido esta semana', verbo: 'Recibido' },
  // La orden de corte no acumula pendientes: se emite y la prenda pasa de una
  // vez a Trazos. Lo que se mide es cuánto se programa.
  ordencorte: { etapa: 'ordenCorte', pendiente: 'Programado', hecho: 'Programado esta semana', verbo: 'Programado' },
}

// Rótulo de la tarjeta de acumulado: lo que el área lleva hecho en total.
const ACUMULADO = {
  trazos: 'Trazado en total',
  corte: 'Cortado en total',
  enviar: 'Enviado a taller en total',
  talleres: 'Recibido de taller en total',
  entrega: 'Recibido en total',
  ordencorte: 'Programado en total',
}

// Casania · Mariset · MG (las dos) · Geodésica
function Desglose({ marcas }) {
  if (!marcas) return null
  const filas = [
    ['Casania', marcas.Casania],
    ['Mariset', marcas.Mariset],
    ['MG', marcas.MG, true],
    ['Geodésica', marcas['Geodésica']],
    ['Sin marca', marcas['Sin marca']],
  ].filter(([, d]) => d && d.unidades > 0)
  if (!filas.length) return null
  return (
    <ul className="kpi-marcas">
      {filas.map(([nombre, d, sub]) => (
        <li key={nombre} className={sub ? 'kpi-marca-sub' : ''} title={`${d.ordenes} órdenes`}>
          <span>{nombre}</span>
          <b>{d.unidades.toLocaleString('es-CO')}</b>
        </li>
      ))}
    </ul>
  )
}

export default function AreaKpis({ areaKey, orders, enEtapa, refMap, onViewImage, onOpenRef, izquierda, sinAcumulado }) {
  // En Entrega ensamble no hay nada "pendiente": lo que entra ya está hecho,
  // así que la tarjeta de pendientes sería la misma del acumulado.
  const sinPendiente = areaKey === 'entrega'
  const [diaAbierto, setDiaAbierto] = useState('')
  const medida = MEDIDA[areaKey] || MEDIDA.trazos
  const hoy = isoLocal(new Date())

  // Tarjeta de la izquierda: lo que falta en la etapa, desglosado por marca.
  const propio = useMemo(
    () => desglosePorMarca(enEtapa || [], refMap, 'ordenCorte'),
    [enEtapa, refMap],
  )
  const pendiente = izquierda || propio
  const etiquetaIzq = (izquierda && izquierda.label) || medida.pendiente

  // Segunda tarjeta: lo que el área lleva hecho desde que se importa el
  // archivo. No se pasa como prop porque sale de lo mismo en todas.
  const acumulado = useMemo(
    () => desglosePorMarca(ordenesConEtapa(orders, medida.etapa), refMap, medida.etapa),
    [orders, medida.etapa, refMap],
  )
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

  const detalle = diaAbierto ? porDia.get(diaAbierto) : null

  return (
    <div className="kpi-wrap">
      <div className="kpi-grid">
        <div className="kpi-nums">
        {!sinPendiente && (
        <div className="kpi-card">
          <p className="kpi-label">{etiquetaIzq}</p>
          <p className="kpi-cifra">{pendiente.unidades.toLocaleString('es-CO')}</p>
          <p className="kpi-unidad">unidades</p>
          <p className="kpi-desglose">
            {pendiente.ordenes} {pendiente.ordenes === 1 ? 'orden' : 'órdenes'}
          </p>
          <Desglose marcas={pendiente.marcas} />
        </div>
        )}

        {!sinAcumulado && (
        <div className="kpi-card">
          <p className="kpi-label">{ACUMULADO[areaKey] || 'En total'}</p>
          <p className="kpi-cifra">{acumulado.unidades.toLocaleString('es-CO')}</p>
          <p className="kpi-unidad">unidades</p>
          <p className="kpi-desglose">
            {acumulado.ordenes} {acumulado.ordenes === 1 ? 'orden' : 'órdenes'}
          </p>
          <Desglose marcas={acumulado.marcas} />
        </div>
        )}
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

      <DiaProduccionModal dia={diaAbierto} detalle={detalle} titulo={medida.verbo}
        refMap={refMap} onViewImage={onViewImage}
        onOpenRef={(ficha) => { setDiaAbierto(''); onOpenRef && onOpenRef(ficha) }}
        onClose={() => setDiaAbierto('')} />
    </div>
  )
}
