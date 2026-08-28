import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { esConjunto, indiceConjuntos, leerArchivo, leerPegado, piezaQueFalta } from '../lib/programaciones.js'

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

// Lo que dijo el encargado de por qué una referencia no se ha programado.
// Es una bitácora, no un campo: la respuesta de la semana pasada importa tanto
// como la de hoy para saber si el problema se está moviendo.
function SeguimientoModal({ fila, usuario, onGuardar, onClose }) {
  const [texto, setTexto] = useState('')
  if (!fila) return null
  const historial = [...(fila.observaciones || [])].sort((a, b) => (b.at || 0) - (a.at || 0))

  function agregar() {
    const t = texto.trim()
    if (!t) return
    onGuardar({
      ...fila,
      observaciones: [...(fila.observaciones || []), { texto: t, usuario, at: Date.now() }],
    })
    setTexto('')
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
          <label className="field-label">¿Qué dijeron?</label>
          <textarea className="input prog-ta" rows={3} value={texto} autoFocus
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej. no hay tela, se está buscando con otros proveedores" />
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
              <p>{o.texto}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={agregar} disabled={!texto.trim()}>
          Anotar
        </button>
      </div>
    </Modal>
  )
}

// Carga del reporte de Factory. Lo normal es soltar el archivo tal como sale;
// pegar las filas queda como salida por si algún día el archivo no abre.
function CargarModal({ marca, onConfirmar, onClose }) {
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [err, setErr] = useState('')
  const [delArchivo, setDelArchivo] = useState(null) // { filas, marca, nombre }
  const pegado = useMemo(() => leerPegado(texto, marca), [texto, marca])
  const filas = delArchivo ? delArchivo.filas : pegado.filas
  const marcaFinal = delArchivo ? delArchivo.marca : marca

  async function tomar(file) {
    if (!file) return
    setErr(''); setLeyendo(true); setDelArchivo(null)
    try {
      const { filas: fs, marca: m } = await leerArchivo(file)
      if (!m) { setErr('No pude saber si es de Casania o de Mariset. Renombra el archivo o pega las filas.'); return }
      setDelArchivo({ filas: fs, marca: m, nombre: file.name })
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
          exportas. Se toman la referencia, la descripción, el pedido y lo cortado.
        </p>

        <label className="import-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); tomar(e.dataTransfer.files && e.dataTransfer.files[0]) }}>
          <input type="file" hidden
            accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => tomar(e.target.files && e.target.files[0])} />
          <span>
            {leyendo ? 'Leyendo…'
              : delArchivo ? `${delArchivo.nombre} · ${delArchivo.marca}`
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

        {filas.length > 0 && (
          <p className="field-hint">
            Se van a cargar <b>{filas.length}</b> referencias de <b>{marcaFinal}</b>.
            Las que ya existan actualizan sus cifras; el seguimiento no se pierde.
          </p>
        )}
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!filas.length || leyendo}
          onClick={() => onConfirmar(filas.map((f) => ({ ...f, marca: marcaFinal })), marcaFinal)}>
          Cargar {filas.length || ''}
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
  const [cargar, setCargar] = useState(false)
  const [obsDe, setObsDe] = useState(null)
  const { sortKey, sortDir, toggle } = useSort('pendiente', 'desc')

  // Los conjuntos ya están armados en Costos: de ahí sale su foto, que es la de
  // las dos prendas puestas y no la de la blusa sola.
  const conjuntos = useMemo(() => indiceConjuntos(refs), [refs])
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
      // Sin la clave, la fila viene de una carga vieja: no es un cero, es que
      // no se trajo. Se distingue para no hacer creer que no se ha cortado nada.
      const cortado = p.cortado == null ? null : (Number(p.cortado) || 0)
      const piezas = delCatalogo ? delCatalogo.piezas : []
      return {
        ...p,
        pedido,
        cortado,
        falta: piezaQueFalta(piezas, ordenesPorRef, refMap),
        pendiente: cortado == null ? null : pedido - cortado,
        image: (delCatalogo && delCatalogo.image) || (ficha && ficha.image) || '',
        tipoFicha: (ficha && ficha.tipo) || '',
        conj: esConjunto(p) || !!delCatalogo,
        piezas,
        obs: (p.observaciones || []).length,
        ultimaObs: (p.observaciones || []).slice(-1)[0] || null,
      }
    }), [programaciones, marca, refMap, conjuntos, ordenesPorRef])

  const rows = useMemo(() => {
    let list = filas
    if (soloPendientes) list = list.filter((f) => (f.pendiente || 0) > 0)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((f) => (f.id + ' ' + (f.descripcion || '')).toLowerCase().includes(term))
    }
    const accessors = {
      referencia: (f) => f.id,
      descripcion: (f) => f.descripcion || '',
      pedido: (f) => f.pedido,
      cortado: (f) => f.cortado || 0,
      pendiente: (f) => f.pendiente || 0,
      obs: (f) => f.obs,
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [filas, q, soloPendientes, sortKey, sortDir])

  const tot = useMemo(() => rows.reduce((a, f) => ({
    pedido: a.pedido + f.pedido,
    cortado: a.cortado + (f.cortado || 0),
    pendiente: a.pendiente + Math.max(0, f.pendiente || 0),
  }), { pedido: 0, cortado: 0, pendiente: 0 }), [rows])

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
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia…" />
        <button className="btn btn-primary" onClick={() => setCargar(true)}>Cargar pedidos</button>
      </div>

      <div className="prog-kpis">
        <div className="prog-kpi"><span>Pedido</span><b>{num(tot.pedido)}</b></div>
        <div className="prog-kpi"><span>Cortado</span><b>{num(tot.cortado)}</b></div>
        <div className="prog-kpi alerta"><span>Falta por programar</span><b>{num(tot.pendiente)}</b></div>
        <div className="prog-kpi"><span>Referencias</span><b>{rows.length}</b></div>
      </div>

      {filas.some((f) => f.cortado == null) && (
        <div className="prog-aviso">
          Estas cifras se cargaron antes de que existiera la columna <b>Cortado</b>,
          por eso sale vacía. Vuelve a cargar el reporte y queda completa.
        </div>
      )}

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
                <SortTh label="Cortado" col="cortado" className="num" {...thProps} />
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
                    <td className="num strong">{num(f.pedido)}</td>
                    <td className="num">
                      {f.cortado == null ? <span className="muted">—</span> : num(f.cortado)}
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
                      <button type="button" className={'nota-btn' + (f.obs ? ' con' : '')}
                        onClick={() => setObsDe(f)}
                        title={f.obs ? `${f.obs} anotaciones` : 'Anotar por qué no se ha programado'}>
                        {f.ultimaObs ? f.ultimaObs.texto : '+ anotar'}
                      </button>
                      {f.ultimaObs && (
                        <span className="prog-obs-fecha">
                          {nombreCorto(f.ultimaObs.usuario)} · {fechaHora(f.ultimaObs.at)}
                        </span>
                      )}
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

      {cargar && (
        <CargarModal marca={marca} onClose={() => setCargar(false)}
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
    </>
  )
}
