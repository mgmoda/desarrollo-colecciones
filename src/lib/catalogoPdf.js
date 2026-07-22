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

// Ancho de un texto contando el espaciado entre letras (jsPDF no lo suma).
function textW(doc, s, cs) {
  s = String(s || '')
  return doc.getTextWidth(s) + (cs || 0) * Math.max(0, s.length - 1)
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

// ── Rótulo estilo catálogo impreso ──
// Línea centrada "BLUSA M5087 - PANTALÓN M5088" y, debajo, los colores de
// cada prenda en fila (NOMBRE ●), separados por grupos. Devuelve el y final.
function drawRotulo(doc, prendas, cx, W, y) {
  const parts = (prendas || [])
    .filter((p) => p && (p.tipo || p.code))
    .map((p) => ({ tipo: String(p.tipo || '').toUpperCase(), code: String(p.code || ''), colores: p.colores || [] }))
  if (!parts.length) return y
  const SEP = '  -  '

  // 1) Línea de referencias — se achica sola si no cabe a lo ancho.
  const CS = 0.9
  // Una sola cadena centrada, como en el catálogo impreso. Va en un solo
  // doc.text para que los espacios queden exactos (midiendo tramo por tramo
  // jsPDF descuadra las palabras con tilde).
  const linea = parts.map((p) => `${p.tipo} ${p.code}`).join(SEP)
  doc.setFont('helvetica', 'normal')
  let size = 12.5
  doc.setFontSize(size)
  while (textW(doc, linea, CS) > W && size > 6.5) { size -= 0.5; doc.setFontSize(size) }
  doc.setTextColor(...INK)
  doc.text(linea, cx, y, { align: 'center', charSpace: CS })
  y += 15

  // 2) Fila de colores: NOMBRE ● por color, con más aire entre prendas.
  const grupos = parts.filter((p) => p.colores.length)
  if (!grupos.length) return y
  const CCS = 0.6
  const GAP_COLOR = 11   // entre colores de la misma prenda
  const GAP_GRUPO = 24   // entre prendas
  const medirCols = (s) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(s)
    const r = s * 0.42
    let t = 0
    grupos.forEach((g, gi) => {
      g.colores.forEach((c, ci) => {
        t += textW(doc, String(c.name || '').toUpperCase(), CCS) + 4 + r * 2
        if (ci < g.colores.length - 1) t += GAP_COLOR
      })
      if (gi < grupos.length - 1) t += GAP_GRUPO
    })
    return t
  }
  let cs = 8.5
  let ctotal = medirCols(cs)
  while (ctotal > W && cs > 5.5) { cs -= 0.5; ctotal = medirCols(cs) }
  const r = cs * 0.42
  doc.setFont('helvetica', 'bold'); doc.setFontSize(cs)
  let cxp = cx - ctotal / 2
  grupos.forEach((g, gi) => {
    g.colores.forEach((c, ci) => {
      const nm = String(c.name || '').toUpperCase()
      doc.setTextColor(...INK)
      doc.text(nm, cxp, y, { charSpace: CCS })
      cxp += textW(doc, nm, CCS) + 4
      doc.setFillColor(...hexToRgb(c.hex))
      doc.circle(cxp + r, y - cs * 0.32, r, 'F')
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.25)
      doc.circle(cxp + r, y - cs * 0.32, r, 'S')
      cxp += r * 2
      if (ci < g.colores.length - 1) cxp += GAP_COLOR
    })
    if (gi < grupos.length - 1) cxp += GAP_GRUPO
  })
  return y + 12
}

// ── Media página de un pliego ──
// Estructura de catálogo impreso: las fotos arriba (1, 2 o 3, del mismo alto)
// y debajo, centrado, el rótulo de referencias + colores. Al pie, los nombres
// de archivo para que la diseñadora ubique cada foto en la carpeta.
async function drawHalf(doc, e, x0, halfW, yTop) {
  const PAD = 10
  const X = x0 + PAD
  const W = halfW - PAD * 2
  const cx = X + W / 2
  const BOTTOM = PAGE_H - MARGIN - 16
  let y = yTop

  // Encabezado del lado: Nº nuevo (lo que la diseñadora rotula)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...GRAY)
  doc.text('Nº NUEVO', X, y + 8, { charSpace: 0.8 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...ACCENT_DEEP)
  doc.text(String(e.codigo), X + 52, y + 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...GRAY)
  if (e.marca) doc.text(e.marca, X + W, y + 8, { align: 'right' })
  y += 22

  // Fotos de la sesión (o el boceto de la ficha si aún no hay ninguna),
  // todas del mismo alto y repartidas a lo ancho.
  const fotos = e.fotos || []
  const imgs = fotos.length ? fotos.map((f) => f.src) : [e.image]
  const n = imgs.length
  const GAP = 8
  // Alto fijo para todas las páginas: así los rótulos quedan a la misma
  // altura en las dos mitades del pliego, como en el catálogo impreso.
  const boxH = 290
  const boxW = Math.min(boxH * 0.72, (W - GAP * (n - 1)) / n)
  const rowW = boxW * n + GAP * (n - 1)
  let px = cx - rowW / 2
  for (let i = 0; i < n; i++) {
    await drawContained(doc, imgs[i], px, y, boxW, boxH)
    if (fotos.length > 1) {
      doc.setFillColor(...INK)
      doc.circle(px + 10, y + 10, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(255, 255, 255)
      doc.text(String(i + 1), px + 10, y + 12.5, { align: 'center' })
    }
    const f = fotos[i]
    if (f && (f.rol === 'detalle' || f.refCode)) {
      const tag = f.rol === 'detalle' ? 'DETALLE' : f.refCode
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      const tw = doc.getTextWidth(tag) + 10
      doc.setFillColor(...(f.rol === 'detalle' ? ACCENT_DEEP : INK))
      doc.roundedRect(px + boxW - tw - 6, y + boxH - 16, tw, 11, 3, 3, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(tag, px + boxW - tw / 2 - 6, y + boxH - 8.5, { align: 'center' })
    }
    px += boxW + GAP
  }
  y += boxH + 22

  // Rótulo: referencias en una línea + colores debajo
  y = drawRotulo(doc, e.prendas && e.prendas.length ? e.prendas
    : [{ tipo: e.tipo, code: e.refActual, colores: e.colores || [] }], cx, W, y)

  // Archivos de las fotos, al pie: nombre COMPLETO de cada una para que la
  // diseñadora la ubique en la carpeta. Compacto, para no competir con el rótulo.
  if (fotos.length) {
    y = Math.max(y + 10, BOTTOM - 14 - fotos.length * 13)
    doc.setDrawColor(...HAIRLINE)
    doc.setLineWidth(0.4)
    doc.line(X, y - 8, X + W, y - 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(...GRAY)
    doc.text(fotos.length === 1 ? 'ARCHIVO DE LA FOTO' : 'ARCHIVOS DE LAS FOTOS', X, y, { charSpace: 0.7 })
    y += 10
    fotos.forEach((f, fi) => {
      doc.setFont('courier', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(...ACCENT_DEEP)
      doc.text(String(fi + 1), X, y)
      doc.setTextColor(...INK)
      // Sin flechas ni símbolos fuera de WinAnsi: jsPDF no los tiene en sus
      // fuentes base y rompe el renglón entero.
      const suf = f.rol === 'detalle' ? '   (detalle)'
        : f.refCode ? `   (${f.refCode})` : ''
      const lines = doc.splitTextToSize((f.name || '(sin nombre)') + suf, W - 11)
      doc.text(lines, X + 11, y)
      y += lines.length * 8 + 3
    })
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
