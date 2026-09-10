import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import CarteraMensaje from './CarteraMensaje.jsx'
import { FormContacto, LineaContacto } from './CarteraContacto.jsx'
import { autorDe, cerrarGestion, etiquetaColeccion } from '../lib/cartera.js'
import { formatPrice } from '../lib/constants.js'

// ════════════════════════════════════════════════════════════════════════
// Detalle de un cliente de cartera: qué debe, desde cuándo, qué ha pagado
// y el historial de contactos. El contacto se registra con el mismo
// formulario de dos toques de la lista ("Contacté").
// ════════════════════════════════════════════════════════════════════════

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fechaLarga(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`
}
function fechaCorta(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)} ${a.slice(2)}`
}
const hoyISO = () => new Date().toISOString().slice(0, 10)

export default function CarteraCliente({ cliente, usuario, onClose, onGuardado }) {
  const [abrirForm, setAbrirForm] = useState(false)
  const [mensaje, setMensaje] = useState(false)
  const [error, setError] = useState('')

  // Al cambiar de cliente se cierra el formulario: si no, el contacto a medio
  // escribir de uno aparecía en el siguiente.
  useEffect(() => {
    setAbrirForm(false)
    setError('')
  }, [cliente && cliente.cliente_key, usuario])

  const porColeccion = useMemo(() => {
    if (!cliente) return []
    return Object.entries(cliente.periodos)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, valor]) => {
        const [anio, temp] = key.split('-').map(Number)
        return { key, anio, temp, valor, label: `${key} · ${etiquetaColeccion(temp)}` }
      })
  }, [cliente])

  if (!cliente) return null

  // Encargos del modelo viejo que quedaron abiertos: se pueden cerrar.
  async function resolver(g) {
    try {
      await cerrarGestion(g.id, autorDe(usuario))
      if (onGuardado) await onGuardado()
    } catch (e) {
      setError('No se pudo cerrar el encargo: ' + ((e && e.message) || e))
    }
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="modal-head">
        <div>
          <h2>{cliente.cliente}</h2>
          <p className="modal-sub">
            {cliente.ciudad || 'Sin ciudad'}
            <span className="modal-sub-sep"> · </span>
            {cliente.facturas.length} facturas pendientes
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="modal-body">
        {error && <div className="ct-error">{error}</div>}

        <div className="ct-modal-cards">
          <div className="ct-mc">
            <div className="l">Total debe</div>
            <div className="v">{formatPrice(cliente.total) || '$ 0'}</div>
          </div>
          <div className="ct-mc">
            <div className="l">Antigüedad máx</div>
            <div className={'v' + (cliente.dias_max > 90 ? ' bad' : '')}>{cliente.dias_max} días</div>
          </div>
          <div className="ct-mc">
            <div className="l">Último pago</div>
            <div className="v">
              {cliente.ult_pago ? fechaCorta(cliente.ult_pago) : 'sin pagos'}
              {cliente.ult_pago && <small>hace {cliente.dias_ult_pago} días</small>}
            </div>
          </div>
        </div>

        {porColeccion.length > 0 && (
          <div className="ct-sec">
            <div className="ct-sec-h">Deuda por colección</div>
            <div className="ct-modal-cards ct-cols">
              {porColeccion.map((p) => (
                <div className="ct-mc" key={p.key}>
                  <div className="l">{p.label}</div>
                  <div className="v">{formatPrice(p.valor)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ct-sec">
          <div className="ct-sec-h">
            Facturas pendientes<span className="sp" />
            <span className="c">{cliente.facturas.length}</span>
          </div>
          <div className="table-wrap ct-plano">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Factura</th><th>Fecha</th><th>Vence</th>
                  <th className="num">Días</th><th className="num">Valor</th><th className="num">Col.</th>
                </tr>
              </thead>
              <tbody>
                {cliente.facturas.map((f) => (
                  <tr key={f.factura}>
                    <td className="mono">{f.factura}</td>
                    <td>{fechaCorta(f.fecha)}</td>
                    <td>{fechaCorta(f.venc)}</td>
                    <td className="num">
                      <span className={'flag ' + (f.dias >= 90 ? 'flag-no' : f.dias >= 60 ? 'flag-warn' : 'flag-yes')}>
                        {f.dias}d
                      </span>
                    </td>
                    <td className="num">{formatPrice(f.valor)}</td>
                    <td className="num">
                      {f.temp ? <span className="tag">T{f.temp}</span> : <span className="ct-dash">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ct-sec">
          <div className="ct-sec-h">
            Historial de pagos<span className="sp" />
            <span className="c">{cliente.pagos.length}</span>
          </div>
          {cliente.pagos.length === 0 ? (
            <div className="ct-empty">Sin pagos registrados.</div>
          ) : cliente.pagos.slice(0, 12).map((p, i) => (
            <div className="ct-pago" key={p.fecha + '|' + p.valor + '|' + i}>
              <div>
                <span className="f">{fechaLarga(p.fecha)}</span>
                <span className="r">hace {diasDesdeISO(p.fecha)}d</span>
              </div>
              <div className="m">{formatPrice(p.valor)}</div>
            </div>
          ))}
        </div>

        <div className="ct-sec ct-sec-last">
          <div className="ct-sec-h">
            Contactos<span className="sp" />
            {!abrirForm && (
              <button className="btn btn-primary ct-btn-sm" onClick={() => setAbrirForm(true)}>
                Contacté
              </button>
            )}
          </div>

          {abrirForm && (
            <FormContacto cliente={cliente} usuario={usuario} compacto
              onCancelar={() => { setAbrirForm(false); setError('') }}
              onGuardado={async () => { setAbrirForm(false); if (onGuardado) await onGuardado() }} />
          )}

          {cliente.gestion.length === 0 && !abrirForm && (
            <div className="ct-empty">Nadie ha contactado a este cliente todavía.</div>
          )}

          {cliente.gestion.map((g) => (
            <div key={g.id}>
              <LineaContacto g={g} />
              {g.estado === 'abierta' && (
                <div className="ct-g-pend">
                  <span>
                    {g.proximo_seguimiento
                      ? (g.proximo_seguimiento <= hoyISO()
                          ? 'Revisión vencida: ' : 'Volver a revisar el ') + fechaLarga(g.proximo_seguimiento)
                      : 'Encargo abierto del modelo anterior'}
                  </span>
                  <button className="btn btn-ghost ct-btn-sm" onClick={() => resolver(g)}>
                    Marcar resuelto
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={() => setMensaje(true)}>
          Mensaje de cobro para WhatsApp
        </button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </div>

      {mensaje && <CarteraMensaje cliente={cliente} onClose={() => setMensaje(false)} />}
    </Modal>
  )
}

// ── Auxiliares ─────────────────────────────────────────────────────────

function diasDesdeISO(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const h = new Date()
  return Math.round((Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) - Date.UTC(a, m - 1, d)) / 86400000)
}
