import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SearchInput from './SearchInput.jsx'
import { AREAS, ORIGEN_ABBR, normRef } from '../lib/constants.js'
import { orderArea, areaIndex } from '../lib/domain.js'
import { newId } from '../lib/storage.js'

// Faltantes de corte: lo que antes se pedía por el grupo de WhatsApp y se
// hundía en la conversación. Aquí cada solicitud queda arriba hasta que
// Ninfa la resuelva, con su edad a la vista y el seguimiento anotado.
//
// El reporte no se escribe a mano: se ESCOGE la orden (con su foto) entre
// las que están en Corte o ya pasaron a Por enviar, así el faltante queda
// amarrado al número de orden.

// Un faltante pasa por dos manos, y el estado dice de quién es la pelota:
// Corte lo reporta → Ninfa consigue lo que falta → cuando llega, Corte lo corta
// y lo entrega. Sin eso, "en gestión" no decía quién tenía que mover.
// Las cuatro columnas del tablero, en el orden en que avanza un faltante.
const ESTADOS = {
  pendiente: 'Faltante',
  proceso: 'En proceso',
  gestion: 'Entregado',
  resuelto: 'Completo',
}
const QUIEN = {
  pendiente: 'Corte lo reportó — Ninfa todavía no lo ha tomado',
  proceso: 'Ninfa lo está gestionando — pedir tela, mandar a estampar…',
  gestion: 'Ninfa ya lo entregó — falta que Corte lo corte',
  resuelto: 'Cortado y entregado, sin pendientes',
}
const COLUMNAS = ['pendiente', 'proceso', 'gestion', 'resuelto']
// Quién y cuándo dejó la tarjeta en cada columna. Cada paso guarda su propia
// firma, así que la tarjeta muestra la del paso en el que está parada.
const FIRMA = {
  pendiente: ['creadoPor', 'creadoAt'],
  proceso: ['procesoPor', 'procesoAt'],
  gestion: ['llegoPor', 'llegoAt'],
  resuelto: ['resueltoPor', 'resueltoAt'],
}
// La columna de completos crecería sin fin; se muestran los últimos.
const TOPE_COMPLETOS = 12
// Mismo criterio que las tablas de área: pasados 3 días la cifra sale en rojo.
const LIMITE_DIAS = 3

// Los empleados entran como "marcela", "monica", "ninfa". Se muestra el nombre
// solo, con mayúscula. Quien tenga correo real se recorta antes de la arroba.
// Mover una tarjeta de columna. Cada paso deja su marca de quién y cuándo; al
// devolverla se borran las marcas de los pasos que ya no aplican, para que los
// días no queden mintiendo. La usan el desplegable y el arrastre.
function conNuevoEstado(f, nuevo, usuario) {
  const ahora = Date.now()
  const {
    procesoPor: _pp, procesoAt: _pa, llegoPor: _lp, llegoAt: _la,
    resueltoPor: _rp, resueltoAt: _ra, ...limpio
  } = f
  const next = { ...limpio, estado: nuevo, updatedAt: ahora }
  const orden = COLUMNAS.indexOf(nuevo)
  if (orden >= 1) { next.procesoPor = f.procesoPor || usuario; next.procesoAt = f.procesoAt || ahora }
  if (orden >= 2) { next.llegoPor = f.llegoPor || usuario; next.llegoAt = f.llegoAt || ahora }
  if (orden >= 3) { next.resueltoPor = f.resueltoPor || usuario; next.resueltoAt = f.resueltoAt || ahora }
  // El reloj de la columna arranca en cada movida: lo que importa del día a día
  // es cuánto lleva parada AHÍ, no desde que nació el faltante.
  next.desdeAt = ahora
  next.historial = [...(f.historial || []), { de: f.estado, a: nuevo, por: usuario, at: ahora }]
  return next
}

// Desde cuándo está en la columna donde está. Los faltantes viejos no tienen
// `desdeAt`, así que se cae a la marca del paso, y de últimas a la creación.
function desdeCuando(f) {
  if (f.desdeAt) return f.desdeAt
  const campo = (FIRMA[f.estado] || [])[1]
  return (campo && f[campo]) || f.creadoAt
}

function nombreCorto(v) {
  const base = String(v || '').split('@')[0]
  // Solo el nombre de pila: "marcela" queda igual, y "diego_monsalve87" queda
  // en "Diego". El identificador completo se guarda en el title.
  const pila = (base.split(/[._-]+/).filter(Boolean)[0] || '').replace(/\d+$/, '')
  if (!pila) return ''
  return pila.charAt(0).toUpperCase() + pila.slice(1)
}

