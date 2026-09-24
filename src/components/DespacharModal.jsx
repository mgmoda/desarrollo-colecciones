import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { EMPAQUES, abrirEtiqueta, armarGuia, faltantesDe, coordinadora } from '../lib/coordinadora.js'
import { formatPrice } from '../lib/constants.js'

// Despachar con Coordinadora: destinatario precargado de la libreta, empaque,
// cotización automática y la guía con un clic. Lo que se corrige del
// destinatario se guarda en la libreta para el próximo envío.
const num = (n) => new Intl.NumberFormat('es-CO').format(Math.round(Number(n) || 0))

export default function DespacharModal({ cliente, ciudadSyd, pedidos, unidades, libreta, ciudades, danePorCiudad, usuario, onGuardarLibreta, onGuiaGenerada, onClose, llamar = coordinadora }) {
  const base = libreta || {}
  const [dest, setDest] = useState({
    cliente_key: cliente, nombre: base.nombre || cliente, documento: base.documento || '', tipo_documento: base.tipo_documento || 13,
    direccion: base.direccion || '', ciudad_syd: base.ciudad_syd || ciudadSyd || '', dane: base.dane || danePorCiudad[ciudadSyd] || '',
    celular: base.celular || '', correo: base.correo || '', observacion: base.observacion || '',
  })
  const [empKey, setEmpKey] = useState('caja')
  const [cajas, setCajas] = useState(1)
  const emp = EMPAQUES.find((e) => e.key === empKey)
  const [valor, setValor] = useState(String(emp.valor))
  const [cot, setCot] = useState(null)     // { flete, dias, ... } | { error }
  const [cotizando, setCotizando] = useState(false)
  const [gen, setGen] = useState(null)     // resultado de generar
  const [generando, setGenerando] = useState(false)
  const [etiqueta, setEtiqueta] = useState('')
  const timer = useRef(null)

  function cambiarEmpaque(k) {
    const e = EMPAQUES.find((x) => x.key === k)
    setEmpKey(k); setValor(String(e.valor * Math.max(1, Number(cajas) || 1)))
  }
  function cambiarCajas(n) {
    const c = Math.max(1, Number(n) || 1)
    setCajas(c); setValor(String(emp.valor * c))
  }
  const faltan = faltantesDe(dest)
  const ciudadOk = !!dest.dane
  const nombreCiudad = useMemo(() => { const c = (ciudades || []).find((x) => x.dane === dest.dane); return c ? `${c.municipio} (${c.departamento})` : '' }, [ciudades, dest.dane])

  // Cotiza sola cuando cambian ciudad, empaque, cajas o valor (con una pausa
  // para no pedir en cada tecla).
  useEffect(() => {
    if (!ciudadOk) { setCot(null); return undefined }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setCotizando(true)
      try {
        const r = await llamar('cotizar', { destino: dest.dane, valoracion: Number(valor) || 0, detalle: [{ alto: emp.alto, ancho: emp.ancho, largo: emp.largo, peso: emp.peso, unidades: Math.max(1, Number(cajas) || 1) }] })
        const d = r && r.data && r.data.data
        if (r && r.ok && d) setCot({ flete: d.flete_total, fijo: d.flete_fijo, variable: d.flete_variable, dias: d.dias_entrega, pesoLiq: d.peso_liquidado, raw: r.data })
        else setCot({ error: (r && r.data && (r.data.error?.message || r.data.message || JSON.stringify(r.data).slice(0, 160))) || 'Sin respuesta' })
      } catch (e) { setCot({ error: e.message || String(e) }) }
      setCotizando(false)
    }, 600)
    return () => clearTimeout(timer.current)
  }, [dest.dane, empKey, cajas, valor, ciudadOk])

  async function generar() {
    if (faltan.length || generando) return
    setGenerando(true); setGen(null)
    try {
      await onGuardarLibreta(dest)
      const guia = armarGuia({ dest, emp, cajas, valorDeclarado: valor, pedidos, observacion: dest.observacion })
      const r = await llamar('guia', { guia })
      const numero = r && r.guia
      const registro = {
        id: numero || ('sin-numero-' + Date.now()), cliente_key: cliente, cliente, pedidos, empaque: empKey, cajas: Math.max(1, Number(cajas) || 1),
        valor_declarado: Number(valor) || 0, cotizacion: cot && !cot.error ? cot.raw : null, enviado: r && r.enviado, respuesta: r && r.data,
        guia: numero, estado: numero ? 'generada' : 'error', ambiente: 'test', usuario, at: new Date().toISOString(),
      }
      if (numero) await onGuiaGenerada(registro)
      setGen({ numero, ok: !!numero, status: r && r.status, respuesta: r && r.data })
    } catch (e) { setGen({ ok: false, error: e.message || String(e) }) }
    setGenerando(false)
  }

  async function imprimirEtiqueta() {
    if (!gen || !gen.numero) return
    setEtiqueta('')
    try { setEtiqueta(await abrirEtiqueta(gen.numero, llamar)) } catch (e) { setEtiqueta(e.message || String(e)) }
  }

  const campo = (k, props = {}) => (
    <input className={'input' + (props.falta ? ' cd-falta' : '')} value={dest[k] || ''} onChange={(e) => setDest({ ...dest, [k]: e.target.value })} {...props} />
  )

  return (
    <Modal open onClose={onClose} size="xl">
      <div className="modal-head">
        <div>
          <h2 className="modal-title">Guía Coordinadora · {cliente}</h2>
          <p className="eb-meta">{ciudadSyd || '—'} · pedidos {pedidos.join(', ') || '—'} · {num(unidades)} unidades separadas
            {base.ultima_guia ? ` · último envío ${base.ultimo_envio || ''} (guía ${base.ultima_guia})` : ' · sin envíos este año'}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body cd-cuerpo">
        <div className="cd-col">
          <h3>Destinatario {base.origen === 'reporte' && <span className="tag dsp-tag">de la libreta · {num(base.envios_2026)} envíos</span>}</h3>
          <div className="cd-f"><label>Nombre</label>{campo('nombre')}</div>
          <div className="cd-f"><label>Cédula / NIT</label>{campo('documento', { inputMode: 'numeric' })}</div>
          <div className="cd-f"><label>Dirección</label>{campo('direccion')}</div>
          <div className="cd-f"><label>Ciudad</label>
            <select className={'input' + (ciudadOk ? '' : ' cd-falta')} value={dest.dane || ''} onChange={(e) => setDest({ ...dest, dane: e.target.value })}>
              <option value="">— elegir ciudad —</option>
              {(ciudades || []).map((c) => <option key={c.dane} value={c.dane}>{c.municipio} ({c.departamento})</option>)}
            </select>
          </div>
          <div className="cd-f"><label>Celular</label>{campo('celular', { inputMode: 'tel', placeholder: '10 dígitos · obligatorio', falta: String(dest.celular || '').replace(/\D/g, '').length < 10 })}</div>
          <div className="cd-f"><label>Correo</label>{campo('correo', { placeholder: 'opcional' })}</div>
          <div className="cd-f"><label>Observación</label>{campo('observacion', { placeholder: 'piso, local, horario…' })}</div>
          {faltan.length > 0 && <div className="dsp-nota">Falta: {faltan.join(', ')}. Se guarda en la libreta y no se vuelve a pedir.</div>}
        </div>
        <div className="cd-col">
          <h3>Empaque</h3>
          <div className="cd-emp">
            {EMPAQUES.map((e) => (
              <button type="button" key={e.key} className={'cd-emp-btn' + (empKey === e.key ? ' on' : '')} onClick={() => cambiarEmpaque(e.key)}>
                <b>{e.label}</b><span>{e.nota}</span><span>declarado {formatPrice(e.valor)}</span>
              </button>
            ))}
          </div>
          <div className="cd-f"><label>Cajas</label><input className="input cd-corto" type="number" min="1" value={cajas} onChange={(e) => cambiarCajas(e.target.value)} /></div>
          <div className="cd-f"><label>Valor declarado</label><input className="input cd-corto" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} /></div>
          <div className="cd-cot">
            <span className="cd-cot-t">Cotización · Bucaramanga → {nombreCiudad || 'ciudad sin elegir'}</span>
            {!ciudadOk ? <b className="muted">—</b>
              : cotizando ? <b className="muted">cotizando…</b>
                : cot && cot.error ? <span className="cd-err">{cot.error}</span>
                  : cot ? <><b className="cd-cot-g">{formatPrice(cot.flete)}</b><span className="muted">fijo {formatPrice(cot.fijo)} · variable {formatPrice(cot.variable)} · entrega <b>{cot.dias} {cot.dias === 1 ? 'día' : 'días'}</b> · peso liquidado {cot.pesoLiq} kg</span></>
                    : <b className="muted">—</b>}
          </div>
          <div className="dsp-acciones" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" disabled={faltan.length > 0 || generando || !!(gen && gen.ok)} onClick={generar}>{generando ? 'Generando…' : 'Generar guía'}</button>
            <span className="muted">Ambiente de <b>pruebas</b>: la guía no es real todavía.</span>
          </div>
          {gen && (
            <div className={'cd-res' + (gen.ok ? '' : ' err')}>
              {gen.ok ? (
                <>
                  <span className="cd-cot-t">Guía generada</span>
                  <b className="cd-guia">{gen.numero}</b>
                  <div className="dsp-acciones" style={{ marginTop: 6, paddingTop: 0, borderTop: 0 }}>
                    <button type="button" className="btn" onClick={imprimirEtiqueta}>Imprimir etiqueta</button>
                    <button type="button" className="btn" onClick={() => navigator.clipboard && navigator.clipboard.writeText(gen.numero)}>Copiar número</button>
                  </div>
                  {etiqueta && <div className="cd-err">{etiqueta}</div>}
                </>
              ) : (
                <>
                  <span className="cd-cot-t">No se generó la guía{gen.status ? ` (HTTP ${gen.status})` : ''}</span>
                  <code className="cd-raw">{gen.error || JSON.stringify(gen.respuesta, null, 1)}</code>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
