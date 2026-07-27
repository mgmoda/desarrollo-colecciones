import { jsPDF } from 'jspdf'
import { MARCA_LOGOS } from './marcaLogos.js'

// Lista de precios por marca, al estilo del listado impreso de MG Moda:
// tipografía serif, cabecera con el nombre de la marca y franja crema en los
// encabezados de columna. Precios en pesos con punto de miles ("$ 158.900").

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 57

// Tema por marca. Casania (y las demás) en café/crema; Mariset en negro/gris,
// para diferenciarlas de un vistazo.
const THEME_CAFE = {
  ink: [20, 18, 16], accent: [74, 59, 42], band: [239, 228, 212],
  grid: [204, 183, 159], outer: [184, 157, 122], muted: [161, 144, 122], none: [201, 191, 168],
  fallback: [42, 33, 24],
}
const THEME_NEGRO = {
  ink: [17, 17, 17], accent: [17, 17, 17], band: [235, 235, 235],
  grid: [199, 199, 199], outer: [110, 110, 110], muted: [110, 110, 110], none: [188, 188, 188],
  fallback: [17, 17, 17],
}
const THEMES = { Mariset: THEME_NEGRO }
const themeDe = (marca) => THEMES[marca] || THEME_CAFE
let TH = THEME_CAFE

const ROW_H = 18
const HEAD_BAND_H = 20
const CONTENT_W = PAGE_W - MARGIN * 2

const REF_W = 56   // ancho de la columna REF
const PAD = 8

// Columnas de precio: Colombia lleva Talla 6-18 y Talla 20; Ecuador una sola.
const COLS_COLOMBIA = [
  { key: 't618', label: 'TALLA 6-18', width: 90 },
  { key: 't20', label: 'TALLA 20', width: 91 },
]
const COLS_ECUADOR = [
  { key: 'precio', label: 'PRECIO', width: 130 },
]
// Calcula posiciones a partir de las columnas de precio (a la derecha).
function computarLayout(priceCols) {
  const total = priceCols.reduce((a, c) => a + c.width, 0)
  const descEnd = CONTENT_W - total
  let x = descEnd
  const cols = priceCols.map((c) => { const start = x; x += c.width; return { ...c, x: start } })
  return { descEnd, cols, descMax: descEnd - REF_W - PAD * 2 }
}
let L = computarLayout(COLS_COLOMBIA)  // layout activo (se fija por documento)
let SUB = null                          // subtítulo (si null, el de colección)

const pesos = (n) => (Number(n) > 0 ? '$ ' + Math.round(Number(n)).toLocaleString('es-CO') : '')

