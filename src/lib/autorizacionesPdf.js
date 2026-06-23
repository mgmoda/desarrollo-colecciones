import { jsPDF } from 'jspdf'
import { formatDate } from './constants.js'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const ROW_H = 56
const PHOTO_W = 38
const PHOTO_H = 48

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const RED = [178, 49, 33]
const ACCENT = [44, 90, 140]
const PHOTO_BG = [238, 236, 232]
const HAIRLINE = [216, 214, 207]

const TIPO_LABEL = { muestras: 'MUESTRAS', produccion: 'PRODUCCIÓN' }
const TIPO_COLOR = {
  muestras: [107, 60, 134],
  produccion: [31, 122, 68],
}

function loadImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawHeader(doc, fechaStr) {
  const x = MARGIN
  let y = MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text('Autorizaciones pendientes', x, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text(fechaStr, PAGE_W - MARGIN, y + 4, { align: 'right' })
  y += 18
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(1.5)
  doc.line(x, y, PAGE_W - MARGIN, y)
  return y + 14
}

function drawColumnHeader(doc, y) {
  const x = MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('FOTO', x, y)
  doc.text('REFERENCIA', x + 60, y)
  doc.text('MARCA', x + 180, y)
  doc.text('TIPO', x + 270, y)
  doc.text('AUTORIZADA', x + 350, y)
  doc.text('DÍAS', PAGE_W - MARGIN, y, { align: 'right' })
  doc.setDrawColor(...HAIRLINE)
  doc.setLineWidth(0.5)
  doc.line(x, y + 6, PAGE_W - MARGIN, y + 6)
  return y + 14
}

async function drawRow(doc, item, y) {
  const x = MARGIN

  // Foto
  if (item.image) {
    try {
      const size = await loadImageSize(item.image)
      if (size) {
        const ratio = size.w / size.h
        let w = PHOTO_W, h = PHOTO_H
        if (ratio > w / h) { h = w / ratio } else { w = h * ratio }
        const dx = x + (PHOTO_W - w) / 2
        const dy = y - PHOTO_H + (PHOTO_H - h) / 2 + 4
        doc.setFillColor(...PHOTO_BG)
        doc.rect(x, y - PHOTO_H + 4, PHOTO_W, PHOTO_H, 'F')
        doc.addImage(item.image, 'JPEG', dx, dy, w, h)
      }
    } catch (e) { /* ignorar */ }
  } else {
    doc.setFillColor(...PHOTO_BG)
    doc.rect(x, y - PHOTO_H + 4, PHOTO_W, PHOTO_H, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('—', x + PHOTO_W / 2, y - PHOTO_H / 2 + 6, { align: 'center' })
  }

  // Referencia
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(item.referencia, x + 60, y - 22)

  // Marca
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(item.marca || '—', x + 180, y - 22)

  // Tipo (chip de color)
  const tColor = TIPO_COLOR[item.tipo] || GRAY
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...tColor)
  doc.text(TIPO_LABEL[item.tipo] || '', x + 270, y - 22)

  // Fecha autorizada
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(formatDate(item.fecha) || '—', x + 350, y - 22)

  // Días esperando — en rojo si ≥ 7
  const diasTxt = item.dias == null ? '—' : `${item.dias} d`
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...(item.dias != null && item.dias >= 7 ? RED : INK))
  doc.text(diasTxt, PAGE_W - MARGIN, y - 22, { align: 'right' })

  // Línea inferior
  doc.setDrawColor(...HAIRLINE)
  doc.setLineWidth(0.3)
  doc.line(x, y + 8, PAGE_W - MARGIN, y + 8)
}

// items: [{ referencia, marca, tipo: 'muestras'|'produccion', fecha, dias, image? }]
export async function generateAutorizacionesPDF(items) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fechaStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

  let y = drawHeader(doc, fechaStr)
  y = drawColumnHeader(doc, y) + ROW_H

  for (const it of items) {
    if (y > PAGE_H - MARGIN - 20) {
      doc.addPage()
      y = drawHeader(doc, fechaStr)
      y = drawColumnHeader(doc, y) + ROW_H
    }
    await drawRow(doc, it, y)
    y += ROW_H
  }

  const filename = `autorizaciones-${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
