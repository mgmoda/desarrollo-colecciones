import { jsPDF } from 'jspdf'
import { formatPrice } from './constants.js'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42
const ROW_H = 60
const PHOTO_W = 40
const PHOTO_H = 52

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const ORANGE = [179, 95, 21]
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

function drawHeader(doc, fechaStr) {
  const x = MARGIN
  let y = MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...INK)
  doc.text('Geodésica · Precios', x, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text(fechaStr, PAGE_W - MARGIN, y + 4, { align: 'right' })
  y += 18
  doc.setDrawColor(...ORANGE)
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
  doc.text('PRODUCTO', x + 180, y)
  doc.text('CANT', x + 340, y, { align: 'right' })
  doc.text('PRECIO', x + 415, y, { align: 'right' })
  doc.text('SUBTOTAL', PAGE_W - MARGIN, y, { align: 'right' })
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
    } catch (e) { /* ignorar errores de imagen */ }
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
  doc.text(item.referencia, x + 60, y - 24)

  // Producto
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  const productoLines = doc.splitTextToSize(item.producto || '—', 150)
  doc.text(productoLines.slice(0, 2), x + 180, y - 24)

  // Cantidad
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(String(item.cantidad), x + 340, y - 24, { align: 'right' })

  // Precio unitario
  doc.text(formatPrice(item.precio), x + 415, y - 24, { align: 'right' })

  // Subtotal
  doc.setFont('helvetica', 'bold')
  doc.text(formatPrice(item.subtotal), PAGE_W - MARGIN, y - 24, { align: 'right' })

  // Línea inferior
  doc.setDrawColor(...HAIRLINE)
  doc.setLineWidth(0.3)
  doc.line(x, y + 8, PAGE_W - MARGIN, y + 8)
}

function drawTotal(doc, total, y) {
  const x = MARGIN
  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(1)
  doc.line(x, y, PAGE_W - MARGIN, y)
  y += 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  doc.text('TOTAL', PAGE_W - MARGIN - 150, y, { align: 'left' })
  doc.setFontSize(16)
  doc.setTextColor(...ORANGE)
  doc.text(formatPrice(total), PAGE_W - MARGIN, y, { align: 'right' })
}

// items: [{ referencia, producto, cantidad, precio, subtotal, image? }]
export async function generateGeodesicaPDF(items) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fechaStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

  let y = drawHeader(doc, fechaStr)
  y = drawColumnHeader(doc, y) + ROW_H

  let total = 0
  for (const it of items) {
    if (y > PAGE_H - MARGIN - 60) {
      doc.addPage()
      y = drawHeader(doc, fechaStr)
      y = drawColumnHeader(doc, y) + ROW_H
    }
    await drawRow(doc, it, y)
    total += it.subtotal || 0
    y += ROW_H
  }

  if (y > PAGE_H - MARGIN - 60) {
    doc.addPage()
    y = drawHeader(doc, fechaStr)
  }
  drawTotal(doc, total, y - ROW_H + 30)

  const filename = `geodesica-precios-${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)
}
