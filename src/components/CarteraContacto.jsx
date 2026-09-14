import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import {
  CANALES, CANAL_VENDEDOR, ESPERA_DIAS, RESULTADOS, VENDEDORES, autorDe, esPedidoVendedor,
  etiquetaResultado, guardarContacto, resultadoDe,
} from '../lib/cartera.js'
import { formatPrice } from '../lib/constants.js'

// "Contacté": registrar en dos toques cómo se contactó al cliente y qué quedó.
// Debajo va el historial de contactos, para ver qué le dijeron antes y quién.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  const esteAnio = String(new Date().getFullYear()) === a
  return `${Number(d)} ${MESES[Number(m) - 1]}${esteAnio ? '' : ' ' + a.slice(2)}`
}
function haceTxt(d) {
  if (d == null) return ''
  if (d === 0) return 'hoy'
  if (d === 1) return 'ayer'
  return `hace ${d} d`
}
function montoNumero(txt) {
  if (!txt) return null
  const n = Number(String(txt).replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Un contacto del historial, en una línea. */
export function LineaContacto({ g }) {
  const r = resultadoDe(g)
  return (
    <div className="ct-ln">
      <span className="ct-ln-f">{fechaCorta(g.creado_en)}</span>
      <b className="ct-ln-q">{g.autor || '—'}</b>
      <span className="ct-ln-t">
        <span className={'ct-res r-' + r}>{r === 'vendedor' ? `Pedido a ${g.remitido_a || 'vendedor'}` : etiquetaResultado(r)}</span>
        {g.acuerdo_fecha && <> · paga el {fechaCorta(g.acuerdo_fecha)}{g.acuerdo_monto ? ` · ${formatPrice(g.acuerdo_monto)}` : ''}</>}
        {g.canal === CANAL_VENDEDOR && r !== 'vendedor' && <> · respuesta del vendedor{g.cerrado_por ? ` (la anotó ${g.cerrado_por})` : ''}</>}
        {g.canal && g.canal !== CANAL_VENDEDOR && <> · {g.canal}</>}
        {g.texto && g.texto !== etiquetaResultado(r) && <> · <i>"{g.texto}"</i></>}
      </span>
    </div>
  )
}

export function FormContacto({ cliente, usuario, onGuardado, onCancelar, compacto }) {
  const [canal, setCanal] = useState('WhatsApp')
  const [vendedor, setVendedor] = useState('')
  const [resultado, setResultado] = useState('')
  const [fecha, setFecha] = useState('')
  const [monto, setMonto] = useState('')
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  // Si el cliente está en manos de un vendedor, lo primero es anotar su
  // respuesta; con un clic se puede registrar otro contacto en su lugar.
  const enVendedor = cliente && cliente.con_vendedor
  const [otroContacto, setOtroContacto] = useState(false)
  const modoRespuesta = !!enVendedor && !otroContacto
  const esVendedor = canal === CANAL_VENDEDOR

  useEffect(() => {
    setCanal('WhatsApp'); setVendedor(''); setResultado(''); setFecha(''); setMonto(''); setTexto(''); setError(''); setOtroContacto(false)
  }, [cliente && cliente.cliente_key])

  const autor = autorDe(usuario)

  async function guardar() {
    if (modoRespuesta) {
      if (!resultado) { setError('Marca qué respondió ' + enVendedor + '.'); return }
    } else if (esVendedor) {
      if (!vendedor) { setError('¿A cuál vendedor se lo pediste?'); return }
    } else if (!resultado) { setError('Marca qué quedó del contacto.'); return }
    if (resultado === 'promesa' && !fecha) { setError('Si promete pagar, ¿para qué día?'); return }
    setGuardando(true)
    setError('')
    try {
      const datos = modoRespuesta
        ? { canal: CANAL_VENDEDOR, vendedor: enVendedor, respuesta: true, resultado, texto, acuerdo_fecha: fecha || null, acuerdo_monto: montoNumero(monto) }
        : esVendedor
          ? { canal: CANAL_VENDEDOR, vendedor, resultado: 'vendedor', texto }
          : { canal, resultado, texto, acuerdo_fecha: fecha || null, acuerdo_monto: montoNumero(monto) }
      await guardarContacto(cliente, datos, autor)
      if (onGuardado) await onGuardado()
    } catch (e) {
      setError('No se pudo guardar: ' + ((e && e.message) || e))
    } finally {
      setGuardando(false)
    }
  }

  const resumen = esVendedor && !modoRespuesta
    ? (vendedor ? `Queda con ${vendedor} desde hoy · si en ${ESPERA_DIAS} días no hay respuesta vuelve a "Para llamar"` : '')
    : !resultado ? ''
    : modoRespuesta && resultado === 'promesa'
      ? `Queda: contactado por ${enVendedor}${fecha ? ` · promesa para el ${fechaCorta(fecha)}` : ''}`
    : modoRespuesta
      ? `Queda: contactado por ${enVendedor} · ${etiquetaResultado(resultado).toLowerCase()}`
    : resultado === 'promesa'
      ? `Queda contactado hoy por ${autor}${fecha ? ` · promesa para el ${fechaCorta(fecha)}` : ''}`
      : resultado === 'no_llamar'
        ? `Sale de la lista de llamadas hasta que alguien lo reactive`
        : `Queda contactado hoy por ${autor} · en espera ${ESPERA_DIAS} días`

  return (
    <div className={'ct-form' + (compacto ? ' compacto' : '')}>
      {error && <div className="ct-error">{error}</div>}
      {modoRespuesta ? (
        <div className="ct-fld">
          <label>Respuesta de {enVendedor}
            <button type="button" className="ct-link" onClick={() => { setOtroContacto(true); setResultado('') }}>
              o registrar otro contacto
            </button>
          </label>
          <div className="ct-opts">
            {RESULTADOS.map((r) => (
              <button key={r.k} type="button" className={'ct-opt' + (resultado === r.k ? ' on' : '')}
                onClick={() => setResultado(r.k)}>{r.label}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="ct-fld">
            <label>Cómo
              {enVendedor && (
                <button type="button" className="ct-link" onClick={() => { setOtroContacto(false); setResultado('') }}>
                  o anotar la respuesta de {enVendedor}
                </button>
              )}
            </label>
            <div className="ct-opts">
              {CANALES.map((c) => (
                <button key={c} type="button" className={'ct-opt' + (canal === c ? ' on' : '')}
                  onClick={() => setCanal(c)}>{c}</button>
              ))}
              <button type="button" className={'ct-opt' + (esVendedor ? ' on' : '')}
                onClick={() => { setCanal(CANAL_VENDEDOR); setResultado('') }}>Pedí al vendedor</button>
            </div>
          </div>
          {esVendedor ? (
            <>
              <div className="ct-fld">
                <label>A quién</label>
                <div className="ct-opts">
                  {VENDEDORES.map((v) => (
                    <button key={v} type="button" className={'ct-opt ct-opt-v' + (vendedor === v ? ' on' : '')}
                      onClick={() => setVendedor(v)}><span className="ct-av-op">{v.charAt(0)}</span>{v}</button>
                  ))}
                </div>
              </div>
              <div className="ct-fld">
                <label>Qué quedó</label>
                <div className="ct-auto">
                  ⏳ <span><b>Esperando la respuesta{vendedor ? ` de ${vendedor}` : ' del vendedor'}.</b> Cuando responda,
                  se anota con el botón "Respuesta" en la fila del cliente.</span>
                </div>
              </div>
            </>
          ) : (
            <div className="ct-fld">
              <label>Qué quedó</label>
              <div className="ct-opts">
                {RESULTADOS.map((r) => (
                  <button key={r.k} type="button" className={'ct-opt' + (resultado === r.k ? ' on' : '')}
                    onClick={() => setResultado(r.k)}>{r.label}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {resultado === 'promesa' && (
        <div className="ct-fld-row">
          <div className="ct-fld">
            <label>Paga el</label>
            <input type="date" className="input" value={fecha} min={hoyISO()}
              onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="ct-fld">
            <label>Cuánto (opcional)</label>
            <input type="text" className="input" value={monto} placeholder="$"
              onChange={(e) => setMonto(e.target.value)} />
          </div>
        </div>
      )}
      <div className="ct-fld">
        <label>Nota (opcional)</label>
        <input type="text" className="input" value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej. dice que le pagan el 15 y consigna el 17"
          onKeyDown={(e) => { if (e.key === 'Enter') guardar() }} />
      </div>
      <div className="ct-form-foot">
        <span className="ct-form-res">{resumen}</span>
        {onCancelar && <button className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>}
        <button className="btn btn-primary" onClick={guardar}
          disabled={guardando || (esVendedor && !modoRespuesta ? !vendedor : !resultado)}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function CarteraContacto({ cliente, usuario, onClose, onGuardado }) {
  if (!cliente) return null
  const ult = cliente.ult_contacto
  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">{cliente.cliente}</h2>
          <p className="eb-meta">
            {cliente.ciudad ? `${cliente.ciudad} · ` : ''}debe <b>{formatPrice(cliente.total) || '$ 0'}</b>
            {cliente.ult_pago ? ` · último pago ${fechaCorta(cliente.ult_pago)}` : ' · sin pagos'}
            {cliente.con_vendedor
              ? <> · con <b>{cliente.con_vendedor}</b> desde {haceTxt(cliente.dias_contacto)}</>
              : ult ? ` · último contacto ${haceTxt(cliente.dias_contacto)} (${ult.autor || '—'}: ${etiquetaResultado(resultadoDe(ult)).toLowerCase()})` : ' · sin contactos'}
          </p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <FormContacto cliente={cliente} usuario={usuario}
          onGuardado={async () => { if (onGuardado) await onGuardado(); onClose() }} />
        {cliente.gestion.length > 0 && (
          <div className="ct-hist">
            <div className="ct-sec-h">Contactos anteriores<span className="sp" /><span className="c">{cliente.gestion.length}</span></div>
            {cliente.gestion.slice(0, 8).map((g) => <LineaContacto key={g.id} g={g} />)}
          </div>
        )}
      </div>
    </Modal>
  )
}
