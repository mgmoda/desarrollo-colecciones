import { useRef, useState } from 'react'
import {
  aIso, desdeTxt, duracion, estaAndando, estaListo, etapaProc, fechaHoraProc,
  horaProc, rangoTxt, abrir, borrarEtapa, cambiarFecha, cerrar, reabrir,
} from '../lib/procesos.js'

const dm = (ts) => {
  const d = new Date(Number(ts) || 0)
  return isNaN(d) ? '—'
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// El tiempo de la etapa, que además es el botón para corregir la fecha: se
// toca y abre el calendario del navegador. Va junto y no en dos controles
// porque la columna tiene que caber sin empujar la tabla a lo ancho.
function Tiempo({ texto, ts, min, max, titulo, clase, onCambiar }) {
  const picker = useRef(null)
  return (
    <span className="et-t">
      <button type="button" className={'et-t-btn' + (clase ? ' ' + clase : '')} title={titulo}
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
// Se escribe cortito a propósito —el encabezado de la columna ya dice si es
// doblando o cortando— para que las dos quepan sin mandar la tabla a scroll
// horizontal. Lo que no cabe en el texto va en el tooltip.
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
    if (!window.confirm(`¿Borrar el ${e.label.toLowerCase()} de esta orden?`)) return
    onCambiar(borrarEtapa(proc, etapa))
  }

  const equis = (
    <button type="button" className="et-x" title="Borrar: se marcó por equivocación"
      aria-label="Borrar" onClick={borrar}>✕</button>
  )

  if (estaListo(et)) {
    return (
      // Las horas van en su propia línea: puestas al lado empujaban la tabla
      // a scroll horizontal, y abajo no cuestan ni un píxel de ancho.
      <span className="et-celda">
        <span className="et-listo"
          title={`${e.listo} · empezó ${fechaHoraProc(et.desde)} · terminó ${fechaHoraProc(et.hasta)}`}>
          <Tiempo texto={`✓ ${dur.texto}`} ts={et.hasta} min={aIso(et.desde)} max={aIso(Date.now())}
            titulo={`Terminó el ${dm(et.hasta)} a las ${horaProc(et.hasta)} · clic para corregir el día`}
            onCambiar={(iso) => onCambiar(cambiarFecha(proc, etapa, 'hasta', iso))} />
          <button type="button" className="et-mini" title="Volver a abrirla"
            aria-label="Volver a abrir" onClick={() => onCambiar(reabrir(proc, etapa))}>↺</button>
          {equis}
        </span>
        <span className="et-horas">{rangoTxt(et.desde, et.hasta)}</span>
      </span>
    )
  }

  if (estaAndando(et)) {
    // La tela que está afuera se ve distinta: no es lo mismo que la esté
    // cortando alguien de la casa.
    const clase = et.externo ? 'externo' : etapa
    return (
      <span className="et-celda">
      <span className={'et-vivo ' + clase}
        title={et.externo
          ? `La tela está donde ${et.quien} desde ${fechaHoraProc(et.desde)}`
          : `${e.andando} desde ${fechaHoraProc(et.desde)}`}>
        <span className="punto" />
        {et.quien && <span className="et-quien">{et.quien}</span>}
        <Tiempo texto={dur.texto} ts={et.desde} max={aIso(Date.now())}
          clase={dur.dias > e.limite ? 'tarde' : ''}
          titulo={`Empezó el ${dm(et.desde)} a las ${horaProc(et.desde)} · clic para corregir el día`}
          onCambiar={(iso) => onCambiar(cambiarFecha(proc, etapa, 'desde', iso))} />
        <button type="button" className="et-mini ok"
          title={et.externo
            ? 'Volvió cortada: se cierra y queda cuántos días estuvo afuera'
            : 'Terminó: se cierra y queda cuánto tardó'}
          aria-label={et.externo ? 'Volvió' : 'Terminó'}
          onClick={() => onCambiar(cerrar(proc, etapa, usuario))}>✓</button>
        {equis}
      </span>
      <span className="et-horas">{desdeTxt(et.desde)}</span>
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
    <button type="button" className="et-iniciar" title={e.iniciar}
      onClick={() => (e.pregunta ? setPreguntando(true) : iniciar(null))}>
      ▸ {e.corto}
    </button>
  )
}
