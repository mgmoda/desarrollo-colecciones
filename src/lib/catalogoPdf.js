import { jsPDF } from 'jspdf'

// PDF guía de maquetación del catálogo: horizontal, un pliego por hoja,
// con página de índice al inicio. Pensado para entregarle a la diseñadora
// exactamente el orden, los códigos nuevos, las refs actuales y los colores.

const PAGE_W = 841.89   // A4 landscape
const PAGE_H = 595.28
const MARGIN = 36

const INK = [26, 26, 31]
const GRAY = [128, 128, 136]
const ACCENT = [166, 124, 82]      // champagne (mundo Fotos)
const ACCENT_DEEP = [125, 90, 58]
const HAIRLINE = [216, 214, 207]
const PHOTO_BG = [246, 243, 236]

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return [200, 200, 200]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function loadImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Dibuja una imagen contenida (object-fit: contain) dentro de un rect.
async function drawContained(doc, src, x, y, w, h) {
  doc.setFillColor(...PHOTO_BG)
  doc.rect(x, y, w, h, 'F')
  if (!src) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text('Sin foto', x + w / 2, y + h / 2, { align: 'center' })
    return
  }
  try {
    const size = await loadImageSize(src)
    if (!size) return
    const ratio = size.w / size.h
    let dw = w, dh = h
    if (ratio > w / h) { dh = w / ratio } else { dw = h * ratio }
    doc.addImage(src, 'JPEG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  } catch (e) { /* imagen inválida: dejar el fondo */ }
}

function drawHeader(doc, left, right) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...INK)
  doc.text(left, MARGIN, MARGIN + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(right, PAGE_W - MARGIN, MARGIN + 4, { align: 'right' })
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(1.5)
  doc.line(MARGIN, MARGIN + 12, PAGE_W - MARGIN, MARGIN + 12)
  return MARGIN + 30
}

