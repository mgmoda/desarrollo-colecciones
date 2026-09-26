import { useEffect } from 'react'

// Full-screen photo viewer. Click anywhere or press Esc to close.
export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return
    // En captura y frenando la tecla: con una foto abierta sobre una ventana
    // o un panel, Escape cierra solo la foto; el siguiente Escape, la ventana.
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey, true)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = ''
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Cerrar">
        ✕
      </button>
      <img
        src={src}
        alt="Foto del producto"
        className="lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
