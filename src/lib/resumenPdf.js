import { jsPDF } from 'jspdf'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const ROW_H = 76
const PHOTO_W = 48
const PHOTO_H = 62

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const GREEN = [31, 122, 68]
const PHOTO_BG = [238, 236, 232]
const HAIRLINE = [216, 214, 207]

function loadImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawHeader(doc, subtitulo) {
  const top = MARGIN
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('RESUMEN DE PRODUCCIÓN', MARGIN, top + 4, { charSpace: 1.2 })

  doc.setTextColor(...INK)
  doc.setFont('times', 'normal')
  doc.setFontSize(22)
  doc.text(subtitulo || 'Referencias seleccionadas', MARGIN, top + 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(
    new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
    PAGE_W - MARGIN, top + 4, { align: 'right' },
  )

  const lineY = top + 40
  doc.setDrawColor(...INK)
  doc.setLineWidth(1)
  doc.line(MARGIN, lineY, PAGE_W - MARGIN, lineY)
  return lineY + 16
}

function drawFooter(doc, page, total) {
  const y = PAGE_H - MARGIN + 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text(`Página ${page} de ${total}`, PAGE_W - MARGIN, y, { align: 'right' })
}

function drawRow(doc, it, size, y) {
  doc.setFillColor(...PHOTO_BG)
  doc.roundedRect(MARGIN, y, PHOTO_W, PHOTO_H, 4, 4, 'F')
  if (it.image && size) {
    const scale = Math.min(PHOTO_W / size.w, PHOTO_H / size.h)
    const dw = size.w * scale
    const dh = size.h * scale
    try {
      doc.addImage(it.image, 'JPEG', MARGIN + (PHOTO_W - dw) / 2, y + (PHOTO_H - dh) / 2, dw, dh)
    } catch (e) { /* imagen no válida */ }
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text('Sin foto', MARGIN + PHOTO_W / 2, y + PHOTO_H / 2, { align: 'center' })
  }

  const tx = MARGIN + PHOTO_W + 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text(it.referencia || '', tx, y + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...GRAY)
  const l1 = [it.tipo, it.tela].filter(Boolean).join(' · ')
  if (l1) doc.text(l1, tx, y + 28)

  doc.setTextColor(...INK)
  const l2 = [it.etapa && `Etapa: ${it.etapa}`, it.medicion && `Medición: ${it.medicion}`]
    .filter(Boolean).join('   ·   ')
  if (l2) doc.text(l2, tx, y + 44)
  if (it.comentario) {
    doc.setTextColor(...GRAY)
    doc.text(`Nota: ${it.comentario}`.slice(0, 90), tx, y + 58)
  }

  if (it.costo) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...GREEN)
    doc.text(it.costo, PAGE_W - MARGIN, y + 14, { align: 'right' })
  }
}

export async function generateResumenPDF(items, subtitulo) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sizes = await Promise.all(
    items.map((it) => (it.image ? loadImageSize(it.image) : Promise.resolve(null))),
  )
  let y = drawHeader(doc, subtitulo)
  items.forEach((it, i) => {
    if (y + ROW_H > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN }
    drawRow(doc, it, sizes[i], y)
    y += ROW_H
    doc.setDrawColor(...HAIRLINE)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, y - 6, PAGE_W - MARGIN, y - 6)
  })
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) { doc.setPage(p); drawFooter(doc, p, total) }
  doc.save('resumen-referencias.pdf')
}
