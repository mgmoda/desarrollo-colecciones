import { useEffect } from 'react'

// Full-screen photo viewer. Click anywhere or press Esc to close.
export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
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
