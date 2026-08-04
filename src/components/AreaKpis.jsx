import { useMemo, useState } from 'react'
import DiaProduccionModal from './DiaProduccionModal.jsx'
import TablaSemanas from './TablaSemanas.jsx'
import {
  desglosePorMarca, cuentaComoTop, ordenesConEtapa, produccionPorDia, SUBMARCAS_KPI,
} from '../lib/domain.js'
import {
  etiquetaDia, isoLocal, rangoSemana, semanaDe,
} from '../lib/dates.js'

// Cada área mide su propio trabajo por la etapa que ella cierra: Trazos el
// trazo, Corte la entrega de corte, Por enviar el envío al taller… En Entrega
// ensamble no hay etapa siguiente, así que se mide lo que va entrando.
const MEDIDA = {
  trazos: { etapa: 'trazo', pendiente: 'Pendiente por trazar', hecho: 'Trazado esta semana', verbo: 'Trazado' },
  corte: { etapa: 'entregaCorte', pendiente: 'Pendiente por cortar', hecho: 'Cortado esta semana', verbo: 'Cortado' },
  enviar: { etapa: 'alistamiento', pendiente: 'Pendiente por alistar', hecho: 'Alistado esta semana', verbo: 'Alistado' },
  alistamiento: { etapa: 'envioEnsamble', pendiente: 'Pendiente por enviar', hecho: 'Enviado a taller esta semana', verbo: 'Enviado a taller' },
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
  enviar: 'Alistado en total',
  alistamiento: 'Enviado a taller en total',
  talleres: 'Recibido de taller en total',
  entrega: 'Recibido en total',
  ordencorte: 'Programado en total',
}

// Tarjeta de cifra. La grande es MG, que es lo propio; debajo, Geodésica y el
// total en tamaño normal. Al tocar la cifra se abre el reparto de MG entre
// Casania y Mariset.
function TarjetaCifra({ label, datos }) {
  const [abierto, setAbierto] = useState(false)
  const m = datos.marcas || {}
  const cero = { unidades: 0, ordenes: 0 }
  const mg = m.MG || cero
  const geo = m['Geodésica'] || cero
  const tops = m.Tops || cero
  const num = (n) => n.toLocaleString('es-CO')
  const subs = SUBMARCAS_KPI.map((k) => [k, m[k] || cero]).filter(([, d]) => d.unidades > 0)
  const puedeAbrir = subs.length > 1

  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      {puedeAbrir ? (
        <button type="button" className="kpi-cifra-btn" onClick={() => setAbierto(!abierto)}
          title={abierto ? 'Ocultar el reparto por marca' : 'Ver cuánto va de Casania y de Mariset'}>
          <span className="kpi-cifra">{num(mg.unidades)}</span>
          <span className="kpi-caret" aria-hidden="true">{abierto ? '▴' : '▾'}</span>
        </button>
      ) : (
        <p className="kpi-cifra">{num(mg.unidades)}</p>
      )}
      <p className="kpi-unidad">unidades MG</p>
      <p className="kpi-desglose">
        {mg.ordenes} {mg.ordenes === 1 ? 'orden' : 'órdenes'}
      </p>
      <ul className="kpi-marcas">
        {abierto && subs.map(([nombre, d]) => (
          <li key={nombre} className="kpi-sub" title={`${d.ordenes} órdenes`}>
            <span>{nombre}</span>
            <b>{num(d.unidades)}</b>
          </li>
        ))}
        {geo.unidades > 0 && (
          <>
            <li title={`${geo.ordenes} órdenes`}>
              <span>Geodésica</span>
              <b>{num(geo.unidades)}</b>
            </li>
            <li className="kpi-suma" title={`${datos.ordenes} órdenes en total`}>
              <span>Total</span>
              <b>{num(datos.unidades)}</b>
            </li>
          </>
        )}
        {tops.unidades > 0 && (
          <li className="kpi-tops"
            title={`${tops.ordenes} ${tops.ordenes === 1 ? 'orden' : 'órdenes'} de top · no entran en el total`}>
            <span>Tops <em>aparte</em></span>
            <b>{num(tops.unidades)}</b>
          </li>
        )}
      </ul>
    </div>
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
  // El día a día cuenta prendas. Los tops de la semana van en su propia línea
  // debajo, para que la suma de los días cuadre con el total de arriba.
  const porDia = useMemo(
    () => produccionPorDia(orders.filter((o) => !cuentaComoTop(o)), medida.etapa, dias),
    [orders, medida.etapa, dias],
  )
  const topsSemana = useMemo(() => {
    let n = 0
    produccionPorDia(orders.filter(cuentaComoTop), medida.etapa, dias)
      .forEach((d) => { n += d.unidades })
    return n
  }, [orders, medida.etapa, dias])

  const detalle = diaAbierto ? porDia.get(diaAbierto) : null

  return (
    <div className="kpi-wrap">
      <div className="kpi-grid">
        <div className="kpi-nums">
        {!sinPendiente && <TarjetaCifra label={etiquetaIzq} datos={pendiente} />}
        {!sinAcumulado && (
          <TarjetaCifra label={ACUMULADO[areaKey] || 'En total'} datos={acumulado} />
        )}
        </div>

        <div className="kpi-card">
          <div className="kpi-semana-head">
            <p className="kpi-label">{medida.hecho}</p>
            <p className="kpi-rango">
              {topsSemana > 0 && (
                <span className="kpi-rango-tops">
                  + {topsSemana.toLocaleString('es-CO')} en tops
                </span>
              )}
              {rangoSemana(dias)}
            </p>
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

          <TablaSemanas orders={orders} refMap={refMap} destacado={areaKey} />
        </div>
      </div>

      <DiaProduccionModal dia={diaAbierto} detalle={detalle} titulo={medida.verbo}
        refMap={refMap} onViewImage={onViewImage}
        onOpenRef={(ficha) => { setDiaAbierto(''); onOpenRef && onOpenRef(ficha) }}
        onClose={() => setDiaAbierto('')} />
    </div>
  )
}
