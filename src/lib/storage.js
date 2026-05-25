// The PDF selection is a per-device UI state, kept in localStorage.
const SELECTION_KEY = 'inventarios-mg:pdf-selection'

export function loadSelection() {
  try {
    const v = JSON.parse(localStorage.getItem(SELECTION_KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveSelection(ids) {
  localStorage.setItem(SELECTION_KEY, JSON.stringify(ids))
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
