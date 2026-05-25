import * as XLSX from 'xlsx'
import { newId } from './storage.js'
import { normRef } from './constants.js'

// El sistema exporta cada hoja con un encabezado de DOS filas:
//   fila 1 = grupo de la etapa (Orden Corte, Trazo, Envío Ensamble, …)
//   fila 2 = subcampo (Fecha, Cant, Días, Taller)
// Las primeras columnas (# Orden, Referencia, Producto, Empresa) traen el
// nombre en la fila 1 y la fila 2 vacía. Construimos el mapa de columnas
// combinando ambas filas para no depender de posiciones fijas.

const STAGE_MATCHERS = [
  { key: 'ordenCorte', re: /orden\s*corte/i },
  { key: 'entregaCorte', re: /entrega\s*corte/i },
  { key: 'entregaEnsamble', re: /entrega\s*ensamble/i },
  { key: 'envioEnsamble', re: /env[ií]o\s*ensamble/i },
  { key: 'entradaBodega', re: /entrada\s*bodega/i },
  { key: 'trazo', re: /trazo/i },
  { key: 'alistamiento', re: /alistamiento/i },
  { key: 'revisado', re: /revisad/i },
]

function txt(v) {
  return (v == null ? '' : String(v)).trim()
}

function matchStage(group) {
  for (const m of STAGE_MATCHERS) if (m.re.test(group)) return m.key
  return null
}

function subField(sub, group) {
  const s = sub + ' ' + group
  if (/taller/i.test(s)) return 'taller'
  if (/fecha/i.test(s)) return 'fecha'
  if (/d[ií]as/i.test(s)) return 'dias'
  if (/cant|unidad/i.test(s)) return 'cant'
  return null
}

// Localiza la fila de encabezado de grupo (la que contiene "Referencia").
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const joined = (rows[i] || []).map(txt).join(' | ').toLowerCase()
    if (/referencia/.test(joined) && /(orden|# orden|producto)/.test(joined)) {
      return i
    }
  }
  return -1
}

function buildColumnMap(groupRow, subRow) {
  const map = []
  let lastGroup = ''
  const n = Math.max(groupRow.length, subRow.length)
  for (let c = 0; c < n; c++) {
    const g = txt(groupRow[c])
    if (g) lastGroup = g
    const group = g || lastGroup
    const sub = txt(subRow[c])
    const low = (group + ' ' + sub).toLowerCase()

    // Columnas base
    if (/#?\s*orden/.test(low) && !/corte/.test(low)) { map[c] = { base: 'orden' }; continue }
    if (/referencia/.test(low)) { map[c] = { base: 'referencia' }; continue }
    if (/producto/.test(low)) { map[c] = { base: 'producto' }; continue }
    if (/empresa/.test(low)) { map[c] = { base: 'empresa' }; continue }
    if (/error/.test(low)) { map[c] = { base: 'errores' }; continue }
    if (/corregid/.test(low)) { map[c] = { base: 'corregido' }; continue }
    if (/acum/.test(low)) { map[c] = { base: 'acumDias' }; continue }

    const stage = matchStage(group)
    if (stage) {
      const field = subField(sub, group) || 'fecha'
      map[c] = { stage, field }
    }
  }
  return map
}

function cleanCell(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return txt(v)
}

// Lee un File (XLS/XLSX) y devuelve registros de orden listos para guardar.
export async function parseProductionFile(file, origen) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  // Tomamos la primera hoja: así sale del sistema.
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })

  const h = findHeaderRow(rows)
  if (h < 0) {
    return { orders: [], skipped: 0, error: 'No se encontró el encabezado (Referencia / # Orden) en la primera hoja.' }
  }
  const groupRow = rows[h] || []
  const subRow = rows[h + 1] || []
  // Si la fila siguiente parece de datos (trae una referencia tipo MG-...),
  // entonces el encabezado es de una sola fila.
  const subLooksData = /\bMG[- ]?\w/i.test((subRow.map(txt).join(' ')))
  const colMap = buildColumnMap(groupRow, subLooksData ? [] : subRow)
  const firstDataRow = subLooksData ? h + 1 : h + 2

  const orders = []
  let skipped = 0
  for (let r = firstDataRow; r < rows.length; r++) {
    const row = rows[r] || []
    const order = {
      id: newId(),
      origen,
      orden: '', referencia: '', producto: '', empresa: '',
      errores: '', corregido: '', acumDias: '',
      stages: {},
      importedAt: Date.now(),
    }
    colMap.forEach((m, c) => {
      if (!m) return
      const val = cleanCell(row[c])
      if (val === '') return
      if (m.base) {
        order[m.base] = m.base === 'referencia' ? normRef(val) : val
      } else {
        const st = order.stages[m.stage] || (order.stages[m.stage] = {})
        st[m.field] = val
      }
    })
    if (!order.referencia) { skipped += 1; continue }
    orders.push(order)
  }
  return { orders, skipped, error: '' }
}
