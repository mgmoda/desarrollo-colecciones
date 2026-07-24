import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import PhotoDropzone from './PhotoDropzone.jsx'
import ComboBox from './ComboBox.jsx'
import ColorCell from './ColorCell.jsx'
import DateField from './DateField.jsx'
import { RESUMEN_FLAGS, DEFAULT_TIPOS, TOP_OPTIONS, procesoColor } from '../lib/constants.js'
import { emptyRef, medicionInfo, refTelas } from '../lib/domain.js'

const MAX_COLORS = 6
const MAX_TELAS = 3

function todayStr() {
  return new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Interruptor Sí/No (estilo switch).
function Toggle({ on, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on}
      className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span className="switch-track"><span className="switch-thumb" /></span>
      <span className="switch-text">{on ? 'Sí' : 'No'}</span>
    </button>
  )
}

function FlagControl({ value, onChange }) {
  const state = value && value.si ? 'si' : value === 'no' ? 'no' : ''
  return (
    <div className="flag-control">
      <button type="button" className={'flag-btn' + (state === '' ? ' on' : '')}
        onClick={() => onChange('')}>—</button>
      <button type="button" className={'flag-btn no' + (state === 'no' ? ' on' : '')}
        onClick={() => onChange('no')}>No</button>
      <button type="button" className={'flag-btn yes' + (state === 'si' ? ' on' : '')}
        onClick={() => onChange({ si: true, fecha: (value && value.fecha) || todayStr() })}>Sí</button>
      {state === 'si' && (
        <DateField className="flag-date" value={value.fecha || ''}
          onChange={(v) => onChange({ si: true, fecha: v })} />
      )}
    </div>
  )
}

// Selector múltiple de procesos: chips que se encienden/apagan, más un campo
// para crear uno nuevo que queda en el catálogo.
function ProcesosPicker({ value = [], catalogo = [], onChange, onCrear, onBorrar }) {
  const [nuevo, setNuevo] = useState('')
  const activos = Array.isArray(value) ? value : []
  const lista = [...catalogo]
  activos.forEach((p) => { if (!lista.some((c) => c.toLowerCase() === p.toLowerCase())) lista.push(p) })
  const alternar = (p) => {
    const on = activos.some((x) => x.toLowerCase() === p.toLowerCase())
    onChange(on ? activos.filter((x) => x.toLowerCase() !== p.toLowerCase()) : [...activos, p])
  }
  const crear = () => {
    const v = nuevo.trim()
    if (!v) return
    if (onCrear) onCrear(v)
    if (!activos.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...activos, v])
    setNuevo('')
  }
  return (
    <div className="proc-picker">
      <div className="proc-chips">
        {lista.map((p) => {
          const on = activos.some((x) => x.toLowerCase() === p.toLowerCase())
          const c = procesoColor(p)
          return (
            <button key={p} type="button"
              className={'proc-chip' + (on ? ' on' : '')}
              style={on ? { background: c.bg, color: c.fg, borderColor: c.bd } : undefined}
              onClick={() => alternar(p)}>
              {p}
              {on && <span className="proc-chip-x">✓</span>}
            </button>
          )
        })}
        {lista.length === 0 && <span className="muted">Aún no hay procesos en el catálogo.</span>}
      </div>
      <div className="proc-nuevo">
        <input className="input" value={nuevo} placeholder="Crear otro proceso…"
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crear() } }} />
        <button type="button" className="btn" onClick={crear} disabled={!nuevo.trim()}>Agregar</button>
      </div>
    </div>
  )
}

