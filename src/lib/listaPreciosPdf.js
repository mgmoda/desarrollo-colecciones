import { jsPDF } from 'jspdf'

// Lista de precios por marca, al estilo del listado impreso de MG Moda:
// tipografía serif, cabecera con el nombre de la marca y franja crema en los
// encabezados de columna. Precios en pesos con punto de miles ("$ 158.900").

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 57

const INK = [20, 18, 16]
const BROWN = [74, 59, 42]      // #4a3b2a
const BAND = [239, 228, 212]    // #efe4d4
const LINE = [230, 220, 201]
const MUTED = [161, 144, 122]
const NONE = [201, 191, 168]

const ROW_H = 18
const HEAD_BAND_H = 20

// Columnas (x desde MARGIN)
const COL_REF = 0
const COL_DESC = 58
const COL_618 = 300
const COL_20 = 392
const DESC_MAX = COL_618 - COL_DESC - 10

const pesos = (n) => (Number(n) > 0 ? '$ ' + Math.round(Number(n)).toLocaleString('es-CO') : '')

function ellipsis(doc, text, maxW) {
  if (doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

// Monograma "MG": cuadro oscuro redondeado con las iniciales en serif.
function drawMonogram(doc, x, y, size) {
  doc.setFillColor(42, 33, 24)
  doc.roundedRect(x, y, size, size, 5, 5, 'F')
  doc.setFont('times', 'normal')
  doc.setFontSize(size * 0.42)
  doc.setTextColor(243, 235, 219)
  doc.text('MG', x + size / 2, y + size / 2 + size * 0.15, { align: 'center' })
}

function drawHeader(doc, marca, coleccion) {
  const x = MARGIN
  let y = MARGIN
  drawMonogram(doc, x, y, 34)
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...BROWN)
  doc.text('MG MODA S.A.S', x + 44, y + 14)
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('DESARROLLO DE COLECCIONES', x + 44, y + 26)

  y += 58
  doc.setFont('times', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(42, 33, 24)
  doc.text(marca.toUpperCase(), PAGE_W / 2, y, { align: 'center' })
  y += 16
  doc.setFont('times', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  doc.text(`LISTADO DE PRECIOS · COLECCIÓN ${coleccion}`, PAGE_W / 2, y, { align: 'center' })
  return y + 16
}

// Franja crema con los títulos de columna. Devuelve la Y de la primera fila.
function drawColumnBand(doc, y) {
  const x = MARGIN
  const w = PAGE_W - MARGIN * 2
  doc.setFillColor(...BAND)
  doc.rect(x, y, w, HEAD_BAND_H, 'F')
  doc.setFont('times', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...BROWN)
  const ty = y + 13
  doc.text('REF', x + COL_REF, ty)
  doc.text('DESCRIPCIÓN', x + COL_DESC, ty)
  doc.text('TALLA 6-18', x + COL_618, ty)
  doc.text('TALLA 20', x + COL_20, ty)
  return y + HEAD_BAND_H + 4
}

function drawFooter(doc, pageNum) {
  doc.setDrawColor(...BROWN)
  doc.setLineWidth(1)
  doc.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46)
  doc.setFont('times', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('MG MODA S.A.S · PRECIOS SUGERIDOS AL PÚBLICO', PAGE_W / 2, PAGE_H - 34, { align: 'center' })
  doc.text(String(pageNum), PAGE_W - MARGIN, PAGE_H - 34, { align: 'right' })
}

// Dibuja una marca (una o varias páginas). Devuelve el número de la última página.
function drawMarca(doc, marca, rows, coleccion, pageNum) {
  const x = MARGIN
  let y = drawHeader(doc, marca, coleccion)
  y = drawColumnBand(doc, y)
  const bottomLimit = PAGE_H - 60

  rows.forEach((r) => {
    if (y + ROW_H > bottomLimit) {
      drawFooter(doc, pageNum)
      doc.addPage()
      pageNum += 1
      y = MARGIN
      // Cabecera compacta en páginas siguientes
      doc.setFont('times', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(42, 33, 24)
      doc.text(marca.toUpperCase(), x, y + 4)
      doc.setFont('times', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...MUTED)
      doc.text(`LISTADO DE PRECIOS · ${coleccion}`, PAGE_W - MARGIN, y + 4, { align: 'right' })
      y += 16
      y = drawColumnBand(doc, y)
    }
    const ty = y + 12
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    // REF
    doc.setTextColor(...BROWN)
    doc.text(r.ref || '—', x + COL_REF, ty)
    // DESCRIPCIÓN
    doc.setTextColor(...INK)
    doc.text(ellipsis(doc, (r.desc || '').toUpperCase(), DESC_MAX), x + COL_DESC, ty)
    // PRECIOS
    const p618 = pesos(r.t618)
    const p20 = pesos(r.t20)
    if (p618) { doc.setTextColor(...INK); doc.text(p618, x + COL_618, ty) }
    else { doc.setTextColor(...NONE); doc.text('—', x + COL_618, ty) }
    if (p20) { doc.setTextColor(...INK); doc.text(p20, x + COL_20, ty) }
    else { doc.setTextColor(...NONE); doc.text('—', x + COL_20, ty) }
    // separador
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.5)
    doc.line(x, y + ROW_H, PAGE_W - MARGIN, y + ROW_H)
    y += ROW_H
  })
  drawFooter(doc, pageNum)
  return pageNum
}

// Construye el documento (sin descargar). sections: [{ marca, rows }].
export function buildListaPreciosDoc(sections, { coleccion = '2026-1' } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let pageNum = 1
  sections.forEach((sec, i) => {
    if (i > 0) { doc.addPage(); pageNum += 1 }
    pageNum = drawMarca(doc, sec.marca, sec.rows, coleccion, pageNum)
  })
  return doc
}

// sections: [{ marca, rows: [{ ref, desc, t618, t20 }] }]
export function generateListaPreciosPDF(sections, opts = {}) {
  const doc = buildListaPreciosDoc(sections, opts)
  const nombre = sections.length === 1
    ? `Lista_Precios_${sections[0].marca}.pdf`
    : 'Lista_Precios.pdf'
  doc.save(nombre)
}
