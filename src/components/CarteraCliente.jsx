import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { guardarGestion, cerrarGestion, etiquetaColeccion } from '../lib/cartera.js'
import { formatPrice } from '../lib/constants.js'

// ════════════════════════════════════════════════════════════════════════
// Detalle de un cliente de cartera: qué debe, desde cuándo, qué ha pagado
// y toda la gestión de cobro. Es donde se registra cada contacto.
//
// Las reglas de validación son las mismas del backend que se reemplaza
// (cobranza-app, POST /api/gestion): un acuerdo necesita fecha, un encargo
// puede ir sin texto (se describe solo) y queda ABIERTO hasta resolverse.
// ════════════════════════════════════════════════════════════════════════

const GESTORES = ['Jorge', 'Nancy', 'Adriana', 'Estela', 'Samuel', 'Kelly', 'Diego']
const CANALES = ['WhatsApp', 'Llamada', 'Remito', 'Visita']
const TIPOS = [
  { k: 'novedad', label: 'Novedad' },
  { k: 'promesa', label: 'Promesa de pago' },
  { k: 'acuerdo', label: 'Acuerdo de pago' },
  { k: 'pendiente', label: 'Pendiente / Encargo' },
]

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

const FORM_VACIO = {
  gestor: '', canal: '', remitido_a: '', tipo: 'novedad', texto: '',
  acuerdo_fecha: '', acuerdo_monto: '', proximo_seguimiento: '',
}

