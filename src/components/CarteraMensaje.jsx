import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'

// ════════════════════════════════════════════════════════════════════════
// MENSAJE DE COBRO PARA WHATSAPP
// ────────────────────────────────────────────────────────────────────────
// Portado tal cual de la app de cobranza que se reemplaza. Los DOS textos se
// copiaron palabra por palabra: son los que Diego ya venía mandando y no hay
// razón para reescribirlos.
//
//   · Al vendedor → para que el vendedor llame al cliente. Lleva el saldo
//     desglosado por MARCA, porque un cliente puede tener las dos con
//     vendedores distintos.
//   · Al cliente  → se lo manda directo al cliente. Va por COLECCIÓN, de la
//     más vieja a la más nueva, y detecta si es empresa para no tratarla de
//     señor/señora.
//
// El texto queda editable antes de copiar.
// ════════════════════════════════════════════════════════════════════════

// La marca sale de la primera letra del número de factura.
const MARCA = { C: 'Casania', A: 'Casania', M: 'Mariset', T: 'Mariset' }
const marcaDe = (factura) => MARCA[((factura || '').trim()[0] || '').toUpperCase()] || 'Otras'
const ORDEN_MARCAS = ['Casania', 'Mariset', 'Otras']

// Formato del mensaje: "$276.743.881", sin espacio tras el símbolo. NO es el
// formatPrice del sistema — es el que ya usaban estos mensajes.
const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')

const ES_EMPRESA = /\b(S\.?A\.?S|LTDA|S\.?A\.?|E\.?U|COMERCIALIZADORA|ALMACEN|COLLECTION|GRUPO|CASA|INVERSIONES)\b/i

function primerNombre(nombre) {
  const p = (nombre || '').trim().split(/\s+/)
  const n = p[0] || ''
  return n.charAt(0) + n.slice(1).toLowerCase()
}

function fechaLarga(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00').toLocaleDateString('es-CO',
    { day: '2-digit', month: 'long', year: 'numeric' })
}

function deudaPorMarca(c) {
  const m = {}
  for (const f of c.facturas || []) {
    const k = marcaDe(f.factura)
    m[k] = (m[k] || 0) + f.valor
  }
  return m
}

const nombreColeccion = (f) => `${f.temp === 1 ? 'Madres' : 'Diciembre'} ${f.anio || ''}`.trim()

function deudaPorColeccion(c, marca) {
  const m = {}
  for (const f of c.facturas || []) {
    if (marca && marca !== 'todas' && marcaDe(f.factura) !== marca) continue
    if (!f.temp) continue
    const k = nombreColeccion(f)
    m[k] = (m[k] || 0) + f.valor
  }
  // La más antigua primero: es el orden en que se cobra.
  const ord = (k) => {
    const [n, a] = [k.split(' ')[0], parseInt(k.split(' ')[1], 10)]
    return a * 10 + (n === 'Madres' ? 0 : 1)
  }
  return Object.entries(m).sort((a, b) => ord(a[0]) - ord(b[0]))
}

function mensajeCliente(c, marca, trato) {
  const cols = deudaPorColeccion(c, marca)
  const total = cols.reduce((a, [, v]) => a + v, 0)
  const empresa = ES_EMPRESA.test(c.cliente)
  const saludo = empresa ? 'Hola, buen día' : `Hola ${trato} ${primerNombre(c.cliente)}`
  const lineas = cols.map(([k, v]) => `• ${fmt(v)} de la colección ${k}`).join('\n')
  const cierre = cols.length > 1 ? `\n\nTotal pendiente: *${fmt(total)}*` : ''
  return `${saludo}, espero te encuentres bien 😊

Quería saber cuándo tienes programación de pagos, ya que tienes un saldo pendiente de:

${lineas}${cierre}

Quedo atento a tu respuesta. ¡Muchas gracias! 🙏`
}

