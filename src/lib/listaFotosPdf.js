import { jsPDF } from 'jspdf'
import { formatDate } from './constants.js'

// Lista de prendas que hay que sacar para la sesión de fotos. Junta lo
// seleccionado en Pendientes y en Por programar, con su foto, su referencia y
// la etapa en la que va, para que el equipo sepa dónde buscarla.

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 42

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const ACCENT = [44, 90, 140]      // taller que tiene la prenda
const MAQUILA = [166, 92, 21]     // distintivo de maquila
const HAIRLINE = [216, 214, 207]
const BAND = [244, 242, 237]
const PHOTO_BG = [238, 236, 232]

const ROW_H = 62
const PHOTO_W = 40
const PHOTO_H = 50

const COL_REF = MARGIN + 56
const COL_ETAPA = MARGIN + 190
const COL_PROD = MARGIN + 320

function loadImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawHeader(doc, total, fechaStr, maquilas) {
  const x = MARGIN
  let y = MARGIN
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...INK)
  doc.text('Prendas para sesión de fotos', x, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text(fechaStr, PAGE_W - MARGIN, y + 4, { align: 'right' })
  y += 17
  doc.setFontSize(10.5)
  const resumen = `${total} ${total === 1 ? 'referencia' : 'referencias'} · Geodésica`
    + (maquilas > 0 ? `  ·  ${maquilas} en maquila` : '')
  doc.text(resumen, x, y)
  y += 10
  doc.setDrawColor(...INK)
  doc.setLineWidth(1.4)
  doc.line(x, y, PAGE_W - MARGIN, y)
  return y + 16
}

function drawColumnHeader(doc, y) {
  const x = MARGIN
  doc.setFillColor(...BAND)
  doc.rect(x, y - 12, PAGE_W - MARGIN * 2, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...GRAY)
  doc.text('FOTO', x + 2, y + 2)
  doc.text('REFERENCIA', COL_REF, y + 2)
  doc.text('ETAPA · TALLER', COL_ETAPA, y + 2)
  doc.text('PRODUCTO', COL_PROD, y + 2)
  doc.text('✓', PAGE_W - MARGIN - 10, y + 2, { align: 'right' })
  return y + 8
}

async function drawRow(doc, item, y) {
  const x = MARGIN
  // Foto
  let dibujada = false
  if (item.image) {
    try {
      const size = await loadImageSize(item.image)
      if (size) {
        const escala = Math.min(PHOTO_W / size.w, PHOTO_H / size.h)
        const w = size.w * escala
        const h = size.h * escala
        doc.setFillColor(...PHOTO_BG)
        doc.rect(x, y, PHOTO_W, PHOTO_H, 'F')
        doc.addImage(item.image, 'JPEG', x + (PHOTO_W - w) / 2, y + (PHOTO_H - h) / 2, w, h)
        dibujada = true
      }
    } catch (e) { /* si la imagen falla, se deja el recuadro vacío */ }
  }
  if (!dibujada) {
    doc.setFillColor(...PHOTO_BG)
    doc.rect(x, y, PHOTO_W, PHOTO_H, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text('—', x + PHOTO_W / 2, y + PHOTO_H / 2 + 3, { align: 'center' })
  }

  const cy = y + PHOTO_H / 2 + 3
  // Referencia, con el distintivo de maquila debajo si aplica
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(...INK)
  doc.text(item.referencia || '—', COL_REF, item.maquila ? cy - 6 : cy)
  if (item.maquila) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...MAQUILA)
    doc.text('MAQUILA', COL_REF, cy + 8)
  }

  // Etapa actual y, si está en talleres, cuál lo tiene
  const conTaller = !!item.taller
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text(item.etapa || '—', COL_ETAPA, conTaller ? cy - 6 : cy)
  if (conTaller) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...ACCENT)
    doc.text(doc.splitTextToSize(item.taller, COL_PROD - COL_ETAPA - 12)[0], COL_ETAPA, cy + 9)
  }

  // Producto
  doc.setTextColor(...GRAY)
  doc.setFontSize(9.5)
  const prod = doc.splitTextToSize(item.producto || '', PAGE_W - MARGIN - 34 - COL_PROD)
  doc.text(prod.slice(0, 2), COL_PROD, prod.length > 1 ? cy - 5 : cy)

  // Casilla para marcar cuando ya la sacaron
  doc.setDrawColor(...GRAY)
  doc.setLineWidth(0.8)
  doc.rect(PAGE_W - MARGIN - 20, y + PHOTO_H / 2 - 7, 14, 14)

  // Separador
  doc.setDrawColor(...HAIRLINE)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y + ROW_H - 6, PAGE_W - MARGIN, y + ROW_H - 6)
}

// items: [{ referencia, etapa, producto, image }]
export async function generateListaFotosPDF(items) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fecha = formatDate(new Date().toISOString().slice(0, 10)) || ''
  const maquilas = items.filter((i) => i.maquila).length
  let y = drawHeader(doc, items.length, fecha, maquilas)
  y = drawColumnHeader(doc, y) + 8

  for (const item of items) {
    if (y + ROW_H > PAGE_H - MARGIN - 20) {
      doc.addPage()
      y = MARGIN
      y = drawColumnHeader(doc, y + 12) + 8
    }
    // eslint-disable-next-line no-await-in-loop
    await drawRow(doc, item, y)
    y += ROW_H
  }

  // Pie con numeración
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('MG MODA S.A.S · Sesión de fotos', MARGIN, PAGE_H - 24)
    doc.text(`${p} / ${paginas}`, PAGE_W - MARGIN, PAGE_H - 24, { align: 'right' })
  }

  doc.save(`Prendas_para_fotos_${new Date().toISOString().slice(0, 10)}.pdf`)
}
