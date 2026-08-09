import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import SearchInput from './SearchInput.jsx'
import { formatDate } from '../lib/constants.js'
import { processImage, getImageFromClipboard } from '../lib/image.js'
import {
  ETAPAS, EVENTOS, TIPOS_DISENO, accionesDisponibles, agruparPorFase, codigoDiseno, eventosPorFase,
  disenoInfo, duracionFases, emptyDiseno, etapaColor, siguienteNumero,
} from '../lib/disenos.js'
import FormatoDisenadora from './FormatoDisenadora.jsx'
import { dbLoadDisenoImgs, dbUpsertDiseno, dbDeleteDiseno, dbLog } from '../lib/db.js'
import { generateDisenosPDF } from '../lib/disenosPdf.js'

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
  const [sel, setSel] = useState(() => new Set())

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

  const todos = rows.length > 0 && rows.every((d) => sel.has(d.codigo))
  function alternar(codigo) {
    setSel((s) => { const n = new Set(s); n.has(codigo) ? n.delete(codigo) : n.add(codigo); return n })
  }
  function alternarTodos() {
    setSel(todos ? new Set() : new Set(rows.map((d) => d.codigo)))
  }

  function generarPdf() {
    const elegidos = rows.filter((d) => sel.has(d.codigo))
    if (!elegidos.length) return
    const items = elegidos.map((d) => {
      const info = disenoInfo(d)
      return {
        codigo: d.codigo,
        codigoCliente: d.codigoCliente || '',
        nombre: d.nombre || '',
        tipo: d.tipo || '',
        etapa: info.etiqueta,
        recibido: formatDate(d.recibidoAt) || '',
        rondas: info.rondas || 0,
        dias: info.terminado ? null : info.dias,
        diasTotal: info.diasTotal,
        image: d.thumb || null,
      }
    })
    const etapa = etapaF ? (ETAPAS.find((e) => e.key === etapaF) || {}).label : ''
    generateDisenosPDF(items, etapa ? `Etapa: ${etapa}` : '')
  }

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
        {sel.size > 0 && (
          <button className="btn btn-primary" onClick={generarPdf}>
            Generar PDF ({sel.size})
          </button>
        )}
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
                <th className="cell-check">
                  <input type="checkbox" checked={todos} onChange={alternarTodos}
                    title="Seleccionar todo" />
                </th>
                <th>Diseño</th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Recibido</th>
                <th>Etapa actual</th>
                <th className="num">Rondas</th>
                <th className="num">En etapa</th>
                <th className="num">Ciclo total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const info = disenoInfo(d)
                const alerta = !info.terminado && info.dias != null && info.dias >= 7
                return (
                  <tr key={d.codigo} className={'row-click' + (sel.has(d.codigo) ? ' row-sel' : '')}
                    onClick={() => setAbierto(d.codigo)}>
                    <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(d.codigo)}
                        onChange={() => alternar(d.codigo)} />
                    </td>
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
                    <td className="num dis-total" title={info.diasGrafico != null
                      ? `${info.diasGrafico} d desde que se mandó a desarrollo gráfico`
                      : 'Aún no se manda a desarrollo gráfico'}>
                      {info.diasTotal == null ? <span className="muted">—</span> : `${info.diasTotal} d`}
                      {info.diasGrafico != null && (
                        <span className="dis-total-sub">{info.diasGrafico} d gráfico</span>
                      )}
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
      dbLog('crear', 'diseño', meta.codigo, { tipo: meta.tipo || '' })
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
  const panelRegistro = useRef(null)
  const [edEv, setEdEv] = useState(null) // { i, fecha, nota, tela, metros, imgs }
  const [fecha, setFecha] = useState(hoyISO())
  const [nota, setNota] = useState('')
  const [codCliente, setCodCliente] = useState(meta?.codigoCliente || '')
  const [nuevasImgs, setNuevasImgs] = useState([])
  const [guardando, setGuardando] = useState(false)
  // Edición de los datos base y de las imágenes de cada ronda.
  const [editando, setEditando] = useState(false)
  const [ed, setEd] = useState(null)
  // Formato del strike off para la diseñadora gráfica.
  const [formato, setFormato] = useState(null)
  const [tela, setTela] = useState('')
  const [metros, setMetros] = useState('')
  const [imgElegida, setImgElegida] = useState(null)

  useEffect(() => {
    let vivo = true
    dbLoadDisenoImgs(meta.codigo)
      .then((r) => { if (vivo) setImgs(r) })
      .catch((e) => { console.error(e); if (vivo) setImgs({}) })
    return () => { vivo = false }
  }, [meta.codigo])

  const info = disenoInfo(meta)
  // Se puede registrar cualquier proceso; los del paso natural van marcados.
  const sugeridas = new Set(accionesDisponibles(info.etapa))
  const yaHechos = new Set((meta.eventos || []).map((e) => e.tipo))

  function abrirRegistro(tipo) {
    setEdEv(null)
    setRegistrando(tipo)
    setFecha(hoyISO())
    setNota('')
    setNuevasImgs([])
    setTela('')
    setMetros('')
    setImgElegida(null)
  }

  // Todas las imágenes ya cargadas del diseño, para elegir la del strike off.
  const todasLasImgs = imgs ? Object.values(imgs).flat() : []

  async function registrar() {
    if (guardando) return
    setGuardando(true)
    try {
      const def = EVENTOS[registrando] || {}
      const eventos = [...(meta.eventos || [])]
      const ev = { tipo: registrando, fecha }
      if (nota.trim()) ev.nota = nota.trim()
      if (def.codigoCliente && codCliente.trim()) ev.codigoCliente = codCliente.trim()
      if (def.formato || def.tela) {
        if (tela.trim()) ev.tela = tela.trim()
        if (metros) ev.metros = metros
      }
      eventos.push(ev)

      const idx = eventos.length - 1
      const nuevoMeta = { ...meta, eventos, updatedAt: Date.now() }
      if (def.codigoCliente && codCliente.trim()) nuevoMeta.codigoCliente = codCliente.trim()
      if (!meta.thumb && nuevasImgs.length) nuevoMeta.thumb = await hacerThumb(nuevasImgs[0])

      // En el strike off se puede reutilizar una imagen ya cargada del diseño.
      const conPicker = def.formato || def.formatoCorreccion
      const delEvento = conPicker && imgElegida
        ? [imgElegida, ...nuevasImgs]
        : nuevasImgs
      const nuevasTodas = { ...(imgs || {}) }
      if (delEvento.length) nuevasTodas['ev-' + idx] = delEvento

      await dbUpsertDiseno(nuevoMeta, nuevasTodas)
      dbLog('registrar', 'diseño', meta.codigo, { proceso: def.label || registrando, fecha })
      setRegistrando(null)
      setImgs(nuevasTodas)
      onSaved()
      // Recién registrado, mostrar de una vez la hoja para mandarla.
      if (def.formato || def.formatoCorreccion) {
        setFormato({ ev, img: delEvento[0], variante: def.formatoCorreccion ? 'correccion' : 'strikeoff' })
      }
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

  // Borra un registro cualquiera de la bitácora, no solo el último: las
  // imágenes van indexadas por posición ('ev-3'), así que hay que recorrerlas.
  async function borrarEvento(i) {
    const evs = meta.eventos || []
    if (evs.length <= 1) { alert('No se puede borrar el único registro. Elimina el diseño si quieres empezar de cero.'); return }
    const def = EVENTOS[evs[i].tipo] || {}
    if (!confirm(`¿Borrar el registro “${def.label}” del ${formatDate(evs[i].fecha)}?`)) return
    setGuardando(true)
    try {
      const nuevos = evs.filter((_, k) => k !== i)
      const nuevasImgsTodas = {}
      evs.forEach((_, k) => {
        if (k === i) return
        const lista = (imgs || {})['ev-' + k]
        if (lista) nuevasImgsTodas['ev-' + (k > i ? k - 1 : k)] = lista
      })
      const nuevoMeta = { ...meta, eventos: nuevos, updatedAt: Date.now() }
      // Sin evento de aprobación, el código del cliente deja de aplicar.
      if (evs[i].tipo === 'aprobado' && !nuevos.some((e) => e.tipo === 'aprobado')) {
        nuevoMeta.codigoCliente = ''
      }
      if (i === 0) {
        const primera = nuevasImgsTodas['ev-0'] && nuevasImgsTodas['ev-0'][0]
        nuevoMeta.thumb = primera ? await hacerThumb(primera) : null
      }
      await dbUpsertDiseno(nuevoMeta, nuevasImgsTodas)
      dbLog('borrar proceso', 'diseño', meta.codigo, { proceso: def.label || evs[i].tipo, fecha: evs[i].fecha })
      setImgs(nuevasImgsTodas)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('No se pudo deshacer: ' + (e.message || e))
    } finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar el diseño ${meta.codigo} y todas sus rondas?`)) return
    try {
      await dbDeleteDiseno(meta.codigo)
      dbLog('eliminar', 'diseño', meta.codigo, { nombre: meta.nombre || '' })
      onClose(); onSaved()
    } catch (e) { console.error(e) }
  }

  function abrirEdEvento(i) {
    const ev = (meta.eventos || [])[i] || {}
    setRegistrando(null)
    setEdEv({
      i,
      fecha: ev.fecha || '',
      nota: ev.nota || '',
      tela: ev.tela || '',
      metros: ev.metros || '',
      imgs: [...((imgs || {})['ev-' + i] || [])],
    })
  }

  async function guardarEdEvento() {
    if (guardando || !edEv) return
    setGuardando(true)
    try {
      const { i } = edEv
      const evs = (meta.eventos || []).map((e) => ({ ...e }))
      const def = EVENTOS[evs[i].tipo] || {}
      const ev = { ...evs[i], fecha: edEv.fecha }
      if (edEv.nota.trim()) ev.nota = edEv.nota.trim(); else delete ev.nota
      if (def.formato || def.tela) {
        if (edEv.tela.trim()) ev.tela = edEv.tela.trim(); else delete ev.tela
        if (String(edEv.metros).trim()) ev.metros = edEv.metros; else delete ev.metros
      }
      evs[i] = ev
      const nuevasImgsTodas = { ...(imgs || {}) }
      if (edEv.imgs.length) nuevasImgsTodas['ev-' + i] = edEv.imgs
      else delete nuevasImgsTodas['ev-' + i]

      const nuevoMeta = { ...meta, eventos: evs, updatedAt: Date.now() }
      if (evs[0] && evs[0].tipo === 'recibido') nuevoMeta.recibidoAt = evs[0].fecha
      if (i === 0) {
        const primera = nuevasImgsTodas['ev-0'] && nuevasImgsTodas['ev-0'][0]
        nuevoMeta.thumb = primera ? await hacerThumb(primera) : null
      }
      await dbUpsertDiseno(nuevoMeta, nuevasImgsTodas)
      dbLog('corregir', 'diseño', meta.codigo, { proceso: def.label || evs[i].tipo, fecha: ev.fecha })
      setImgs(nuevasImgsTodas)
      setEdEv(null)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('No se pudo guardar: ' + (e.message || e))
    } finally { setGuardando(false) }
  }

  const defReg = registrando ? EVENTOS[registrando] : null

  // El formulario se abre al final de una bitácora larga: si no se lleva a la
  // vista, el usuario cree que el botón no hizo nada y no ve los campos.
  useEffect(() => {
    if ((registrando || edEv) && panelRegistro.current) {
      panelRegistro.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [registrando, edEv && edEv.i])

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
          <p className="dis-ed-ayuda">
            Datos del diseño. Para corregir o borrar un proceso, usa los botones
            de cada uno en la bitácora.
          </p>
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

        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={guardarEdicion} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
        </>
      ) : (
      <>
      <div className="modal-body">
        <div className="dis-resumen">
          <span>
            <b>{info.diasTotal != null ? `${info.diasTotal} d` : '—'}</b>
            {info.terminado ? ' de ciclo total' : ' desde que entró'}
          </span>
          {info.diasGrafico != null && (
            <span><b>{info.diasGrafico} d</b> en desarrollo gráfico</span>
          )}
          {!info.terminado && info.dias != null && (
            <span><b>{info.dias} d</b> en “{info.etiqueta}”</span>
          )}
          {info.rondas > 0 && <span><b>{info.rondas}</b> {info.rondas === 1 ? 'ronda' : 'rondas'}</span>}
        </div>

        <div className="dis-bitacora">
          {duracionFases(meta.eventos || [], info.etapa).map((f) => (
            <section key={f.key} className={'dis-fase ' + f.estado}>
              <header className="dis-fase-cab">
                <span className="dis-fase-num">{f.estado === 'hecha' ? '✓' : f.num}</span>
                <span className="dis-fase-tit">{f.label}</span>
                {f.dias != null && <span className="dis-fase-dias">{f.dias} d</span>}
                <span className="dis-fase-linea" />
                {f.estado === 'curso' && <span className="dis-fase-est">en curso</span>}
                {/* La fase quedó atrás sin registrar su cierre: se avisa en vez
                    de darla por buena con un ✓. */}
                {f.estado === 'abierta' && (
                  <span className="dis-fase-est abierta"
                    title="Se pasó a la siguiente fase sin registrar el cierre de esta">
                    sin cerrar
                  </span>
                )}
              </header>
              <div className="dis-fase-evs">
                {f.eventos.map((ev) => {
                  const evImgs = imgs ? (imgs['ev-' + ev.i] || []) : []
                  const clase = ev.def.vuelta ? ' corr' : ev.def.hito ? ' hito' : ''
                  return (
                    <div key={ev.i} className={'dis-ev' + clase}>
                      <span className="dis-ev-punto" aria-hidden="true" />
                      <div className="dis-ev-fecha">{formatDate(ev.fecha)}</div>
                      <div className="dis-ev-cuerpo">
                        <div className="dis-ev-titulo">
                          {ev.ronda && <span className="dis-ronda">Ronda {ev.ronda}</span>}
                          {ev.def.label}
                          {ev.codigoCliente && <span className="dis-codcli">{ev.codigoCliente}</span>}
                        </div>
                        {ev.nota && <div className="dis-ev-nota">“{ev.nota}”</div>}
                        {(ev.tela || ev.metros) && (
                          <div className="dis-ev-datos">
                            {ev.tela && <span><b>Tela:</b> {ev.tela}</span>}
                            {ev.metros && <span><b>Metros:</b> {ev.metros}</span>}
                          </div>
                        )}
                        {imgs === null ? (
                          <div className="dis-ev-cargando">cargando imágenes…</div>
                        ) : evImgs.length > 0 && (
                          <div className="dis-ev-imgs">
                            {evImgs.map((src, k) => (
                              <img key={k} src={src} alt="" onClick={() => onViewImage && onViewImage(src)} />
                            ))}
                          </div>
                        )}
                        {(ev.def.formato || ev.def.formatoCorreccion) && (
                          <button className="btn btn-ghost dis-formato-btn"
                            onClick={() => setFormato({
                              ev,
                              img: evImgs[0],
                              variante: ev.def.formatoCorreccion ? 'correccion' : 'strikeoff',
                            })}>
                            📋 {ev.def.formatoCorreccion
                              ? 'Ver corrección para la diseñadora'
                              : 'Ver formato para la diseñadora'}
                          </button>
                        )}
                      </div>
                      <div className="dis-ev-acciones">
                        <button className="dis-ev-btn" title="Corregir este proceso"
                          onClick={() => abrirEdEvento(ev.i)}>✎</button>
                        <button className="dis-ev-btn dis-ev-btn-del" title="Borrar este proceso"
                          onClick={() => borrarEvento(ev.i)} disabled={guardando}>✕</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {edEv ? (
          <div className="dis-registro" ref={panelRegistro}>
            <div className="dis-registro-tit">
              Corregir “{(EVENTOS[(meta.eventos || [])[edEv.i].tipo] || {}).label}”
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Fecha</label>
                <input className="input" type="date" value={edEv.fecha}
                  onChange={(e) => setEdEv({ ...edEv, fecha: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 2 }}>
                <label className="field-label">Nota</label>
                <input className="input" value={edEv.nota} placeholder="Opcional…"
                  onChange={(e) => setEdEv({ ...edEv, nota: e.target.value })} />
              </div>
            </div>
            {(() => { const d = EVENTOS[(meta.eventos || [])[edEv.i].tipo] || {}; return d.formato || d.tela })() && (
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Tela</label>
                  <input className="input" value={edEv.tela} placeholder="Ej. Chalís estampado"
                    onChange={(e) => setEdEv({ ...edEv, tela: e.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label">Cantidad (metros)</label>
                  <input className="input" type="number" step="0.5" min="0" value={edEv.metros}
                    placeholder="Ej. 3"
                    onChange={(e) => setEdEv({ ...edEv, metros: e.target.value })} />
                </div>
              </div>
            )}
            <div className="field">
              <label className="field-label">Imágenes</label>
              <ImagePicker imgs={edEv.imgs} onChange={(l) => setEdEv({ ...edEv, imgs: l })} label="Agregar" />
            </div>
            <div className="dis-registro-foot">
              <button className="btn" onClick={() => setEdEv(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarEdEvento} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        ) : registrando ? (
          <div className="dis-registro" ref={panelRegistro}>
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
            {(defReg.formato || defReg.tela) && (
              <>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Tela</label>
                    <input className="input" value={tela} onChange={(e) => setTela(e.target.value)}
                      placeholder="Ej. Chalís estampado" />
                  </div>
                  <div className="field">
                    <label className="field-label">Cantidad (metros)</label>
                    <input className="input" type="number" step="0.5" min="0" value={metros}
                      onChange={(e) => setMetros(e.target.value)}
                      placeholder={defReg.tela ? 'Ej. 30' : 'Ej. 3'} />
                  </div>
                </div>
              </>
            )}
            {/* Reutilizar una foto que ya está en el diseño, en vez de volver
                a subirla. Sirve para el strike off y para la corrección. */}
            {(defReg.formato || defReg.formatoCorreccion) && todasLasImgs.length > 0 && (
              <div className="field">
                <label className="field-label">
                  {defReg.formatoCorreccion ? 'Elige la foto marcada por el cliente' : 'Elige la foto del strike off'}
                </label>
                <div className="dis-elegir">
                  {todasLasImgs.map((src, k) => (
                    <button key={k} type="button"
                      className={'dis-elegir-item' + (imgElegida === src ? ' on' : '')}
                      onClick={() => setImgElegida(imgElegida === src ? null : src)}>
                      <img src={src} alt={`opción ${k + 1}`} />
                      {imgElegida === src && <span className="dis-elegir-ok">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {defReg.img && (
              <div className="field">
                <label className="field-label">
                  {defReg.formatoCorreccion
                    ? 'Sube la foto que marcó el cliente'
                    : defReg.formato ? 'O sube una foto nueva' : 'Imágenes'}
                </label>
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
        ) : (
          <div className="dis-elegir-proceso">
            <p className="dis-elegir-tit">Registrar un proceso</p>
            {eventosPorFase().map((f) => (
              <div key={f.key} className="dis-fase-grupo">
                <span className="dis-fase-nom">{f.num}. {f.label}</span>
                <div className="dis-fase-btns">
                  {f.tipos.map((t) => (
                    <button key={t} type="button"
                      className={'dis-proc'
                        + (sugeridas.has(t) ? ' dis-proc-sug' : '')
                        + (yaHechos.has(t) ? ' dis-proc-hecho' : '')}
                      onClick={() => abrirRegistro(t)}
                      title={sugeridas.has(t) ? 'Es el paso que sigue' : 'Registrar este proceso'}>
                      {EVENTOS[t].label}
                      {sugeridas.has(t) && <span className="dis-proc-punto" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button className="btn btn-danger" onClick={eliminar}>Eliminar</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
      </>
      )}

      {formato && (
        <FormatoDisenadora
          diseno={meta}
          evento={formato.ev}
          imagen={formato.img}
          variante={formato.variante}
          onClose={() => setFormato(null)}
        />
      )}
    </Modal>
  )
}
