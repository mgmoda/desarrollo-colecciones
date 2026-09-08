import { useEffect, useRef, useState } from 'react'

// Cuando se publica un cambio, el navegador se queda con el código viejo hasta
// que alguien recargue. Esto lo detecta: cada compilación deja su número, y la
// app pregunta cada minuto cuál es el que está publicado.
//
// Se actualiza sola, pero no encima de nadie: espera a que la persona lleve
// unos segundos sin tocar el teclado ni el mouse y a que no tenga nada abierto
// (una ficha, una nota). Mientras tanto avisa con una barra, por si prefiere
// actualizar de una.
const CADA = 60 * 1000
const QUIETO = 12 * 1000

export default function NuevaVersion({ ocupado }) {
  const [hay, setHay] = useState(false)
  const ultimaActividad = useRef(Date.now())

  useEffect(() => {
    let vivo = true
    async function mirar() {
      try {
        const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const { version } = await r.json()
        if (vivo && version && version !== __BUILD__) setHay(true)
      } catch { /* sin internet: se vuelve a mirar en la siguiente vuelta */ }
    }
    mirar()
    const id = setInterval(mirar, CADA)
    const alVolver = () => { if (document.visibilityState === 'visible') mirar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  // Qué tan quieta está la persona: cualquier gesto reinicia el reloj.
  useEffect(() => {
    const marcar = () => { ultimaActividad.current = Date.now() }
    const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']
    eventos.forEach((e) => document.addEventListener(e, marcar, { passive: true }))
    return () => eventos.forEach((e) => document.removeEventListener(e, marcar))
  }, [])

  // Con versión nueva y nada abierto: en cuanto la persona lleve un rato sin
  // tocar nada, o al volver a la pestaña, se actualiza sola.
  useEffect(() => {
    if (!hay || ocupado) return undefined
    const revisar = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - ultimaActividad.current >= QUIETO) window.location.reload()
    }
    const id = setInterval(revisar, 2000)
    const alVolver = () => { if (document.visibilityState === 'visible') window.location.reload() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [hay, ocupado])

  if (!hay) return null
  return (
    <div className="version-nueva" role="status">
      <span>
        Hay una versión nueva del sistema.
        {ocupado ? ' Se actualiza cuando cierres lo que tienes abierto.' : ' Se actualiza sola en unos segundos.'}
      </span>
      <button type="button" onClick={() => window.location.reload()}>Actualizar ahora</button>
    </div>
  )
}