export default function RefForm({
  open, initial, telas = [], telasCatalog = [], refIds = [],
  onAddTela, onEditTela, onDeleteTela, onUpdateTela,
  proveedores = [], onAddProveedor, onEditProveedor, onDeleteProveedor,
  decorados = [], onAddDecorado, onEditDecorado, onDeleteDecorado,
  procesosCatalogo = [], onAddProceso, onEditProceso, onDeleteProceso,
  marcas = [], onAddMarca, onEditMarca, onDeleteMarca,
  savedColors = [], onAddColor, onEditColor, onDeleteColor,
  onSave, onClose, onDelete,
}) {
  const [form, setForm] = useState(emptyRef(''))

  useEffect(() => {
    if (open) {
      const base = initial ? { ...emptyRef(initial.id), ...initial, flags: { ...(initial.flags || {}) } } : emptyRef('')
      base.telas = refTelas(base).map((t) => ({ ...t }))
      setForm(base)
    }
  }, [open, initial])

  if (!open) return null

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })) }
  function setFlag(key, val) { setForm((f) => ({ ...f, flags: { ...f.flags, [key]: val } })) }

  function addColorRow() {
    setForm((f) => ((f.colores || []).length >= MAX_COLORS ? f : { ...f, colores: [...(f.colores || []), null] }))
  }
  function setColorAt(i, color) {
    setForm((f) => ({ ...f, colores: f.colores.map((c, j) => (j === i ? color : c)) }))
  }
  function removeColorAt(i) {
    setForm((f) => ({ ...f, colores: f.colores.filter((_, j) => j !== i) }))
  }

  function addTelaRow() {
    setForm((f) => ((f.telas || []).length >= MAX_TELAS ? f : { ...f, telas: [...(f.telas || []), { nombre: '', disponible: false, metros: '' }] }))
  }
  function setTelaAt(i, field, val) {
    setForm((f) => ({ ...f, telas: f.telas.map((t, j) => (j === i ? { ...t, [field]: val } : t)) }))
  }
  function removeTelaRow(i) {
    setForm((f) => ({ ...f, telas: f.telas.filter((_, j) => j !== i) }))
  }

  function addMedicion() {
    setForm((f) => ({ ...f, mediciones: [...(f.mediciones || []), { fecha: todayStr(), resultado: 'aprobada', nota: '' }] }))
  }
  function setMedAt(i, field, val) {
    setForm((f) => ({ ...f, mediciones: f.mediciones.map((m, j) => (j === i ? { ...m, [field]: val } : m)) }))
  }
  function removeMedAt(i) {
    setForm((f) => ({ ...f, mediciones: f.mediciones.filter((_, j) => j !== i) }))
  }

  function save() {
    const ref = (form.referencia || '').trim().toUpperCase()
    if (!ref) return
    const colores = (form.colores || []).filter((c) => c && c.name)
    const telas = (form.telas || []).filter((t) => t && t.nombre)
      .map((t) => ({ nombre: t.nombre, disponible: !!t.disponible, metros: t.metros || '' }))
    const pendienteFecha = form.pendiente ? (form.pendienteFecha || todayStr()) : ''
    // Importante: nunca persistir el flag interno _stub.
    const { _stub: _ignore, ...rest } = form
    onSave({ ...rest, colores, telas, tela: telas[0] ? telas[0].nombre : '', pendienteFecha, id: ref, referencia: ref, updatedAt: Date.now() })
  }

  const partnerOptions = refIds.filter((id) => id !== (form.referencia || '').toUpperCase())

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="modal-head">
        <h2 className="modal-title">{initial && !initial._stub ? form.referencia : 'Nueva referencia'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      <div className="modal-body ref-form">
        <div className="ref-form-photo">
          <PhotoDropzone value={form.image} onChange={(v) => set('image', v)} />
        </div>

        <div className="ref-form-fields">
          {/* ---- General ---- */}
          <section className="ff-section">
            <h3 className="ff-section-title">General</h3>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Referencia</label>
                <input className="input" value={form.referencia}
                  onChange={(e) => set('referencia', e.target.value.toUpperCase())} placeholder="MG-B705" />
              </div>
              <div className="field">
                <label className="field-label">Tipo</label>
                <input className="input" list="tipos" value={form.tipo}
                  onChange={(e) => set('tipo', e.target.value)} placeholder="Blusa, vestido…" />
                <datalist id="tipos">{DEFAULT_TIPOS.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
              <div className="field">
                <label className="field-label">Marca</label>
                <ComboBox
                  value={form.marca}
                  options={marcas}
                  onChange={(v) => set('marca', v)}
                  onCreate={onAddMarca}
                  onEdit={onEditMarca}
                  onDelete={onDeleteMarca}
                  placeholder="Elegir o crear marca…"
                  entityLabel="marca"
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Costo</label>
                <input className={'input' + (form.costoRevisado ? ' input-checked' : '')} value={form.costo}
                  onChange={(e) => set('costo', e.target.value)} placeholder="109900" />
                <label className="check check-inline" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={!!form.costoRevisado}
                    onChange={(e) => set('costoRevisado', e.target.checked)} />
                  <span>Costo revisado (final)</span>
                </label>
              </div>
              <div className="field">
                <label className="field-label">Cantidad</label>
                <input className="input" value={form.cantidad}
                  onChange={(e) => set('cantidad', e.target.value)} />
              </div>
            </div>
            <label className={'check check-lg check-fotos' + (form.enFotos ? ' on' : '')}>
              <input type="checkbox" checked={!!form.enFotos}
                onChange={(e) => {
                  const now = e.target.checked
                  setForm((f) => ({
                    ...f,
                    enFotos: now,
                    enFotosAt: now ? (f.enFotosAt || Date.now()) : '',
                    // Si sale del pool, también se limpia fotografiada.
                    fotografiada: now ? f.fotografiada : false,
                    fotografiadaAt: now ? f.fotografiadaAt : '',
                  }))
                }} />
              <span>📸 Lista para foto</span>
            </label>
            <label className="check check-lg">
              <input type="checkbox" checked={!!form.conjunto}
                onChange={(e) => set('conjunto', e.target.checked)} />
              Va en conjunto con otra prenda
            </label>
            {form.conjunto && (
              <div>
                <input className="input" list="partner-refs" value={form.conjuntoRef}
                  onChange={(e) => set('conjuntoRef', e.target.value.toUpperCase())}
                  placeholder="Referencia de la prenda pareja (ej. MG-B900)" />
                <datalist id="partner-refs">
                  {partnerOptions.map((id) => <option key={id} value={id} />)}
                </datalist>
                <p className="field-hint">Se enlazará en ambas referencias.</p>
              </div>
            )}

            <label className={'check check-lg' + (form.pendiente ? ' check-alert' : '')}>
              <input type="checkbox" checked={!!form.pendiente}
                onChange={(e) => {
                  const on = e.target.checked
                  setForm((f) => ({ ...f, pendiente: on, pendienteFecha: on ? (f.pendienteFecha || todayStr()) : '' }))
                }} />
              ⚠ Tiene un pendiente por resolver
            </label>
            {form.pendiente && (
              <div className="field-row">
                <div className="field" style={{ flex: 2 }}>
                  <label className="field-label">¿Qué hay que resolver?</label>
                  <input className="input" value={form.pendienteNota}
                    onChange={(e) => set('pendienteNota', e.target.value)}
                    placeholder="Ej. tela Rosario agotada, buscar reemplazo" />
                </div>
                <div className="field">
                  <label className="field-label">Pendiente desde</label>
                  <DateField value={form.pendienteFecha} onChange={(v) => set('pendienteFecha', v)} />
                </div>
              </div>
            )}
          </section>

          {/* ---- Tela y color ---- */}
          <section className="ff-section">
            <h3 className="ff-section-title">Tela y color</h3>

            <div className="field">
              <label className="field-label">
                Telas <span className="muted">(hasta {MAX_TELAS})</span>
              </label>
              <div className="tela-list">
                {(form.telas || []).map((t, i) => (
                  <div className="tela-card" key={i}>
                    <div className="tela-card-top">
                      <span className="color-row-num">{i + 1}</span>
                      <div className="tela-combo">
                        <ComboBox
                          value={t.nombre}
                          options={telas}
                          onChange={(v) => setTelaAt(i, 'nombre', v)}
                          onCreate={onAddTela}
                          onEdit={onEditTela}
                          onDelete={onDeleteTela}
                          placeholder="Elegir o crear tela…"
                          entityLabel="tela"
                        />
                      </div>
                      <button type="button" className="icon-btn" onClick={() => removeTelaRow(i)} title="Quitar tela">✕</button>
                    </div>
                    {(() => {
                      const cat = telasCatalog.find((x) => x.nombre === t.nombre)
                      return (
                        <div className="tela-fields">
                          <div className="tela-f">
                            <span className="tela-f-lbl">Inventario</span>
                            <Toggle on={!!t.disponible} onChange={(v) => setTelaAt(i, 'disponible', v)} />
                          </div>
                          <div className="tela-f">
                            <span className="tela-f-lbl">Metros</span>
                            <input className="input tela-metros" value={t.metros || ''}
                              onChange={(e) => setTelaAt(i, 'metros', e.target.value)} placeholder="0" />
                          </div>
                          <div className="tela-f">
                            <span className="tela-f-lbl">Precio</span>
                            <input className="input tela-precio" value={cat ? cat.precio : ''}
                              disabled={!t.nombre}
                              onChange={(e) => onUpdateTela(t.nombre, { precio: e.target.value })} placeholder="—" />
                          </div>
                          <div className="tela-f tela-f-prov">
                            <span className="tela-f-lbl">Proveedor</span>
                            {t.nombre ? (
                              <ComboBox
                                value={cat ? cat.proveedor : ''}
                                options={proveedores}
                                onChange={(v) => onUpdateTela(t.nombre, { proveedor: v })}
                                onCreate={onAddProveedor}
                                onEdit={onEditProveedor}
                                onDelete={onDeleteProveedor}
                                placeholder="Elegir o crear…"
                                entityLabel="proveedor"
                              />
                            ) : (
                              <input className="input" disabled placeholder="Elige la tela primero" />
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    <p className="tela-cat-note">Precio y proveedor quedan guardados en la tela.</p>
                  </div>
                ))}
                {(form.telas || []).length < MAX_TELAS && (
                  <button type="button" className="btn btn-ghost color-add" onClick={addTelaRow}>
                    + Agregar tela
                  </button>
                )}
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label">Top / forro</label>
                <div className="select-wrap">
                  <select className="input select" value={form.topIncluido || ''}
                    onChange={(e) => set('topIncluido', e.target.value)}>
                    {TOP_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <span className="select-caret" aria-hidden="true">▾</span>
                </div>
              </div>
              <div className="field">
                <label className="field-label">Color muestra</label>
                <input className="input" value={form.colorMuestra}
                  onChange={(e) => set('colorMuestra', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">
                Colores <span className="muted">(hasta {MAX_COLORS})</span>
              </label>
              <div className="color-rows">
                {(form.colores || []).map((c, i) => (
                  <div className="color-row" key={i}>
                    <span className="color-row-num">{i + 1}</span>
                    <ColorCell
                      value={c}
                      savedColors={savedColors}
                      usedNames={(form.colores || []).filter((_, j) => j !== i).map((x) => x && x.name).filter(Boolean)}
                      onSelect={(col) => setColorAt(i, col)}
                      onCreateColor={onAddColor}
                      onEditColor={onEditColor}
                      onDeleteColor={onDeleteColor}
                    />
                    <button type="button" className="icon-btn" onClick={() => removeColorAt(i)} title="Quitar color">✕</button>
                  </div>
                ))}
                {(form.colores || []).length < MAX_COLORS && (
                  <button type="button" className="btn btn-ghost color-add" onClick={addColorRow}>
                    + Agregar color
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ---- Procesos ---- */}
          <section className="ff-section">
            <h3 className="ff-section-title">Procesos</h3>
            <div className="field">
              <label className="field-label">
                Procesos especiales
                <span className="field-hint"> · marca los que apliquen (puede llevar varios)</span>
              </label>
              <ProcesosPicker
                value={form.procesos}
                catalogo={procesosCatalogo}
                onChange={(v) => set('procesos', v)}
                onCrear={onAddProceso}
                onBorrar={onDeleteProceso}
              />
            </div>
            {(form.procesos || []).some((p) => /bordado/i.test(p)) && (
              <div className="field">
                <label className="field-label">Detalle del bordado</label>
                <input className="input" value={form.bordadoDetalle}
                  onChange={(e) => set('bordadoDetalle', e.target.value)} placeholder="Descripción del bordado" />
              </div>
            )}
            <div className="field-row">
              <div className="field">
                <label className="field-label">Estampado</label>
                <div className="select-wrap">
                  <select className="input select" value={form.estampado || ''}
                    onChange={(e) => set('estampado', e.target.value)}>
                    <option value="">Sin definir</option>
                    <option value="no">Unicolor (sin estampado)</option>
                    <option value="sublimacion">Sublimación</option>
                    <option value="reactivos">Reactivos</option>
                  </select>
                  <span className="select-caret" aria-hidden="true">▾</span>
                </div>
              </div>
              <div className="field" />
            </div>
          </section>

          {/* ---- Medición ---- */}
          <section className="ff-section">
            <h3 className="ff-section-title">Medición y aprobación</h3>
            <div className="med-log">
              {(form.mediciones || []).map((m, i) => (
                <div className="med-item" key={i}>
                  <div className="med-row">
                    <span className="color-row-num">{i + 1}</span>
                    <DateField className="med-date" value={m.fecha}
                      onChange={(v) => setMedAt(i, 'fecha', v)} />
                    <div className="med-res-group">
                      <button type="button" className={'med-res rep' + (m.resultado === 'repeticion' ? ' on' : '')}
                        onClick={() => setMedAt(i, 'resultado', 'repeticion')}>Repetición</button>
                      <button type="button" className={'med-res ap' + (m.resultado === 'aprobada' ? ' on' : '')}
                        onClick={() => setMedAt(i, 'resultado', 'aprobada')}>Aprobada</button>
                      <button type="button" className={'med-res des' + (m.resultado === 'descartada' ? ' on' : '')}
                        onClick={() => setMedAt(i, 'resultado', 'descartada')}>Descartada</button>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => removeMedAt(i)} title="Quitar medición">✕</button>
                  </div>
                  {m.resultado === 'repeticion' && (
                    <input className="input med-nota" value={m.nota || ''}
                      onChange={(e) => setMedAt(i, 'nota', e.target.value)}
                      placeholder="Motivo de la repetición (ej. hombro ancho, largo, color…)" />
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost color-add" onClick={addMedicion}>
                + Registrar medición
              </button>
              <p className="field-hint">Cuando la prenda vuelva de repetición, registra la nueva medición: eso cierra la repetición anterior y detiene su contador de días.</p>
              {(() => {
                const info = medicionInfo(form)
                if (info.estado === 'pendiente') return null
                const txt = info.estado === 'aprobada'
                  ? `Aprobada${info.dias != null ? ` en ${info.dias} días` : ''}${info.repeticiones ? ` · ${info.repeticiones} repetición(es)` : ''}`
                  : info.estado === 'descartada'
                    ? `Descartada${info.repeticiones ? ` · ${info.repeticiones} repetición(es)` : ''}`
                    : `En repetición${info.diasRepeticion != null ? ` hace ${info.diasRepeticion} días` : ''}${info.repeticiones ? ` · ${info.repeticiones} repetición(es)` : ''}`
                return <p className="med-summary">{txt}</p>
              })()}
            </div>
          </section>

          {/* ---- Desarrollo ---- */}
          <section className="ff-section">
            <h3 className="ff-section-title">Estados del desarrollo</h3>
            <div className="flags-grid">
              {RESUMEN_FLAGS.map((f) => (
                <div className="flag-line" key={f.key}>
                  <span className="flag-name">{f.label}</span>
                  <FlagControl value={(form.flags || {})[f.key]} onChange={(v) => setFlag(f.key, v)} />
                </div>
              ))}
            </div>
          </section>

          {/* ---- Comentario ---- */}
          <section className="ff-section">
            <h3 className="ff-section-title">Comentario</h3>
            <textarea className="input" rows={3} value={form.comentario}
              onChange={(e) => set('comentario', e.target.value)} />
          </section>
        </div>
      </div>

      <div className="modal-foot spread">
        {initial && !initial._stub ? (
          <button className="btn btn-ghost danger" onClick={() => onDelete(form)}>Eliminar</button>
        ) : <span />}
        <div className="foot-right">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </Modal>
  )
}
