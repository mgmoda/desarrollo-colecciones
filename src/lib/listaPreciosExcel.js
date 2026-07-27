import { MARCA_LOGOS } from './marcaLogos.js'

// Lista de precios en Excel: mismo diseño del PDF (logo de la marca, franja de
// encabezados y cuadrícula) pero con los precios como NÚMEROS, para poder
// hacer cuentas encima. ExcelJS se carga solo al exportar.

// Tema por marca, igual que en el PDF: Casania café/crema, Mariset negro/gris.
const TEMA_CAFE = {
  banda: 'FFEFE4D4', textoBanda: 'FF4A3B2A', ref: 'FF4A3B2A',
  linea: 'FFCCB79F', borde: 'FFB89D7A', tenue: 'FFA1907A',
}
const TEMA_NEGRO = {
  banda: 'FFEBEBEB', textoBanda: 'FF111111', ref: 'FF111111',
  linea: 'FFC7C7C7', borde: 'FF6E6E6E', tenue: 'FF6E6E6E',
}
const temaDe = (marca) => (marca === 'Mariset' ? TEMA_NEGRO : TEMA_CAFE)

// Columnas: las mismas del PDF.
const COLS = [
  { key: 'ref', header: 'REF', width: 13 },
  { key: 'desc', header: 'DESCRIPCIÓN', width: 46 },
  { key: 't618', header: 'TALLA 6-18', width: 16, precio: true },
  { key: 't20', header: 'TALLA 20', width: 16, precio: true },
]
const FORMATO_PESOS = '"$ "#,##0'
const PX_POR_CARACTER = 7

// Convierte una posición en píxeles a { col, fracción } para anclar la imagen.
function pxAColumna(px) {
  let restante = px
  for (let i = 0; i < COLS.length; i += 1) {
    const anchoPx = COLS[i].width * PX_POR_CARACTER
    if (restante < anchoPx) return i + restante / anchoPx
    restante -= anchoPx
  }
  return COLS.length
}

function hojaDeMarca(wb, marca, rows, coleccion) {
  const T = temaDe(marca)
  const ws = wb.addWorksheet(marca, {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = COLS.map((c) => ({ key: c.key, width: c.width }))

  // Filas 1-4: el logo de la marca (o su nombre si no lo hay).
  ws.mergeCells(1, 1, 4, COLS.length)
  ;[1, 2, 3, 4].forEach((r) => { ws.getRow(r).height = 17 })
  const logo = MARCA_LOGOS[marca]
  const anchoTotalPx = COLS.reduce((a, c) => a + c.width * PX_POR_CARACTER, 0)
  if (logo) {
    const alto = 52
    const ancho = Math.round(alto * (logo.w / logo.h))
    const id = wb.addImage({ base64: logo.dataUri, extension: 'png' })
    ws.addImage(id, {
      tl: { col: pxAColumna((anchoTotalPx - ancho) / 2), row: 0.35 },
      ext: { width: ancho, height: alto },
      editAs: 'absolute',
    })
  } else {
    const c = ws.getCell(1, 1)
    c.value = marca.toUpperCase()
    c.font = { name: 'Times New Roman', size: 26, bold: true, color: { argb: T.ref } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  // Fila 5: subtítulo de colección.
  ws.mergeCells(5, 1, 5, COLS.length)
  const sub = ws.getCell(5, 1)
  sub.value = `LISTADO DE PRECIOS · COLECCIÓN ${coleccion}`
  sub.font = { name: 'Times New Roman', size: 10, color: { argb: T.tenue } }
  sub.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(5).height = 20

  // Fila 6: franja de encabezados.
  const cab = ws.getRow(6)
  cab.height = 22
  COLS.forEach((c, i) => {
    const cell = cab.getCell(i + 1)
    cell.value = c.header
    cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: T.textoBanda } }
    cell.alignment = { vertical: 'middle', horizontal: c.precio ? 'right' : 'left' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: T.banda } }
    cell.border = {
      top: { style: 'thin', color: { argb: T.borde } },
      bottom: { style: 'thin', color: { argb: T.borde } },
      left: { style: 'thin', color: { argb: T.linea } },
      right: { style: 'thin', color: { argb: T.linea } },
    }
  })

  // Filas de datos: precios como número, con formato de pesos.
  rows.forEach((r) => {
    const fila = ws.addRow({
      ref: r.ref || '',
      desc: (r.desc || '').toUpperCase(),
      t618: Number(r.t618) > 0 ? Number(r.t618) : null,
      t20: Number(r.t20) > 0 ? Number(r.t20) : null,
    })
    fila.height = 17
    COLS.forEach((c, i) => {
      const cell = fila.getCell(i + 1)
      cell.font = {
        name: 'Times New Roman',
        size: 10.5,
        color: { argb: c.key === 'ref' ? T.ref : 'FF141210' },
      }
      cell.alignment = { vertical: 'middle', horizontal: c.precio ? 'right' : 'left' }
      if (c.precio) {
        cell.numFmt = FORMATO_PESOS
        if (cell.value == null) {
          cell.value = '—'
          cell.font = { name: 'Times New Roman', size: 10.5, color: { argb: 'FFC9BFA8' } }
        }
      }
      cell.border = {
        top: { style: 'hair', color: { argb: T.linea } },
        bottom: { style: 'hair', color: { argb: T.linea } },
        left: { style: 'thin', color: { argb: T.linea } },
        right: { style: 'thin', color: { argb: T.linea } },
      }
    })
  })

  // Borde exterior de la tabla.
  const ultima = ws.lastRow.number
  for (let f = 6; f <= ultima; f += 1) {
    const izq = ws.getCell(f, 1)
    const der = ws.getCell(f, COLS.length)
    izq.border = { ...izq.border, left: { style: 'medium', color: { argb: T.borde } } }
    der.border = { ...der.border, right: { style: 'medium', color: { argb: T.borde } } }
  }
  COLS.forEach((_, i) => {
    const c = ws.getCell(ultima, i + 1)
    c.border = { ...c.border, bottom: { style: 'medium', color: { argb: T.borde } } }
  })

  // Pie: para qué es la lista.
  const pie = ws.getRow(ultima + 2)
  ws.mergeCells(ultima + 2, 1, ultima + 2, COLS.length)
  const pc = pie.getCell(1)
  pc.value = 'MG MODA S.A.S · PRECIOS PARA DISTRIBUIDORES AUTORIZADOS'
  pc.font = { name: 'Times New Roman', size: 8.5, color: { argb: T.tenue } }
  pc.alignment = { horizontal: 'center' }

  return ws
}

// sections: [{ marca, rows: [{ ref, desc, t618, t20 }] }] — una hoja por marca.
export async function generateListaPreciosExcel(sections, { coleccion = '2026-2' } = {}) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MG Moda · Desarrollo de Colecciones'
  wb.created = new Date()
  sections.forEach((s) => hojaDeMarca(wb, s.marca, s.rows, coleccion))

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sections.length === 1
    ? `Lista_Precios_${sections[0].marca}.xlsx`
    : 'Lista_Precios.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
