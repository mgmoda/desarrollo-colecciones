// Qué cambió entre dos versiones de una ficha, para dejarlo anotado en la
// bitácora. Solo campos que importan y en forma corta: las imágenes se
// resumen como "sí/no" en vez de guardar el archivo entero.

const CAMPOS = [
  ['referencia', 'Referencia'],
  ['nuevaRef', 'Referencia final'],
  ['descripcion', 'Descripción'],
  ['tipo', 'Tipo'],
  ['marca', 'Marca'],
  ['costo', 'Costo'],
  ['precioTalla20', 'Precio talla 20'],
  ['cantidad', 'Cantidad'],
  ['tela', 'Tela'],
  ['colorMuestra', 'Color de muestra'],
  ['topIncluido', 'Top/forro'],
  ['estampado', 'Estampado'],
  ['bordado', 'Bordado'],
  ['tintoreria', 'Tintorería'],
  ['decorado', 'Decorado'],
  ['conjunto', 'Conjunto'],
  ['conjuntoRef', 'Pareja del conjunto'],
  ['pendiente', 'Pendiente'],
  ['costoRevisado', 'Costo revisado'],
]

const FOTOS = [['image', 'Foto'], ['imageReal', 'Foto real'], ['imageDetalle', 'Foto detalle']]

function texto(v) {
  if (v == null || v === '') return ''
  // Un "no" y un campo sin marcar son lo mismo: si no, una ficha nueva sale
  // con media docena de cambios falsos.
  if (typeof v === 'boolean') return v ? 'sí' : ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export function resumirCambios(antes, despues) {
  const out = {}
  const previo = antes || {}
  CAMPOS.forEach(([k, label]) => {
    const a = texto(previo[k])
    const b = texto(despues[k])
    if (a !== b) out[label] = [a || '—', b || '—']
  })
  // Procesos: lista, se compara ordenada.
  const pa = [...(previo.procesos || [])].sort().join(', ')
  const pb = [...(despues.procesos || [])].sort().join(', ')
  if (pa !== pb) out.Procesos = [pa || '—', pb || '—']
  // De las fotos solo interesa si se puso o se quitó.
  FOTOS.forEach(([k, label]) => {
    const a = !!previo[k]
    const b = !!despues[k]
    if (a !== b) out[label] = [a ? 'sí' : 'no', b ? 'sí' : 'no']
  })
  return out
}
