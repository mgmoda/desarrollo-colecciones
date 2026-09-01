import { useEffect, useState } from 'react'

// Cuando se publica un cambio, el navegador se queda con el código viejo hasta
// que alguien recargue. Esto lo detecta: cada compilación deja su número, y la
// app pregunta cada tanto cuál es el que está publicado.
//
// No recarga sola de una: si alguien está escribiendo una nota o llenando una
// ficha, recargar le borra lo que iba. Avisa con una barra, y se actualiza
// sola al volver a la pestaña cuando no hay nada abierto.
const CADA = 3 * 60 * 1000

export default function NuevaVersion({ ocupado }) {
  const [hay, setHay] = useState(false)

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

  // Al volver a la pestaña, si no hay nada abierto, se actualiza sola.
  useEffect(() => {
    if (!hay) return
    const alVolver = () => {
      if (document.visibilityState === 'visible' && !ocupado) window.location.reload()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [hay, ocupado])

  if (!hay) return null
  return (
    <div className="version-nueva" role="status">
      <span>Hay una versión nueva del sistema.</span>
      <button type="button" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  )
}
