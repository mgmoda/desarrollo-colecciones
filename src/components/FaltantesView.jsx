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

const ESTADOS = {
  pendiente: 'Pendiente',
  gestion: 'En gestión',
  resuelto: 'Resuelto',
}

function cuando(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

// Edad del faltante: días completos desde que se reportó (o cuánto tardó en
// resolverse). Con piso, para que lo reportado hoy diga 0 y no 1.
function edad(f) {
  const hasta = f.estado === 'resuelto' && f.resueltoAt ? f.resueltoAt : Date.now()
  if (!f.creadoAt) return null
  return Math.max(0, Math.floor((hasta - f.creadoAt) / 86400000))
}

function FaltanteCard({ f, refMap, etapaViva, usuario, puedeResolver, onSave, onDelete, onViewImage, onOpenRef }) {
  const [nota, setNota] = useState('')
  const ficha = refMap.get(normRef(f.referencia))
  const dias = edad(f)
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

  function resolver() {
    onSave({ ...f, estado: 'resuelto', resueltoPor: usuario, resueltoAt: Date.now(), updatedAt: Date.now() },
      'resolver', {})
  }

  function reabrir() {
    const { resueltoPor: _p, resueltoAt: _a, ...resto } = f
    onSave({ ...resto, estado: 'gestion', updatedAt: Date.now() }, 'reabrir', {})
  }

  return (
    <article className={'fal-card' + (resuelto ? ' fal-resuelto' : '')}>
      <div className="fal-cuerpo">
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
            <span className={'fal-chip fal-' + f.estado}>
              {ESTADOS[f.estado]}{dias != null && (resuelto ? ` en ${dias} d` : ` · ${dias} d`)}
            </span>
          </p>
          <p className="fal-texto">“{f.descripcion}”</p>
          <p className="fal-meta">
            Reportó <b>{String(f.creadoPor || '').split('@')[0]}</b> · {cuando(f.creadoAt)}
            {resuelto && <> — resolvió <b>{String(f.resueltoPor || '').split('@')[0]}</b> · {cuando(f.resueltoAt)}</>}
          </p>

          {(f.notas || []).length > 0 && (
            <div className="fal-notas">
              {(f.notas || []).map((n, i) => (
                <p key={i}><b>{String(n.por || '').split('@')[0]}</b> · {cuando(n.at)} — “{n.texto}”</p>
              ))}
            </div>
          )}

          {!resuelto && (
            <div className="fal-acciones">
              <input className="input fal-nota-input" value={nota}
                placeholder="Agregar nota de seguimiento…"
                onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') agregarNota() }} />
              <button className="btn" onClick={agregarNota} disabled={!nota.trim()}>Anotar</button>
              {puedeResolver && (
                <button className="btn fal-btn-ok" onClick={resolver}
                  title="Marcar como resuelto">✓ Resuelto</button>
              )}
            </div>
          )}
          {resuelto && puedeResolver && (
            <div className="fal-acciones">
              <button className="btn" onClick={reabrir}>Reabrir</button>
              <button className="btn" onClick={() => {
                if (confirm('¿Eliminar este faltante definitivamente?')) onDelete(f)
              }}>Eliminar</button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default function FaltantesView({
  faltantes, orders, refMap, fasesOcultas, usuario, puedeResolver,
  onSave, onDelete, onViewImage, onOpenRef,
}) {
  const [filtro, setFiltro] = useState('activos')
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
    const c = { pendiente: 0, gestion: 0, resuelto: 0 }
    faltantes.forEach((f) => { if (c[f.estado] != null) c[f.estado] += 1 })
    return c
  }, [faltantes])

  const masViejo = useMemo(() => {
    const activos = faltantes.filter((f) => f.estado !== 'resuelto')
    return activos.reduce((m, f) => Math.max(m, edad(f) || 0), 0)
  }, [faltantes])

  const lista = useMemo(() => {
    let l = faltantes
    if (filtro === 'activos') l = l.filter((f) => f.estado !== 'resuelto')
    else if (filtro !== 'todos') l = l.filter((f) => f.estado === filtro)
    const term = q.trim().toLowerCase()
    if (term) {
      l = l.filter((f) => [f.referencia, f.orden, f.descripcion, f.creadoPor]
        .some((v) => String(v || '').toLowerCase().includes(term)))
    }
    // Los activos, del más viejo al más nuevo: lo urgente arriba, que no se
    // hunda como en WhatsApp. Los resueltos, del más reciente hacia atrás.
    return [...l].sort((a, b) => {
      const ra = a.estado === 'resuelto' ? 1 : 0
      const rb = b.estado === 'resuelto' ? 1 : 0
      if (ra !== rb) return ra - rb
      return ra ? (b.creadoAt - a.creadoAt) : (a.creadoAt - b.creadoAt)
    })
  }, [faltantes, filtro, q])

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
      notas: [],
      updatedAt: Date.now(),
    }, 'crear', { descripcion: texto })
    setCreando(false)
  }

  const FILTROS = [
    ['activos', `Activos ${conteos.pendiente + conteos.gestion}`],
    ['pendiente', `Pendientes ${conteos.pendiente}`],
    ['gestion', `En gestión ${conteos.gestion}`],
    ['resuelto', `Resueltos ${conteos.resuelto}`],
  ]

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

      <div className="fal-filtros">
        {FILTROS.map(([k, label]) => (
          <button key={k} type="button" className={'opt-btn' + (filtro === k ? ' on' : '')}
            onClick={() => setFiltro(k)}>{label}</button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="empty-state">
          <p>{faltantes.length === 0 ? 'No hay faltantes reportados.' : 'Nada en este filtro.'}</p>
          {faltantes.length === 0 && <p className="muted">Cuando en corte falte una pieza, repórtala aquí con “+ Reportar faltante”.</p>}
        </div>
      ) : (
        <div className="fal-lista">
          {lista.map((f) => {
            const ov = f.orden ? porOrden.get(String(f.orden)) : null
            const area = ov ? orderArea(ov) : null
            return (
              <FaltanteCard key={f.id} f={f} refMap={refMap}
                etapaViva={area ? AREAS[area].label : null}
                usuario={usuario} puedeResolver={puedeResolver}
                onSave={onSave} onDelete={onDelete}
                onViewImage={onViewImage} onOpenRef={onOpenRef} />
            )
          })}
        </div>
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
