import { useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import {
  ESTADOS_PROG, colorProducidoDe, cortesDe, esConjunto, estadoProg, faltaPorColor,
  indiceCodigos, indiceConjuntos, leerArchivo, leerPegado, piezaQueFalta,
  programadoDe, telasDe,
} from '../lib/programaciones.js'
import { formatDate } from '../lib/constants.js'
import { diasDesde, diasEntre } from '../lib/dates.js'

const MARCAS = ['Casania', 'Mariset']

// Movimientos: lo que Ninfa manda a pedir o a estampar, color por color y con
// cantidad total (sin curvas: en ese momento no las sabe). Cada movimiento
// cuenta sus días desde que se registró, y al llegar queda grabado cuánto
// tardó ese proceso para esas cantidades.
const PROCESOS_MOV = [
  { key: 'tela', label: 'Tela pedida', accion: 'Pedí la tela', estado: 'telaPedida', bg: '#faeeda', fg: '#633806', bd: '#fac775' },
  { key: 'textampa', label: 'Textampa', accion: 'Textampa', estado: 'estampacion', bg: '#eeedfe', fg: '#3c3489', bd: '#cecbf6' },
]
const procesoMov = (k) => PROCESOS_MOV.find((p) => p.key === k) || PROCESOS_MOV[0]
const fechaCorta = (ts) => {
  const d = new Date(Number(ts) || 0)
  return isNaN(d) ? '' : d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
}
const diasTxt = (n) => `${n} ${n === 1 ? 'día' : 'días'}`

// Una línea de movimiento: proceso, color con cantidad y días, en columnas
// alineadas para que se lea como tabla y no como etiquetas sueltas. Corre en
// vivo si sigue abierto (rojo pasadas dos semanas); si ya llegó, dice cuántos
// días tardó.
function MovFila({ mov }) {
  const p = procesoMov(mov.proceso)
  const cerrado = !!mov.llegadaAt
  const dias = cerrado ? diasEntre(mov.desde, mov.llegadaAt) : diasDesde(mov.desde)
  return (
    <span className="mov-f">
      <span className="mov-f-proc" style={{ color: p.fg }}>{p.label}</span>
      <span className="mov-f-que">{mov.color} ×{mov.cant}</span>
      <span className={'mov-f-dias' + (!cerrado && dias > 15 ? ' tarde' : '')}>
        {cerrado ? `llegó en ${diasTxt(dias)}` : diasTxt(dias)}
      </span>
    </span>
  )
}

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

// El modal de movimientos: se abre tocando la casilla "En proceso".
//
// Registrar es llenar una tablita tipo Excel: los colores del pedido ya vienen
// puestos como filas y solo se escriben las cantidades (Enter o flecha baja a
// la siguiente celda; el color que no va se deja en blanco). Un botón crea un
// movimiento por cada color con cantidad, con la fecha de hoy y a nombre de
// quien registra, y el estado de la referencia se mueve solo. Aquí mismo se
// marca "Llegó", que cierra el movimiento dejando cuántos días tardó.
function MovimientosModal({ fila, ficha, usuario, onGuardar, onClose }) {
  const [proceso, setProceso] = useState('tela')
  const [cants, setCants] = useState({})
  const celdas = useRef([])

  const colores = useMemo(() => {
    const delPedido = ((fila.desglose && fila.desglose.colores) || [])
      .map((c) => c.color).filter(Boolean)
    if (delPedido.length) return delPedido
    return ((ficha && ficha.colores) || []).map((c) => c && c.name).filter(Boolean)
  }, [fila, ficha])

  const movs = fila.movimientos || []
  const abiertos = movs.filter((m) => !m.llegadaAt)
  const cerrados = movs.filter((m) => m.llegadaAt)
    .sort((a, b) => (b.llegadaAt || 0) - (a.llegadaAt || 0))
  const total = colores.reduce((n, c) => n + (Math.round(Number(cants[c])) || 0), 0)
  const num = (n) => n.toLocaleString('es-CO')

  function registrar() {
    if (!total) return
    const p = procesoMov(proceso)
    const ahora = Date.now()
    const nuevos = colores
      .map((c) => ({ color: c, cant: Math.round(Number(cants[c])) || 0 }))
      .filter((x) => x.cant > 0)
      .map((x, i) => ({
        id: (ahora + i).toString(36) + Math.random().toString(36).slice(2, 6),
        proceso, color: x.color, cant: x.cant, desde: ahora, usuario,
      }))
    // El estado de la referencia se mueve solo con el movimiento; el
    // seguimiento (las notas) no se toca: es texto libre y nada más.
    onGuardar({
      ...fila,
      movimientos: [...movs, ...nuevos],
      estado: p.estado,
      estadoColor: '',
    })
    setCants({})
  }

  function llego(mov) {
    onGuardar({
      ...fila,
      movimientos: movs.map((m) => (m.id === mov.id
        ? { ...m, llegadaAt: Date.now(), llegadaUsuario: usuario } : m)),
    })
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{fila.id} · en proceso</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
      <p className="field-hint" style={{ marginTop: 0 }}>{fila.descripcion || '—'}</p>
      <div className="field">
      <label className="field-label">Registrar movimiento</label>
      <div className="est-chips">
        {PROCESOS_MOV.map((p) => (
          <button key={p.key} type="button"
            className={'est-chip' + (proceso === p.key ? ' on' : '')}
            style={proceso === p.key
              ? { background: p.bg, color: p.fg, borderColor: p.bd }
              : undefined}
            onClick={() => setProceso(p.key)}>
            {p.accion}
          </button>
        ))}
      </div>

      {colores.length === 0 ? (
        <p className="field-hint">
          Carga el pedido (reporte de separados) para tener los colores de esta referencia.
        </p>
      ) : (
        <>
          <div className="mov-hoja">
            <table>
              <thead>
                <tr><th>Color</th><th className="num">Unidades</th></tr>
              </thead>
              <tbody>
                {colores.map((c, i) => (
                  <tr key={c}>
                    <td className="mov-rotulo">{c}</td>
                    <td className="mov-celda">
                      <input ref={(el) => { celdas.current[i] = el }}
                        inputMode="numeric" value={cants[c] || ''} placeholder="·"
                        onChange={(e) => setCants({ ...cants, [c]: e.target.value.replace(/[^\d]/g, '') })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'ArrowDown') {
                            e.preventDefault()
                            const sig = celdas.current[i + 1]
                            if (sig) sig.focus()
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            const ant = celdas.current[i - 1]
                            if (ant) ant.focus()
                          }
                        }} />
                    </td>
                  </tr>
                ))}
                {colores.length > 1 && (
                  <tr className="mov-fila-total">
                    <td className="mov-rotulo">Total</td>
                    <td className="num">{total ? num(total) : '·'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div>
            <button type="button" className="btn btn-primary mov-registrar"
              disabled={!total} onClick={registrar}>
              Registrar{total > 0 ? ` ${num(total)} unidades` : ''}
            </button>
          </div>
          <p className="field-hint">
            Un movimiento por cada color con cantidad, con la fecha de hoy y a tu
            nombre. El color que no va se deja en blanco.
          </p>
        </>
      )}

      {(abiertos.length > 0 || cerrados.length > 0) && (
        <div className="mov-lista">
          {abiertos.map((m) => (
            <div key={m.id} className="mov-item">
              <MovFila mov={m} />
              <span className="mov-desde">desde el {fechaCorta(m.desde)}</span>
              <button type="button" className="btn btn-ghost mov-llego"
                title="Marcar que ya llegó: se cierra el movimiento y queda cuánto tardó"
                onClick={() => llego(m)}>✓ Llegó</button>
              <span className="mov-quien">{nombreCorto(m.usuario)}</span>
            </div>
          ))}
          {cerrados.map((m) => (
            <div key={m.id} className="mov-item cerrado">
              <MovFila mov={m} />
              <span className="mov-desde">{fechaCorta(m.desde)} → {fechaCorta(m.llegadaAt)}</span>
              <span className="mov-quien">{nombreCorto(m.usuario)}</span>
            </div>
          ))}
        </div>
      )}
      </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}

// El seguimiento de una referencia: solo texto, fácil de escribir.
//
// Nada de opciones ni estados aquí: el estado lo mueven los movimientos de
// "En proceso". Esto es la conversación —qué dijo el proveedor, qué se está
// esperando— y cada nota queda con quién la escribió, fecha y hora.
function SeguimientoModal({ fila, usuario, onGuardar, onClose }) {
  const [texto, setTexto] = useState('')
  if (!fila) return null
  const historial = [...(fila.observaciones || [])]
    .filter((o) => o.texto)
    .sort((a, b) => (b.at || 0) - (a.at || 0))
  const cambio = !!texto.trim()

  function guardar() {
    if (!cambio) return
    onGuardar({
      ...fila,
      observaciones: [...(fila.observaciones || []), {
        usuario, at: Date.now(), texto: texto.trim(),
      }],
    })
    setTexto('')
  }

  // Borrar una nota. Se busca por identidad y no por posición: la lista que se
  // ve está ordenada al revés y filtrada, así que su índice no es el mismo.
  function borrar(obs) {
    const todas = fila.observaciones || []
    const i = todas.indexOf(obs)
    if (i < 0) return
    if (!window.confirm('¿Borrar esta nota?\n\n' + obs.texto)) return
    onGuardar({ ...fila, observaciones: todas.filter((_, j) => j !== i) })
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
          <label className="field-label">Nota</label>
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
                <button type="button" className="prog-obs-del"
                  title="Borrar esta nota" aria-label="Borrar esta nota"
                  onClick={() => borrar(o)}>✕</button>
              </div>
              <p>{o.texto}</p>
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
        <TablaColores colores={d.colores} tallas={d.tallas || []} />
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}

// Tabla de color por talla, compartida por el pedido y por cada corte.
function TablaColores({ colores, tallas, nombreDe }) {
  const conDato = tallas.filter((t) => colores.some((c) => (c.tallas[t] || 0) > 0))
  const totalPorTalla = (t) => colores.reduce((n, c) => n + (c.tallas[t] || 0), 0)
  const total = colores.reduce((n, c) => n + c.unid, 0)
  const num = (n) => n.toLocaleString('es-CO')
  return (
    <div className="table-wrap">
      <table className="data-table desg-table">
        <thead>
          <tr>
            <th>Color</th>
            {conDato.map((t) => <th key={t} className="num">{t}</th>)}
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {colores.map((c, i) => (
            <tr key={i}>
              <td className="strong">{nombreDe ? nombreDe(c) : c.color}</td>
              {conDato.map((t) => (
                <td key={t} className="num">
                  {c.tallas[t] ? num(c.tallas[t]) : <span className="muted">·</span>}
                </td>
              ))}
              <td className="num strong">{num(c.unid)}</td>
            </tr>
          ))}
          {colores.length > 1 && (
            <tr className="desg-total">
              <td>Total</td>
              {conDato.map((t) => <td key={t} className="num">{num(totalPorTalla(t))}</td>)}
              <td className="num strong">{num(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Lo programado de una referencia, corte por corte, con los mismos colores y
// tallas del pedido. El color real es el del pedido: si el nombre de la orden
// empata con uno del pedido se muestra ese; si no empata, se deja el de la
// orden con su aviso, porque esa diferencia es justo lo que hay que ver.
function ProgramadoModal({ fila, cortes, onClose }) {
  if (!fila) return null
  const num = (n) => n.toLocaleString('es-CO')
  const nombreDe = (c) => c.colorPedido || (
    <span className="desg-otro" title="Este color no está en el pedido">{c.color} ⚠</span>
  )
  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{fila.id} · programado por color y talla</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>{fila.descripcion || '—'}</p>
        {cortes.length === 0 ? (
          <p className="muted">Todavía no se ha programado ningún corte.</p>
        ) : cortes.map((c, i) => (
          <div key={i} className="desg-corte">
            <p className="desg-corte-cab">
              <b>Orden {c.orden}</b>
              {c.muestra && <span className="tag" title="Orden de muestras: también descuenta del pedido">Muestra</span>}
              {c.pieza && <span className="tag conj-tag">{c.pieza}</span>}
              <span>{formatDate(c.fecha)}</span>
              <span>· {num(c.cant)} unidades</span>
            </p>
            {c.colores.length ? (
              <TablaColores colores={c.colores} tallas={c.tallas} nombreDe={nombreDe} />
            ) : (
              <p className="muted" style={{ fontSize: 12.5 }}>
                Esta orden es anterior al sistema y no trae el detalle de colores.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}

// Lo que falta por programar, color por color: el pedido menos los cortes,
// con los colores casados por su nombre del pedido. Un color programado que el
// pedido no tiene sale como fila propia en negativo, y los cortes viejos sin
// detalle se restan aparte: el total del modal es el mismo de la columna.
function FaltaModal({ fila, cortes, onClose }) {
  if (!fila || !fila.desglose) return null
  const f = faltaPorColor(fila.desglose, cortes)
  const num = (n) => n.toLocaleString('es-CO')
  const nombreDe = (c) => {
    if (!c.delPedido) {
      return <span className="desg-otro" title="Se programó en un color que el pedido no tiene">{c.color} ⚠</span>
    }
    // Si el color del pedido se está produciendo con otro nombre (el BEIGE
    // que sale CRUDO), se avisa aquí mismo.
    const producido = colorProducidoDe(fila.id, c.color)
    return producido ? (
      <span title={`El pedido dice ${c.color}, pero se produce como ${producido}`}>
        {c.color} <span className="muted">→ {producido}</span>
      </span>
    ) : c.color
  }
  // La tela que hay que conseguir para lo que falta, color por color: las
  // unidades pendientes de cada color por el promedio de la ficha. Solo los
  // colores del pedido que aún deben unidades; la unidad es m/und o m/conj
  // según sea prenda suelta o conjunto.
  const telas = fila.telasRef || []
  const porColor = f.colores.filter((c) => c.delPedido && c.unid > 0)
  const dec = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 })
  const mts = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' m'
  return (
    <Modal open onClose={onClose} size="md">
      <div className="modal-head">
        <h2 className="modal-title">{fila.id} · falta por color y talla</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <p className="field-hint" style={{ marginTop: 0 }}>
          {fila.descripcion || '—'} · pedido menos programado
        </p>
        <TablaColores colores={f.colores} tallas={f.tallas} nombreDe={nombreDe} />
        {f.sinDetalle > 0 && (
          <p className="field-hint">
            Ya se descontaron además <b>{num(f.sinDetalle)}</b> unidades de cortes
            anteriores al sistema, que no traen detalle de color.
          </p>
        )}
        {telas.length > 0 && porColor.length > 0 && (
          <>
            <p className="field-hint" style={{ marginTop: 14 }}>
              Tela necesaria para lo que falta, según el promedio de la ficha:
            </p>
            <div className="table-wrap">
              <table className="data-table desg-table">
                <thead>
                  <tr>
                    <th>Color</th>
                    {telas.map((t) => (
                      <th key={t.tela} className="num">
                        {t.tela}{' '}
                        <span className="muted">· {dec(t.prom)} m/{fila.conj ? 'conj' : 'und'}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porColor.map((c) => (
                    <tr key={c.color}>
                      <td className="strong">{c.color}</td>
                      {telas.map((t) => (
                        <td key={t.tela} className="num">{mts(c.unid * t.prom)}</td>
                      ))}
                    </tr>
                  ))}
                  {porColor.length > 1 && (
                    <tr className="desg-total">
                      <td>Total</td>
                      {telas.map((t) => (
                        <td key={t.tela} className="num">
                          {mts(porColor.reduce((n, c) => n + c.unid, 0) * t.prom)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="modal-foot">
        <span className="muted" style={{ fontSize: 12.5, marginRight: 'auto' }}>
          Falta en total: <b>{num(f.total)}</b>
        </span>
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
          El reporte de <b>separados</b> (Pendientes por Clientes y Referencias), tal
          como sale de Factory. Trae todo: referencias, pedido y el detalle por color
          y talla de las dos marcas. Lo programado lo cuenta el sistema de sus
          órdenes de corte.
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
            <b>{delArchivo.refs}</b> referencias con su pedido y su desglose por
            color y talla. Lo ya cargado conserva su seguimiento.
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
  programaciones, orders, refMap, refs, telas, usuario,
  onGuardar, onGuardarVarias, onBorrar, onViewImage, onOpenRef,
}) {
  const [marca, setMarca] = useState('Casania')
  const [q, setQ] = useState('')
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [estadoF, setEstadoF] = useState('')
  // Dos formas de mirar lo mismo: por referencia (la tabla) o por tela,
  // agrupando las referencias que usan cada una y los metros que necesitan.
  const [vista, setVista] = useState('ref')
  const [telaF, setTelaF] = useState('')
  const [cargar, setCargar] = useState(false)
  const [obsDe, setObsDe] = useState(null)
  const [movDe, setMovDe] = useState(null)
  const [desgDe, setDesgDe] = useState(null)
  const [progDe, setProgDe] = useState(null)
  const [faltaDe, setFaltaDe] = useState(null)
  const { sortKey, sortDir, toggle } = useSort('pendiente', 'desc')

  // Los conjuntos ya están armados en Costos: de ahí sale su foto, que es la de
  // las dos prendas puestas y no la de la blusa sola.
  const conjuntos = useMemo(() => indiceConjuntos(refs), [refs])
  // Cada prenda puede tener órdenes bajo su código interno y bajo el final.
  const codigos = useMemo(() => indiceCodigos(refs), [refs])
  const ordenesPorRef = useMemo(() => {
    const m = new Map()
    ;(orders || []).forEach((o) => {
      // Las premuestras no cuentan como programado: es una sola prenda para
      // decidir, no producción. Las muestras sí, y llegan del sync con su
      // curva para restarlas por color y talla.
      if (o.origen === 'premuestra') return
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
      // El pedido que manda es el del desglose (reporte de separados): si
      // alguien carga el reporte viejo de Pedidos y Cortes encima, su cifra
      // no puede pisar la del separados, o la columna y el modal se
      // contradicen (287 contra 318 en la misma referencia).
      const pedido = p.desglose
        ? (Number(p.desglose.total) || 0)
        : (Number(p.pedido) || 0)
      const piezas = delCatalogo ? delCatalogo.piezas : []
      const programado = programadoDe({ id: p.id, piezas }, ordenesPorRef, codigos)
      const pendiente = pedido - programado
      // La tela y su promedio vienen de la ficha técnica de Factory. Los
      // metros son promedio × lo que falta por programar: la cuenta que se
      // hace a mano antes de pedir tela.
      const telasRef = telasDe({ id: p.id, piezas }, telas, codigos)
        .map((t) => ({ ...t, metros: t.prom * Math.max(0, pendiente) }))
      return {
        ...p,
        pedido,
        programado,
        telasRef,
        falta: piezaQueFalta(piezas, ordenesPorRef, refMap, codigos),
        pendiente,
        image: (delCatalogo && delCatalogo.image) || (ficha && ficha.image) || '',
        tipoFicha: (ficha && ficha.tipo) || '',
        conj: esConjunto(p) || !!delCatalogo,
        piezas,
        estado: p.estado || '',
        estadoColor: p.estadoColor || '',
        obs: (p.observaciones || []).filter((o) => o.texto).length,
        ultimaObs: (p.observaciones || []).filter((o) => o.texto).slice(-1)[0] || null,
        movAbiertos: (p.movimientos || []).filter((m) => !m.llegadaAt),
      }
    }), [programaciones, marca, refMap, conjuntos, ordenesPorRef, codigos, telas])

  const rows = useMemo(() => {
    let list = filas
    if (soloPendientes) list = list.filter((f) => f.pendiente > 0)
    if (estadoF) list = list.filter((f) => f.estado === estadoF)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((f) => (
        f.id + ' ' + (f.descripcion || '') + ' '
        + (f.telasRef || []).map((t) => t.tela).join(' ')
      ).toLowerCase().includes(term))
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

  // La otra vista: cada tela con las referencias que la usan, los metros que
  // necesita (promedio × falta) y el estado más atrasado del seguimiento de
  // sus referencias, que es el que manda: la tela está tan lista como la
  // referencia que menos ha avanzado.
  const grupos = useMemo(() => {
    const m = new Map()
    rows.forEach((f) => (f.telasRef || []).forEach((t) => {
      const k = String(t.tela).toUpperCase()
      if (!m.has(k)) m.set(k, { key: k, tela: t.tela, grupo: t.grupo, filas: [], metros: 0 })
      const g = m.get(k)
      g.filas.push({ ...f, prom: t.prom, metros: t.metros })
      g.metros += t.metros
    }))
    const orden = (e) => {
      const i = ESTADOS_PROG.findIndex((x) => x.key === e)
      return i < 0 ? 99 : i
    }
    return [...m.values()].map((g) => {
      const conEstado = g.filas.filter((f) => f.estado)
      return {
        ...g,
        filas: g.filas.sort((a, b) => b.metros - a.metros),
        estado: conEstado.length
          ? conEstado.reduce((a, f) => (orden(f.estado) < orden(a) ? f.estado : a), conEstado[0].estado)
          : '',
      }
    }).sort((a, b) => b.metros - a.metros)
  }, [rows])

  const sinFichaTela = useMemo(() => rows.filter((f) => !(f.telasRef || []).length), [rows])
  const totMetros = useMemo(() => grupos.reduce((n, g) => n + g.metros, 0), [grupos])

  const thProps = { sortKey, sortDir, onSort: toggle }
  const num = (n) => n.toLocaleString('es-CO')
  const dec = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 })
  const mts = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' m'

  return (
    <>
      <div className="view-actions" style={{ marginBottom: 14 }}>
        <div className="dis-filtros">
          <button type="button" className={'proc-f-btn' + (vista === 'ref' ? ' on' : '')}
            onClick={() => setVista('ref')}>Por referencia</button>
          <button type="button" className={'proc-f-btn' + (vista === 'tela' ? ' on' : '')}
            onClick={() => setVista('tela')}>Por tela</button>
        </div>
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

      {vista === 'tela' ? (
        <div className="prog-kpis">
          <div className="prog-kpi"><span>Telas</span><b>{num(grupos.length)}</b></div>
          <div className="prog-kpi alerta"><span>Metros necesarios</span><b>{mts(totMetros)}</b></div>
          <div className="prog-kpi"><span>Falta por programar</span><b>{num(tot.pendiente)}</b></div>
          <div className="prog-kpi"><span>Referencias</span><b>{rows.length}</b></div>
        </div>
      ) : (
        <div className="prog-kpis">
          <div className="prog-kpi"><span>Pedido</span><b>{num(tot.pedido)}</b></div>
          <div className="prog-kpi"><span>Programado</span><b>{num(tot.programado)}</b></div>
          <div className="prog-kpi alerta"><span>Falta por programar</span><b>{num(tot.pendiente)}</b></div>
          <div className="prog-kpi"><span>Referencias</span><b>{rows.length}</b></div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>{(programaciones || []).length === 0
            ? 'Todavía no hay pedidos cargados.'
            : 'Sin referencias en este filtro.'}</p>
          <p className="muted">Carga el reporte de Factory con “Cargar pedidos”.</p>
        </div>
      ) : vista === 'tela' ? (
        <>
          <div className="dis-filtros" style={{ marginBottom: 14 }}>
            <button type="button" className={'proc-f-btn' + (!telaF ? ' on' : '')}
              onClick={() => setTelaF('')}>Todas <b>{grupos.length}</b></button>
            {/* Chips solo de las telas que más metros necesitan: son las que
                se vienen a revisar. Las demás igual aparecen abajo en su
                tarjeta, y el buscador también encuentra por nombre de tela. */}
            {grupos.filter((g, i) => (g.metros > 0 && i < 15) || telaF === g.key).map((g) => (
              <button key={g.key} type="button"
                className={'proc-f-btn' + (telaF === g.key ? ' on' : '')}
                onClick={() => setTelaF(telaF === g.key ? '' : g.key)}>
                {g.tela} <b>{g.filas.length}</b>
              </button>
            ))}
          </div>

          {grupos.filter((g) => !telaF || g.key === telaF).map((g) => (
            <div key={g.key} className="tela-card">
              <div className="tela-card-head">
                <span className="tela-nombre">{g.tela}</span>
                {g.grupo && <span className="tela-grupo">{g.grupo}</span>}
                {g.estado && <EstadoChip estado={g.estado} chico />}
                <div className="tela-total">
                  <b>{mts(g.metros)}</b>
                  <span>necesarios · {g.filas.length} {g.filas.length === 1 ? 'referencia' : 'referencias'}</span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Foto</th>
                      <th>Referencia</th>
                      <th>Descripción</th>
                      <th className="num">Promedio</th>
                      <th className="num">Falta</th>
                      <th className="num">Metros</th>
                      <th>Seguimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.map((f) => {
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
                            {f.conj && <span className="tag conj-tag">Conjunto</span>}
                          </td>
                          <td className="muted">{f.descripcion || '—'}</td>
                          <td className="num muted">{dec(f.prom)} m/{f.conj ? 'conj' : 'und'}</td>
                          <td className={'num strong' + (f.pendiente > 0 ? ' prog-falta' : '')}>
                            {f.pendiente > 0 ? num(f.pendiente) : <span className="muted">—</span>}
                          </td>
                          <td className="num strong">
                            {f.metros > 0 ? mts(f.metros) : <span className="muted">—</span>}
                          </td>
                          <td>
                            <button type="button" className="prog-seg"
                              onClick={() => setObsDe(f)}
                              title={f.obs ? `${f.obs} anotaciones — clic para ver o cambiar` : 'Marcar en qué va'}>
                              {f.estado
                                ? <EstadoChip estado={f.estado} color={f.estadoColor} chico />
                                : <span className="prog-seg-vacio">+ anotar</span>}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {sinFichaTela.length > 0 && (
            <p className="field-hint">
              Sin tela en la ficha técnica de Factory:{' '}
              {sinFichaTela.map((f) => f.id).join(', ')}.
            </p>
          )}
        </>
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
                <th>Tela</th>
                <th>En proceso</th>
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
                      {f.programado > 0 ? (
                        <button type="button" className="prog-ped"
                          onClick={() => setProgDe(f)}
                          title="Ver lo programado por color y talla, corte por corte">
                          {num(f.programado)}
                        </button>
                      ) : num(f.programado)}
                      {f.falta && (
                        <span className="prog-falta-pieza"
                          title={`La otra prenda va programada en ${f.falta.hechas} y esta en ninguna`}>
                          falta {f.falta.tipo}
                        </span>
                      )}
                    </td>
                    <td className={'num strong' + (f.pendiente > 0 ? ' prog-falta' : '')}>
                      {f.desglose && f.pendiente !== 0 ? (
                        <button type="button" className="prog-ped"
                          onClick={() => setFaltaDe(f)}
                          title="Ver lo que falta por color y talla">
                          {num(f.pendiente)}
                        </button>
                      ) : f.pendiente > 0 ? num(f.pendiente) : <span className="muted">—</span>}
                    </td>
                    <td>
                      {(f.telasRef || []).length ? (
                        <div className="tela-stack">
                          {f.telasRef.map((t) => (
                            <span key={t.tela} className="tela-chip"
                              title={`${t.grupo ? t.grupo + ' · ' : ''}${dec(t.prom)} m por ${f.conj ? 'conjunto' : 'unidad'}${f.pendiente > 0 ? ` — faltan ${mts(t.metros)}` : ''}`}>
                              <b>{t.tela}</b>
                              <span>{dec(t.prom)} m/{f.conj ? 'conj' : 'und'}{f.pendiente > 0 ? ` · ${mts(t.metros)}` : ''}</span>
                            </span>
                          ))}
                        </div>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td>
                      <button type="button" className="prog-seg"
                        onClick={() => setMovDe(f)}
                        title="Registrar tela pedida o Textampa, o marcar que llegó">
                        {f.movAbiertos.length ? (
                          <span className="mov-tabla">
                            {f.movAbiertos.map((m) => <MovFila key={m.id} mov={m} />)}
                          </span>
                        ) : <span className="prog-seg-vacio">+ registrar</span>}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="prog-seg"
                        onClick={() => setObsDe(f)}
                        title={f.obs ? `${f.obs} anotaciones — clic para ver o agregar` : 'Anotar seguimiento'}>
                        {f.ultimaObs ? (
                          <>
                            <span className="prog-seg-txt">{f.ultimaObs.texto}</span>
                            <span className="prog-obs-fecha">
                              {nombreCorto(f.ultimaObs.usuario)} · {fechaHora(f.ultimaObs.at)}
                            </span>
                          </>
                        ) : <span className="prog-seg-vacio">+ anotar</span>}
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

      {progDe && (
        <ProgramadoModal fila={progDe}
          cortes={cortesDe(progDe, ordenesPorRef, codigos,
            (progDe.desglose ? progDe.desglose.colores.map((c) => c.color) : []))}
          onClose={() => setProgDe(null)} />
      )}

      {faltaDe && (
        <FaltaModal fila={faltaDe}
          cortes={cortesDe(faltaDe, ordenesPorRef, codigos,
            faltaDe.desglose.colores.map((c) => c.color))}
          onClose={() => setFaltaDe(null)} />
      )}

      {cargar && (
        <CargarModal marca={marca} onClose={() => setCargar(false)}
          onSeparados={(desglose) => {
            // El reporte de separados trae todo: referencias, descripción,
            // pedido y desglose, de las dos marcas a la vez. Es el único que
            // hay que cargar. Lo que ya existía conserva su seguimiento.
            const previas = new Map((programaciones || []).map((p) => [p.id, p]))
            const filasNuevas = Object.entries(desglose).map(([id, d]) => {
              const previa = previas.get(id) || {}
              const ficha = refMap.get(id)
              const marca = (ficha && ficha.marca)
                || previa.marca
                || (id.startsWith('C') ? 'Casania' : 'Mariset')
              return {
                ...previa,
                id,
                marca,
                descripcion: d.descripcion || previa.descripcion || '',
                pedido: d.total,
                desglose: d,
                desgloseAt: Date.now(),
                observaciones: previa.observaciones || [],
                actualizadoAt: Date.now(),
              }
            })
            onGuardarVarias(filasNuevas)
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
          usuario={usuario} onGuardar={onGuardar} onClose={() => setObsDe(null)} />
      )}

      {movDe && (
        <MovimientosModal fila={(programaciones || []).find((p) => p.id === movDe.id) || movDe}
          ficha={refMap.get(movDe.id)}
          usuario={usuario} onGuardar={onGuardar} onClose={() => setMovDe(null)} />
      )}
    </>
  )
}
