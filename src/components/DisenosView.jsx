import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import SearchInput from './SearchInput.jsx'
import { formatDate } from '../lib/constants.js'
import { processImage, getImageFromClipboard } from '../lib/image.js'
import {
  ETAPAS, EVENTOS, TIPOS_DISENO, accionesDisponibles, codigoDiseno,
  disenoInfo, emptyDiseno, etapaColor, siguienteNumero,
} from '../lib/disenos.js'
import { dbLoadDisenoImgs, dbUpsertDiseno, dbDeleteDiseno } from '../lib/db.js'

const hoyISO = () => new Date().toISOString().slice(0, 10)

// Miniatura muy liviana para la lista (la imagen completa se carga al abrir).
function hacerThumb(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = 90
      const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', 0.6))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

function EtapaChip({ etapa, etiqueta, small }) {
  const c = etapaColor(etapa)
  return (
    <span className={'dis-chip' + (small ? ' sm' : '')}
      style={{ background: c.bg, color: c.fg, borderColor: c.bd }}>{etiqueta}</span>
  )
}

export default function DisenosView({ disenos, loading, onReload, onViewImage }) {
  const [q, setQ] = useState('')
  const [etapaF, setEtapaF] = useState('')
  const [abierto, setAbierto] = useState(null)   // código del diseño abierto
  const [nuevo, setNuevo] = useState(false)

  const conteo = useMemo(() => {
    const m = new Map()
    disenos.forEach((d) => {
      const { etapa } = disenoInfo(d)
      m.set(etapa, (m.get(etapa) || 0) + 1)
    })
    return m
  }, [disenos])

  const rows = useMemo(() => {
    let list = disenos
    if (etapaF) list = list.filter((d) => disenoInfo(d).etapa === etapaF)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((d) => [d.codigo, d.codigoCliente, d.nombre, d.tipo]
        .some((v) => String(v || '').toLowerCase().includes(term)))
    }
    return list
  }, [disenos, etapaF, q])

  return (
    <>
      <div className="view-actions" style={{ marginBottom: 14 }}>
        <div className="dis-filtros">
          <button type="button" className={'proc-f-btn' + (!etapaF ? ' on' : '')}
            onClick={() => setEtapaF('')}>Todos <b>{disenos.length}</b></button>
          {ETAPAS.filter((e) => conteo.get(e.key)).map((e) => {
            const c = etapaColor(e.key)
            const on = etapaF === e.key
            return (
              <button key={e.key} type="button" className={'proc-f-btn' + (on ? ' on' : '')}
                style={on ? { background: c.bg, color: c.fg, borderColor: c.bd } : undefined}
                onClick={() => setEtapaF(on ? '' : e.key)}>
                {e.label} <b>{conteo.get(e.key)}</b>
              </button>
            )
          })}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar diseño…" />
        <button className="btn btn-primary" onClick={() => setNuevo(true)}>+ Diseño</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Cargando diseños…</p></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>{disenos.length === 0 ? 'Aún no hay diseños de Geodésica.' : 'Sin diseños en este filtro.'}</p>
          {disenos.length === 0 && <p className="muted">Agrega el primero con “+ Diseño”.</p>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Diseño</th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Recibido</th>
                <th>Etapa actual</th>
                <th className="num">Rondas</th>
                <th className="num">Espera</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const info = disenoInfo(d)
                const alerta = !info.terminado && info.dias != null && info.dias >= 7
                return (
                  <tr key={d.codigo} className="row-click" onClick={() => setAbierto(d.codigo)}>
                    <td className="cell-photo">
                      {d.thumb
                        ? <img src={d.thumb} alt={d.codigo} className="thumb" />
                        : <span className="thumb empty">—</span>}
                    </td>
                    <td className="strong">
                      {d.codigo}
                      {d.codigoCliente && <span className="dis-codcli" title="Código de Geodésica">{d.codigoCliente}</span>}
                    </td>
                    <td>{d.nombre || <span className="muted">—</span>}</td>
                    <td className="muted">{formatDate(d.recibidoAt) || '—'}</td>
                    <td><EtapaChip etapa={info.etapa} etiqueta={info.etiqueta} /></td>
                    <td className="num">{info.rondas || <span className="muted">—</span>}</td>
                    <td className={'num' + (alerta ? ' dis-alerta' : '')}>
                      {info.terminado || info.dias == null ? <span className="muted">—</span> : `${info.dias} d`}
                    </td>
                    <td className="muted cell-action">Abrir ›</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nuevo && (
        <NuevoDisenoModal
          disenos={disenos}
          onClose={() => setNuevo(false)}
          onSaved={() => { setNuevo(false); onReload() }}
        />
      )}
      {abierto && (
        <DisenoModal
          meta={disenos.find((d) => d.codigo === abierto)}
          disenos={disenos}
          onClose={() => setAbierto(null)}
          onSaved={onReload}
          onRenombrado={(nuevo) => setAbierto(nuevo)}
          onViewImage={onViewImage}
        />
      )}
    </>
  )
}

// ---- Selector de varias imágenes ----
// Acepta pegar (Cmd/Ctrl+V), arrastrar y buscar el archivo, como el resto
// de la app. Solo hay un selector visible a la vez, así que escuchar el
// "paste" de la ventana es seguro.
function ImagePicker({ imgs, onChange, label = 'Agregar imágenes' }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const listaRef = useRef(imgs)
  listaRef.current = imgs

  const agregar = useCallback(async (files) => {
    const arr = [...(files || [])].filter((f) => f && f.type.startsWith('image/'))
    if (!arr.length) return
    setBusy(true)
    try {
      const nuevas = []
      for (const f of arr) {
        try { const { dataUrl } = await processImage(f); nuevas.push(dataUrl) } catch (e) { console.error(e) }
      }
      if (nuevas.length) onChange([...(listaRef.current || []), ...nuevas])
    } finally { setBusy(false) }
  }, [onChange])

  useEffect(() => {
    function onPaste(e) {
      const f = getImageFromClipboard(e)
      if (f) { e.preventDefault(); agregar([f]) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [agregar])

  return (
    <div className="dis-picker">
      <div className="dis-picker-list">
        {(imgs || []).map((src, i) => (
          <span key={i} className="dis-thumb">
            <img src={src} alt={`imagen ${i + 1}`} />
            <button type="button" className="dis-thumb-x" title="Quitar"
              onClick={() => onChange(imgs.filter((_, k) => k !== i))}>×</button>
          </span>
        ))}
        <button type="button"
          className={'dis-add' + (drag ? ' is-drag' : '') + (busy ? ' is-busy' : '')}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); agregar(e.dataTransfer.files) }}>
          <span className="dis-add-ico" aria-hidden="true">{busy ? '⏳' : drag ? '⬇' : '＋'}</span>
          <span className="dis-add-tit">{busy ? 'Procesando…' : drag ? 'Suelta aquí' : label}</span>
          {!busy && !drag && <span className="dis-add-hint">pega con Cmd/Ctrl + V<br />o arrastra el archivo</span>}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { agregar(e.target.files); e.target.value = '' }} />
    </div>
  )
}

