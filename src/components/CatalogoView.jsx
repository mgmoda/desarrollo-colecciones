import { useEffect, useMemo, useRef, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import { processImage, getImageFromClipboard } from '../lib/image.js'
import { generateCatalogoPDF } from '../lib/catalogoPdf.js'

// Armador de catálogo por pliegos (dentro de Fotos).
// - Un catálogo por marca, misma estructura.
// - Una referencia por página; los conjuntos muestran ambas refs.
// - Bautizo automático: serial inicial + posición = nuevo código.
//   Insertar o mover recalcula todos los códigos (siempre ascendente).
// - Cada página puede llevar una foto de DETALLE (se guarda en la ref).
export default function CatalogoView({ refs, marcas, catalogos, onSave, onViewImage, onSetFields, onOpenRef }) {
  const [marcaSel, setMarcaSel] = useState(marcas[0] || '')
  const [q, setQ] = useState('')
  const [busyPdf, setBusyPdf] = useState(false)
  // Página seleccionada para pegar la foto real con Cmd/Ctrl+V.
  const [selectedIdx, setSelectedIdx] = useState(null)

  const refById = useMemo(() => new Map(refs.map((r) => [r.id, r])), [refs])
  const marcaOf = (r) => (r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca')

  const cat = catalogos[marcaSel] || { startSerial: '', items: [] }
  const items = cat.items || []

  // Serial base: si está definido, el código de la página i es base + i.
  const base = /^\d+$/.test(cat.startSerial || '') ? parseInt(cat.startSerial, 10) : null
  const codigo = (i) => (base == null ? null : String(base + i))

  function saveItems(nextItems) { onSave && onSave(marcaSel, { ...cat, items: nextItems }) }
  function setStartSerial(v) { onSave && onSave(marcaSel, { ...cat, startSerial: v.replace(/\D/g, '') }) }

  const inCatalog = useMemo(() => new Set(items.map((i) => i.refId)), [items])

  // Sugerencias del buscador: refs de la marca del catálogo, no agregadas aún.
  // Prioriza las del pool de Fotos.
  const sugerencias = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return refs
      .filter((r) => marcaOf(r) === marcaSel && !inCatalog.has(r.id))
      .filter((r) => (r.referencia + ' ' + (r.tipo || '')).toLowerCase().includes(term))
      .sort((a, b) => ((b.enFotos ? 1 : 0) - (a.enFotos ? 1 : 0)) || a.referencia.localeCompare(b.referencia))
      .slice(0, 8)
  }, [q, refs, marcaSel, inCatalog])

  function addRef(r) {
    saveItems([...items, { refId: r.id, colores: (r.colores || []).filter(Boolean) }])
    setQ('')
  }
  function removeAt(i) {
    const it = items[i]
    if (!window.confirm(`¿Sacar ${it.refId} del catálogo? Las páginas siguientes se recorren.`)) return
    const n = [...items]; n.splice(i, 1); saveItems(n)
  }
  function move(i, d) {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const n = [...items]; const [x] = n.splice(i, 1); n.splice(j, 0, x); saveItems(n)
  }
  function moveTo(i, pos) {
    const j = Math.max(0, Math.min(items.length - 1, pos - 1))
    if (isNaN(j) || j === i) return
    const n = [...items]; const [x] = n.splice(i, 1); n.splice(j, 0, x); saveItems(n)
  }
  function removeColor(i, ci) {
    saveItems(items.map((it, k) => (k === i ? { ...it, colores: (it.colores || []).filter((_, c) => c !== ci) } : it)))
  }
  function resyncColors(i) {
    const r = refById.get(items[i].refId)
    if (!r) return
    saveItems(items.map((it, k) => (k === i ? { ...it, colores: (r.colores || []).filter(Boolean) } : it)))
  }

  // Pegar la FOTO REAL: clic en una página para seleccionarla y Cmd/Ctrl+V.
  // La imagen del portapapeles reemplaza al boceto como imagen principal.
  useEffect(() => {
    function onPaste(e) {
      if (selectedIdx == null || selectedIdx >= items.length) return
      const file = getImageFromClipboard(e)
      if (!file) return
      e.preventDefault()
      const refId = items[selectedIdx].refId
      processImage(file)
        .then(({ dataUrl }) => { onSetFields && onSetFields(refId, { imageReal: dataUrl }) })
        .catch(() => alert('No se pudo procesar la imagen pegada'))
    }
    function onKey(e) { if (e.key === 'Escape') setSelectedIdx(null) }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, items, marcaSel])

  function clearReal(refId) { onSetFields && onSetFields(refId, { imageReal: null }) }

  async function onDetailFile(refId, file) {
    if (!file) return
    try {
      const { dataUrl } = await processImage(file)
      onSetFields && onSetFields(refId, { imageDetalle: dataUrl })
    } catch (e) {
      alert('No se pudo procesar la imagen de detalle')
    }
  }
  function clearDetail(refId) { onSetFields && onSetFields(refId, { imageDetalle: null }) }

  async function generarPdf() {
    if (items.length === 0) return
    setBusyPdf(true)
    try {
      const entries = items.map((it, i) => {
        const r = refById.get(it.refId) || { referencia: it.refId }
        const esConj = !!(r.conjunto && r.conjuntoRef)
        return {
          codigo: codigo(i) || String(i + 1),
          pagina: i + 1,
          refActual: esConj ? `${r.referencia} + ${r.conjuntoRef}` : (r.referencia || it.refId),
          tipo: esConj ? 'Conjunto' : (r.tipo || '—'),
          marca: r.marca || '',
          colores: (it.colores || []).filter(Boolean),
          // Si ya se pegó la foto real, es la que va al PDF (si no, el boceto).
          image: r.imageReal || r.image || '',
          imageDetalle: r.imageDetalle || '',
        }
      })
      await generateCatalogoPDF({ marca: marcaSel, entries })
    } finally {
      setBusyPdf(false)
    }
  }

  // Pliegos: pares de páginas [izq, der].
  const pliegos = []
  for (let i = 0; i < items.length; i += 2) {
    pliegos.push([i, i + 1 < items.length ? i + 1 : null])
  }

  function renderPage(idx, side) {
    const it = items[idx]
    const r = refById.get(it.refId) || { referencia: it.refId }
    const esConj = !!(r.conjunto && r.conjuntoRef)
    const cod = codigo(idx)
    const mainImg = r.imageReal || r.image
    const isSel = selectedIdx === idx
    return (
      <div className={'cb-page ' + side + (isSel ? ' cb-selected' : '')}
        onClick={() => setSelectedIdx(idx)}
        title={isSel ? 'Página seleccionada — pega la foto real con Cmd+V / Ctrl+V' : 'Clic para seleccionar y pegar la foto real'}>
        <div className="cb-photo">
          {cod != null && <span className="cb-pos" title={`Nuevo código: ${cod}`}>{cod}</span>}
          {cod == null && <span className="cb-pos cb-pos-plain">{idx + 1}</span>}
          {mainImg ? (
            <img src={mainImg} alt={r.referencia}
              onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(mainImg) }} />
          ) : (
            <span className="cb-noimg">Sin foto</span>
          )}
          {r.imageReal ? (
            <span className="cb-real-tag" title="Foto real pegada — la ✕ vuelve al boceto">
              REAL
              <button className="cb-real-x" onClick={(e) => { e.stopPropagation(); clearReal(it.refId) }}>×</button>
            </span>
          ) : (
            isSel && (
              <span className="cb-paste-hint">📋 Pega la foto real<br /><span>Cmd+V / Ctrl+V</span></span>
            )
          )}
          {r.imageDetalle && (
            <span className="cb-detail-thumb" title="Foto de detalle — clic para ampliar">
              <img src={r.imageDetalle} alt="detalle"
                onClick={() => onViewImage && onViewImage(r.imageDetalle)} />
              <button className="cb-detail-x" title="Quitar detalle"
                onClick={() => clearDetail(it.refId)}>×</button>
            </span>
          )}
        </div>
        <div className="cb-info">
          <div className="cb-ref" title="Abrir ficha"
            onClick={() => onOpenRef && r.id && onOpenRef(r)}>
            {esConj ? `${r.referencia} + ${r.conjuntoRef}` : r.referencia}
          </div>
          <div className="cb-meta">
            <span className={'cb-tipo' + (esConj ? ' conj' : '')}>{esConj ? '⇄ Conjunto' : (r.tipo || 'Sin tipo')}</span>
            {r.marca && <span className="cb-marca">{r.marca}</span>}
          </div>
          <div className="cb-colors">
            {(it.colores || []).length === 0 && <span className="muted" style={{ fontSize: 11 }}>Sin colores</span>}
            {(it.colores || []).map((c, ci) => (
              <span key={ci} className="cb-color" title={c.name}>
                <span className="cb-dot" style={{ background: c.hex || '#ccc' }} />
                {c.name}
                <button className="cb-color-x" title="Quitar color (solo del catálogo)"
                  onClick={() => removeColor(idx, ci)}>×</button>
              </span>
            ))}
            <button className="cb-resync" title="Volver a traer los colores de la ficha"
              onClick={() => resyncColors(idx)}>↺</button>
          </div>
          {!r.imageDetalle && (
            <DetailUpload onFile={(f) => onDetailFile(it.refId, f)} />
          )}
        </div>
        <div className="cb-controls">
          <span className="cb-move">
            <button className="cb-btn" title="Mover atrás" onClick={() => move(idx, -1)}>‹</button>
            <button className="cb-btn" title="Mover adelante" onClick={() => move(idx, 1)}>›</button>
            <input className="cb-posinput" key={'pos-' + idx + '-' + items.length}
              defaultValue={idx + 1}
              title="Escribe la posición y presiona Enter"
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
              onBlur={(e) => moveTo(idx, parseInt(e.target.value, 10))} />
          </span>
          <button className="cb-btn cb-del" title="Sacar del catálogo" onClick={() => removeAt(idx)}>✕</button>
        </div>
        <span className="cb-pagenum">pág. {idx + 1}</span>
      </div>
    )
  }

  return (
    <div className="catalogo-view">
      {/* Barra: marca + serial + acciones */}
      <div className="cb-bar">
        <div className="opt-group">
          {marcas.map((m) => (
            <button key={m} type="button" className={'opt-btn' + (marcaSel === m ? ' on' : '')}
              onClick={() => setMarcaSel(m)}>
              {m} <span className="muted">({(catalogos[m] && catalogos[m].items && catalogos[m].items.length) || 0})</span>
            </button>
          ))}
        </div>
        <label className="cb-serial">
          Serial inicial
          <input className="input" value={cat.startSerial || ''} placeholder="6521"
            onChange={(e) => setStartSerial(e.target.value)} />
        </label>
        <span className="cb-counts">
          {items.length} página{items.length === 1 ? '' : 's'} · {pliegos.length} pliego{pliegos.length === 1 ? '' : 's'}
          {base != null && items.length > 0 && (
            <span className="muted"> · códigos {base}–{base + items.length - 1}</span>
          )}
          {items.length > 0 && (() => {
            const conReal = items.filter((it) => { const r = refById.get(it.refId); return r && r.imageReal }).length
            return (
              <span className={conReal === items.length ? 'cb-real-count done' : 'cb-real-count'}>
                {' '}· {conReal}/{items.length} con foto real
              </span>
            )
          })()}
        </span>
        <span className="cb-spacer" />
        <button className="btn btn-primary" disabled={items.length === 0 || busyPdf} onClick={generarPdf}>
          {busyPdf ? 'Generando…' : '📄 Generar PDF para diseño'}
        </button>
      </div>

      {/* Buscador para agregar */}
      <div className="cb-add">
        <SearchInput value={q} onChange={setQ} placeholder={`Agregar referencia de ${marcaSel}…`} />
        {q.trim() && (
          <div className="cb-suggest">
            {sugerencias.length === 0 ? (
              <div className="cb-sg-empty">
                Sin coincidencias en {marcaSel} (o ya están en el catálogo).
              </div>
            ) : sugerencias.map((r) => (
              <button key={r.id} className="cb-sg-row" onClick={() => addRef(r)}>
                <span className="cb-sg-img">
                  {r.image ? <img src={r.image} alt="" /> : null}
                </span>
                <span className="cb-sg-info">
                  <span className="cb-sg-ref">
                    {r.referencia}
                    {r.enFotos && <span className="cb-sg-pool" title="Está en el pool de Fotos">📸</span>}
                  </span>
                  <span className="cb-sg-colors">
                    {r.tipo || 'Sin tipo'}
                    {(r.colores || []).filter(Boolean).slice(0, 4).map((c, i) => (
                      <span key={i} className="cb-dot" style={{ background: c.hex || '#ccc' }} title={c.name} />
                    ))}
                  </span>
                </span>
                <span className="cb-sg-addlbl">+ pág. {items.length + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>El catálogo de {marcaSel} está vacío.</p>
          <p className="muted">
            Define el serial inicial (ej. 6521) y agrega referencias con el buscador —
            cada una trae sus colores automáticamente y recibe su código en orden.
          </p>
        </div>
      ) : (
        <div className="cb-book">
          {pliegos.map(([izq, der], pi) => (
            <div key={pi} className="cb-pliego">
              <div className="cb-pliego-label">
                Pliego {pi + 1} · págs. {izq + 1}{der != null ? `–${der + 1}` : ''}
              </div>
              <div className="cb-spread">
                {renderPage(izq, 'left')}
                {der != null ? renderPage(der, 'right') : (
                  <div className="cb-page right cb-page-empty">
                    <div className="cb-empty-hint">
                      página libre<br />
                      <span>busca arriba y la nueva referencia cae aquí</span>
                    </div>
                    <span className="cb-pagenum">pág. {izq + 2}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Botón compacto para subir la foto de detalle (se guarda en la ref).
function DetailUpload({ onFile }) {
  const inputRef = useRef(null)
  return (
    <>
      <button className="cb-detail-add" title="Agregar foto de detalle (la diseñadora sabrá que la página lleva detalle)"
        onClick={() => inputRef.current && inputRef.current.click()}>
        + Foto de detalle
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { onFile(e.target.files && e.target.files[0]); e.target.value = '' }} />
    </>
  )
}
