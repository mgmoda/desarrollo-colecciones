import { useMemo } from 'react'
import { MODULOS_FLUJO, unidadesPorSemana } from '../lib/domain.js'
import { EXTERNOS } from '../lib/procesos.js'
import { isoLocal, rangoSemana, ultimasSemanas } from '../lib/dates.js'

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
  // Solo la pestaña Corte abre la columna en MG · Diego · Juan Carlos ·
  // Total; en las demás, Corte es una sola cifra. Se listan los externos
  // fijos y cualquier otro nombre que aparezca en los datos.
  const abrirCorte = columna === 'corte'
  const externos = useMemo(() => {
    const vistos = new Set(EXTERNOS)
    datos.forEach((d) => Object.keys(d.modulos.corte.externos || {}).forEach((q) => vistos.add(q)))
    return [...vistos]
  }, [datos])
  const num = (n) => (n || 0).toLocaleString('es-CO')
  const claseDe = (i) => (i === 0 ? 'sem-ext-a' : i === 1 ? 'sem-ext-b' : 'sem-ext-c')

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
          {abrirCorte && (
            <tr className="sem-grupo">
              <th />
              {MODULOS_FLUJO.map((m) => (m.key === 'corte'
                ? <th key={m.key} colSpan={2 + externos.length} className="sem-grupo-corte">Corte</th>
                : <th key={m.key} />))}
            </tr>
          )}
          <tr>
            <th>Semana</th>
            {MODULOS_FLUJO.map((m) => {
              if (m.key === 'corte' && abrirCorte) {
                return [
                  <th key="mg" className="num sem-sub sem-sub-ini">MG</th>,
                  ...externos.map((q, i) => <th key={q} className={'num sem-sub ' + claseDe(i)}>{q}</th>),
                  <th key="total" className="num sem-col-on sem-sub-fin">Total</th>,
                ]
              }
              return (
                <th key={m.key} className={'num' + (m.key === columna ? ' sem-col-on' : '')}>{m.label}</th>
              )
            })}
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
                if (m.key === 'corte' && abrirCorte) {
                  const ext = (d.modulos.corte.externo || {}).unidades || 0
                  const porQuien = d.modulos.corte.externos || {}
                  const celda = (k, n, cls, on) => (
                    <td key={k} className={'num sem-celda ' + cls + (on ? ' sem-col-on' : '')}>
                      {on && <span className="sem-barra" style={{ width: `${pct}%` }} aria-hidden="true" />}
                      <span className={'sem-valor' + (n === 0 ? ' muted' : '')}>{n === 0 && !on ? '·' : num(n)}</span>
                    </td>
                  )
                  return [
                    celda('mg', v - ext, 'sem-sub-ini'),
                    ...externos.map((q, i) => celda(q, (porQuien[q] || {}).unidades || 0, claseDe(i))),
                    celda('total', v, 'sem-sub-fin', true),
                  ]
                }
                return (
                  <td key={m.key} className={'num sem-celda' + (m.key === columna ? ' sem-col-on' : '')}>
                    <span className="sem-barra" style={{ width: `${pct}%` }} aria-hidden="true" />
                    <span className={'sem-valor' + (v === 0 ? ' muted' : '')}>{num(v)}</span>
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