function ellipsis(doc, text, maxW) {
  if (doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

// Monograma "MG": cuadro oscuro redondeado con las iniciales en serif.
function drawHeader(doc, marca, coleccion) {
  let y = MARGIN + 14
  const logo = MARCA_LOGOS[marca]
  if (logo) {
    // Encajar el logo dentro de un alto y un ancho máximos, manteniendo
    // la proporción (los wordmarks anchos no se desbordan).
    const maxH = 46
    const maxW = 300
    let hLogo = maxH
    let wLogo = hLogo * (logo.w / logo.h)
    if (wLogo > maxW) { wLogo = maxW; hLogo = wLogo * (logo.h / logo.w) }
    doc.addImage(logo.dataUri, 'PNG', (PAGE_W - wLogo) / 2, y, wLogo, hLogo)
    y += hLogo + 16
  } else {
    doc.setFont('times', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(...TH.fallback)
    doc.text(marca.toUpperCase(), PAGE_W / 2, y + 26, { align: 'center' })
    y += 44
  }
  doc.setFont('times', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...TH.muted)
  doc.text(SUB || `LISTADO DE PRECIOS · COLECCIÓN ${coleccion}`, PAGE_W / 2, y, { align: 'center' })
  return y + 18
}

// Franja crema con los títulos de columna. Devuelve la Y de la primera fila.
function drawColumnBand(doc, y) {
  const x = MARGIN
  doc.setFillColor(...TH.band)
  doc.rect(x, y, CONTENT_W, HEAD_BAND_H, 'F')
  doc.setFont('times', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TH.accent)
  const ty = y + 13
  doc.text('REF', x + PAD, ty)
  doc.text('DESCRIPCIÓN', x + REF_W + PAD, ty)
  L.cols.forEach((c) => doc.text(c.label, x + c.x + PAD, ty))
  return y + HEAD_BAND_H
}

// Cuadrícula tipo Excel: franja inferior, divisores verticales y borde exterior,
// desde la parte alta de la franja hasta el fondo de la última fila.
function drawFrame(doc, tableTop, yBottom) {
  doc.setDrawColor(...TH.grid)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, tableTop + HEAD_BAND_H, MARGIN + CONTENT_W, tableTop + HEAD_BAND_H)
  ;[REF_W, ...L.cols.map((c) => c.x)].forEach((bx) => doc.line(MARGIN + bx, tableTop, MARGIN + bx, yBottom))
  doc.setDrawColor(...TH.outer)
  doc.setLineWidth(0.8)
  doc.rect(MARGIN, tableTop, CONTENT_W, yBottom - tableTop)
}

function drawFooter(doc, pageNum) {
  doc.setDrawColor(...TH.accent)
  doc.setLineWidth(1)
  doc.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46)
  doc.setFont('times', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TH.muted)
  doc.text('MG MODA S.A.S · PRECIOS PARA DISTRIBUIDORES AUTORIZADOS', PAGE_W / 2, PAGE_H - 34, { align: 'center' })
  doc.text(String(pageNum), PAGE_W - MARGIN, PAGE_H - 34, { align: 'right' })
}

// Dibuja una marca (una o varias páginas). Devuelve el número de la última página.
function drawMarca(doc, marca, rows, coleccion, pageNum) {
  TH = themeDe(marca)
  const x = MARGIN
  let y = drawHeader(doc, marca, coleccion)
  let tableTop = y
  y = drawColumnBand(doc, y)
  const bottomLimit = PAGE_H - 60

  rows.forEach((r) => {
    if (y + ROW_H > bottomLimit) {
      drawFrame(doc, tableTop, y)
      drawFooter(doc, pageNum)
      doc.addPage()
      pageNum += 1
      y = MARGIN
      // Cabecera compacta en páginas siguientes
      const logo2 = MARCA_LOGOS[marca]
      if (logo2) {
        let hL = 17
        let wL = hL * (logo2.w / logo2.h)
        if (wL > 150) { wL = 150; hL = wL * (logo2.h / logo2.w) }
        doc.addImage(logo2.dataUri, 'PNG', x, y - hL / 2 + 5, wL, hL)
      } else {
        doc.setFont('times', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(...TH.fallback)
        doc.text(marca.toUpperCase(), x, y + 4)
      }
      doc.setFont('times', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...TH.muted)
      doc.text(SUB || `LISTADO DE PRECIOS · ${coleccion}`, PAGE_W - MARGIN, y + 4, { align: 'right' })
      y += 16
      tableTop = y
      y = drawColumnBand(doc, y)
    }
    const ty = y + 12
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    // REF
    doc.setTextColor(...TH.accent)
    doc.text(r.ref || '—', x + PAD, ty)
    // DESCRIPCIÓN
    doc.setTextColor(...TH.ink)
    doc.text(ellipsis(doc, (r.desc || '').toUpperCase(), L.descMax), x + REF_W + PAD, ty)
    // PRECIOS (una o varias columnas según el layout)
    L.cols.forEach((c) => {
      const val = pesos(r[c.key])
      if (val) { doc.setTextColor(...TH.ink); doc.text(val, x + c.x + PAD, ty) }
      else { doc.setTextColor(...TH.none); doc.text('—', x + c.x + PAD, ty) }
    })
    // línea horizontal de fila (cuadrícula)
    doc.setDrawColor(...TH.grid)
    doc.setLineWidth(0.5)
    doc.line(x, y + ROW_H, MARGIN + CONTENT_W, y + ROW_H)
    y += ROW_H
  })
  drawFrame(doc, tableTop, y)
  drawFooter(doc, pageNum)
  return pageNum
}

// Construye el documento (sin descargar). sections: [{ marca, rows }].
export function buildListaPreciosDoc(sections, { coleccion = '2026-2', priceCols = COLS_COLOMBIA, subtitulo = null } = {}) {
  L = computarLayout(priceCols)
  SUB = subtitulo
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

// Precio de Ecuador: descuento sobre el precio base (Talla 6-18), cerrado al
// MIL más cercano (155.718 → 156.000; 184.418 → 184.000). Lo usan por igual
// el PDF y el Excel, para que nunca den cifras distintas.
export const DESCUENTO_ECUADOR = 0.18
export function precioEcuador(base, descuento = DESCUENTO_ECUADOR) {
  const con = (Number(base) || 0) * (1 - descuento)
  return con > 0 ? Math.round(con / 1000) * 1000 : 0
}

// Lista de Ecuador: una sola columna PRECIO. sections: [{ marca, rows con t618 }].
export function generateListaEcuadorPDF(sections, { descuento = DESCUENTO_ECUADOR, coleccion = '2026-2' } = {}) {
  const secs = sections.map((s) => ({
    marca: s.marca,
    rows: s.rows.map((r) => ({
      ref: r.ref,
      desc: r.desc,
      precio: precioEcuador(r.t618, descuento),
    })),
  }))
  const doc = buildListaPreciosDoc(secs, {
    coleccion,
    priceCols: COLS_ECUADOR,
    subtitulo: `LISTA ECUADOR · COLECCIÓN ${coleccion}`,
  })
  const nombre = secs.length === 1 ? `Lista_Ecuador_${secs[0].marca}.pdf` : 'Lista_Ecuador.pdf'
  doc.save(nombre)
}
