import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import {
  ESTADOS_PROG, esConjunto, estadoProg, indiceCodigos, indiceConjuntos,
  leerArchivo, leerPegado, piezaQueFalta, programadoDe,
} from '../lib/programaciones.js'

const MARCAS = ['Casania', 'Mariset']

const fechaHora = (ts) => {
  const d = new Date(Number(ts) || 0)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

const nombreCorto = (email) => {
  const s = String(email || '').split('@')[0].replace(/[._-]/g, ' ').trim()
  if (!s) return 'alguien'
  return s.split(/\s+/)[0].replace(/^\w/, (c) => c.toUpperCase())
}

// Chip de estado, con el color que le corresponde.
function EstadoChip({ estado, color, chico, flecha }) {
  const e = estadoProg(estado)
  if (!e) return null
  return (
    <span className={'est-chip fijo' + (chico ? ' sm' : '')}
      style={{ background: e.bg, color: e.fg, borderColor: e.bd }}>
      {flecha ? '→ ' : ''}{e.label}{color ? ` · ${color}` : ''}
    </span>
  )
}

// El seguimiento de una referencia: en qué estado está y qué han dicho.
//
// Un solo gesto: se toca el estado, si es "Sin tela" se toca el color que
// falta -salen de la ficha-, se escribe la nota si hay algo que decir, y
// Guardar. Todo queda en la misma bitácora: los cambios de estado se anotan
// solos, y en la reunión se ve si la respuesta de hoy es la misma de hace ocho
// días, que es la señal de que el problema no se mueve.
function SeguimientoModal({ fila, ficha, usuario, onGuardar, onClose }) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState((fila && fila.estado) || '')
  const [color, setColor] = useState((fila && fila.estadoColor) || '')
  const [otroColor, setOtroColor] = useState('')
  if (!fila) return null
  const historial = [...(fila.observaciones || [])].sort((a, b) => (b.at || 0) - (a.at || 0))
  const colores = ((ficha && ficha.colores) || []).map((c) => c && c.name).filter(Boolean)
  const colorFinal = estado === 'sinTela' ? (color || otroColor.trim()) : ''
  const cambio = estado !== (fila.estado || '')
    || colorFinal !== (fila.estadoColor || '')
    || !!texto.trim()

  function guardar() {
    if (!cambio) return
    const entrada = { usuario, at: Date.now() }
    if (texto.trim()) entrada.texto = texto.trim()
    if (estado !== (fila.estado || '') || colorFinal !== (fila.estadoColor || '')) {
      entrada.estado = estado
      if (colorFinal) entrada.color = colorFinal
    }
    onGuardar({
      ...fila,
      estado,
      estadoColor: colorFinal,
      observaciones: [...(fila.observaciones || []), entrada],
    })
    setTexto('')
    setOtroColor('')
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{fila.id} · seguimiento</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>{fila.descripcion || '—'}</p>

        <div className="field">
          <label className="field-label">¿En qué va?</label>
          <div className="est-chips">
            {ESTADOS_PROG.map((e) => (
              <button key={e.key} type="button"
                className={'est-chip' + (estado === e.key ? ' on' : '')}
                style={estado === e.key
                  ? { background: e.bg, color: e.fg, borderColor: e.bd }
                  : undefined}
                onClick={() => { setEstado(estado === e.key ? '' : e.key); setColor('') }}>
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {estado === 'sinTela' && (
          <div className="field">
            <label className="field-label">¿Cuál color falta?</label>
            {colores.length > 0 ? (
              <div className="est-chips">
                {colores.map((c) => (
                  <button key={c} type="button"
                    className={'est-chip' + (color === c ? ' on color' : '')}
                    onClick={() => setColor(color === c ? '' : c)}>
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <input className="input" value={otroColor} placeholder="Ej. verde"
                onChange={(e) => setOtroColor(e.target.value)} />
            )}
          </div>
        )}

        <div className="field">
          <label className="field-label">Nota (opcional)</label>
          <textarea className="input prog-ta" rows={2} value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej. se está buscando reemplazo con otros proveedores" />
        </div>

        <div className="prog-hist">
          {historial.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Todavía no hay anotaciones.</p>
          ) : historial.map((o, i) => (
            <div key={i} className="prog-obs">
              <div className="prog-obs-cab">
                <b>{nombreCorto(o.usuario)}</b>
                <span>{fechaHora(o.at)}</span>
              </div>
              {o.estado && <EstadoChip estado={o.estado} color={o.color} chico flecha />}
              {o.texto && <p>{o.texto}</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={!cambio}>
          Guardar
        </button>
      </div>
    </Modal>
  )
}

// El desglose del pedido: qué colores y qué tallas piden los clientes. Sale
// del reporte de separados y se abre tocando el número de pedido.
function DesgloseModal({ fila, onClose }) {
  if (!fila || !fila.desglose) return null
  const d = fila.desglose
  // Solo las tallas que traen algo, en el orden del reporte.
  const tallas = (d.tallas || []).filter((t) => d.colores.some((c) => (c.tallas[t] || 0) > 0))
  const totalPorTalla = (t) => d.colores.reduce((n, c) => n + (c.tallas[t] || 0), 0)
  const cuadra = d.total === fila.pedido
  const num = (n) => n.toLocaleString('es-CO')
  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{fila.id} · pedido por color y talla</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>
          {fila.descripcion || '—'} · {d.clientes} {d.clientes === 1 ? 'cliente' : 'clientes'}
        </p>
        <div className="table-wrap">
          <table className="data-table desg-table">
            <thead>
              <tr>
                <th>Color</th>
                {tallas.map((t) => <th key={t} className="num">{t}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.colores.map((c) => (
                <tr key={c.color}>
                  <td className="strong">{c.color}</td>
                  {tallas.map((t) => (
                    <td key={t} className="num">
                      {c.tallas[t] ? num(c.tallas[t]) : <span className="muted">·</span>}
                    </td>
                  ))}
                  <td className="num strong">{num(c.unid)}</td>
                </tr>
              ))}
              <tr className="desg-total">
                <td>Total</td>
                {tallas.map((t) => <td key={t} className="num">{num(totalPorTalla(t))}</td>)}
                <td className="num strong">{num(d.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {!cuadra && (
          <p className="form-err" style={{ marginTop: 10 }}>
            El desglose suma {num(d.total)} y el pedido cargado dice {num(fila.pedido)}.
            Los dos reportes son de días distintos: vuelve a cargarlos juntos.
          </p>
        )}
      </div>
      <div className="modal-foot">
        {cuadra && <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>✓ Cuadra con el pedido</span>}
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}

// Carga del reporte de Factory. Lo normal es soltar el archivo tal como sale;
// pegar las filas queda como salida por si algún día el archivo no abre.
function CargarModal({ marca, onConfirmar, onSeparados, onClose }) {
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [err, setErr] = useState('')
  const [delArchivo, setDelArchivo] = useState(null) // { filas, marca, nombre }
  const pegado = useMemo(() => leerPegado(texto, marca), [texto, marca])
  const filas = delArchivo ? (delArchivo.filas || []) : pegado.filas
  const marcaFinal = delArchivo ? delArchivo.marca : marca

  async function tomar(file) {
    if (!file) return
    setErr(''); setLeyendo(true); setDelArchivo(null)
    try {
      const r = await leerArchivo(file)
      if (r.tipo === 'separados') {
        setDelArchivo({ sep: r.desglose, refs: r.refs, nombre: file.name })
        return
      }
      if (!r.marca) { setErr('No pude saber si es de Casania o de Mariset. Renombra el archivo o pega las filas.'); return }
      setDelArchivo({ filas: r.filas, marca: r.marca, nombre: file.name })
    } catch (e) {
      setErr(e.message || 'No pude leer el archivo.')
    } finally { setLeyendo(false) }
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">Cargar pedidos</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>
          El reporte <b>Pedidos y Cortes por Referencia</b> de Factory, tal como lo
          exportas. Se toman la referencia, la descripción y el pedido; lo programado
          lo cuenta el sistema de sus órdenes de corte.
        </p>

        <label className="import-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); tomar(e.dataTransfer.files && e.dataTransfer.files[0]) }}>
          <input type="file" hidden
            accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => tomar(e.target.files && e.target.files[0])} />
          <span>
            {leyendo ? 'Leyendo…'
              : delArchivo ? `${delArchivo.nombre} · ${delArchivo.sep ? 'Separados' : delArchivo.marca}`
                : 'Arrastra el archivo aquí o haz clic para buscarlo'}
          </span>
        </label>

        {err && <p className="form-err">{err}</p>}

        <details className="prog-pegar">
          <summary>O pegar las filas a mano</summary>
          <textarea className="input prog-ta" rows={6} value={texto}
            onChange={(e) => { setTexto(e.target.value); setDelArchivo(null) }}
            placeholder="C6848&#9;VESTIDO ALGODON CON CINTURON&#9;3&#9;121&#9;61&#9;60" />
        </details>

        {delArchivo && delArchivo.sep ? (
          <p className="field-hint">
            Desglose por color y talla para <b>{delArchivo.refs}</b> referencias.
            Se pega a las que ya están cargadas; el número de pedido queda
            clickeable para verlo.
          </p>
        ) : filas.length > 0 && (
          <p className="field-hint">
            Se van a cargar <b>{filas.length}</b> referencias de <b>{marcaFinal}</b>.
            Las que ya existan actualizan sus cifras; el seguimiento no se pierde.
          </p>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary"
          disabled={leyendo || (delArchivo && delArchivo.sep ? false : !filas.length)}
          onClick={() => {
            if (delArchivo && delArchivo.sep) onSeparados(delArchivo.sep)
            else onConfirmar(filas.map((f) => ({ ...f, marca: marcaFinal })), marcaFinal)
          }}>
          Cargar {delArchivo && delArchivo.sep ? delArchivo.refs : (filas.length || '')}
        </button>
      </div>
    </Modal>
  )
}

export default function ProgramacionesView({
  programaciones, orders, refMap, refs, usuario,
  onGuardar, onGuardarVarias, onBorrar, onViewImage, onOpenRef,
}) {
  const [marca, setMarca] = useState('Casania')
  const [q, setQ] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [estadoF, setEstadoF] = useState('')
  const [cargar, setCargar] = useState(false)
  const [obsDe, setObsDe] = useState(null)
  const [desgDe, setDesgDe] = useState(null)
  const { sortKey, sortDir, toggle } = useSort('pendiente', 'desc')

  // Los conjuntos ya están armados en Costos: de ahí sale su foto, que es la de
  // las dos prendas puestas y no la de la blusa sola.
  const conjuntos = useMemo(() => indiceConjuntos(refs), [refs])
  // Cada prenda puede tener órdenes bajo su código interno y bajo el final.
  const codigos = useMemo(() => indiceCodigos(refs), [refs])
  const ordenesPorRef = useMemo(() => {
    const m = new Map()
    ;(orders || []).forEach((o) => {
      if (!m.has(o.referencia)) m.set(o.referencia, [])
      m.get(o.referencia).push(o)
    })
    return m
  }, [orders])

  const filas = useMemo(() => (programaciones || [])
    .filter((p) => p.marca === marca)
    .map((p) => {
      const delCatalogo = conjuntos.get(String(p.id).toUpperCase())
      const ficha = refMap.get(p.id)
      const pedido = Number(p.pedido) || 0
      const piezas = delCatalogo ? delCatalogo.piezas : []
      const programado = programadoDe({ id: p.id, piezas }, ordenesPorRef, codigos)
      return {
        ...p,
        pedido,
        programado,
        falta: piezaQueFalta(piezas, ordenesPorRef, refMap, codigos),
        pendiente: pedido - programado,
        image: (delCatalogo && delCatalogo.image) || (ficha && ficha.image) || '',
        tipoFicha: (ficha && ficha.tipo) || '',
        conj: esConjunto(p) || !!delCatalogo,
        piezas,
        estado: p.estado || '',
        estadoColor: p.estadoColor || '',
        obs: (p.observaciones || []).length,
        ultimaObs: (p.observaciones || []).slice(-1)[0] || null,
      }
    }), [programaciones, marca, refMap, conjuntos, ordenesPorRef, codigos])

  const rows = useMemo(() => {
    let list = filas
    if (soloPendientes) list = list.filter((f) => f.pendiente > 0)
    if (estadoF) list = list.filter((f) => f.estado === estadoF)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((f) => (f.id + ' ' + (f.descripcion || '')).toLowerCase().includes(term))
    }
    const accessors = {
      referencia: (f) => f.id,
      descripcion: (f) => f.descripcion || '',
      pedido: (f) => f.pedido,
      programado: (f) => f.programado,
      pendiente: (f) => f.pendiente,
      obs: (f) => f.obs,
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [filas, q, soloPendientes, estadoF, sortKey, sortDir])

  const tot = useMemo(() => rows.reduce((a, f) => ({
    pedido: a.pedido + f.pedido,
    programado: a.programado + f.programado,
    pendiente: a.pendiente + Math.max(0, f.pendiente),
  }), { pedido: 0, programado: 0, pendiente: 0 }), [rows])

  const thProps = { sortKey, sortDir, onSort: toggle }
  const num = (n) => n.toLocaleString('es-CO')

  return (
    <>
      <div className="view-actions" style={{ marginBottom: 14 }}>
        <div className="dis-filtros">
          {MARCAS.map((m) => (
            <button key={m} type="button" className={'proc-f-btn' + (marca === m ? ' on' : '')}
              onClick={() => setMarca(m)}>
              {m} <b>{(programaciones || []).filter((p) => p.marca === m).length}</b>
            </button>
          ))}
          <button type="button" className={'proc-f-btn' + (soloPendientes ? ' on' : '')}
            onClick={() => setSoloPendientes(!soloPendientes)}>
            Solo con pendiente
          </button>
          {ESTADOS_PROG.map((e) => {
            const n = filas.filter((f) => f.estado === e.key).length
            if (!n && estadoF !== e.key) return null
            const on = estadoF === e.key
            return (
              <button key={e.key} type="button" className={'proc-f-btn' + (on ? ' on' : '')}
                style={on ? { background: e.bg, color: e.fg, borderColor: e.bd } : undefined}
                onClick={() => setEstadoF(on ? '' : e.key)}>
                {e.label} <b>{n}</b>
              </button>
            )
          })}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia…" />
        <button className="btn btn-primary" onClick={() => setCargar(true)}>Cargar pedidos</button>
      </div>

      <div className="prog-kpis">
        <div className="prog-kpi"><span>Pedido</span><b>{num(tot.pedido)}</b></div>
        <div className="prog-kpi"><span>Programado</span><b>{num(tot.programado)}</b></div>
        <div className="prog-kpi alerta"><span>Falta por programar</span><b>{num(tot.pendiente)}</b></div>
        <div className="prog-kpi"><span>Referencias</span><b>{rows.length}</b></div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>{(programaciones || []).length === 0
            ? 'Todavía no hay pedidos cargados.'
            : 'Sin referencias en este filtro.'}</p>
          <p className="muted">Carga el reporte de Factory con “Cargar pedidos”.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Foto</th>
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Descripción" col="descripcion" {...thProps} />
                <SortTh label="Pedido" col="pedido" className="num" {...thProps} />
                <SortTh label="Programado" col="programado" className="num" {...thProps} />
                <SortTh label="Falta" col="pendiente" className="num" {...thProps} />
                <SortTh label="Seguimiento" col="obs" {...thProps} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const ficha = refMap.get(f.id)
                return (
                  <tr key={f.id}>
                    <td className="cell-photo">
                      {f.image
                        ? <img src={f.image} alt={f.id} className="thumb" title="Ampliar foto"
                          onClick={() => onViewImage && onViewImage(f.image)} />
                        : <span className="thumb empty" title="Sin foto en la ficha">—</span>}
                    </td>
                    <td className="strong" style={{ cursor: ficha && onOpenRef ? 'pointer' : 'default' }}
                      onClick={() => ficha && onOpenRef && onOpenRef(ficha)}>
                      {f.id}
                      {f.conj && (
                        <span className="tag conj-tag"
                          title={f.piezas.length ? `Se arma con ${f.piezas.join(' + ')}` : 'Conjunto'}>
                          Conjunto
                        </span>
                      )}
                    </td>
                    <td className="muted">
                      {f.descripcion || '—'}
                      {f.tipoFicha && <span className="prog-tipo">{f.tipoFicha}</span>}
                    </td>
                    <td className="num strong">
                      {f.desglose ? (
                        <button type="button" className="prog-ped"
                          onClick={() => setDesgDe(f)}
                          title="Ver el pedido por color y talla">
                          {num(f.pedido)}
                        </button>
                      ) : num(f.pedido)}
                    </td>
                    <td className="num">
                      {num(f.programado)}
                      {f.falta && (
                        <span className="prog-falta-pieza"
                          title={`La otra prenda va programada en ${f.falta.hechas} y esta en ninguna`}>
                          falta {f.falta.tipo}
                        </span>
                      )}
                    </td>
                    <td className={'num strong' + (f.pendiente > 0 ? ' prog-falta' : '')}>
                      {f.pendiente > 0 ? num(f.pendiente) : <span className="muted">—</span>}
                    </td>
                    <td>
                      <button type="button" className="prog-seg"
                        onClick={() => setObsDe(f)}
                        title={f.obs ? `${f.obs} anotaciones — clic para ver o cambiar` : 'Marcar en qué va'}>
                        {f.estado
                          ? <EstadoChip estado={f.estado} color={f.estadoColor} chico />
                          : <span className="prog-seg-vacio">+ anotar</span>}
                        {f.ultimaObs && f.ultimaObs.texto && (
                          <span className="prog-seg-txt">{f.ultimaObs.texto}</span>
                        )}
                        {f.ultimaObs && (
                          <span className="prog-obs-fecha">
                            {nombreCorto(f.ultimaObs.usuario)} · {fechaHora(f.ultimaObs.at)}
                          </span>
                        )}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-ghost" style={{ color: '#b23121' }}
                        onClick={() => {
                          if (window.confirm(`¿Quitar ${f.id} de programaciones?`)) onBorrar(f.id)
                        }}>Quitar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {desgDe && <DesgloseModal fila={desgDe} onClose={() => setDesgDe(null)} />}

      {cargar && (
        <CargarModal marca={marca} onClose={() => setCargar(false)}
          onSeparados={(desglose) => {
            // El desglose se pega a las referencias ya cargadas, de las dos
            // marcas a la vez: el reporte de separados viene junto.
            const cambiadas = (programaciones || [])
              .filter((p) => desglose[String(p.id).toUpperCase()])
              .map((p) => ({
                ...p,
                desglose: desglose[String(p.id).toUpperCase()],
                desgloseAt: Date.now(),
              }))
            onGuardarVarias(cambiadas)
            setCargar(false)
          }}
          onConfirmar={(nuevas, marcaCargada) => {
            // Del reporte solo llegan las cifras y la descripción: el
            // seguimiento que ya tenga la referencia se conserva.
            const previas = new Map((programaciones || []).map((p) => [p.id, p]))
            onGuardarVarias(nuevas.map((n) => ({
              ...(previas.get(n.id) || {}),
              ...n,
              observaciones: (previas.get(n.id) || {}).observaciones || [],
              actualizadoAt: Date.now(),
            })))
            if (marcaCargada) setMarca(marcaCargada)
            setCargar(false)
          }} />
      )}

      {obsDe && (
        <SeguimientoModal fila={(programaciones || []).find((p) => p.id === obsDe.id) || obsDe}
          ficha={refMap.get(obsDe.id)}
          usuario={usuario} onGuardar={onGuardar} onClose={() => setObsDe(null)} />
      )}
    </>
  )
}
