// Excel por marca con la equivalencia de referencias: foto, referencia
// antigua, nueva referencia y tipo. Las fotos van incrustadas en la hoja;
// se reducen antes para que el archivo no pese de más.
// ExcelJS se carga solo al exportar, para no engordar el arranque de la app.

const FOTO_PX = 96          // ancho al que se reduce cada foto
const ROW_H = 78            // alto de fila en puntos
const COL_FOTO_W = 15       // ancho de la columna de foto (caracteres)

// Reduce una foto (data URL) a un JPEG pequeño. Devuelve { dataUrl, w, h }.
function reducirFoto(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const escala = FOTO_PX / img.naturalWidth
      const w = FOTO_PX
      const h = Math.max(1, Math.round(img.naturalHeight * escala))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve({ dataUrl: c.toDataURL('image/jpeg', 0.72), w, h })
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

// rows: [{ referencia, nuevaRef, tipo, image }]
export async function generateRefsExcel(marca, rows) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MG Moda · Desarrollo de Colecciones'
  wb.created = new Date()
  const ws = wb.addWorksheet(marca, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { header: 'FOTO', key: 'foto', width: COL_FOTO_W },
    { header: 'REFERENCIA', key: 'referencia', width: 18 },
    { header: 'NUEVA REF.', key: 'nuevaRef', width: 16 },
    { header: 'TIPO', key: 'tipo', width: 16 },
  ]

  const head = ws.getRow(1)
  head.height = 22
  head.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FF4A3B2A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE4D4' } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB89D7A' } },
      bottom: { style: 'thin', color: { argb: 'FFB89D7A' } },
      left: { style: 'thin', color: { argb: 'FFCCB79F' } },
      right: { style: 'thin', color: { argb: 'FFCCB79F' } },
    }
  })

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const fila = ws.addRow({
      foto: '',
      referencia: r.referencia || '',
      nuevaRef: r.nuevaRef || '',
      tipo: r.tipo || '',
    })
    fila.height = ROW_H
    fila.eachCell((cell, col) => {
      cell.alignment = { vertical: 'middle', horizontal: col === 1 ? 'center' : 'left' }
      cell.font = { size: 11 }
      if (col === 3) cell.font = { size: 11, bold: true, color: { argb: 'FF1F5FA5' } }
      // La fila del conjunto va resaltada, para distinguirla de sus prendas.
      if (r.esConjunto) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F2EA' } }
        if (col === 2 || col === 4) cell.font = { size: 11, bold: true, color: { argb: 'FF8A5A2B' } }
      }
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFCCB79F' } },
        left: { style: 'hair', color: { argb: 'FFCCB79F' } },
        right: { style: 'hair', color: { argb: 'FFCCB79F' } },
      }
    })

    if (r.image) {
      const chica = await reducirFoto(r.image)
      if (chica) {
        const id = wb.addImage({ base64: chica.dataUrl, extension: 'jpeg' })
        // Alto disponible en px (1 pt ≈ 1.333 px) menos un margen
        const maxH = ROW_H * 1.3 - 8
        const escala = Math.min(1, maxH / chica.h)
        const w = Math.round(chica.w * escala)
        const h = Math.round(chica.h * escala)
        ws.addImage(id, {
          tl: { col: 0.15, row: fila.number - 1 + 0.08 },
          ext: { width: w, height: h },
          editAs: 'oneCell',
        })
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Referencias_${marca}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
