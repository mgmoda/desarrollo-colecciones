import { jsPDF } from 'jspdf'

// Tarjetas de precio para imprimir y recortar, en hoja CARTA.
// Dos columnas de tarjetas; cada tarjeta es una tablita con REF / DESCRIPCION /
// precio 06-18, con 1 fila (prenda suelta) o 3 filas (conjunto: las dos prendas
// y el conjunto). Debajo de cada tarjeta va la nota de Talla 20.

const PAGE_W = 612   // Carta 8.5"
const PAGE_H = 792   // Carta 11"
const MARGIN_X = 44
const MARGIN_TOP = 46
const MARGIN_BOTTOM = 40

const CARD_W = 250
const GAP_X = 24
const COL_REF = 56
const COL_DESC = 108
const COL_PRICE = CARD_W - COL_REF - COL_DESC   // 86

const HEADER_H = 20
const ROW_H = 30
const NOTA_H = 24
const CARD_GAP_Y = 18

const INK = [0, 0, 0]

const pesos = (n) => (Number(n) > 0 ? Math.round(Number(n)).toLocaleString('es-CO') : '')

const NOTA_TITULO = 'RECARGO TALLA 20'
const NOTA_TEXTO = 'Vestido +$10.000 · Blusa, Short, Falda y Pantalón +$6.000'

// Marcas de corte tenues en las esquinas (fuera de la tarjeta), como guía para
// la guillotina. Grises y finas: si el corte se corre un poco, no se notan.
function drawCropMarks(doc, x, y, w, h) {
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  const len = 6
  const gap = 2
  const x2 = x + w
  const y2 = y + h
  doc.line(x - gap - len, y, x - gap, y)
  doc.line(x, y - gap - len, x, y - gap)
  doc.line(x2 + gap, y, x2 + gap + len, y)
  doc.line(x2, y - gap - len, x2, y - gap)
  doc.line(x - gap - len, y2, x - gap, y2)
  doc.line(x, y2 + gap, x, y2 + gap + len)
  doc.line(x2 + gap, y2, x2 + gap + len, y2)
  doc.line(x2, y2 + gap, x2, y2 + gap + len)
}

function cardHeight(card) {
  return HEADER_H + card.rows.length * ROW_H
}
function blockHeight(card) {
  return cardHeight(card) + NOTA_H + CARD_GAP_Y
}

// Descripción centrada en su celda, hasta 2 líneas.
function drawDesc(doc, texto, cx, cyCenter, maxW) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  const lines = doc.splitTextToSize((texto || '').toUpperCase(), maxW)
  const use = lines.slice(0, 2)
  if (lines.length > 2) use[1] = use[1].replace(/\s+\S*$/, '') + '…'
  const lh = 9
  const startY = cyCenter - ((use.length - 1) * lh) / 2 + 2.5
  use.forEach((ln, i) => doc.text(ln, cx, startY + i * lh, { align: 'center' }))
}

function drawCard(doc, card, x, y) {
  const h = cardHeight(card)
  // Cabecera
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text('REF', x + COL_REF / 2, y + 13.5, { align: 'center' })
  doc.text('DESCRIPCION', x + COL_REF + COL_DESC / 2, y + 13.5, { align: 'center' })
  doc.text('06 - 18', x + COL_REF + COL_DESC + COL_PRICE / 2, y + 13.5, { align: 'center' })

  // Filas
  card.rows.forEach((r, i) => {
    const ry = y + HEADER_H + i * ROW_H
    const cy = ry + ROW_H / 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(r.ref || '—', x + COL_REF / 2, cy + 3, { align: 'center' })
    drawDesc(doc, r.desc, x + COL_REF + COL_DESC / 2, cy, COL_DESC - 10)
    const px = x + COL_REF + COL_DESC
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const val = pesos(r.precio)
    if (val) {
      doc.text('$', px + 8, cy + 3.5)
      doc.text(val, px + COL_PRICE - 8, cy + 3.5, { align: 'right' })
    } else {
      doc.text('—', px + COL_PRICE / 2, cy + 3.5, { align: 'center' })
    }
  })

  // Rejilla de la tarjeta
  doc.setDrawColor(...INK)
  doc.setLineWidth(0.5)
  // horizontales internas
  doc.line(x, y + HEADER_H, x + CARD_W, y + HEADER_H)
  for (let i = 1; i < card.rows.length; i += 1) {
    const ry = y + HEADER_H + i * ROW_H
    doc.line(x, ry, x + CARD_W, ry)
  }
  // verticales internas
  doc.line(x + COL_REF, y, x + COL_REF, y + h)
  doc.line(x + COL_REF + COL_DESC, y, x + COL_REF + COL_DESC, y + h)
  // borde exterior
  doc.setLineWidth(1.2)
  doc.rect(x, y, CARD_W, h)

  // NOTA (recargo Talla 20) centrada bajo la tarjeta
  const cx = x + CARD_W / 2
  const ny = y + h + 11
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(NOTA_TITULO, cx, ny, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text(NOTA_TEXTO, cx, ny + 9, { align: 'center' })

  // Guías de corte alrededor de la tarjeta + su nota (la pieza a recortar).
  drawCropMarks(doc, x, y, CARD_W, h + NOTA_H)
}

// cards: [{ rows: [{ ref, desc, precio }] }]
export function buildTarjetasPreciosDoc(cards) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const colX = [MARGIN_X, MARGIN_X + CARD_W + GAP_X]
  const limit = PAGE_H - MARGIN_BOTTOM
  let y = MARGIN_TOP
  let i = 0
  while (i < cards.length) {
    // Una fila de hasta 2 tarjetas; la altura la manda la más alta.
    const fila = cards.slice(i, i + 2)
    const hFila = Math.max(...fila.map(blockHeight))
    if (y + hFila - CARD_GAP_Y > limit && y > MARGIN_TOP) {
      doc.addPage()
      y = MARGIN_TOP
    }
    fila.forEach((c, k) => drawCard(doc, c, colX[k], y))
    y += hFila
    i += 2
  }
  return doc
}

export function generateTarjetasPreciosPDF(marca, cards) {
  const doc = buildTarjetasPreciosDoc(cards)
  doc.save(`Tarjetas_Precios_${marca}.pdf`)
}
