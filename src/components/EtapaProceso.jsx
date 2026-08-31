import { useRef, useState } from 'react'
import {
  aIso, duracion, estaAndando, estaListo, etapaProc,
  abrir, borrarEtapa, cambiarFecha, cerrar, reabrir,
} from '../lib/procesos.js'

// Fecha corta de la etapa, que al tocarla abre el calendario del navegador.
// Por defecto queda la de hoy; esto es para corregirla cuando empezaron ayer
// y lo vienen a marcar hoy.
function FechaEtapa({ ts, min, max, titulo, onCambiar }) {
  const picker = useRef(null)
  const d = new Date(Number(ts) || 0)
  const texto = isNaN(d) ? '—'
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return (
    <span className="et-fecha">
      <button type="button" className="et-fecha-btn" title={titulo}
        onClick={() => { try { picker.current.showPicker() } catch { picker.current.focus() } }}>
        {texto}
      </button>
      <input ref={picker} type="date" className="date-hidden" tabIndex={-1} aria-hidden="true"
        value={aIso(ts)} min={min} max={max}
        onChange={(e) => e.target.value && onCambiar(e.target.value)} />
    </span>
  )
}

// La casilla de una etapa medida por el sistema (doblado o corte), con sus
// tres estados: sin empezar, andando con el contador corriendo, y cerrada con
// el tiempo que tomó.
//
// Todo se hace desde la misma casilla y sin ventanas: un toque inicia, un
// toque cierra la tapa, las fechas se corrigen tocándolas, y la ✕ borra la
// etapa si se marcó por equivocación.
export default function EtapaProceso({ etapa, proc, usuario, onCambiar }) {
  const [preguntando, setPreguntando] = useState(false)
  const e = etapaProc(etapa)
  const et = (proc || {})[etapa]
  const dur = duracion(et)

  function iniciar(quien) {
    setPreguntando(false)
    onCambiar(abrir(proc, etapa, usuario, quien))
  }

  function borrar() {
    const qué = estaListo(et) ? `${e.listo.toLowerCase()}` : `${e.andando.toLowerCase()}`
    if (!window.confirm(`¿Borrar el ${qué} de esta orden?`)) return
    onCambiar(borrarEtapa(proc, etapa))
  }

  const botonBorrar = (
    <button type="button" className="et-x" title="Borrar: se marcó por equivocación"
      aria-label="Borrar" onClick={borrar}>✕</button>
  )

  if (estaListo(et)) {
    return (
      <span className="et-listo">
        <button type="button" className="et-listo-txt" title="Clic para volver a abrirla"
          onClick={() => onCambiar(reabrir(proc, etapa))}>
          ✓ {e.listo} <b>{dur.texto}</b>
        </button>
        {et.quien && <span className="et-quien">{et.quien}</span>}
        <span className="cuando">
          <FechaEtapa ts={et.desde} max={aIso(et.hasta)} titulo="Cambiar la fecha en que empezó"
            onCambiar={(iso) => onCambiar(cambiarFecha(proc, etapa, 'desde', iso))} />
          →
          <FechaEtapa ts={et.hasta} min={aIso(et.desde)} titulo="Cambiar la fecha en que terminó"
            onCambiar={(iso) => onCambiar(cambiarFecha(proc, etapa, 'hasta', iso))} />
        </span>
        {botonBorrar}
      </span>
    )
  }

  if (estaAndando(et)) {
    return (
      <span className={'et-vivo ' + etapa}>
        <span className="punto" />
        {e.andando}
        {et.quien && <><span className="et-quien">{et.quien}</span></>}
        <FechaEtapa ts={et.desde} max={aIso(Date.now())} titulo="Cambiar la fecha en que empezó"
          onCambiar={(iso) => onCambiar(cambiarFecha(proc, etapa, 'desde', iso))} />
        <span className={'et-dias' + (dur.dias > e.limite ? ' tarde' : '')}>{dur.texto}</span>
        <button type="button" className="tapa" title="Terminó: se cierra y queda cuánto tardó"
          onClick={() => onCambiar(cerrar(proc, etapa, usuario))}>
          ✓ Terminó
        </button>
        {botonBorrar}
      </span>
    )
  }

  if (preguntando) {
    return (
      <span className="et-pregunta">
        {e.pregunta.map((q) => (
          <button key={q} type="button" className="pop-chip" onClick={() => iniciar(q)}>{q}</button>
        ))}
        <button type="button" className="et-x" aria-label="Cancelar"
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
