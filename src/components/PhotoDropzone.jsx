import { useCallback, useEffect, useRef, useState } from 'react'
import { processImage, getImageFromClipboard } from '../lib/image.js'

export default function PhotoDropzone({ value, onChange }) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleFile = useCallback(
    async (file) => {
      if (!file) return
      setError('')
      setBusy(true)
      try {
        const { dataUrl } = await processImage(file)
        onChange(dataUrl)
      } catch (err) {
        setError(err.message || 'No se pudo procesar la imagen')
      } finally {
        setBusy(false)
      }
    },
    [onChange],
  )

  // Paste anywhere while the form is open: screenshot -> copiar -> pegar.
  useEffect(() => {
    function onPaste(event) {
      const file = getImageFromClipboard(event)
      if (file) {
        event.preventDefault()
        handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile])

  function onDrop(event) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files && event.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="photo-field">
      <div
        className={
          'dropzone' +
          (dragOver ? ' is-drag' : '') +
          (value ? ' has-image' : '') +
          (busy ? ' is-busy' : '')
        }
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {value ? (
          <>
            <img src={value} alt="Producto" className="dropzone-preview" />
            <div className="dropzone-overlay">
              <span>Cambiar foto</span>
            </div>
          </>
        ) : (
          <div className="dropzone-empty">
            <div className="dropzone-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none"
                stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.8" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <p className="dropzone-title">
              {busy ? 'Procesando imagen…' : 'Arrastra una foto aquí'}
            </p>
            <p className="dropzone-hint">
              o <strong>pega</strong> una captura (Cmd/Ctrl + V) · o haz clic para buscarla
            </p>
          </div>
        )}
        {busy && <div className="dropzone-spinner" />}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files && e.target.files[0])}
      />

      {value && (
        <button
          type="button"
          className="link-btn danger"
          onClick={() => onChange(null)}
        >
          Quitar foto
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
