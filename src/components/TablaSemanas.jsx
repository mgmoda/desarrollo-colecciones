import { useMemo } from 'react'
import { MODULOS_FLUJO, unidadesPorSemana } from '../lib/domain.js'
import { isoLocal, rangoSemana, ultimasSemanas } from '../lib/dates.js'

const SEMANAS = 6

// Lo que cerró cada módulo en las últimas semanas, para ver el ritmo de un
// vistazo: si una etapa se frenó o si la carga viene subiendo.
export default function TablaSemanas({ orders, refMap, destacado }) {
  const hoy = isoLocal(new Date())
  const semanas = useMemo(() => ultimasSemanas(hoy, SEMANAS), [hoy])
  const datos = useMemo(
    () => unidadesPorSemana(orders, refMap, semanas),
    [orders, refMap, semanas],
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
              <th key={m.key} className={'num' + (m.key === destacado ? ' sem-col-on' : '')}>
                {m.label}
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
                const pct = Math.round((v / topes[m.key]) * 100)
                return (
                  <td key={m.key} className={'num sem-celda' + (m.key === destacado ? ' sem-col-on' : '')}>
                    <span className="sem-barra" style={{ width: `${pct}%` }} aria-hidden="true" />
                    <span className={'sem-valor' + (v === 0 ? ' muted' : '')}>
                      {v.toLocaleString('es-CO')}
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
