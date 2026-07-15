import { jsPDF } from 'jspdf'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const ACCENT = [107, 60, 134]        // morado suave
const ACCENT_2 = [31, 122, 68]       // verde para totales
const HAIRLINE = [216, 214, 207]
const BAND_BG = [246, 243, 236]
const CELL_ALT = [252, 250, 244]

function drawTopHeader(doc, fechaStr) {
  const x = MARGIN
  let y = MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text('Reporte de colores por categoría', x, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text(fechaStr, PAGE_W - MARGIN, y + 4, { align: 'right' })
  y += 18
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(1.5)
  doc.line(x, y, PAGE_W - MARGIN, y)
  return y + 16
}

function drawSummaryTable(doc, resumen, yStart) {
  const x = MARGIN
  let y = yStart
  const cols = [
    { label: 'CATEGORÍA', w: 145, align: 'left' },
    { label: 'REFS', w: 45, align: 'right' },
    { label: 'CON COLOR', w: 60, align: 'right' },
    { label: 'MENCIONES', w: 60, align: 'right' },
    { label: 'COLOR DOMINANTE', w: 141, align: 'left' },
  ]

  // Título de sección
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...ACCENT)
  doc.text('Resumen general', x, y)
  y += 14

  // Encabezados
  doc.setFillColor(...BAND_BG)
  doc.rect(x, y - 10, PAGE_W - 2 * MARGIN, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  let cx = x + 6
  cols.forEach((c) => {
    const tx = c.align === 'right' ? cx + c.w - 12 : cx
    doc.text(c.label, tx, y + 2, { align: c.align })
    cx += c.w
  })
  y += 12

  // Filas
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  resumen.forEach((row, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(...CELL_ALT)
      doc.rect(x, y - 10, PAGE_W - 2 * MARGIN, 18, 'F')
    }
    doc.setTextColor(...INK)
    cx = x + 6
    // Categoría
    doc.setFont('helvetica', 'bold')
    doc.text(row.categoria, cx, y + 3)
    cx += cols[0].w
    // Refs / Con color / Menciones
    doc.setFont('helvetica', 'normal')
    ;['refs', 'conColor', 'menciones'].forEach((k, j) => {
      const c = cols[j + 1]
      doc.text(String(row[k]), cx + c.w - 12, y + 3, { align: 'right' })
      cx += c.w
    })
    // Color dominante
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...ACCENT_2)
    doc.text(row.dominante, cx, y + 3)
    y += 16
  })

  // Línea final
  doc.setDrawColor(...HAIRLINE)
  doc.setLineWidth(0.5)
  doc.line(x, y - 6, PAGE_W - MARGIN, y - 6)
  return y + 12
}

function drawCategoryDetail(doc, cat, yStart) {
  const x = MARGIN
  let y = yStart

  // Guarda espacio para al menos header + 2 filas
  if (y > PAGE_H - MARGIN - 60) {
    doc.addPage()
    y = MARGIN
  }

  // Header de la categoría
  doc.setFillColor(...BAND_BG)
  doc.rect(x, y - 8, PAGE_W - 2 * MARGIN, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...ACCENT)
  doc.text(cat.categoria, x + 6, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(`${cat.refs} refs · ${cat.menciones} menciones de color`, PAGE_W - MARGIN - 6, y + 6, { align: 'right' })
  y += 22

  // Encabezados de columnas
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('COLOR', x + 6, y)
  doc.text('REFS', x + 260, y, { align: 'right' })
  doc.text('%', x + 340, y, { align: 'right' })
  doc.text('DISTRIBUCIÓN', x + 350, y)
  y += 4
  doc.setDrawColor(...HAIRLINE)
  doc.setLineWidth(0.3)
  doc.line(x, y, PAGE_W - MARGIN, y)
  y += 10

  // Barra máxima para escala visual
  const maxCount = cat.distribucion.reduce((m, d) => Math.max(m, d.count), 0)

  cat.distribucion.forEach((d) => {
    if (y > PAGE_H - MARGIN - 20) {
      doc.addPage()
      y = MARGIN
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(d.name, x + 6, y)
    doc.text(String(d.count), x + 260, y, { align: 'right' })
    doc.text(d.pct.toFixed(1) + '%', x + 340, y, { align: 'right' })
    // Barra
    const barX = x + 350
    const barW = PAGE_W - MARGIN - barX - 4
    doc.setFillColor(230, 226, 216)
    doc.rect(barX, y - 6, barW, 6, 'F')
    doc.setFillColor(...ACCENT)
    doc.rect(barX, y - 6, (d.count / maxCount) * barW, 6, 'F')
    y += 14
  })

  return y + 10
}

// Genera el reporte completo. Recibe la lista de refs (ya filtradas
// por _stub / descartadas / geodesica en el llamador) y las CATS.
export async function generateColoresReportPDF(refs, CATS) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fechaStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

  // Construir el reporte por categoría
  const cats = []
  CATS.forEach((c) => {
    const items = refs.filter(c.match)
    if (!items.length) return
    const counts = new Map()
    items.forEach((r) => (r.colores || []).forEach((col) => {
      if (col && col.name) counts.set(col.name, (counts.get(col.name) || 0) + 1)
    }))
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const menciones = sorted.reduce((s, [, n]) => s + n, 0)
    const conColor = items.filter((r) => (r.colores || []).filter(Boolean).length > 0).length
    cats.push({
      categoria: c.label,
      refs: items.length,
      conColor,
      menciones,
      dominante: sorted[0] ? `${sorted[0][0]} (${sorted[0][1]})` : '—',
      distribucion: sorted.map(([name, count]) => ({
        name, count, pct: menciones ? (count / menciones) * 100 : 0,
      })),
    })
  })

  if (cats.length === 0) {
    // Nada que reportar
    let y = drawTopHeader(doc, fechaStr)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...GRAY)
    doc.text('No hay categorías con referencias.', MARGIN, y)
    doc.save('colores-por-categoria-' + new Date().toISOString().slice(0, 10) + '.pdf')
    return
  }

  let y = drawTopHeader(doc, fechaStr)
  y = drawSummaryTable(doc, cats, y)

  // Detalle por categoría (nueva página si conviene)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...ACCENT)
  if (y > PAGE_H - MARGIN - 80) { doc.addPage(); y = MARGIN }
  y += 4
  doc.text('Detalle por categoría', MARGIN, y)
  y += 14

  cats.forEach((cat) => {
    y = drawCategoryDetail(doc, cat, y)
  })

  const filename = 'colores-por-categoria-' + new Date().toISOString().slice(0, 10) + '.pdf'
  doc.save(filename)
}
