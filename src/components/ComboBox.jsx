import { useEffect, useRef, useState } from 'react'
import Dropdown from './Dropdown.jsx'
import { capitalize } from '../lib/constants.js'

// Single-select: type to filter a saved list, pick one, create, edit or delete.
export default function ComboBox({
  value,
  options,
  onChange,
  onCreate,
  onDelete,
  onEdit,
  placeholder,
  entityLabel = 'opción',
}) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createText, setCreateText] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  function close(revert) {
    setOpen(false)
    setEditing(null)
    setConfirming(null)
    setCreating(false)
    if (revert) setQuery(value || '')
  }

  const q = query.trim().toLowerCase()
  // Show every option when nothing new has been typed (e.g. reopening a field
  // that already has a value); filter only once the user types something else.
  const showAll = !query.trim() || query === value
  const items = showAll
    ? options
    : options.filter((o) => o.toLowerCase().includes(q))
  const exact = options.some((o) => o.toLowerCase() === q)
  const creatableQuery = q.length > 0 && !exact

  function pick(option) {
    onChange(option)
    setQuery(option)
    setOpen(false)
  }

  function create(rawText) {
    const v = capitalize(rawText)
    if (!v) return
    onCreate(v)
    onChange(v)
    setQuery(v)
    setCreating(false)
    setOpen(false)
  }

  function startEdit(name) {
    setEditing(name)
    setEditText(name)
  }

  function saveEdit() {
    const next = capitalize(editText)
    if (next && next !== editing) onEdit(editing, next)
    setEditing(null)
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(items.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[highlight]) pick(items[highlight])
      else if (creatableQuery) create(query)
    } else if (e.key === 'Escape') {
      close(true)
    }
  }

  return (
    <div className="combo" ref={wrapRef}>
      <input
        className="input"
        value={query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setHighlight(0)
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onKeyDown={handleKey}
      />
      <span className="combo-caret" aria-hidden="true">▾</span>

      <Dropdown anchorRef={wrapRef} open={open} onClose={() => close(true)}>
        <div className="combo-panel">
          <ul className="combo-list">
          {items.map((opt, i) => {
            if (editing === opt) {
              return (
                <li key={opt} className="combo-item editrow">
                  <input
                    className="combo-editfield"
                    value={editText}
                    autoFocus
                    onChange={(e) => setEditText(e.target.value)}
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
            if (confirming === opt) {
              return (
                <li key={opt} className="combo-item combo-confirmrow">
                  <span className="combo-confirm-text">
                    ¿Eliminar «{opt}»?
                  </span>
                  <button
                    type="button"
                    className="combo-cbtn danger"
                    onClick={() => {
                      onDelete(opt)
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
                key={opt}
                className={'combo-item' + (i === highlight ? ' hl' : '')}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(opt)}
              >
                <span className="combo-item-label">{opt}</span>
                {onEdit && (
                  <button
                    type="button"
                    className="combo-edit"
                    title={'Editar ' + opt}
                    onClick={(e) => {
                      e.stopPropagation()
                      startEdit(opt)
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
                {onDelete && (
                  <button
                    type="button"
                    className="combo-del"
                    title={'Eliminar ' + opt + ' de la lista'}
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirming(opt)
                    }}
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
          </ul>

          {creating ? (
            <div className="combo-item editrow combo-createrow">
              <input
                className="combo-editfield"
                value={createText}
                autoFocus
                placeholder={'Nueva ' + entityLabel + '…'}
                onChange={(e) => setCreateText(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') create(createText)
                  if (e.key === 'Escape') setCreating(false)
                }}
              />
              <button
                type="button"
                className="combo-iconbtn save"
                title="Crear"
                onClick={() => create(createText)}
              >
                ✓
              </button>
              <button
                type="button"
                className="combo-iconbtn"
                title="Cancelar"
                onClick={() => setCreating(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              className="combo-createbtn"
              onClick={() => {
                if (creatableQuery) create(query)
                else {
                  setCreateText('')
                  setCreating(true)
                }
              }}
            >
              <span className="combo-plus">+</span>
              {creatableQuery
                ? <>Crear «{query.trim()}»</>
                : <>Crear nueva {entityLabel}</>}
            </div>
          )}
        </div>
      </Dropdown>
    </div>
  )
}
