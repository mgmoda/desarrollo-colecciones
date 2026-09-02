import { useMemo } from 'react'
import { MODULOS_FLUJO, unidadesPorSemana } from '../lib/domain.js'
import { isoLocal, rangoSemana, ultimasSemanas } from '../lib/dates.js'
import { EXTERNO } from '../lib/procesos.js'

// Doce semanas de historia, pero la tarjeta no crece: se desplaza por dentro.
const SEMANAS = 12

// Lo que cerró cada módulo en las últimas semanas, para ver el ritmo de un
// vistazo: si una etapa se frenó o si la carga viene subiendo.
// "En talleres" no tiene columna propia porque cierra la misma etapa que
// Entrega ensamble; estando ahí se resalta esa. Y cada área resalta la etapa
// que ella cierra: Por alistar cierra el alistamiento, y Alistamiento —que ya
// tiene el lote listo— cierra el envío al taller.
const COLUMNA_DEL_MODULO = {
  talleres: 'entrega', enviar: 'alistamiento', alistamiento: 'enviar',
}

export default function TablaSemanas({ orders, refMap, procesos, destacado }) {
  const columna = COLUMNA_DEL_MODULO[destacado] || destacado
  const hoy = isoLocal(new Date())
  const semanas = useMemo(() => ultimasSemanas(hoy, SEMANAS), [hoy])
  const datos = useMemo(
    () => unidadesPorSemana(orders, refMap, semanas, procesos),
    [orders, refMap, semanas, procesos],
  )
  // Si en estas semanas hubo corte afuera, la cabecera lo anuncia una sola
  // vez; la celda va "MG – Diego", con lo de afuera en azul.
  const hayExterno = useMemo(
    () => datos.some((d) => ((d.modulos.corte.externo || {}).unidades || 0) > 0),
    [datos],
  )

  // Máximo de cada columna, para la barra de fondo que da la proporción.
  const topes = useMemo(() => {
    const t = {}
    MODULOS_FLUJO.forEach((m) => {
      t[m.key] = Math.max(1, ...datos.map((d) => d.modulos[m.key].unidades))
    })
    return t
  }, [datos])

  return (
    <div className="sem-wrap">
      <table className="sem-tabla">
        <thead>
          <tr>
            <th>Semana</th>
            {MODULOS_FLUJO.map((m) => (
              <th key={m.key} className={'num' + (m.key === columna ? ' sem-col-on' : '')}>
                {m.label}
                {m.key === 'corte' && hayExterno && (
                  <span className="sem-ext-leyenda" title={`MG – corte externo (${EXTERNO})`}>
                    MG <span className="sem-ext">– {EXTERNO}</span>
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.map((d, i) => (
            <tr key={d.desde} className={i === 0 ? 'sem-actual' : ''}>
              <th scope="row">
                {rangoSemana(d.dias)}
                {i === 0 && <span className="sem-chip">en curso</span>}
              </th>
              {MODULOS_FLUJO.map((m) => {
                const v = d.modulos[m.key].unidades
                const ext = (d.modulos[m.key].externo || {}).unidades || 0
                const pct = Math.round((v / topes[m.key]) * 100)
                const titulo = ext
                  ? `MG ${(v - ext).toLocaleString('es-CO')} · corte externo (${EXTERNO}) ${ext.toLocaleString('es-CO')} · total ${v.toLocaleString('es-CO')}`
                  : ''
                return (
                  <td key={m.key} className={'num sem-celda' + (m.key === columna ? ' sem-col-on' : '')}
                    title={titulo}>
                    <span className="sem-barra" style={{ width: `${pct}%` }} aria-hidden="true" />
                    <span className={'sem-valor' + (v === 0 ? ' muted' : '')}>
                      {(v - ext).toLocaleString('es-CO')}
                      {ext > 0 && <span className="sem-ext"> – {ext.toLocaleString('es-CO')}</span>}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