function mensajeVendedor(c, marca) {
  const m = deudaPorMarca(c)
  const ult = c.ult_pago
    ? `${fechaLarga(c.ult_pago)} (hace ${c.dias_ult_pago} días)`
    : 'sin pagos registrados'
  let bloque
  if (marca && marca !== 'todas') {
    bloque = `💰 Saldo ${marca}: *${fmt(m[marca] || 0)}*`
  } else {
    const lineas = ORDEN_MARCAS.filter((k) => m[k]).map((k) => `• ${k}: ${fmt(m[k])}`)
    bloque = `💰 Saldo total: *${fmt(c.total)}*\n${lineas.join('\n')}`
  }
  return `Por favor contactar a este cliente para gestionar el pago 🙏

*${c.cliente}*
📍 ${c.ciudad || ''}

${bloque}

🗓 Último pago: ${ult}`
}

export default function CarteraMensaje({ cliente, onClose }) {
  const marcas = useMemo(() => {
    const m = deudaPorMarca(cliente)
    return { montos: m, lista: ORDEN_MARCAS.filter((k) => m[k]) }
  }, [cliente])

  const multi = marcas.lista.length > 1
  const esEmpresa = ES_EMPRESA.test(cliente.cliente)

  const [tipo, setTipo] = useState('vendedor')
  const [marca, setMarca] = useState(multi ? 'todas' : (marcas.lista[0] || 'todas'))
  const [trato, setTrato] = useState('señora')
  // El texto se puede editar antes de copiar; al cambiar de opción se rearma.
  const [editado, setEditado] = useState(null)
  const [copiado, setCopiado] = useState(false)

  const texto = editado !== null ? editado
    : tipo === 'cliente' ? mensajeCliente(cliente, marca, trato)
    : mensajeVendedor(cliente, marca)

  const cambiar = (fn) => { fn(); setEditado(null); setCopiado(false) }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Safari sin permiso de portapapeles: se cae al método viejo.
      const ta = document.getElementById('ctMsgTexto')
      if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy') } catch { /* nada */ } }
    }
    setCopiado(true)
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <div>
          <h2>Mensaje de cobro</h2>
          <p className="modal-sub">
            {tipo === 'cliente'
              ? 'Para enviárselo directo al cliente · puedes editarlo'
              : 'Cópialo y pégaselo al vendedor por WhatsApp · puedes editarlo'}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="modal-body">
        <div className="ct-msg-fila">
          <span className="ct-msg-lbl">Para</span>
          <div className="ct-opts">
            <button type="button" className={'ct-opt' + (tipo === 'vendedor' ? ' on' : '')}
              onClick={() => cambiar(() => setTipo('vendedor'))}>Al vendedor</button>
            <button type="button" className={'ct-opt' + (tipo === 'cliente' ? ' on' : '')}
              onClick={() => cambiar(() => setTipo('cliente'))}>Al cliente</button>
          </div>
          {tipo === 'cliente' && !esEmpresa && (
            <div className="ct-opts">
              <button type="button" className={'ct-opt' + (trato === 'señora' ? ' on' : '')}
                onClick={() => cambiar(() => setTrato('señora'))}>Sra.</button>
              <button type="button" className={'ct-opt' + (trato === 'señor' ? ' on' : '')}
                onClick={() => cambiar(() => setTrato('señor'))}>Sr.</button>
            </div>
          )}
        </div>

        {multi && (
          <div className="ct-msg-fila">
            <span className="ct-msg-lbl">Marca</span>
            <div className="ct-opts">
              <button type="button" className={'ct-opt' + (marca === 'todas' ? ' on' : '')}
                onClick={() => cambiar(() => setMarca('todas'))}>
                Ambas · {fmt(cliente.total)}
              </button>
              {marcas.lista.map((k) => (
                <button key={k} type="button" className={'ct-opt' + (marca === k ? ' on' : '')}
                  onClick={() => cambiar(() => setMarca(k))}>
                  {k} · {fmt(marcas.montos[k])}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea id="ctMsgTexto" className="input ct-msg-area" value={texto}
          onChange={(e) => { setEditado(e.target.value); setCopiado(false) }} />
      </div>

      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={copiar}>
          {copiado ? 'Copiado ✓' : 'Copiar mensaje'}
        </button>
      </div>
    </Modal>
  )
}
