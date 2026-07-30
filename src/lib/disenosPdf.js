import { jsPDF } from 'jspdf'

// Resumen de los diseños de Geodésica: en qué etapa va cada uno y cuánto
// lleva. Mismo formato que los resúmenes de las etapas de producción.

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const ROW_H = 78
const PHOTO_W = 50
const PHOTO_H = 64

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const RED = [178, 49, 33]
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
  doc.text('GEODÉSICA · RESUMEN', MARGIN, top + 4, { charSpace: 1.2 })

  doc.setTextColor(...INK)
  doc.setFont('times', 'normal')
  doc.setFontSize(22)
  doc.text('Resumen de diseños', MARGIN, top + 28)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(
    new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
    PAGE_W - MARGIN, top + 4, { align: 'right' },
  )
  if (subtitulo) doc.text(subtitulo, PAGE_W - MARGIN, top + 22, { align: 'right' })

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
    const escala = Math.min(PHOTO_W / size.w, PHOTO_H / size.h)
    const dw = size.w * escala
    const dh = size.h * escala
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
  doc.text(it.codigo || '', tx, y + 13)

  if (it.codigoCliente) {
    const ancho = doc.getTextWidth(it.codigo || '')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(15, 110, 86)
    doc.text(it.codigoCliente, tx + ancho + 10, y + 13)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...GRAY)
  const sub = [it.nombre, it.tipo].filter(Boolean).join(' · ')
  if (sub) doc.text(sub, tx, y + 28)

  doc.setFontSize(9.5)
  doc.setTextColor(...INK)
  doc.text(`Etapa: ${it.etapa || '—'}`, tx, y + 44)
  doc.setTextColor(...GRAY)
  const pie = [
    it.recibido ? `Recibido: ${it.recibido}` : '',
    it.rondas ? `${it.rondas} ${it.rondas === 1 ? 'ronda' : 'rondas'}` : '',
  ].filter(Boolean).join('   ·   ')
  if (pie) doc.text(pie, tx, y + 58)

  // Días en la etapa, que es lo que hay que vigilar.
  if (it.dias != null) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...(it.dias >= 7 ? RED : INK))
    doc.text(`${it.dias} ${it.dias === 1 ? 'día' : 'días'}`, PAGE_W - MARGIN, y + 16, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('en esta etapa', PAGE_W - MARGIN, y + 30, { align: 'right' })
  }
  if (it.diasTotal != null) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text(`${it.diasTotal} d de ciclo`, PAGE_W - MARGIN, y + 48, { align: 'right' })
  }
}

export async function generateDisenosPDF(items, subtitulo) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sizes = await Promise.all(
    items.map((it) => (it.image ? loadImageSize(it.image) : Promise.resolve(null))),
  )

  let y = drawHeader(doc, subtitulo)

  items.forEach((it, i) => {
    if (y + ROW_H > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
    drawRow(doc, it, sizes[i], y)
    y += ROW_H
    doc.setDrawColor(...HAIRLINE)
    doc.setLineWidth(0.6)
    doc.line(MARGIN, y - 6, PAGE_W - MARGIN, y - 6)
  })

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    drawFooter(doc, p, total)
  }

  doc.save('resumen-de-disenos.pdf')
}
