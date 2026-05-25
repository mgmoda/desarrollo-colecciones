import { useEffect, useMemo, useRef, useState } from 'react'

// Buscador global de referencia. Sugiere coincidencias y al elegir una
// abre el detalle con su etapa actual.
export default function RefSearch({ refIds, onSelect }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef(null)

  const matches = useMemo(() => {
    const term = q.trim().toUpperCase()
    if (!term) return []
    const starts = []
    const contains = []
    for (const id of refIds) {
      if (id.startsWith(term)) starts.push(id)
      else if (id.includes(term)) contains.push(id)
      if (starts.length >= 8) break
    }
    return [...starts, ...contains].slice(0, 8)
  }, [q, refIds])

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(id) {
    onSelect(id)
    setQ('')
    setOpen(false)
  }

  function onKeyDown(e) {
    if (!open || !matches.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(matches[hi] || matches[0]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="ref-search" ref={boxRef}>
      <input
        className="input ref-search-input"
        placeholder="Buscar referencia…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0) }}
        onFocus={() => q && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {q && (
        <button type="button" className="search-clear" title="Borrar búsqueda"
          aria-label="Borrar búsqueda"
          onClick={() => { setQ(''); setOpen(false) }}>✕</button>
      )}
      {open && matches.length > 0 && (
        <ul className="ref-search-list">
          {matches.map((id, i) => (
            <li
              key={id}
              className={'ref-search-item' + (i === hi ? ' hi' : '')}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(id) }}
            >
              {id}
            </li>
          ))}
        </ul>
      )}
      {open && q && matches.length === 0 && (
        <ul className="ref-search-list">
          <li className="ref-search-empty">Sin coincidencias</li>
        </ul>
      )}
    </div>
  )
}