// ---- Nuevo diseño ----
function NuevoDisenoModal({ disenos, onClose, onSaved }) {
  const [tipo, setTipo] = useState('Blusa')
  const [numero, setNumero] = useState(() => siguienteNumero(disenos, 'Blusa'))
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [imgs, setImgs] = useState([])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  // null = usar el código automático; si se escribe uno propio, manda ese.
  const [codigoManual, setCodigoManual] = useState(null)

  const codigoAuto = codigoDiseno(tipo, numero)
  const codigo = (codigoManual === null ? codigoAuto : codigoManual).trim()
  const repetido = codigo !== '' && disenos.some((d) => d.codigo === codigo)
  const invalido = codigo === '' || repetido

  function cambiarTipo(t) {
    setTipo(t)
    setNumero(siguienteNumero(disenos, t))
  }

  async function guardar() {
    if (invalido || guardando) return
    setGuardando(true)
    try {
      const base = emptyDiseno(codigo, tipo)
      base.nombre = nombre.trim()
      base.recibidoAt = fecha
      base.eventos = [{ tipo: 'recibido', fecha, nota: nota.trim() }]
      base.thumb = imgs.length ? await hacerThumb(imgs[0]) : null
      const { imgs: _drop, ...meta } = base
      await dbUpsertDiseno(meta, imgs.length ? { 'ev-0': imgs } : {})
      onSaved()
    } catch (e) {
      console.error(e)
      alert('No se pudo guardar el diseño: ' + (e.message || e))
      setGuardando(false)
    }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">Nuevo diseño de Geodésica</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <div className="field-row">
          <div className="field">
            <label className="field-label">Tipo de prenda</label>
            <div className="select-wrap">
              <select className="input select" value={tipo} onChange={(e) => cambiarTipo(e.target.value)}>
                {TIPOS_DISENO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="select-caret" aria-hidden="true">▾</span>
            </div>
          </div>
          <div className="field">
            <label className="field-label">Número</label>
            <input className="input" type="number" value={numero}
              onChange={(e) => setNumero(Number(e.target.value) || 0)} />
          </div>
          <div className="field">
            <label className="field-label">
              Código
              {codigoManual !== null && (
                <button type="button" className="dis-cod-reset"
                  title={`Volver al automático (${codigoAuto})`}
                  onClick={() => setCodigoManual(null)}>↺ automático</button>
              )}
            </label>
            <input className={'input dis-codigo' + (invalido ? ' err' : '')}
              value={codigo}
              onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
              placeholder={codigoAuto} />
            {repetido
              ? <span className="field-error">Ese código ya existe</span>
              : codigo === ''
                ? <span className="field-error">Escribe un código</span>
                : <span className="field-hint">Puedes usar el automático o escribir el del cliente</span>}
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Nombre del diseño</label>
            <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Floral acuarela" />
          </div>
          <div className="field">
            <label className="field-label">Fecha de recibido</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Diseño que envía Geodésica</label>
          <ImagePicker imgs={imgs} onChange={setImgs} label="Subir diseño" />
        </div>
        <div className="field">
          <label className="field-label">Nota (opcional)</label>
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="Indicaciones del cliente…" />
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={invalido || guardando}>
          {guardando ? 'Guardando…' : 'Crear diseño'}
        </button>
      </div>
    </Modal>
  )
}

// ---- Detalle con bitácora ----
function DisenoModal({ meta, disenos = [], onClose, onSaved, onRenombrado, onViewImage }) {
  const [imgs, setImgs] = useState(null)     // null = cargando
  const [registrando, setRegistrando] = useState(null)  // tipo de evento
  const [fecha, setFecha] = useState(hoyISO())
  const [nota, setNota] = useState('')
  const [codCliente, setCodCliente] = useState(meta?.codigoCliente || '')
  const [nuevasImgs, setNuevasImgs] = useState([])
  const [guardando, setGuardando] = useState(false)
  // Edición de los datos base y de las imágenes de cada ronda.
  const [editando, setEditando] = useState(false)
  const [ed, setEd] = useState(null)

  useEffect(() => {
    let vivo = true
    dbLoadDisenoImgs(meta.codigo)
      .then((r) => { if (vivo) setImgs(r) })
      .catch((e) => { console.error(e); if (vivo) setImgs({}) })
    return () => { vivo = false }
  }, [meta.codigo])

  const info = disenoInfo(meta)
  const acciones = accionesDisponibles(info.etapa)

  function abrirRegistro(tipo) {
    setRegistrando(tipo)
    setFecha(hoyISO())
    setNota('')
    setNuevasImgs([])
  }

  async function registrar() {
    if (guardando) return
    setGuardando(true)
    try {
      const def = EVENTOS[registrando] || {}
      const eventos = [...(meta.eventos || [])]
      const ev = { tipo: registrando, fecha }
      if (nota.trim()) ev.nota = nota.trim()
      if (def.codigoCliente && codCliente.trim()) ev.codigoCliente = codCliente.trim()
      eventos.push(ev)

      const idx = eventos.length - 1
      const nuevoMeta = { ...meta, eventos, updatedAt: Date.now() }
      if (def.codigoCliente && codCliente.trim()) nuevoMeta.codigoCliente = codCliente.trim()
      if (!meta.thumb && nuevasImgs.length) nuevoMeta.thumb = await hacerThumb(nuevasImgs[0])

      const nuevasTodas = { ...(imgs || {}) }
      if (nuevasImgs.length) nuevasTodas['ev-' + idx] = nuevasImgs

      await dbUpsertDiseno(nuevoMeta, nuevasTodas)
      setRegistrando(null)
      setImgs(nuevasTodas)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('No se pudo registrar: ' + (e.message || e))
    } finally { setGuardando(false) }
  }

  function abrirEdicion() {
    setRegistrando(null)
    setEd({
      codigo: meta.codigo,
      codigoCliente: meta.codigoCliente || '',
      nombre: meta.nombre || '',
      tipo: meta.tipo || '',
      recibidoAt: meta.recibidoAt || '',
      imgs: { ...(imgs || {}) },
      eventos: (meta.eventos || []).map((e) => ({ ...e })),
    })
    setEditando(true)
  }

  async function guardarEdicion() {
    if (guardando) return
    const codigo = (ed.codigo || '').trim().toUpperCase()
    if (!codigo) { alert('El código no puede quedar vacío.'); return }
    const cambioCodigo = codigo !== meta.codigo
    if (cambioCodigo && disenos.some((d) => d.codigo === codigo)) {
      alert('Ya existe un diseño con ese código.'); return
    }
    setGuardando(true)
    try {
      const eventos = ed.eventos
      // La fecha de recibido manda sobre la del primer evento.
      if (eventos[0] && eventos[0].tipo === 'recibido') eventos[0].fecha = ed.recibidoAt
      const primeraImg = ed.imgs['ev-0'] && ed.imgs['ev-0'][0]
      const nuevoMeta = {
        ...meta,
        codigo,
        codigoCliente: (ed.codigoCliente || '').trim(),
        nombre: (ed.nombre || '').trim(),
        tipo: ed.tipo,
        recibidoAt: ed.recibidoAt,
        eventos,
        thumb: primeraImg ? await hacerThumb(primeraImg) : null,
        updatedAt: Date.now(),
      }
      await dbUpsertDiseno(nuevoMeta, ed.imgs)
      if (cambioCodigo) await dbDeleteDiseno(meta.codigo)
      setImgs(ed.imgs)
      setEditando(false)
      onSaved()
      if (cambioCodigo && onRenombrado) onRenombrado(codigo)
    } catch (e) {
      console.error(e)
      alert('No se pudo guardar: ' + (e.message || e))
    } finally { setGuardando(false) }
  }

  // Borra el último evento (para deshacer un registro equivocado).
  async function borrarUltimoEvento() {
    const evs = meta.eventos || []
    if (evs.length <= 1) { alert('No se puede borrar el evento inicial. Elimina el diseño si quieres empezar de cero.'); return }
    const def = EVENTOS[evs[evs.length - 1].tipo] || {}
    if (!confirm(`¿Deshacer el último registro (“${def.label}”)?`)) return
    setGuardando(true)
    try {
      const idx = evs.length - 1
      const nuevos = evs.slice(0, idx)
      const nuevasImgsTodas = { ...(imgs || {}) }
      delete nuevasImgsTodas['ev-' + idx]
      const nuevoMeta = { ...meta, eventos: nuevos, updatedAt: Date.now() }
      // Si se deshace la aprobación, el código del cliente deja de aplicar.
      if (evs[idx].tipo === 'aprobado') nuevoMeta.codigoCliente = ''
      await dbUpsertDiseno(nuevoMeta, nuevasImgsTodas)
      setImgs(nuevasImgsTodas)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('No se pudo deshacer: ' + (e.message || e))
    } finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar el diseño ${meta.codigo} y todas sus rondas?`)) return
    try { await dbDeleteDiseno(meta.codigo); onClose(); onSaved() } catch (e) { console.error(e) }
  }

  const defReg = registrando ? EVENTOS[registrando] : null

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="modal-head">
        <h2 className="modal-title">
          {meta.codigo}
          {meta.codigoCliente && <span className="dis-codcli lg">{meta.codigoCliente}</span>}
          {meta.nombre && <span className="dis-nombre">· {meta.nombre}</span>}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EtapaChip etapa={info.etapa} etiqueta={info.etiqueta} />
          {!editando && imgs !== null && (
            <button className="btn btn-ghost dis-editar" onClick={abrirEdicion}>✎ Editar</button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
      </div>

      {editando ? (
        <>
        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label className="field-label">Código</label>
              <input className="input dis-codigo" value={ed.codigo}
                onChange={(e) => setEd({ ...ed, codigo: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label className="field-label">Código de Geodésica</label>
              <input className="input" value={ed.codigoCliente} placeholder="Cuando lo asignen"
                onChange={(e) => setEd({ ...ed, codigoCliente: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Nombre del diseño</label>
              <input className="input" value={ed.nombre} placeholder="Ej. Floral acuarela"
                onChange={(e) => setEd({ ...ed, nombre: e.target.value })} />
            </div>
            <div className="field">
              <label className="field-label">Tipo de prenda</label>
              <div className="select-wrap">
                <select className="input select" value={ed.tipo}
                  onChange={(e) => setEd({ ...ed, tipo: e.target.value })}>
                  <option value="">Sin definir</option>
                  {TIPOS_DISENO.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="select-caret" aria-hidden="true">▾</span>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Fecha de recibido</label>
              <input className="input" type="date" value={ed.recibidoAt}
                onChange={(e) => setEd({ ...ed, recibidoAt: e.target.value })} />
            </div>
          </div>

          <div className="dis-ed-sep">Rondas — puedes corregir la fecha, la nota y las imágenes</div>
          {ed.eventos.map((ev, i) => {
            const def = EVENTOS[ev.tipo] || { label: ev.tipo }
            return (
              <div key={i} className="dis-ed-ev">
                <div className="dis-ed-ev-tit">{def.label}</div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Fecha</label>
                    <input className="input" type="date" value={ev.fecha || ''}
                      onChange={(e) => {
                        const evs = [...ed.eventos]; evs[i] = { ...ev, fecha: e.target.value }
                        setEd({ ...ed, eventos: evs })
                      }} />
                  </div>
                  <div className="field" style={{ flex: 2 }}>
                    <label className="field-label">Nota</label>
                    <input className="input" value={ev.nota || ''} placeholder="Opcional…"
                      onChange={(e) => {
                        const evs = [...ed.eventos]; evs[i] = { ...ev, nota: e.target.value }
                        setEd({ ...ed, eventos: evs })
                      }} />
                  </div>
                </div>
                <ImagePicker
                  imgs={ed.imgs['ev-' + i] || []}
                  onChange={(lista) => setEd({ ...ed, imgs: { ...ed.imgs, ['ev-' + i]: lista } })}
                  label="Agregar imagen" />
              </div>
            )
          })}
        </div>
        <div className="modal-foot">
          <button className="btn btn-danger" onClick={borrarUltimoEvento} disabled={guardando}>
            ↩ Deshacer último registro
          </button>
          <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardarEdicion} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
        </>
      ) : (
      <>
      <div className="modal-body">
        <div className="dis-bitacora">
          {(meta.eventos || []).map((ev, i) => {
            const def = EVENTOS[ev.tipo] || { label: ev.tipo }
            const evImgs = imgs ? (imgs['ev-' + i] || []) : []
            const esCorreccion = ev.tipo === 'correccion' || ev.tipo === 'strikeoffCorreccion'
            return (
              <div key={i} className={'dis-ev' + (esCorreccion ? ' corr' : '')}>
                <div className="dis-ev-fecha">{formatDate(ev.fecha)}</div>
                <div className="dis-ev-cuerpo">
                  <div className="dis-ev-titulo">
                    {esCorreccion && '↺ '}{def.label}
                    {ev.codigoCliente && <span className="dis-codcli">{ev.codigoCliente}</span>}
                  </div>
                  {ev.nota && <div className="dis-ev-nota">“{ev.nota}”</div>}
                  {imgs === null ? (
                    <div className="dis-ev-cargando">cargando imágenes…</div>
                  ) : evImgs.length > 0 && (
                    <div className="dis-ev-imgs">
                      {evImgs.map((src, k) => (
                        <img key={k} src={src} alt="" onClick={() => onViewImage && onViewImage(src)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {registrando ? (
          <div className="dis-registro">
            <div className="dis-registro-tit">{defReg.label}</div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Fecha</label>
                <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              {defReg.codigoCliente && (
                <div className="field">
                  <label className="field-label">Código de Geodésica</label>
                  <input className="input" value={codCliente} onChange={(e) => setCodCliente(e.target.value.toUpperCase())}
                    placeholder="El código real del cliente" />
                </div>
              )}
            </div>
            {(defReg.nota || true) && (
              <div className="field">
                <label className="field-label">{defReg.nota ? 'Qué pide corregir' : 'Nota (opcional)'}</label>
                <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder={defReg.nota ? 'Ej. bajar saturación del verde' : 'Opcional…'} />
              </div>
            )}
            {defReg.img && (
              <div className="field">
                <label className="field-label">Imágenes</label>
                <ImagePicker imgs={nuevasImgs} onChange={setNuevasImgs} label="Subir" />
              </div>
            )}
            <div className="dis-registro-foot">
              <button className="btn" onClick={() => setRegistrando(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={registrar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        ) : acciones.length > 0 ? (
          <div className="dis-acciones">
            {acciones.map((a) => (
              <button key={a} className={'btn' + (a === 'aprobado' || a === 'strikeoffAprobado' ? ' btn-ok' : '')}
                onClick={() => abrirRegistro(a)}>
                {EVENTOS[a].label}
              </button>
            ))}
          </div>
        ) : (
          <div className="dis-acciones"><span className="muted">Diseño terminado.</span></div>
        )}
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={eliminar}>Eliminar</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
      </>
      )}
    </Modal>
  )
}
