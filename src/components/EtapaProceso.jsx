import { useState } from 'react'
import {
  duracion, estaAndando, estaListo, etapaProc, abrir, cerrar, reabrir,
} from '../lib/procesos.js'
import { formatDate } from '../lib/constants.js'

// La casilla de una etapa medida por el sistema (doblado o corte), con sus
// tres estados: sin empezar, andando con el contador corriendo, y cerrada con
// el tiempo que tomó. Un toque abre, un toque cierra; si se cerró por error,
// se vuelve a tocar y se reabre.
export default function EtapaProceso({ etapa, proc, usuario, onCambiar }) {
  const [preguntando, setPreguntando] = useState(false)
  const e = etapaProc(etapa)
  const et = (proc || {})[etapa]
  const dur = duracion(et)

  function iniciar(quien) {
    setPreguntando(false)
    onCambiar(abrir(proc, etapa, usuario, quien))
  }

  if (estaListo(et)) {
    const cuando = et.quien
      ? `${et.quien} · ${formatDate(new Date(et.desde))}`
      : `${formatDate(new Date(et.desde))} → ${formatDate(new Date(et.hasta))}`
    return (
      <button type="button" className="et-listo"
        title="Terminado. Clic para reabrir si se cerró por error."
        onClick={() => onCambiar(reabrir(proc, etapa))}>
        ✓ {e.listo} <b>{dur.texto}</b> <span className="cuando">{cuando}</span>
      </button>
    )
  }

  if (estaAndando(et)) {
    return (
      <span className={'et-vivo ' + etapa}>
        <span className="punto" />
        {e.andando}{et.quien ? ' · ' : ''}
        {et.quien && <span className="quien">{et.quien}</span>}
        <span className={'et-dias' + (dur.dias > e.limite ? ' tarde' : '')}
          title={`Empezó el ${formatDate(new Date(et.desde))}`}>
          {dur.texto}
        </span>
        <button type="button" className="tapa"
          title="Cerrar la etapa: queda cuánto tardó"
          onClick={() => onCambiar(cerrar(proc, etapa, usuario))}>
          ✓ Terminó
        </button>
      </span>
    )
  }

  if (preguntando) {
    return (
      <span className="et-pregunta">
        {e.pregunta.map((q) => (
          <button key={q} type="button" className="pop-chip" onClick={() => iniciar(q)}>{q}</button>
        ))}
        <button type="button" className="pop-x" aria-label="Cancelar"
          onClick={() => setPreguntando(false)}>✕</button>
      </span>
    )
  }

  return (
    <button type="button" className="et-iniciar"
      onClick={() => (e.pregunta ? setPreguntando(true) : iniciar(null))}>
      ▸ {e.iniciar}
    </button>
  )
}
