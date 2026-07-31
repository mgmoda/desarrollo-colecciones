import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SearchInput from './SearchInput.jsx'
import { formatDate, normRef } from '../lib/constants.js'
import { newId } from '../lib/storage.js'

// Faltantes de corte: lo que antes se pedía por el grupo de WhatsApp y se
// hundía en la conversación. Aquí cada solicitud queda arriba hasta que
// Ninfa la resuelva, con su edad a la vista y el seguimiento anotado.

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

function FaltanteCard({ f, refMap, usuario, puedeResolver, onSave, onDelete, onViewImage, onOpenRef }) {
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
            {ficha && ficha.refInterna && ficha.refInterna !== f.referencia && (
              <span className="muted"> · {ficha.refInterna}</span>
            )}
            {f.orden && <span className="muted"> · orden {f.orden}</span>}
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
  faltantes, refMap, refIds, usuario, puedeResolver,
  onSave, onDelete, onViewImage, onOpenRef,
}) {
  const [filtro, setFiltro] = useState('activos')
  const [q, setQ] = useState('')
  const [creando, setCreando] = useState(false)
  const [nRef, setNRef] = useState('')
  const [nOrden, setNOrden] = useState('')
  const [nTexto, setNTexto] = useState('')

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

  function crear() {
    const ref = normRef(nRef)
    const texto = nTexto.trim()
    if (!ref || !texto) return
    onSave({
      id: newId(),
      referencia: ref,
      orden: nOrden.trim(),
      descripcion: texto,
      estado: 'pendiente',
      creadoPor: usuario,
      creadoAt: Date.now(),
      notas: [],
      updatedAt: Date.now(),
    }, 'crear', { descripcion: texto })
    setCreando(false); setNRef(''); setNOrden(''); setNTexto('')
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
          <button className="btn btn-primary" onClick={() => setCreando(true)}>+ Reportar faltante</button>
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
          {lista.map((f) => (
            <FaltanteCard key={f.id} f={f} refMap={refMap} usuario={usuario}
              puedeResolver={puedeResolver} onSave={onSave} onDelete={onDelete}
              onViewImage={onViewImage} onOpenRef={onOpenRef} />
          ))}
        </div>
      )}

      {creando && (
        <Modal open onClose={() => setCreando(false)} size="md">
          <div className="modal-head">
            <h2>Reportar faltante</h2>
            <button className="icon-btn" onClick={() => setCreando(false)} title="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            <div className="field-row">
              <div className="field">
                <label className="field-label">Referencia</label>
                <input className="input" value={nRef} list="fal-refs" autoFocus
                  onChange={(e) => setNRef(e.target.value.toUpperCase())}
                  placeholder="MG-B872 o C6893" />
                <datalist id="fal-refs">
                  {refIds.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
              <div className="field">
                <label className="field-label"># Orden (opcional)</label>
                <input className="input" value={nOrden}
                  onChange={(e) => setNOrden(e.target.value)} placeholder="10741" />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Qué falta</label>
              <textarea className="input fal-textarea" value={nTexto} rows={4}
                onChange={(e) => setNTexto(e.target.value)}
                placeholder="Ej. Faltan mangas estampadas talla 10 coral. Delanteros completos, solo falta lo que va en tela continua." />
            </div>
            <p className="field-hint">
              Escríbelo como lo pondrías en el grupo: piezas, tallas y colores.
            </p>
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setCreando(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={crear}
              disabled={!normRef(nRef) || !nTexto.trim()}>Reportar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