function trunc(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── Índice ──
function drawIndex(doc, marca, entries, fechaStr) {
  const cols = [
    { label: 'Nº NUEVO', x: MARGIN, align: 'left' },
    { label: 'PÁG', x: MARGIN + 70, align: 'left' },
    { label: 'REF ACTUAL', x: MARGIN + 110, align: 'left' },
    { label: 'TIPO', x: MARGIN + 255, align: 'left' },
    { label: 'ARCHIVO FOTO 1', x: MARGIN + 330, align: 'left' },
    { label: 'COLORES', x: MARGIN + 520, align: 'left' },
    { label: 'FOTOS', x: PAGE_W - MARGIN, align: 'right' },
  ]
  let y = drawHeader(doc, `Catálogo ${marca} · Índice de maquetación`, fechaStr)

  function colHeads() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    cols.forEach((c) => doc.text(c.label, c.x, y, { align: c.align }))
    y += 6
    doc.setDrawColor(...HAIRLINE)
    doc.setLineWidth(0.4)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 12
  }
  colHeads()

  entries.forEach((e) => {
    if (y > PAGE_H - MARGIN - 10) {
      doc.addPage()
      y = drawHeader(doc, `Catálogo ${marca} · Índice (cont.)`, fechaStr)
      colHeads()
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...ACCENT_DEEP)
    doc.text(String(e.codigo), MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    doc.text(String(e.pagina), MARGIN + 70, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text(trunc(e.refActual, 24), MARGIN + 110, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(trunc(e.tipo, 12), MARGIN + 255, y)
    // Archivo de la foto 1 (los nombres completos van en cada pliego)
    const arch1 = (e.fotos && e.fotos[0] && e.fotos[0].name) || ''
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...(arch1 ? INK : GRAY))
    doc.text(arch1 ? trunc(arch1, 32) : '—', MARGIN + 330, y)
    // Colores: puntos + nombres
    doc.setFontSize(9)
    doc.setTextColor(...GRAY)
    let cx = MARGIN + 520
    if (e.colores.length === 0) {
      doc.text('—', cx, y)
    } else {
      e.colores.slice(0, 3).forEach((c) => {
        doc.setFillColor(...hexToRgb(c.hex))
        doc.circle(cx + 3, y - 2.6, 3, 'F')
        doc.setDrawColor(150, 150, 150)
        doc.setLineWidth(0.2)
        doc.circle(cx + 3, y - 2.6, 3, 'S')
        doc.setTextColor(...INK)
        doc.setFontSize(8.5)
        doc.text(c.name || '', cx + 9, y)
        cx += 9 + doc.getTextWidth(c.name || '') + 10
      })
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const nFotos = (e.fotos || []).length
    doc.setTextColor(...(nFotos ? ACCENT_DEEP : GRAY))
    doc.text(nFotos ? String(nFotos) : '—', PAGE_W - MARGIN, y, { align: 'right' })
    y += 16
  })
}

// ── Media página de un pliego ──
async function drawHalf(doc, e, x0, halfW, yTop) {
  const PHOTO_W = 175
  const PHOTO_H = 250

  await drawContained(doc, e.image, x0 + 8, yTop, PHOTO_W, PHOTO_H)

  // Badge de posición sobre la foto
  doc.setFillColor(...INK)
  doc.circle(x0 + 22, yTop + 14, 11, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(String(e.pagina), x0 + 22, yTop + 17, { align: 'center' })

  // Columna de texto
  const tx = x0 + 8 + PHOTO_W + 16
  let ty = yTop + 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('Nº NUEVO', tx, ty)
  ty += 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...ACCENT_DEEP)
  doc.text(String(e.codigo), tx, ty)
  ty += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('REF ACTUAL', tx, ty)
  ty += 13
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(e.refActual, tx, ty, { maxWidth: halfW - (tx - x0) - 8 })
  ty += 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text((e.tipo + (e.marca ? ' · ' + e.marca : '')).toUpperCase(), tx, ty)
  ty += 18

  // Archivos de las fotos: nombre COMPLETO de cada una (envuelto en varias
  // líneas si es largo) para que la diseñadora los ubique en la carpeta.
  const fotos = e.fotos || []
  if (fotos.length) {
    const nameW = halfW - (tx - x0) - 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(fotos.length === 1 ? 'ARCHIVO FOTO' : 'ARCHIVOS FOTOS', tx, ty)
    ty += 12
    fotos.forEach((f, fi) => {
      const name = f.name || '(sin nombre)'
      doc.setFont('courier', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(...ACCENT_DEEP)
      doc.text(String(fi + 1), tx, ty)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(name, nameW - 12)
      doc.text(lines, tx + 12, ty)
      ty += lines.length * 10 + 4
    })
    ty += 4
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  doc.text('COLORES', tx, ty)
  ty += 13
  if (e.colores.length === 0) {
    doc.setTextColor(...GRAY)
    doc.setFontSize(9)
    doc.text('—', tx, ty)
    ty += 14
  } else {
    e.colores.forEach((c) => {
      doc.setFillColor(...hexToRgb(c.hex))
      doc.circle(tx + 4, ty - 3, 3.6, 'F')
      doc.setDrawColor(150, 150, 150)
      doc.setLineWidth(0.2)
      doc.circle(tx + 4, ty - 3, 3.6, 'S')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(...INK)
      doc.text(c.name || '', tx + 12, ty)
      ty += 14
    })
  }

  // Miniaturas de las fotos 2 y 3 (la 1 es la imagen principal de la página).
  const extras = fotos.slice(1)
  if (extras.length) {
    ty += 4
    let ex = tx
    for (let i = 0; i < extras.length; i++) {
      await drawContained(doc, extras[i].src, ex, ty, 54, 72)
      doc.setDrawColor(...ACCENT)
      doc.setLineWidth(0.6)
      doc.rect(ex, ty, 54, 72, 'S')
      doc.setFillColor(...ACCENT_DEEP)
      doc.circle(ex + 8, ty + 8, 6, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(255, 255, 255)
      doc.text(String(i + 2), ex + 8, ty + 10.5, { align: 'center' })
      ex += 62
    }
  }
}

// entries: [{ codigo, pagina, refActual, tipo, marca, colores:[{name,hex}],
//             image, fotos: [{src, name}] }]
export async function generateCatalogoPDF({ marca, entries }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const fechaStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })

  // 1) Índice
  drawIndex(doc, marca, entries, fechaStr)

  // 2) Un pliego por hoja
  const halfW = (PAGE_W - 2 * MARGIN) / 2
  for (let i = 0; i < entries.length; i += 2) {
    const izq = entries[i]
    const der = i + 1 < entries.length ? entries[i + 1] : null
    doc.addPage()
    const pliego = Math.floor(i / 2) + 1
    const pags = der ? `págs. ${izq.pagina}–${der.pagina}` : `pág. ${izq.pagina}`
    const yTop = drawHeader(doc, `Catálogo ${marca} · Pliego ${pliego} (${pags})`, fechaStr)

    // Línea del lomo al centro
    doc.setDrawColor(...HAIRLINE)
    doc.setLineWidth(0.8)
    doc.line(PAGE_W / 2, yTop, PAGE_W / 2, PAGE_H - MARGIN - 16)

    await drawHalf(doc, izq, MARGIN, halfW, yTop + 6)
    if (der) {
      await drawHalf(doc, der, MARGIN + halfW + 8, halfW, yTop + 6)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...GRAY)
      doc.text('página libre', MARGIN + halfW + halfW / 2, PAGE_H / 2, { align: 'center' })
    }

    // Números de página en las esquinas exteriores
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY)
    doc.text(`pág. ${izq.pagina}`, MARGIN, PAGE_H - MARGIN + 6)
    if (der) doc.text(`pág. ${der.pagina}`, PAGE_W - MARGIN, PAGE_H - MARGIN + 6, { align: 'right' })
  }

  const slug = (marca || 'catalogo').toLowerCase().replace(/\s+/g, '-')
  doc.save(`catalogo-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
