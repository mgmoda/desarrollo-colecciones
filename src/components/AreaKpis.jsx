import { Fragment, useMemo, useState } from 'react'
import DiaProduccionModal from './DiaProduccionModal.jsx'
import TablaSemanas from './TablaSemanas.jsx'
import {
  desglosePorMarca, cuentaComoTop, ordenesConEtapa, produccionPorDia, SUBMARCAS_KPI,
} from '../lib/domain.js'
import {
  etiquetaDia, isoLocal, rangoSemana, semanaDe,
} from '../lib/dates.js'
import { AREAS } from '../lib/constants.js'

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

// Tarjeta de cifra, con dos maneras de encabezar según lo que mida:
//
//   modo 'mg'  — para los acumulados. La cifra grande es MG, que es lo propio
//                de la casa, y debajo va Geodésica, los tops y el total.
//   por defecto — para los pendientes. La cifra grande es todo lo que hay en
//                la etapa, tops incluidos, porque tiene que cuadrar de un
//                vistazo con las filas de la tabla de abajo.
//
// Al tocar la cifra se abre el detalle de MG entre Casania y Mariset.
function TarjetaCifra({ label, datos, modo }) {
  const [abierto, setAbierto] = useState(false)
  const m = datos.marcas || {}
  const cero = { unidades: 0, ordenes: 0 }
  const mg = m.MG || cero
  const geo = m['Geodésica'] || cero
  const tops = m.Tops || cero
  const num = (n) => n.toLocaleString('es-CO')
  const subs = SUBMARCAS_KPI.map((k) => [k, m[k] || cero]).filter(([, d]) => d.unidades > 0)
  const puedeAbrir = subs.length > 1

  // `datos.unidades` no trae los tops: son prenda aparte y así se cuentan en la
  // tabla de semanas. En la tarjeta sí van sumados, porque ocupan filas en la
  // tabla y sin ellos la cifra nunca cuadraba con lo que se ve.
  const total = {
    unidades: datos.unidades + tops.unidades,
    ordenes: datos.ordenes + tops.ordenes,
  }
  const soloMG = modo === 'mg'
  const cifra = soloMG ? mg : total

  // Cada renglón lleva su conteo de órdenes al lado, para poder cruzarlo con
  // la tabla. Si queda uno solo sobra la lista: repetiría la cifra grande.
  const filas = []
  if (!soloMG && mg.unidades > 0) filas.push(['MG', mg, ''])
  if (geo.unidades > 0) filas.push(['Geodésica', geo, ''])
  if (tops.unidades > 0) filas.push(['Tops', tops, ''])
  if (soloMG && filas.length) filas.push(['Total', total, 'kpi-suma'])

  const renglonSub = ([sub, d]) => (
    <li key={sub} className="kpi-sub">
      <span>{sub} <i>{d.ordenes}</i></span>
      <b>{num(d.unidades)}</b>
    </li>
  )

  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      {puedeAbrir ? (
        <button type="button" className="kpi-cifra-btn" onClick={() => setAbierto(!abierto)}
          title={abierto ? 'Ocultar el reparto por marca' : 'Ver cuánto va de Casania y de Mariset'}>
          <span className="kpi-cifra">{num(cifra.unidades)}</span>
          <span className="kpi-caret" aria-hidden="true">{abierto ? '▴' : '▾'}</span>
        </button>
      ) : (
        <p className="kpi-cifra">{num(cifra.unidades)}</p>
      )}
      <p className="kpi-unidad">{soloMG ? 'unidades MG' : 'unidades'}</p>
      <p className="kpi-desglose">
        {cifra.ordenes} {cifra.ordenes === 1 ? 'orden' : 'órdenes'}{soloMG ? ' MG' : ''}
      </p>
      {filas.length > 0 && (
        <ul className="kpi-marcas">
          {soloMG && abierto && subs.map(renglonSub)}
          {filas.map(([nombre, d, clase]) => (
            <Fragment key={nombre}>
              <li className={clase}>
                <span>{nombre} <i>{d.ordenes}</i></span>
                <b>{num(d.unidades)}</b>
              </li>
              {!soloMG && nombre === 'MG' && abierto && subs.map(renglonSub)}
            </Fragment>
          ))}
        </ul>
      )}
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
  // Se cuenta con la cantidad de la etapa base —la que ya se cumplió— porque
  // esa es la que de verdad está esperando: un lote programado de 43 del que
  // corte entregó 40 deja 40 por alistar, no 43. Es la misma cifra que muestra
  // la tabla, así que la tarjeta y las filas cuadran.
  const baseEtapa = (AREAS[areaKey] && AREAS[areaKey].base) || 'ordenCorte'
  const propio = useMemo(
    () => desglosePorMarca(enEtapa || [], refMap, baseEtapa),
    [enEtapa, refMap, baseEtapa],
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
        {!sinPendiente && (
          <TarjetaCifra label={etiquetaIzq} datos={pendiente}
            modo={(izquierda && izquierda.modo) || ''} />
        )}
        {!sinAcumulado && (
          <TarjetaCifra label={ACUMULADO[areaKey] || 'En total'} datos={acumulado} modo="mg" />
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
        porTaller={medida.etapa === 'envioEnsamble' || medida.etapa === 'entregaEnsamble'}
        refMap={refMap} onViewImage={onViewImage}
        onOpenRef={(ficha) => { setDiaAbierto(''); onOpenRef && onOpenRef(ficha) }}
        onClose={() => setDiaAbierto('')} />
    </div>
  )
}
