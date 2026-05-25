import { useRef, useState } from 'react'
import { processImage } from '../lib/image.js'

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Deduce la referencia a partir del nombre del archivo.
// Coincidencia exacta o la referencia como "palabra" dentro del nombre
// (admite "MG-B705 frente.jpg", "mg-b705 (1).png", etc.).
function matchRef(filename, refIds, refIdSet) {
  const stem = filename.replace(/\.[^.]+$/, '')
  const up = stem.trim().toUpperCase().replace(/_+/g, ' ')
  if (refIdSet.has(up)) return up
  for (const id of refIds) {
    const re = new RegExp('(^|[^A-Z0-9])' + escapeRe(id) + '([^A-Z0-9]|$)')
    if (re.test(up)) return id
  }
  return null
}

export default function PhotoImport({ refIds, onAssignPhoto }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // {done, total}
  const [result, setResult] = useState(null) // {assigned, unmatched:[]}
  const folderRef = useRef(null)

  // Referencias ordenadas de más larga a más corta para que gane la más específica.
  const sortedIds = [...refIds].sort((a, b) => b.length - a.length)
  const idSet = new Set(refIds)

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name))
    if (!files.length) return
    setBusy(true)
    setResult(null)
    setProgress({ done: 0, total: files.length })

    let assigned = 0
    const unmatched = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const refId = matchRef(file.name, sortedIds, idSet)
      if (!refId) {
        unmatched.push(file.name)
      } else {
        try {
          const { dataUrl } = await processImage(file)
          await onAssignPhoto(refId, dataUrl)
          assigned += 1
        } catch (e) {
          unmatched.push(file.name + ' (error)')
        }
      }
      setProgress({ done: i + 1, total: files.length })
    }
    setBusy(false)
    setResult({ assigned, unmatched })
  }

  return (
    <div className="import-slot">
      <div className="import-slot-head">
        <span className="import-slot-title">Fotos por referencia</span>
        {busy && progress && (
          <span className="import-slot-busy">{progress.done}/{progress.total}…</span>
        )}
      </div>
      <p className="import-hint" style={{ marginBottom: 10 }}>
        Selecciona la carpeta o las imágenes. Se asignan por nombre de archivo
        (ej. <strong>MG-B705.jpg</strong> → MG-B705).
      </p>
      <div className="photo-import-actions">
        <label className="import-drop">
          <input type="file" accept="image/*" multiple hidden
            onChange={(e) => handleFiles(e.target.files)} />
          <span>Elegir imágenes…</span>
        </label>
        <label className="import-drop">
          <input ref={folderRef} type="file" hidden webkitdirectory=""
            onChange={(e) => handleFiles(e.target.files)} />
          <span>Elegir carpeta completa…</span>
        </label>
      </div>
      {result && (
        <div className="photo-import-result">
          <p className="import-slot-msg ok">{result.assigned} fotos asignadas.</p>
          {result.unmatched.length > 0 && (
            <details>
              <summary className="import-slot-msg err">
                {result.unmatched.length} sin coincidencia (clic para ver)
              </summary>
              <ul className="unmatched-list">
                {result.unmatched.slice(0, 50).map((n) => <li key={n}>{n}</li>)}
                {result.unmatched.length > 50 && <li>…y {result.unmatched.length - 50} más</li>}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
