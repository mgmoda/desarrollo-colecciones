const MAX_DIMENSION = 1100
const JPEG_QUALITY = 0.8

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Resizes and compresses an image (File/Blob) into a JPEG data URL
// so the inventory stays light even with many photos.
export async function processImage(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen')
  }
  const rawUrl = await fileToDataURL(file)
  const img = await loadImage(rawUrl)

  let { width, height } = img
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
    width,
    height,
  }
}

// Pulls the first image found in a paste event's clipboard.
export function getImageFromClipboard(event) {
  const items = event.clipboardData && event.clipboardData.items
  if (!items) return null
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}
