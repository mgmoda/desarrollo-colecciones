import { useEffect, useRef, useState } from 'react'
import Swatch from './Swatch.jsx'
import Dropdown from './Dropdown.jsx'
import { capitalize } from '../lib/constants.js'

// Color selector inside a matrix cell: pick a saved color, create, edit or delete.
export default function ColorCell({
  value,
  savedColors,
  usedNames,
  onSelect,
  onCreateColor,
  onDeleteColor,
  onEditColor,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [newHex, setNewHex] = useState('#b5651d')
  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const btnRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      setEditing(null)
      setConfirming(null)
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [open])

  const used = new Set((usedNames || []).map((n) => n.toLowerCase()))
  const q = query.trim().toLowerCase()
  const available = savedColors.filter((c) => !used.has(c.name.toLowerCase()))
  const filtered = available.filter((c) => c.name.toLowerCase().includes(q))
  const exists = savedColors.some((c) => c.name.toLowerCase() === q)
  const items = [
    ...filtered.map((c) => ({ type: 'opt', color: c })),
    ...(q.length > 0 && !exists ? [{ type: 'create' }] : []),
  ]

  function commit(item) {
    if (!item) return
    if (item.type === 'create') {
      const color = { name: capitalize(query), hex: newHex }
      onCreateColor(color)
      onSelect(color)
    } else {
      onSelect(item.color)
    }
    setOpen(false)
  }

  function saveEdit() {
    const name = capitalize(editing.name)
    if (name) onEditColor(editing.orig, { name, hex: editing.hex })
    setEditing(null)
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(items.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(items[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={'colorcell' + (value ? '' : ' empty')}
        onClick={() => setOpen((o) => !o)}
      >
        {value ? (
          <>
            <Swatch hex={value.hex} size={15} />
            <span className="colorcell-name">{value.name}</span>
          </>
        ) : (
          <span className="colorcell-ph">Elegir color</span>
        )}
        <span className="colorcell-caret" aria-hidden="true">▾</span>
      </button>

      <Dropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
        <div className="colorpop">
          <div className="colorpop-head">
            <input
              type="color"
              className="color-input sm"
              value={newHex}
              onChange={(e) => setNewHex(e.target.value)}
              title="Tono para un color nuevo"
            />
            <input
              ref={inputRef}
              className="input"
              placeholder="Buscar o crear color…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlight(0)
              }}
              onKeyDown={handleKey}
            />
          </div>
          <ul className="colorpop-list">
            {items.map((it, i) => {
                if (it.type === 'opt' && editing && editing.orig === it.color.name) {
                  return (
                    <li key={it.color.name} className="combo-item editrow">
                      <input
                        type="color"
                        className="color-input sm"
                        value={editing.hex}
                        onChange={(e) =>
                          setEditing((ed) => ({ ...ed, hex: e.target.value }))
                        }
                      />
                      <input
                        className="combo-editfield"
                        value={editing.name}
                        autoFocus
                        onChange={(e) =>
                          setEditing((ed) => ({ ...ed, name: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') saveEdit()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                      <button
                        type="button"
                        className="combo-iconbtn save"
                        title="Guardar"
                        onClick={saveEdit}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="combo-iconbtn"
                        title="Cancelar"
                        onClick={() => setEditing(null)}
                      >
                        ✕
                      </button>
                    </li>
                  )
                }
                if (it.type === 'opt' && confirming === it.color.name) {
                  return (
                    <li
                      key={it.color.name}
                      className="combo-item combo-confirmrow"
                    >
                      <span className="combo-confirm-text">
                        ¿Eliminar «{it.color.name}»?
                      </span>
                      <button
                        type="button"
                        className="combo-cbtn danger"
                        onClick={() => {
                          onDeleteColor(it.color.name)
                          setConfirming(null)
                        }}
                      >
                        Eliminar
                      </button>
                      <button
                        type="button"
                        className="combo-cbtn ghost"
                        onClick={() => setConfirming(null)}
                      >
                        Cancelar
                      </button>
                    </li>
                  )
                }
                return (
                  <li
                    key={it.type === 'create' ? 'create' : it.color.name}
                    className={
                      'combo-item' +
                      (i === highlight ? ' hl' : '') +
                      (it.type === 'create' ? ' create' : '')
                    }
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => commit(it)}
                  >
                    {it.type === 'create' ? (
                      <>
                        <Swatch hex={newHex} size={15} />
                        <span className="combo-plus">+</span> Crear «{query.trim()}»
                      </>
                    ) : (
                      <>
                        <Swatch hex={it.color.hex} size={15} />
                        <span className="combo-item-label">{it.color.name}</span>
                        {onEditColor && (
                          <button
                            type="button"
                            className="combo-edit"
                            title={'Editar ' + it.color.name}
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditing({
                                orig: it.color.name,
                                name: it.color.name,
                                hex:
                                  it.color.hex === 'linear'
                                    ? '#b5651d'
                                    : it.color.hex,
                              })
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                              strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                        )}
                        {onDeleteColor && (
                          <button
                            type="button"
                            className="combo-del"
                            title={'Eliminar ' + it.color.name + ' de la lista'}
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirming(it.color.name)
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
              {!items.some((it) => it.type === 'create') && (
                <li className="combo-hint">
                  Para agregar un color nuevo, escríbelo en el campo de arriba.
                </li>
              )}
            </ul>
        </div>
      </Dropdown>
    </>
  )
}
