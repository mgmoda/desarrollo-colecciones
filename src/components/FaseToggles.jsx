import { ORIGENES } from '../lib/constants.js'

// Apagar una fase la saca de TODAS las etapas y para TODOS los usuarios: es una
// sola configuración compartida, no una por persona. Por eso solo la mueve el
// administrador. Los demás las ven —así entienden qué están mirando— pero no
// las pueden tocar.
export default function FaseToggles({ ocultas, onToggle, puedeCambiar }) {
  const set = ocultas || new Set()
  return (
    <div className="fase-toggles"
      title={puedeCambiar
        ? 'Apaga una fase para que deje de aparecer en todas las etapas'
        : 'Qué fases se están mostrando. Solo el administrador las cambia.'}>
      {Object.entries(ORIGENES).map(([key, label]) => {
        const apagada = set.has(key)
        const clase = 'fase-toggle' + (apagada ? ' off' : '') + (puedeCambiar ? '' : ' fijo')
        if (!puedeCambiar) {
          return (
            <span key={key} className={clase}>
              <span className="fase-toggle-luz" aria-hidden="true" />
              {label}
            </span>
          )
        }
        return (
          <button key={key} type="button" className={clase}
            onClick={() => onToggle && onToggle(key, !apagada)}
            title={apagada ? `Volver a mostrar ${label}` : `Ocultar ${label} en todas las etapas`}>
            <span className="fase-toggle-luz" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