function diaMes(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'numeric' })
}

function cuando(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

// Días completos entre dos instantes, con piso: lo de hoy dice 0, no 1.
function dias(desde, hasta) {
  if (!desde) return null
  return Math.max(0, Math.floor(((hasta || Date.now()) - desde) / 86400000))
}

// Total desde que se reportó (o cuánto tardó en cerrarse).
function edad(f) {
  return dias(f.creadoAt, f.estado === 'resuelto' ? f.resueltoAt : null)
}

// Lo que lleva parada en la columna actual.
function edadColumna(f) {
  return dias(desdeCuando(f), f.estado === 'resuelto' ? f.resueltoAt : null)
}

function FaltanteCard({ f, refMap, etapaViva, usuario, puedeResolver, onSave, onDelete, onViewImage, onOpenRef }) {
  const [nota, setNota] = useState('')
  const ficha = refMap.get(normRef(f.referencia))
  const dias = edad(f)
  const enCol = edadColumna(f)
  const resuelto = f.estado === 'resuelto'

  function agregarNota() {
    const t = nota.trim()
    if (!t) return
    const nueva = { por: usuario, at: Date.now(), texto: t }
    const next = { ...f, notas: [...(f.notas || []), nueva], updatedAt: Date.now() }
    // La primera gestión de quien puede resolver mueve el faltante a "En gestión".
    if (next.estado === 'pendiente' && puedeResolver) next.estado = 'gestion'
    onSave(next, 'nota', { texto: t })
    setNota('')
  }

  // Mover de columna. Se escoge a cuál, no se avanza a ciegas: así también se
  // puede devolver una tarjeta si alguien la movió por error. Cada paso deja
  // su marca de quién y cuándo, y al retroceder se borran las que ya no aplican.
  function mover(nuevo) {
    if (nuevo === f.estado) return
    onSave(conNuevoEstado(f, nuevo, usuario), 'mover', { de: ESTADOS[f.estado], a: ESTADOS[nuevo] })
  }

  return (
    <article className={'fal-card' + (resuelto ? ' fal-resuelto' : '')}>
      <div className="fal-cuerpo">
        {enCol != null && (
          <div className={'fal-dias' + (!resuelto && enCol > LIMITE_DIAS ? ' fal-dias-alto' : '')}
            title={`${enCol} ${enCol === 1 ? 'día' : 'días'} en ${ESTADOS[f.estado]}`}>
            <b>{enCol}</b>
            <span>{enCol === 1 ? 'día aquí' : 'días aquí'}</span>
            {dias != null && dias !== enCol && (
              <em title="Desde que se reportó el faltante">{dias} en total</em>
            )}
          </div>
        )}
        {ficha && ficha.image ? (
          <img className="fal-foto" src={ficha.image} alt={f.referencia} title="Ampliar foto"
            onClick={() => onViewImage && onViewImage(ficha.image)} />
        ) : (
          <span className="fal-foto fal-foto-vacia">＋</span>
        )}
        <div className="fal-info">
          <p className="fal-ref">
            <b className={ficha && onOpenRef ? 'fal-ref-link' : ''}
              onClick={() => ficha && onOpenRef && onOpenRef(ficha)}
              title={ficha ? 'Abrir la ficha' : undefined}>
              {f.referencia}
            </b>
            {f.orden && <span className="muted"> · orden {f.orden}</span>}
            {!resuelto && etapaViva && (
              <span className="tag fal-etapa" title="Dónde va esa orden hoy">va en {etapaViva}</span>
            )}
            <span className={'fal-chip fal-' + f.estado} title={QUIEN[f.estado]}>
              {ESTADOS[f.estado]}
            </span>
          </p>
          <p className="fal-texto">“{f.descripcion}”</p>
          <p className="fal-meta">
            Reportó <b>{String(f.creadoPor || '').split('@')[0]}</b> · {cuando(f.creadoAt)}
            {f.procesoAt && <> — lo tomó <b>{String(f.procesoPor || '').split('@')[0]}</b> · {cuando(f.procesoAt)}</>}
            {f.llegoAt && <> — llegó <b>{String(f.llegoPor || '').split('@')[0]}</b> · {cuando(f.llegoAt)}</>}
            {resuelto && <> — entregó <b>{String(f.resueltoPor || '').split('@')[0]}</b> · {cuando(f.resueltoAt)}</>}
          </p>

          {(f.historial || []).length > 0 && (
            <div className="fal-historial">
              <p className="fal-historial-tit">Recorrido</p>
              <ol>
                <li>
                  <b>{nombreCorto(f.creadoPor)}</b> lo reportó · {cuando(f.creadoAt)}
                </li>
                {(f.historial || []).map((h, i) => (
                  <li key={i}>
                    <b>{nombreCorto(h.por)}</b> lo pasó de {ESTADOS[h.de] || h.de} a{' '}
                    <b>{ESTADOS[h.a] || h.a}</b> · {cuando(h.at)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(f.notas || []).length > 0 && (
            <div className="fal-notas">
              {(f.notas || []).map((n, i) => (
                <p key={i}><b>{String(n.por || '').split('@')[0]}</b> · {cuando(n.at)} — “{n.texto}”</p>
              ))}
            </div>
          )}

          <div className="fal-acciones">
            <input className="input fal-nota-input" value={nota}
              placeholder="Agregar nota de seguimiento…"
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregarNota() }} />
            <button className="btn" onClick={agregarNota} disabled={!nota.trim()}>Anotar</button>
            <div className="select-wrap fal-mover">
              <select className="input select" value={f.estado}
                onChange={(e) => mover(e.target.value)}
                title="Mover a otra columna del tablero">
                {COLUMNAS.map((k) => <option key={k} value={k}>{ESTADOS[k]}</option>)}
              </select>
              <span className="select-caret" aria-hidden="true">▾</span>
            </div>
            {resuelto && puedeResolver && (
              <button className="btn" onClick={() => {
                if (confirm('¿Eliminar este faltante definitivamente?')) onDelete(f)
              }}>Eliminar</button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function FaltantesView({
  faltantes, orders, refMap, fasesOcultas, usuario, puedeResolver,
  onSave, onDelete, onViewImage, onOpenRef,
}) {
  const [abierto, setAbierto] = useState(null) // id del faltante abierto en el modal
  const [arrastrando, setArrastrando] = useState(null) // id de la tarjeta que se arrastra
  const [colSobre, setColSobre] = useState(null)       // columna bajo el cursor
  const [q, setQ] = useState('')
  const [creando, setCreando] = useState(false)
  const [sel, setSel] = useState(null)        // orden elegida para el reporte
  const [qSel, setQSel] = useState('')
  const [todasEtapas, setTodasEtapas] = useState(false)
  const [nTexto, setNTexto] = useState('')

  const visibles = useMemo(
    () => orders.filter((o) => !(fasesOcultas && fasesOcultas.has(o.origen))),
    [orders, fasesOcultas],
  )

  // Dónde va hoy cada orden, para mostrarlo en la tarjeta del faltante.
  const porOrden = useMemo(() => {
    const m = new Map()
    visibles.forEach((o) => m.set(String(o.orden), o))
    return m
  }, [visibles])

  // Candidatas para reportar: lo que está en Corte o ya pasó a Por enviar.
  // El interruptor "todas las etapas" cubre los casos raros.
  const candidatas = useMemo(() => {
    let base = visibles.filter((o) => {
      const a = orderArea(o)
      if (!a) return false
      return todasEtapas || a === 'corte' || a === 'alistamiento' || a === 'enviar'
    })
    const term = qSel.trim().toLowerCase()
    if (term) {
      base = base.filter((o) => [o.referencia, o.producto, o.orden]
        .some((v) => String(v || '').toLowerCase().includes(term)))
    }
    return [...base].sort((a, b) => {
      const ia = areaIndex(orderArea(a))
      const ib = areaIndex(orderArea(b))
      if (ia !== ib) return ia - ib
      return String(b.orden).localeCompare(String(a.orden))
    })
  }, [visibles, todasEtapas, qSel])

  const conteos = useMemo(() => {
    const c = { pendiente: 0, proceso: 0, gestion: 0, resuelto: 0 }
    faltantes.forEach((f) => { if (c[f.estado] != null) c[f.estado] += 1 })
    return c
  }, [faltantes])

  const masViejo = useMemo(() => {
    const activos = faltantes.filter((f) => f.estado !== 'resuelto')
    return activos.reduce((m, f) => Math.max(m, edad(f) || 0), 0)
  }, [faltantes])

  // Reparto en columnas. Dentro de cada una, lo más viejo arriba: lo que lleva
  // más días esperando es lo que hay que mover. Los completos al revés, que ahí
  // interesa lo último que se cerró.
  const columnas = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtrados = term
      ? faltantes.filter((f) => [f.referencia, f.orden, f.descripcion, f.creadoPor]
        .some((v) => String(v || '').toLowerCase().includes(term)))
      : faltantes
    const out = {}
    COLUMNAS.forEach((k) => { out[k] = [] })
    filtrados.forEach((f) => { if (out[f.estado]) out[f.estado].push(f) })
    COLUMNAS.forEach((k) => {
      out[k].sort((a, b) => (k === 'resuelto'
        ? (b.resueltoAt || b.creadoAt) - (a.resueltoAt || a.creadoAt)
        : a.creadoAt - b.creadoAt))
    })
    out.resuelto = out.resuelto.slice(0, TOPE_COMPLETOS)
    return out
  }, [faltantes, q])

  const faltanteAbierto = useMemo(
    () => faltantes.find((f) => f.id === abierto) || null,
    [faltantes, abierto],
  )

  // Soltar una tarjeta en otra columna. El arrastre y el desplegable hacen lo
  // mismo: uno es cómodo con mouse, el otro en el celular.
  function soltarEn(estado) {
    const f = faltantes.find((x) => x.id === arrastrando)
    setArrastrando(null); setColSobre(null)
    if (!f || f.estado === estado) return
    onSave(conNuevoEstado(f, estado, usuario), 'mover', { de: ESTADOS[f.estado], a: ESTADOS[estado] })
  }

  function abrirReporte() {
    setSel(null); setQSel(''); setTodasEtapas(false); setNTexto('')
    setCreando(true)
  }

  function crear() {
    const texto = nTexto.trim()
    if (!sel || !texto) return
    onSave({
      id: newId(),
      referencia: normRef(sel.referencia),
      orden: String(sel.orden || ''),
      producto: sel.producto || '',
      descripcion: texto,
      estado: 'pendiente',
      creadoPor: usuario,
      creadoAt: Date.now(),
      desdeAt: Date.now(),
      historial: [],
      notas: [],
      updatedAt: Date.now(),
    }, 'crear', { descripcion: texto })
    setCreando(false)
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Faltantes</h1>
          <p className="view-sub">
            Responsable: Ninfa · piezas, tela o estampación pendientes
            {masViejo > 0 && <> · más viejo: {masViejo} d</>}
          </p>
        </div>
        <div className="view-actions">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia, texto…" />
          <button className="btn btn-primary" onClick={abrirReporte}>+ Reportar faltante</button>
        </div>
      </div>

      {faltantes.length === 0 ? (
        <div className="empty-state">
          <p>No hay faltantes reportados.</p>
          <p className="muted">Cuando en corte falte una pieza, repórtala aquí con “+ Reportar faltante”.</p>
        </div>
      ) : (
        <div className="fal-tablero-wrap">
          <div className="fal-tablero">
            {COLUMNAS.map((k) => (
              <section key={k}
                className={'fal-col fal-col-' + k + (colSobre === k && arrastrando ? ' fal-col-sobre' : '')}
                onDragOver={(e) => { if (arrastrando) { e.preventDefault(); setColSobre(k) } }}
                onDragLeave={() => setColSobre((c) => (c === k ? null : c))}
                onDrop={(e) => { e.preventDefault(); soltarEn(k) }}>
                <p className="fal-col-head" title={QUIEN[k]}>
                  <span>{ESTADOS[k]}</span>
                  <b>{k === 'resuelto' ? conteos.resuelto : columnas[k].length}</b>
                </p>
                {columnas[k].length === 0 ? (
                  <p className="fal-col-vacia">—</p>
                ) : columnas[k].map((f) => {
                  const ficha = refMap.get(normRef(f.referencia))
                  const enCol = edadColumna(f)
                  const total = edad(f)
                  const alto = k !== 'resuelto' && enCol != null && enCol > LIMITE_DIAS
                  const [cPor, cAt] = FIRMA[k]
                  const quien = nombreCorto(f[cPor])
                  return (
                    <div key={f.id} className={'fal-t-card' + (arrastrando === f.id ? ' fal-t-arrastrando' : '')}
                      role="button" tabIndex={0}
                      draggable
                      onDragStart={(e) => { setArrastrando(f.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setArrastrando(null); setColSobre(null) }}
                      onClick={() => setAbierto(f.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierto(f.id) } }}
                      title="Arrástrala a otra columna, o ábrela para anotar">
                      {ficha && ficha.image ? (
                        <img className="fal-t-foto" src={ficha.image} alt={f.referencia} draggable={false} />
                      ) : (
                        <span className="fal-t-foto fal-foto-vacia">＋</span>
                      )}
                      <span className="fal-t-info">
                        <span className="fal-t-ref">{f.referencia}</span>
                        <span className="fal-t-texto">{f.descripcion}</span>
                      </span>
                      <span className="fal-t-lado">
                        <span className={'fal-t-dias' + (alto ? ' fal-dias-alto' : '')}
                          title={`${enCol} ${enCol === 1 ? 'día' : 'días'} en ${ESTADOS[k]}`}>
                          {enCol}<i>d</i>
                        </span>
                        {total != null && total !== enCol && (
                          <span className="fal-t-total" title="Días desde que se reportó el faltante">
                            de {total}
                          </span>
                        )}
                        {quien && (
                          <span className="fal-t-quien" title={`${f[cPor]} · ${cuando(f[cAt])}`}>{quien}</span>
                        )}
                      </span>
                    </div>
                  )
                })}
                {k === 'resuelto' && conteos.resuelto > columnas.resuelto.length && (
                  <p className="fal-col-mas">y {conteos.resuelto - columnas.resuelto.length} más</p>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {faltanteAbierto && (
        <Modal open onClose={() => setAbierto(null)} size="lg">
          <div className="modal-head">
            <div>
              <h2>{faltanteAbierto.referencia}</h2>
              <p className="modal-sub">{ESTADOS[faltanteAbierto.estado]} · {QUIEN[faltanteAbierto.estado]}</p>
            </div>
            <button className="icon-btn" onClick={() => setAbierto(null)} title="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            {(() => {
              const ov = faltanteAbierto.orden ? porOrden.get(String(faltanteAbierto.orden)) : null
              const area = ov ? orderArea(ov) : null
              return (
                <FaltanteCard f={faltanteAbierto} refMap={refMap}
                  etapaViva={area ? AREAS[area].label : null}
                  usuario={usuario} puedeResolver={puedeResolver}
                  onSave={onSave} onDelete={(x) => { onDelete(x); setAbierto(null) }}
                  onViewImage={onViewImage} onOpenRef={onOpenRef} />
              )
            })()}
          </div>
          <div className="modal-foot">
            <button className="btn btn-primary" onClick={() => setAbierto(null)}>Cerrar</button>
          </div>
        </Modal>
      )}

      {creando && (
        <Modal open onClose={() => setCreando(false)} size="lg">
          <div className="modal-head">
            <div>
              <h2>Reportar faltante</h2>
              <p className="modal-sub">Escoge la orden a la que le faltan piezas</p>
            </div>
            <button className="icon-btn" onClick={() => setCreando(false)} title="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            <div className="fal-pick-barra">
              <SearchInput value={qSel} onChange={setQSel} placeholder="Buscar orden, referencia…" />
              <button type="button" className={'opt-btn' + (todasEtapas ? ' on' : '')}
                onClick={() => setTodasEtapas(!todasEtapas)}
                title="Ver también trazos, talleres y entrega">
                Todas las etapas
              </button>
            </div>

            {candidatas.length === 0 ? (
              <p className="muted fal-pick-vacio">No hay órdenes en Corte ni Por enviar con ese filtro.</p>
            ) : (
              <div className="fal-pick">
                {candidatas.map((o) => {
                  const ficha = refMap.get(o.referencia)
                  const area = orderArea(o)
                  const on = sel && sel.id === o.id
                  return (
                    <button key={o.id} type="button"
                      className={'fal-pick-item' + (on ? ' on' : '')}
                      onClick={() => setSel(on ? null : o)}>
                      {ficha && ficha.image ? (
                        <img className="fal-pick-foto" src={ficha.image} alt={o.referencia} />
                      ) : (
                        <span className="fal-pick-foto fal-foto-vacia">＋</span>
                      )}
                      <span className="fal-pick-info">
                        <span className="fal-pick-ref">
                          <b>{o.referencia}</b>
                          <span className={'origen-chip o-' + o.origen}>{ORIGEN_ABBR[o.origen] || o.origen}</span>
                        </span>
                        <span className="fal-pick-sub">
                          orden {o.orden}{o.producto && o.producto !== o.referencia ? ` · ${o.producto}` : ''}
                        </span>
                        <span className="fal-pick-etapa">{area ? AREAS[area].label : ''}</span>
                      </span>
                      {on && <span className="fal-pick-check">✓</span>}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label">Qué falta</label>
              <textarea className="input fal-textarea" value={nTexto} rows={3}
                onChange={(e) => setNTexto(e.target.value)}
                placeholder="Ej. Faltan mangas estampadas talla 10 coral. Delanteros completos, solo falta lo que va en tela continua." />
              <p className="field-hint">Escríbelo como lo pondrías en el grupo: piezas, tallas y colores.</p>
            </div>
          </div>
          <div className="modal-foot spread">
            <span className="muted fal-pick-sel">
              {sel ? <>Orden <b>{sel.orden}</b> · {sel.referencia}</> : 'Ninguna orden elegida'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setCreando(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={crear}
                disabled={!sel || !nTexto.trim()}>Reportar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
