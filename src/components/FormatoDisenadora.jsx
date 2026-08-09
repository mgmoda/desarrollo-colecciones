import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { formatDate } from '../lib/constants.js'

// La hoja que se le manda a la diseñadora gráfica. Se dibuja en un canvas, así
// lo que se ve en pantalla ES la imagen que se descarga o se pega en WhatsApp.
//
// Hay dos: la del strike off, vertical, con la tela y los metros; y la de la
// corrección, horizontal —foto a la izquierda, observaciones a la derecha—,
// que es como se venían mandando a mano: el cliente marca sobre la tela el
// tono o el tamaño que quiere y al lado va escrito qué hay que cambiar.

const W = 900
const H = 1260
const WC = 1500
const HC = 760
const CREMA = '#faf6ee'
const CAFE = '#4a3b2a'
const TENUE = '#a1907a'
const LINEA = '#e7ddca'

function cargarImagen(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Texto centrado dentro de un ancho, devolviendo el alto que ocupó.
function parrafo(g, texto, x, y, ancho, alto) {
  const lineas = []
  let linea = ''
  texto.split(/\s+/).forEach((palabra) => {
    const prueba = linea ? `${linea} ${palabra}` : palabra
    if (g.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = palabra }
    else linea = prueba
  })
  if (linea) lineas.push(linea)
  lineas.forEach((l, i) => g.fillText(l, x, y + i * alto))
  return lineas.length * alto
}

// Hoja de corrección: la foto manda, porque es donde el cliente marcó lo que
// quiere cambiar, y al lado va escrito qué es.
function dibujarCorreccion(g, diseno, evento, foto) {
  g.fillStyle = CREMA
  g.fillRect(0, 0, WC, HC)
  g.strokeStyle = '#d9c3a1'
  g.lineWidth = 3
  g.strokeRect(22, 22, WC - 44, HC - 44)

  const M = 46
  const cajaW = Math.round((WC - M * 3) * 0.56)
  const cajaX = M
  const cajaY = M + 18
  const cajaH = HC - cajaY - M

  g.fillStyle = '#ffffff'
  g.fillRect(cajaX, cajaY, cajaW, cajaH)
  g.strokeStyle = LINEA
  g.lineWidth = 1.5
  g.strokeRect(cajaX, cajaY, cajaW, cajaH)
  if (foto) {
    const escala = Math.min(cajaW / foto.width, cajaH / foto.height)
    const fw = foto.width * escala
    const fh = foto.height * escala
    g.drawImage(foto, cajaX + (cajaW - fw) / 2, cajaY + (cajaH - fh) / 2, fw, fh)
  } else {
    g.fillStyle = TENUE
    g.textAlign = 'center'
    g.font = '20px Georgia, serif'
    g.fillText('Sin foto', cajaX + cajaW / 2, cajaY + cajaH / 2)
  }

  // Columna derecha: de quién es el diseño y qué hay que corregir.
  const colX = cajaX + cajaW + M
  const colW = WC - colX - M
  const centro = colX + colW / 2
  g.textAlign = 'center'

  g.fillStyle = TENUE
  g.font = '600 15px Georgia, serif'
  g.fillText('CORRECCIÓN GRÁFICA', centro, cajaY + 44)
  g.fillStyle = CAFE
  g.font = 'bold 42px Georgia, serif'
  g.fillText(diseno.codigo || '', centro, cajaY + 96)
  if (diseno.codigoCliente) {
    g.fillStyle = '#085041'
    g.font = '600 19px Georgia, serif'
    g.fillText(diseno.codigoCliente, centro, cajaY + 124)
  }
  g.strokeStyle = LINEA
  g.lineWidth = 1.5
  g.beginPath(); g.moveTo(colX + 20, cajaY + 152); g.lineTo(colX + colW - 20, cajaY + 152); g.stroke()

  // Las observaciones, que son el motivo de la hoja: grandes y en mayúscula.
  const nota = (evento.nota || '').trim().toUpperCase()
  g.fillStyle = '#141210'
  g.font = '28px Helvetica, Arial, sans-serif'
  const alto = parrafo(g, nota || 'SIN OBSERVACIONES', centro, cajaY + 210, colW - 24, 40)

  let y = cajaY + 210 + alto + 46
  if (evento.tela) {
    g.fillStyle = TENUE
    g.font = '600 14px Georgia, serif'
    g.fillText('TELA', centro, y)
    g.fillStyle = '#141210'
    g.font = 'bold 24px Georgia, serif'
    g.fillText(evento.tela, centro, y + 30)
  }

  g.fillStyle = TENUE
  g.font = '14px Georgia, serif'
  g.fillText(formatDate(evento.fecha) || '', centro, cajaY + cajaH - 34)
  g.fillText('MG MODA S.A.S · GEODÉSICA', centro, cajaY + cajaH - 10)
}

export default function FormatoDisenadora({ diseno, evento, imagen, variante = 'strikeoff', onClose }) {
  const correccion = variante === 'correccion'
  const canvasRef = useRef(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const foto = await cargarImagen(imagen)
      if (!vivo) return
      const c = canvasRef.current
      if (!c) return
      const g = c.getContext('2d')

      if (correccion) { dibujarCorreccion(g, diseno, evento, foto); setListo(true); return }

      // Fondo
      g.fillStyle = CREMA
      g.fillRect(0, 0, W, H)

      // Marco
      g.strokeStyle = '#d9c3a1'
      g.lineWidth = 3
      g.strokeRect(26, 26, W - 52, H - 52)

      // Encabezado
      g.fillStyle = CAFE
      g.textAlign = 'center'
      g.font = '600 22px Georgia, "Times New Roman", serif'
      g.fillText('STRIKE OFF', W / 2, 92)
      g.fillStyle = TENUE
      g.font = '15px Georgia, "Times New Roman", serif'
      g.fillText('SOLICITUD PARA DESARROLLO GRÁFICO', W / 2, 120)

      g.strokeStyle = CAFE
      g.lineWidth = 2
      g.beginPath(); g.moveTo(70, 146); g.lineTo(W - 70, 146); g.stroke()

      // Código del diseño
      g.fillStyle = CAFE
      g.font = 'bold 46px Georgia, "Times New Roman", serif'
      g.fillText(diseno.codigo || '', W / 2, 205)
      if (diseno.codigoCliente) {
        g.fillStyle = '#085041'
        g.font = '600 20px Georgia, serif'
        g.fillText(diseno.codigoCliente, W / 2, 236)
      }
      if (diseno.nombre) {
        g.fillStyle = TENUE
        g.font = 'italic 20px Georgia, serif'
        g.fillText(diseno.nombre, W / 2, diseno.codigoCliente ? 268 : 240)
      }

      // Foto, encajada dentro de su recuadro. Si hay nota se le cede alto,
      // porque la nota es la indicación para la diseñadora y no puede faltar.
      const nota = (evento.nota || '').trim()
      const cajaY = 296
      const cajaH = nota ? 500 : 600
      const cajaX = 70
      const cajaW = W - 140
      g.fillStyle = '#ffffff'
      g.fillRect(cajaX, cajaY, cajaW, cajaH)
      g.strokeStyle = LINEA
      g.lineWidth = 1.5
      g.strokeRect(cajaX, cajaY, cajaW, cajaH)
      if (foto) {
        const escala = Math.min(cajaW / foto.width, cajaH / foto.height)
        const fw = foto.width * escala
        const fh = foto.height * escala
        g.drawImage(foto, cajaX + (cajaW - fw) / 2, cajaY + (cajaH - fh) / 2, fw, fh)
      } else {
        g.fillStyle = TENUE
        g.font = '18px Georgia, serif'
        g.fillText('Sin foto', W / 2, cajaY + cajaH / 2)
      }

      // Datos: tela, metros, fecha
      const filas = [
        ['TELA', evento.tela || '—'],
        ['CANTIDAD', evento.metros ? `${evento.metros} metros` : '—'],
        ['FECHA', formatDate(evento.fecha) || '—'],
      ]
      let y = cajaY + cajaH + 64
      g.textAlign = 'left'
      filas.forEach(([et, val]) => {
        g.strokeStyle = LINEA
        g.lineWidth = 1
        g.beginPath(); g.moveTo(70, y - 34); g.lineTo(W - 70, y - 34); g.stroke()
        g.fillStyle = TENUE
        g.font = '600 15px Georgia, serif'
        g.fillText(et, 82, y)
        g.fillStyle = '#141210'
        g.font = 'bold 26px Georgia, serif'
        g.textAlign = 'right'
        g.fillText(String(val), W - 82, y)
        g.textAlign = 'left'
        y += 76
      })
      g.strokeStyle = LINEA
      g.beginPath(); g.moveTo(70, y - 34); g.lineTo(W - 70, y - 34); g.stroke()

      // Nota: lo que hay que corregir o tener en cuenta.
      if (nota) {
        g.fillStyle = TENUE
        g.font = '600 15px Georgia, serif'
        g.fillText('NOTA', 82, y + 4)
        g.fillStyle = '#141210'
        g.font = 'italic 22px Georgia, serif'
        let linea = ''
        let ly = y + 36
        const ancho = W - 164
        nota.split(/\s+/).forEach((palabra) => {
          const prueba = linea ? `${linea} ${palabra}` : palabra
          if (g.measureText(prueba).width > ancho && linea) {
            g.fillText(linea, 82, ly)
            ly += 30
            linea = palabra
          } else {
            linea = prueba
          }
        })
        if (linea) g.fillText(linea, 82, ly)
      }

      // Pie
      g.textAlign = 'center'
      g.fillStyle = TENUE
      g.font = '14px Georgia, serif'
      g.fillText('MG MODA S.A.S · GEODÉSICA', W / 2, H - 60)

      setListo(true)
    })()
    return () => { vivo = false }
  }, [diseno, evento, imagen, correccion])

  function descargar() {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `${correccion ? 'Correccion' : 'StrikeOff'}_${diseno.codigo}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function copiar() {
    const c = canvasRef.current
    if (!c) return
    try {
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      alert('Imagen copiada. Ya la puedes pegar en WhatsApp.')
    } catch (e) {
      console.error(e)
      alert('No se pudo copiar automáticamente. Usa “Descargar imagen”.')
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{correccion ? 'Corrección para la diseñadora' : 'Formato del strike off'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <canvas ref={canvasRef} width={correccion ? WC : W} height={correccion ? HC : H} className="so-canvas" />
      </div>
      <div className="modal-foot">
        <span className="so-hint">Cópiala o descárgala para enviarla por WhatsApp</span>
        <button className="btn" onClick={descargar} disabled={!listo}>Descargar imagen</button>
        <button className="btn btn-primary" onClick={copiar} disabled={!listo}>Copiar imagen</button>
      </div>
    </Modal>
  )
}
