import { jsPDF } from 'jspdf'
import { AREAS } from './constants.js'

// Título del reporte de cada área. No es solo de atrasos: es el resumen de lo
// que hay en la etapa.
const TITULOS = {
  trazos: 'Resumen de trazos',
  corte: 'Resumen de corte',
  enviar: 'Resumen de por enviar',
  talleres: 'Resumen de talleres',
  entrega: 'Resumen de entrega de ensamble',
}

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

function drawHeader(doc, areaLabel, titulo) {
  const top = MARGIN
  doc.setTextColor(...GRAY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(`${(areaLabel || '').toUpperCase()} · RESUMEN`, MARGIN, top + 4, { charSpace: 1.2 })

  doc.setTextColor(...INK)
  doc.setFont('times', 'normal')
  doc.setFontSize(22)
  doc.text(titulo, MARGIN, top + 28)

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

function drawRow(doc, item, size, y) {
  // Foto
  doc.setFillColor(...PHOTO_BG)
  doc.roundedRect(MARGIN, y, PHOTO_W, PHOTO_H, 4, 4, 'F')
  if (item.image && size) {
    const scale = Math.min(PHOTO_W / size.w, PHOTO_H / size.h)
    const dw = size.w * scale
    const dh = size.h * scale
    try {
      doc.addImage(item.image, 'JPEG', MARGIN + (PHOTO_W - dw) / 2, y + (PHOTO_H - dh) / 2, dw, dh)
    } catch (e) { /* imagen no válida */ }
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text('Sin foto', MARGIN + PHOTO_W / 2, y + PHOTO_H / 2, { align: 'center' })
  }

  const tx = MARGIN + PHOTO_W + 16
  // Referencia
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text(item.referencia || '', tx, y + 13)

  // Producto · Empresa
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...GRAY)
  const sub = [item.producto, item.empresa].filter(Boolean).join(' · ')
  if (sub) doc.text(sub, tx, y + 28)

  // Fecha base + pendiente
  doc.setFontSize(9.5)
  doc.setTextColor(...INK)
  doc.text(`${item.baseLabel || 'Fecha'}: ${item.fecha || '—'}`, tx, y + 44)
  if (item.pendienteLabel) {
    doc.setTextColor(...GRAY)
    doc.text(`Pendiente: ${item.pendienteLabel}`, tx, y + 58)
  }

  // Atraso (destacado a la derecha)
  if (item.atraso != null) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...(item.atraso >= 15 ? RED : INK))
    doc.text(`${item.atraso} días`, PAGE_W - MARGIN, y + 16, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('de atraso', PAGE_W - MARGIN, y + 30, { align: 'right' })
  }
}

export async function generateAreaPDF(areaKey, items) {
  const areaLabel = (AREAS[areaKey] || {}).label || areaKey || ''
  const titulo = TITULOS[areaKey] || `Resumen de ${areaLabel.toLowerCase()}`
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const sizes = await Promise.all(
    items.map((it) => (it.image ? loadImageSize(it.image) : Promise.resolve(null))),
  )

  let y = drawHeader(doc, areaLabel, titulo)

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

  const fname = `${titulo.toLowerCase().replace(/\s+/g, '-')}.pdf`
  doc.save(fname)
}
