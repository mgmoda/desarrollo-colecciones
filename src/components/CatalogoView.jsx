import { useEffect, useMemo, useRef, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import { processImage, getImageFromClipboard } from '../lib/image.js'
import { generateCatalogoPDF } from '../lib/catalogoPdf.js'

// Máximo de fotos de sesión por página del catálogo.
const MAX_FOTOS = 3

// Armador de catálogo por pliegos (dentro de Fotos).
// - Un catálogo por marca, misma estructura.
// - Una referencia por página; los conjuntos muestran ambas refs.
// - Bautizo automático: serial inicial + posición = nuevo código.
//   Insertar o mover recalcula todos los códigos (siempre ascendente).
// - Cada página acepta hasta 3 fotos de la sesión, numeradas y con su
//   nombre de archivo COMPLETO para que la diseñadora las ubique.
export default function CatalogoView({ refs, marcas, catalogos, onSave, onViewImage, onSetFields, onOpenRef }) {
  const [marcaSel, setMarcaSel] = useState(marcas[0] || '')
  const [q, setQ] = useState('')
  const [busyPdf, setBusyPdf] = useState(false)
  // Página seleccionada: pegar con Cmd/Ctrl+V agrega la foto a esa página.
  const [selectedIdx, setSelectedIdx] = useState(null)
  // Página sobre la que se está arrastrando un ARCHIVO de foto.
  const [dragIdx, setDragIdx] = useState(null)
  // Buscador inline para asociar una foto a otra referencia: {idx, fi, q}.
  const [refPick, setRefPick] = useState(null)
  // Páginas con el bloque de archivos desplegado (por refId).
  const [archAbiertos, setArchAbiertos] = useState(() => new Set())
  // Reordenamiento: página que se está arrastrando y página destino.
  const [dragPageIdx, setDragPageIdx] = useState(null)
  const [reorderOverIdx, setReorderOverIdx] = useState(null)
  // Caja del buscador (para enfocarla desde las páginas vacías).
  const addBoxRef = useRef(null)

  const refById = useMemo(() => new Map(refs.map((r) => [r.id, r])), [refs])
  const refByCode = useMemo(() => new Map(refs.map((r) => [r.referencia, r])), [refs])
  const marcaOf = (r) => (r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca')

  // Prendas que se rotulan al pie de la página, al estilo del catálogo
  // impreso ("BLUSA M5087 - PANTALÓN M5088"): la prenda de la página, su
  // pareja de conjunto y las referencias asociadas a las fotos. Cada una
  // aporta sus propios colores. Mismo modelo para la pantalla y el PDF.
  function prendasDe(it, r, fotos) {
    const out = []
    const seen = new Set()
    out.push({
      key: 'main',
      tipo: r.tipo || 'Prenda',
      code: r.referencia || it.refId,
      colores: (it.colores || []).filter(Boolean),
      ref: r.id ? r : null,
      own: true, // sus colores se editan aquí (los demás vienen de su ficha)
    })
    if (r.id) seen.add(r.id)
    if (r.conjunto && r.conjuntoRef) {
      const par = refByCode.get(r.conjuntoRef)
      if (par && !seen.has(par.id)) {
        seen.add(par.id)
        out.push({
          key: 'par-' + par.id, tipo: par.tipo || 'Prenda', code: par.referencia,
          colores: (par.colores || []).filter(Boolean), ref: par,
        })
      } else if (!par) {
        out.push({ key: 'par-code', tipo: 'Prenda', code: r.conjuntoRef, colores: [], ref: null })
      }
    }
    fotos.forEach((f) => {
      if (!f.refId || seen.has(f.refId)) return
      seen.add(f.refId)
      const fr = refById.get(f.refId)
      if (fr) {
        out.push({
          key: 'f-' + fr.id, tipo: fr.tipo || 'Prenda', code: fr.referencia,
          colores: (fr.colores || []).filter(Boolean), ref: fr,
        })
      }
    })
    return out
  }

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
  // Arrastrar una página y soltarla sobre otra: la arrastrada toma esa
  // posición y las demás se recorren. dst = items.length → al final.
  function moveIdxTo(src, dst) {
    if (src == null || src === dst) return
    const n = [...items]; const [x] = n.splice(src, 1)
    n.splice(Math.max(0, Math.min(n.length, dst)), 0, x)
    saveItems(n)
  }
  // Enfoca el buscador para agregar (desde las páginas vacías).
  function focusAdd() {
    const box = addBoxRef.current
    if (!box) return
    box.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const input = box.querySelector('input')
    if (input) setTimeout(() => input.focus(), 250)
  }
  function toggleArch(refId) {
    setArchAbiertos((prev) => {
      const n = new Set(prev)
      if (n.has(refId)) n.delete(refId); else n.add(refId)
      return n
    })
  }
  function removeColor(i, ci) {
    saveItems(items.map((it, k) => (k === i ? { ...it, colores: (it.colores || []).filter((_, c) => c !== ci) } : it)))
  }
  function resyncColors(i) {
    const r = refById.get(items[i].refId)
    if (!r) return
    saveItems(items.map((it, k) => (k === i ? { ...it, colores: (r.colores || []).filter(Boolean) } : it)))
  }

  // Fotos de la página (con compatibilidad hacia los campos legados
  // imageReal/imageDetalle de versiones anteriores del armador).
  function getFotos(r) {
    if (!r) return []
    if (Array.isArray(r.fotosCatalogo) && r.fotosCatalogo.length) return r.fotosCatalogo
    const out = []
    if (r.imageReal) out.push({ src: r.imageReal, name: r.imageRealName || '' })
    if (r.imageDetalle) out.push({ src: r.imageDetalle, name: r.imageDetalleName || '' })
    return out
  }
  // Escribe la lista consolidada y limpia los campos legados.
  function setFotos(refId, fotos) {
    onSetFields && onSetFields(refId, {
      fotosCatalogo: fotos,
      imageReal: null, imageRealName: '',
      imageDetalle: null, imageDetalleName: '',
    })
  }
  // Agrega una foto (pegada, arrastrada o buscada) al final de la página.
  function addFotoFile(refId, file) {
    if (!file) return
    const fotos = getFotos(refById.get(refId))
    if (fotos.length >= MAX_FOTOS) {
      alert(`Esta página ya tiene ${MAX_FOTOS} fotos (el máximo). Quita una con su ✕ antes de agregar otra.`)
      return
    }
    processImage(file)
      .then(({ dataUrl }) => {
        setFotos(refId, [...fotos, { src: dataUrl, name: file.name || '' }])
      })
      .catch(() => alert('No se pudo procesar la imagen'))
  }
  function removeFoto(refId, i) {
    const fotos = getFotos(refById.get(refId))
    setFotos(refId, fotos.filter((_, k) => k !== i))
  }
  // Edita una foto puntual de la página (rol / referencia asociada).
  function updateFoto(pageRefId, fi, patch) {
    const fotos = getFotos(refById.get(pageRefId))
    setFotos(pageRefId, fotos.map((f, k) => (k === fi ? { ...f, ...patch } : f)))
  }
  // Marca/desmarca una foto como DETALLE (sin referencia).
  function marcarFotoDetalle(pageRefId, fi, on) {
    updateFoto(pageRefId, fi, { rol: on ? 'detalle' : '', refId: null })
  }
  // Asocia la foto a OTRA referencia de la base (o la desasocia con null).
  function asignarFotoRef(pageRefId, fi, otherRefId) {
    updateFoto(pageRefId, fi, { refId: otherRefId || null, rol: '' })
  }

  // Pegar con Cmd/Ctrl+V: agrega la foto a la página seleccionada (se queda
  // ahí, para poder pegar la 2ª y 3ª foto de la misma prenda). Funciona con
  // la imagen copiada o con el ARCHIVO copiado desde la carpeta (Cmd/Ctrl+C).
  useEffect(() => {
    function onPaste(e) {
      const file = getImageFromClipboard(e)
      if (!file) return
      if (selectedIdx == null || selectedIdx >= items.length) {
        e.preventDefault()
        alert('Haz clic primero en la página del catálogo donde va la foto y vuelve a pegar (Cmd+V / Ctrl+V).')
        return
      }
      e.preventDefault()
      addFotoFile(items[selectedIdx].refId, file)
    }
    function onKey(e) { if (e.key === 'Escape') setSelectedIdx(null) }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, items, marcaSel, refById])

  async function generarPdf() {
    if (items.length === 0) return
    setBusyPdf(true)
    try {
      const entries = items.map((it, i) => {
        const r = refById.get(it.refId) || { referencia: it.refId }
        const esConj = !!(r.conjunto && r.conjuntoRef)
        const fotos = getFotos(r)
        return {
          codigo: codigo(i) || String(i + 1),
          pagina: i + 1,
          refActual: esConj ? `${r.referencia} + ${r.conjuntoRef}` : (r.referencia || it.refId),
          tipo: esConj ? 'Conjunto' : (r.tipo || '—'),
          marca: r.marca || '',
          colores: (it.colores || []).filter(Boolean),
          // Rótulo del catálogo impreso: TIPO+CÓDIGO de cada prenda con sus colores.
          prendas: prendasDe(it, r, fotos).map((p) => ({
            tipo: p.tipo, code: p.code, colores: p.colores,
          })),
          // La foto 1 de la sesión es la principal del PDF; sin fotos, el boceto.
          image: (fotos[0] && fotos[0].src) || r.image || '',
          // Todas las fotos con su nombre COMPLETO y su rol/referencia asociada.
          fotos: fotos.map((f) => {
            const fr = f.refId ? refById.get(f.refId) : null
            return {
              src: f.src,
              name: f.name || '',
              rol: f.rol || (f.refId ? 'ref' : ''),
              refCode: fr ? fr.referencia : (f.refId || ''),
              refTipo: fr ? (fr.tipo || '') : '',
              refColores: fr ? (fr.colores || []).filter(Boolean) : [],
            }
          }),
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
    const fotos = getFotos(r)
    const prendas = prendasDe(it, r, fotos)
    // Los archivos se despliegan al pedirlo, o solos mientras se busca la
    // referencia de una foto.
    const archOpen = archAbiertos.has(it.refId) || !!(refPick && refPick.idx === idx)
    const isSel = selectedIdx === idx
    const isDrag = dragIdx === idx
    const isReorderTarget = dragPageIdx != null && reorderOverIdx === idx && dragPageIdx !== idx
    const isDragging = dragPageIdx === idx
    return (
      <div className={'cb-page ' + side
        + (isSel ? ' cb-selected' : '')
        + (isDrag ? ' cb-dragover' : '')
        + (isReorderTarget ? ' cb-reorder-over' : '')
        + (isDragging ? ' cb-dragging' : '')}
        draggable
        onClick={() => setSelectedIdx(idx)}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/x-catalogo-page', String(idx))
          e.dataTransfer.effectAllowed = 'move'
          setDragPageIdx(idx); setSelectedIdx(null)
        }}
        onDragEnd={() => { setDragPageIdx(null); setReorderOverIdx(null); setDragIdx(null) }}
        onDragOver={(e) => {
          e.preventDefault()
          if (dragPageIdx != null) {
            // Reordenamiento interno
            if (reorderOverIdx !== idx) setReorderOverIdx(idx)
          } else if (dragIdx !== idx) {
            // Archivo de foto desde el sistema
            setDragIdx(idx)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragIdx(null)
            if (reorderOverIdx === idx) setReorderOverIdx(null)
          }
        }}
        onDrop={(e) => {
          e.preventDefault(); setDragIdx(null); setReorderOverIdx(null)
          if (dragPageIdx != null) {
            moveIdxTo(dragPageIdx, idx)
            setDragPageIdx(null)
            return
          }
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
          if (f) addFotoFile(it.refId, f)
        }}
        title={isSel
          ? 'Página seleccionada — pega (Cmd+V) o arrastra las fotos (hasta 3)'
          : 'Clic: seleccionar · Arrastra la página para cambiarla de posición · Suelta aquí una foto para agregarla'}>
        <div className="cb-photos">
          {/* Casillas de fotos (o el boceto si aún no hay fotos) */}
          {fotos.length === 0 ? (
            <div className="cb-photo cb-photo-main">
              {cod != null && <span className="cb-pos" title={`Nuevo código: ${cod}`}>{cod}</span>}
              {cod == null && <span className="cb-pos cb-pos-plain">{idx + 1}</span>}
              {r.image ? (
                <img src={r.image} alt={r.referencia} draggable={false}
                  onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(r.image) }} />
              ) : (
                <span className="cb-noimg">Sin foto</span>
              )}
              {(isSel || isDrag) && (
                <span className="cb-paste-hint">
                  {isDrag ? '⬇ Suelta la foto aquí' : '📋 Pega o arrastra las fotos'}
                  <br /><span>{isDrag ? 'se guarda con el nombre del archivo' : 'Cmd+V / Ctrl+V · hasta 3 por página'}</span>
                </span>
              )}
            </div>
          ) : (
            fotos.map((f, fi) => {
              const fr = f.refId ? refById.get(f.refId) : null
              return (
                <div key={fi} className="cb-photo cb-photo-foto">
                  {fi === 0 && cod != null && <span className="cb-pos" title={`Nuevo código: ${cod}`}>{cod}</span>}
                  {fi === 0 && cod == null && <span className="cb-pos cb-pos-plain">{idx + 1}</span>}
                  <span className="cb-foto-num" title={`Foto ${fi + 1}`}>{fi + 1}</span>
                  {f.rol === 'detalle' && (
                    <span className="cb-foto-tag det" title="Foto de detalle (sin referencia)">DETALLE</span>
                  )}
                  {f.refId && (
                    <span className="cb-foto-tag" title={`Foto de ${(fr && fr.referencia) || f.refId}`}>
                      {(fr && fr.referencia) || f.refId}
                    </span>
                  )}
                  <img src={f.src} alt={`foto ${fi + 1}`} draggable={false}
                    onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(f.src) }} />
                  <button className="cb-det-x" title={`Quitar la foto ${fi + 1}`}
                    onClick={(e) => { e.stopPropagation(); removeFoto(it.refId, fi) }}>×</button>
                </div>
              )
            })
          )}
          {/* Casilla para agregar la siguiente foto */}
          {fotos.length > 0 && fotos.length < MAX_FOTOS && (
            <div className="cb-photo cb-photo-add"
              onClick={() => setSelectedIdx(idx)}
              title="Agrega otra foto: pega (Cmd+V), arrastra el archivo o búscalo">
              <span className="cb-det-empty">
                {isDrag ? (
                  <>⬇ Suelta aquí<br /><span>foto {fotos.length + 1}</span></>
                ) : isSel ? (
                  <>📋 Pega aquí<br /><span>Cmd+V / Ctrl+V</span></>
                ) : (
                  <>+ Foto {fotos.length + 1}<br /><span>clic y pega · o arrastra</span></>
                )}
                <FotoBrowse onFile={(f) => addFotoFile(it.refId, f)} />
              </span>
            </div>
          )}
        </div>
        <div className="cb-info">
          {/* Pie de página al estilo del catálogo impreso: una sola línea
              centrada "BLUSA M5087 - PANTALÓN M5088" y debajo los colores
              de cada prenda, en fila. Igual con 1, 2 o 3 fotos. */}
          <div className="cb-cap">
            <div className="cb-cap-refs">
              {prendas.map((p, pi) => (
                <span className="cb-cap-item" key={p.key}>
                  {pi > 0 && <span className="cb-cap-sep">-</span>}
                  <span className={'cb-cap-ref' + (p.ref ? '' : ' cb-cap-ref-plain')}
                    title={p.ref ? 'Abrir ficha' : undefined}
                    onClick={(e) => { e.stopPropagation(); if (p.ref && onOpenRef) onOpenRef(p.ref) }}>
                    <span className="cb-cap-tipo">{p.tipo}</span>
                    <span className="cb-cap-code">{p.code}</span>
                  </span>
                </span>
              ))}
            </div>
            <div className="cb-cap-colors">
              {prendas.map((p) => (
                <span className="cb-cap-group" key={p.key}
                  title={prendas.length > 1 ? `Colores de ${p.code}` : undefined}>
                  {p.colores.length === 0 ? (
                    <span className="cb-cap-nocolor">sin colores</span>
                  ) : p.colores.map((c, ci) => (
                    <span className="cb-cap-color" key={ci}>
                      <span className="cb-cap-cname">{c.name}</span>
                      <span className="cb-dot" style={{ background: c.hex || '#ccc' }} />
                      {p.own && (
                        <button className="cb-cap-x" title="Quitar color (solo del catálogo)"
                          onClick={(e) => { e.stopPropagation(); removeColor(idx, ci) }}>×</button>
                      )}
                    </span>
                  ))}
                  {p.own && (
                    <button className="cb-cap-resync" title="Volver a traer los colores de la ficha"
                      onClick={(e) => { e.stopPropagation(); resyncColors(idx) }}>↺</button>
                  )}
                </span>
              ))}
            </div>
            {r.marca && <div className="cb-cap-marca">{r.marca}</div>}
          </div>

          {/* Archivos de las fotos: plegados para no ensuciar el pie; se
              abren para copiar el nombre o marcar de qué es cada foto. */}
          {fotos.length > 0 && (
          <div className={'cb-archivos' + (archOpen ? ' abierto' : '')}>
          <button className="cb-arch-toggle"
            title={archOpen ? 'Ocultar los archivos' : 'Ver el nombre de archivo de cada foto y marcar de qué es'}
            onClick={(e) => { e.stopPropagation(); toggleArch(it.refId) }}>
            <span className="cb-arch-caret">{archOpen ? '▾' : '▸'}</span>
            📎 {fotos.length} {fotos.length === 1 ? 'archivo' : 'archivos'}
            {!archOpen && fotos.some((f) => f.refId || f.rol === 'detalle') && (
              <span className="cb-arch-badges">
                {fotos.map((f, fi) => (
                  f.refId ? <span key={fi} className="cb-arch-b ref">{(refById.get(f.refId) || {}).referencia || f.refId}</span>
                    : f.rol === 'detalle' ? <span key={fi} className="cb-arch-b det">detalle</span> : null
                ))}
              </span>
            )}
          </button>
          {archOpen && fotos.map((f, fi) => {
            const fr = f.refId ? refById.get(f.refId) : null
            const picking = refPick && refPick.idx === idx && refPick.fi === fi
            return (
              <div key={fi} className="cb-fotorow">
                <div className="cb-fotorow-line">
                  <div className="cb-filename"
                    title="Nombre del archivo original — un clic lo selecciona completo para copiarlo">
                    📎 {fi + 1} · {f.name || '(sin nombre — pégala arrastrando el archivo)'}
                  </div>
                  <div className="cb-fotorow-meta">
                    {f.refId ? (
                      <span className="cb-fototag-mini"
                        title={fr ? `Foto de ${fr.referencia} · ${fr.tipo || ''}` : `Foto de ${f.refId}`}>
                        → {(fr && fr.referencia) || f.refId}
                        <button className="cb-color-x" title="Quitar la referencia de esta foto"
                          onClick={(e) => { e.stopPropagation(); asignarFotoRef(it.refId, fi, null) }}>×</button>
                      </span>
                    ) : f.rol === 'detalle' ? (
                      <span className="cb-fotodet" title="Foto de detalle — sin referencia">
                        DETALLE
                        <button className="cb-color-x" title="Quitar la marca de detalle"
                          onClick={(e) => { e.stopPropagation(); marcarFotoDetalle(it.refId, fi, false) }}>×</button>
                      </span>
                    ) : (
                      <>
                        <button className="cb-mini" title="Esta foto es de OTRA referencia (ej. el pantalón que acompaña): búscala en la base"
                          onClick={(e) => { e.stopPropagation(); setRefPick({ idx, fi, q: '' }) }}>
                          + referencia
                        </button>
                        <button className="cb-mini" title="Marcar como foto de DETALLE (sin referencia)"
                          onClick={(e) => { e.stopPropagation(); marcarFotoDetalle(it.refId, fi, true) }}>
                          detalle
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {picking && (
                  <div className="cb-refpick" onClick={(e) => e.stopPropagation()}>
                    <input className="input" autoFocus
                      placeholder="Buscar referencia… (ej. MG-P861)"
                      value={refPick.q}
                      onChange={(e) => setRefPick({ idx, fi, q: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Escape') setRefPick(null) }} />
                    {refPick.q.trim() && (
                      <div className="cb-refpick-list">
                        {refs
                          .filter((x) => x.id !== it.refId)
                          .filter((x) => (x.referencia + ' ' + (x.tipo || '')).toLowerCase().includes(refPick.q.trim().toLowerCase()))
                          .sort((a, b) => ((marcaOf(b) === marcaSel ? 1 : 0) - (marcaOf(a) === marcaSel ? 1 : 0)) || a.referencia.localeCompare(b.referencia))
                          .slice(0, 6)
                          .map((x) => (
                            <button key={x.id} className="cb-refpick-row"
                              onClick={() => { asignarFotoRef(it.refId, fi, x.id); setRefPick(null) }}>
                              <span className="cb-sg-img">{x.image ? <img src={x.image} alt="" /> : null}</span>
                              <span>
                                <span className="cb-sg-ref">{x.referencia}</span>
                                <span className="cb-sg-colors">
                                  {x.tipo || 'Sin tipo'}
                                  {(x.colores || []).filter(Boolean).slice(0, 4).map((c, ci) => (
                                    <span key={ci} className="cb-dot" style={{ background: c.hex || '#ccc' }} title={c.name} />
                                  ))}
                                </span>
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                    <button className="cb-mini" style={{ marginTop: 6 }}
                      onClick={() => setRefPick(null)}>cancelar</button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
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

  // Página vacía: clic → enfoca el buscador; también recibe una página
  // arrastrada para enviarla al final.
  function renderEmptyPage(pageNum, side) {
    const isOver = dragPageIdx != null && reorderOverIdx === -pageNum
    return (
      <div className={'cb-page ' + side + ' cb-page-empty' + (isOver ? ' cb-reorder-over' : '')}
        onClick={focusAdd}
        onDragOver={(e) => { if (dragPageIdx != null) { e.preventDefault(); setReorderOverIdx(-pageNum) } }}
        onDragLeave={() => { if (reorderOverIdx === -pageNum) setReorderOverIdx(null) }}
        onDrop={(e) => {
          if (dragPageIdx == null) return
          e.preventDefault()
          moveIdxTo(dragPageIdx, items.length)
          setDragPageIdx(null); setReorderOverIdx(null)
        }}
        title="Clic para agregar una referencia · o suelta aquí una página para enviarla al final">
        <div className="cb-empty-hint">
          + Agregar referencia<br />
          <span>{dragPageIdx != null ? 'suelta aquí para enviarla al final' : 'clic para buscar · la nueva cae en esta página'}</span>
        </div>
        <span className="cb-pagenum">pág. {pageNum}</span>
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
            const conReal = items.filter((it) => getFotos(refById.get(it.refId)).length > 0).length
            return (
              <span className={conReal === items.length ? 'cb-real-count done' : 'cb-real-count'}>
                {' '}· {conReal}/{items.length} con fotos
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
      <div className="cb-add" ref={addBoxRef}>
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

      {items.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 16 }}>
          <p>El catálogo de {marcaSel} está vacío.</p>
          <p className="muted">
            Define el serial inicial (ej. 6521) y agrega referencias con el buscador o
            haciendo clic en la página vacía de abajo — cada una trae sus colores
            automáticamente y recibe su código en orden.
          </p>
        </div>
      )}
      <div className="cb-book">
        {pliegos.map(([izq, der], pi) => (
          <div key={pi} className="cb-pliego">
            <div className="cb-pliego-label">
              Pliego {pi + 1} · págs. {izq + 1}–{der != null ? der + 1 : izq + 2}
            </div>
            <div className="cb-spread">
              {renderPage(izq, 'left')}
              {der != null ? renderPage(der, 'right') : renderEmptyPage(izq + 2, 'right')}
            </div>
          </div>
        ))}
        {/* Siempre hay un pliego abierto al final para seguir agregando */}
        {items.length % 2 === 0 && (
          <div className="cb-pliego">
            <div className="cb-pliego-label">
              Pliego {pliegos.length + 1} · págs. {items.length + 1}–{items.length + 2}
            </div>
            <div className="cb-spread">
              {renderEmptyPage(items.length + 1, 'left')}
              {renderEmptyPage(items.length + 2, 'right')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Enlace compacto para buscar el archivo de una foto en disco.
function FotoBrowse({ onFile }) {
  const inputRef = useRef(null)
  return (
    <>
      <button className="cb-det-browse" title="Buscar el archivo de la foto"
        onClick={(e) => { e.stopPropagation(); inputRef.current && inputRef.current.click() }}>
        buscar archivo
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { onFile(e.target.files && e.target.files[0]); e.target.value = '' }} />
    </>
  )
}