export default function CarteraCliente({ cliente, usuario, onClose, onGuardado }) {
  const [form, setForm] = useState(FORM_VACIO)
  const [abrirForm, setAbrirForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Al cambiar de cliente se limpia todo: si no, la nota a medio escribir de
  // uno aparecía en el siguiente.
  useEffect(() => {
    setForm({ ...FORM_VACIO, gestor: nombreProbable(usuario) })
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

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function guardar() {
    const texto = form.texto.trim()
    if (!form.gestor) { setError('Elegí quién hace la gestión.'); return }
    if (!texto && form.tipo !== 'pendiente') {
      setError('Escribí qué dijo el cliente o la gestión realizada.'); return
    }
    if (form.tipo === 'acuerdo' && !form.acuerdo_fecha) {
      setError('Un acuerdo de pago necesita la fecha de compromiso.'); return
    }

    // Un encargo sin desenlace se describe solo, igual que en el backend viejo.
    const textoFinal = texto || (form.remitido_a
      ? `Encargo a ${form.remitido_a}: contactar al cliente (sin respuesta aún)`
      : 'Pendiente de contacto / respuesta del cliente')

    setGuardando(true)
    setError('')
    try {
      await guardarGestion(cliente, {
        tipo: form.tipo,
        texto: textoFinal,
        canal: form.canal || null,
        remitido_a: form.canal === 'Remito' ? (form.remitido_a || null) : null,
        estado: form.tipo === 'pendiente' ? 'abierta' : 'cerrada',
        acuerdo_fecha: form.acuerdo_fecha || null,
        acuerdo_monto: montoNumero(form.acuerdo_monto),
        proximo_seguimiento: form.tipo === 'pendiente' ? (form.proximo_seguimiento || null) : null,
      }, form.gestor)
      setForm({ ...FORM_VACIO, gestor: form.gestor })
      setAbrirForm(false)
      if (onGuardado) await onGuardado()
    } catch (e) {
      setError('No se pudo guardar: ' + ((e && e.message) || e))
    } finally {
      setGuardando(false)
    }
  }

  async function resolver(g) {
    try {
      await cerrarGestion(g.id, form.gestor || nombreProbable(usuario))
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
            Gestión y seguimiento<span className="sp" />
            {!abrirForm && (
              <button className="btn btn-soft ct-btn-sm" onClick={() => setAbrirForm(true)}>
                Registrar gestión
              </button>
            )}
          </div>

          {cliente.gestion.length === 0 && !abrirForm && (
            <div className="ct-empty">Sin registros de gestión todavía.</div>
          )}

          {cliente.gestion.map((g) => (
            <div className={'ct-g' + (g.estado === 'abierta' ? ' abierta' : '')} key={g.id}>
              <div className="ct-g-top">
                <span className="tag">{(TIPOS.find((t) => t.k === g.tipo) || {}).label || g.tipo}</span>
                {g.canal && <span className="ct-g-canal">{g.canal}</span>}
                <span className="ct-g-quien">{g.autor || '—'}</span>
                <span className="sp" />
                <span className="ct-g-fecha">{fechaCorta(g.creado_en)}</span>
              </div>
              <div className="ct-g-txt">{g.texto}</div>
              {g.acuerdo_fecha && (
                <div className="ct-g-acuerdo">
                  Compromiso: {g.acuerdo_monto ? formatPrice(g.acuerdo_monto) : 'abono'}
                  {' '}para el {fechaLarga(g.acuerdo_fecha)}
                </div>
              )}
              {g.estado === 'abierta' && (
                <div className="ct-g-pend">
                  <span>
                    {g.proximo_seguimiento
                      ? (g.proximo_seguimiento <= hoyISO()
                          ? 'Revisión vencida: ' : 'Volver a revisar el ') + fechaLarga(g.proximo_seguimiento)
                      : 'Encargo sin fecha de revisión'}
                  </span>
                  <button className="btn btn-ghost ct-btn-sm" onClick={() => resolver(g)}>
                    Marcar resuelto
                  </button>
                </div>
              )}
            </div>
          ))}

          {abrirForm && (
            <div className="ct-form">
              <div className="ct-fld">
                <label>¿Quién hace la gestión?</label>
                <div className="ct-opts">
                  {GESTORES.map((g) => (
                    <button key={g} type="button"
                      className={'ct-opt' + (form.gestor === g ? ' on' : '')}
                      onClick={() => set('gestor', g)}>{g}</button>
                  ))}
                </div>
              </div>

              <div className="ct-fld">
                <label>Canal del contacto</label>
                <div className="ct-opts">
                  {CANALES.map((c) => (
                    <button key={c} type="button"
                      className={'ct-opt' + (form.canal === c ? ' on' : '')}
                      onClick={() => set('canal', form.canal === c ? '' : c)}>{c}</button>
                  ))}
                </div>
              </div>

              {form.canal === 'Remito' && (
                <div className="ct-fld">
                  <label>Remito el contacto a</label>
                  <select className="input select" value={form.remitido_a}
                    onChange={(e) => set('remitido_a', e.target.value)}>
                    <option value="">— elegir vendedor —</option>
                    {GESTORES.filter((g) => g !== 'Diego').map((g) => <option key={g}>{g}</option>)}
                  </select>
                </div>
              )}

              <div className="ct-fld">
                <label>Resultado</label>
                <div className="ct-opts">
                  {TIPOS.map((t) => (
                    <button key={t.k} type="button"
                      className={'ct-opt' + (form.tipo === t.k ? ' on' : '')}
                      onClick={() => set('tipo', t.k)}>{t.label}</button>
                  ))}
                </div>
              </div>

              <textarea className="input ct-texto" value={form.texto}
                onChange={(e) => set('texto', e.target.value)}
                placeholder="¿Qué dijo el cliente? Motivo del atraso, compromiso, a quién se remite…" />

              {(form.tipo === 'promesa' || form.tipo === 'acuerdo') && (
                <div className="ct-fld-row">
                  <div className="ct-fld">
                    <label>Fecha de compromiso</label>
                    <input type="date" className="input" value={form.acuerdo_fecha}
                      onChange={(e) => set('acuerdo_fecha', e.target.value)} />
                  </div>
                  <div className="ct-fld">
                    <label>Monto acordado</label>
                    <input type="text" className="input" value={form.acuerdo_monto}
                      onChange={(e) => set('acuerdo_monto', e.target.value)}
                      placeholder="opcional" />
                  </div>
                </div>
              )}

              {form.tipo === 'pendiente' && (
                <div className="ct-fld">
                  <label>Volver a revisar el</label>
                  <input type="date" className="input" value={form.proximo_seguimiento}
                    onChange={(e) => set('proximo_seguimiento', e.target.value)} />
                </div>
              )}

              <div className="ct-form-foot">
                <button className="btn btn-ghost" onClick={() => { setAbrirForm(false); setError('') }}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar gestión'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={() => copiarMensaje(cliente)}>
          Mensaje de cobro para WhatsApp
        </button>
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}

// ── Auxiliares ─────────────────────────────────────────────────────────

function nombreProbable(usuario) {
  if (!usuario) return ''
  const base = String(usuario).split('@')[0].toLowerCase()
  return GESTORES.find((g) => g.toLowerCase() === base) || ''
}

function montoNumero(txt) {
  if (!txt) return null
  const n = Number(String(txt).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function diasDesdeISO(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const h = new Date()
  return Math.round((Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) - Date.UTC(a, m - 1, d)) / 86400000)
}

/** Arma el mensaje de cobro y lo deja en el portapapeles. */
function copiarMensaje(c) {
  const lineas = [
    `Buen día, ${c.cliente}.`,
    '',
    `Le escribimos de MG MODA para recordarle el saldo pendiente de ${formatPrice(c.total)}.`,
  ]
  const vencidas = c.facturas.filter((f) => f.dias > 60)
  if (vencidas.length) {
    lineas.push('', 'Facturas con mayor atraso:')
    vencidas.slice(0, 6).forEach((f) => {
      lineas.push(`  · ${f.factura} — ${formatPrice(f.valor)} (${f.dias} días)`)
    })
  }
  if (c.ult_pago) {
    lineas.push('', `Su último abono fue el ${fechaLarga(c.ult_pago)}.`)
  }
  lineas.push('', 'Quedamos atentos. Gracias.')
  const texto = lineas.join('\n')
  if (navigator.clipboard) navigator.clipboard.writeText(texto)
  window.alert('Mensaje copiado:\n\n' + texto)
}
