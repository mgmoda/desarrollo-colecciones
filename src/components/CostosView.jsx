import { useEffect, useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import Modal from './Modal.jsx'
import PhotoDropzone from './PhotoDropzone.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { formatPrice } from '../lib/constants.js'
import { medicionInfo, buildConjuntoPairs } from '../lib/domain.js'

// Precio "actual" de una prenda para sumar en el conjunto: usa el precio
// de Talla 6-18 si ya se capturó, si no el costo heredado de la ficha.
const precioActual = (r) => Number(r.precioTalla618) || Number(r.costo) || 0

// Captura de precios de lista para la diseñadora. Solo referencias
// aprobadas, filtradas por marca. Los conjuntos se colapsan en una sola
// fila cuyo precio es la suma del costo actual de sus dos prendas.
export default function CostosView({ refs, marcas = [], onEdit, onNew, onViewImage, onSetFields, onAssignPhoto }) {
  const [q, setQ] = useState('')
  const [marcaF, setMarcaF] = useState('')
  const [fotoId, setFotoId] = useState(null)
  const { sortKey, sortDir, toggle } = useSort('referencia', 'asc')

  const esAprobada = (r) => medicionInfo(r).estado === 'aprobada'

  const rows = useMemo(() => {
    // Base: solo aprobadas y de una marca real (Mariset / Casania).
    let base = refs.filter((r) => esAprobada(r) && marcas.includes(r.marca))
    if (marcaF) base = base.filter((r) => r.marca === marcaF)

    // Conjuntos: se colapsan en una fila; sus dos prendas salen de la lista.
    const pairs = buildConjuntoPairs(base)
    const enPar = new Set()
    pairs.forEach((p) => { enPar.add(p.top.id); enPar.add(p.bottom.id) })
    const conjuntoRows = pairs.map(({ top, bottom }) => ({
      id: 'conj-' + top.id,
      isConjunto: true,
      anchor: top,
      top, bottom,
      image: top.image,
      referencia: top.referencia + ' + ' + bottom.referencia,
      tipo: 'Conjunto',
      nuevaRef: top.conjuntoNuevaRef || '',
      descripcion: top.conjuntoDescripcion || '',
      suma: precioActual(top) + precioActual(bottom),
      precioTalla618: precioActual(top) + precioActual(bottom),
      precioTalla20: 0,
    }))
    const individuales = base.filter((r) => !enPar.has(r.id))
    let list = [...conjuntoRows, ...individuales]

    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((r) =>
        [r.referencia, r.nuevaRef, r.tipo, r.descripcion].some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      referencia: (r) => r.referencia,
      nuevaRef: (r) => r.nuevaRef || '',
      tipo: (r) => r.tipo,
      descripcion: (r) => r.descripcion || '',
      precioTalla618: (r) => Number(r.precioTalla618) || Number(r.costo) || 0,
      precioTalla20: (r) => Number(r.precioTalla20) || 0,
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [refs, q, marcaF, marcas, sortKey, sortDir])

  const thProps = { sortKey, sortDir, onSort: toggle }
  const guardar = (ref, campo, valor) => {
    if (String(ref[campo] ?? '') === String(valor ?? '')) return
    onSetFields && onSetFields(ref.id, { [campo]: valor })
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Costos</h1>
          <p className="view-sub">Precios de lista por talla · solo referencias aprobadas · {rows.length} registros</p>
        </div>
        <div className="view-actions">
          <div className="opt-group">
            <button type="button" className={'opt-btn' + (!marcaF ? ' on' : '')} onClick={() => setMarcaF('')}>Todas</button>
            {marcas.map((m) => (
              <button key={m} type="button" className={'opt-btn' + (marcaF === m ? ' on' : '')}
                onClick={() => setMarcaF(marcaF === m ? '' : m)}>{m}</button>
            ))}
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar…" />
          <button className="btn btn-primary" onClick={onNew}>+ Referencia</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state"><p>No hay referencias aprobadas para esta marca.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Foto</th>
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Nueva ref." col="nuevaRef" {...thProps} />
                <SortTh label="Tipo" col="tipo" {...thProps} />
                <SortTh label="Descripción" col="descripcion" {...thProps} />
                <SortTh label="Talla 6–18" col="precioTalla618" {...thProps} />
                <SortTh label="Talla 20" col="precioTalla20" {...thProps} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => r.isConjunto ? (
                <tr key={r.id} className="row-conjunto">
                  <td className="cell-photo">
                    <button type="button" className="thumb-btn" title="Cambiar foto"
                      onClick={() => setFotoId(r.anchor.id)}>
                      {r.image ? (
                        <img src={r.image} alt={r.referencia} className="thumb" />
                      ) : <span className="thumb empty add">＋</span>}
                    </button>
                  </td>
                  <td>
                    <span className="conj-tag">Conjunto</span>
                    <div className="conj-refs">
                      <span className="conj-ref-line"><em>{r.top.tipo || 'Prenda'}</em>{r.top.referencia}</span>
                      <span className="conj-ref-line"><em>{r.bottom.tipo || 'Prenda'}</em>{r.bottom.referencia}</span>
                      <span className="conj-ref-line conj-ref-total"><em>Conjunto</em></span>
                    </div>
                  </td>
                  <td>
                    <div className="conj-newrefs">
                      <InlineText key={r.top.id} value={r.top.nuevaRef || ''} placeholder="MG-…" accent
                        onCommit={(v) => guardar(r.top, 'nuevaRef', v)} />
                      <InlineText key={r.bottom.id} value={r.bottom.nuevaRef || ''} placeholder="MG-…" accent
                        onCommit={(v) => guardar(r.bottom, 'nuevaRef', v)} />
                      <InlineText key={r.id} value={r.nuevaRef} placeholder="MG-C…" accent
                        onCommit={(v) => guardar(r.anchor, 'conjuntoNuevaRef', v)} />
                    </div>
                  </td>
                  <td>Conjunto</td>
                  <td>
                    <InlineText key={r.id} value={r.descripcion} placeholder="Escribir descripción…" wide
                      onCommit={(v) => guardar(r.anchor, 'conjuntoDescripcion', v)} />
                  </td>
                  <td className="num">
                    <span className="conj-suma" title={`Suma: ${formatPrice(precioActual(r.top))} + ${formatPrice(precioActual(r.bottom))}`}>
                      {r.suma > 0 ? formatPrice(r.suma) : '$ —'}
                    </span>
                  </td>
                  <td className="num muted">—</td>
                  <td className="muted cell-action" onClick={() => onEdit(r.anchor)}>Editar ›</td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td className="cell-photo">
                    <button type="button" className="thumb-btn" title="Cambiar foto"
                      onClick={() => setFotoId(r.id)}>
                      {r.image ? (
                        <img src={r.image} alt={r.referencia} className="thumb" />
                      ) : <span className="thumb empty add">＋</span>}
                    </button>
                  </td>
                  <td className="strong">{r.referencia}</td>
                  <td>
                    <InlineText key={r.id} value={r.nuevaRef || ''} placeholder="MG-…" accent
                      onCommit={(v) => guardar(r, 'nuevaRef', v)} />
                  </td>
                  <td>{r.tipo}</td>
                  <td>
                    <InlineText key={r.id} value={r.descripcion || ''} placeholder="Escribir descripción…" wide
                      onCommit={(v) => guardar(r, 'descripcion', v)} />
                  </td>
                  <td className="num">
                    <InlinePrice key={r.id} value={(r.precioTalla618 != null && r.precioTalla618 !== '') ? r.precioTalla618 : r.costo}
                      onCommit={(v) => guardar(r, 'precioTalla618', v)} />
                  </td>
                  <td className="num">
                    <InlinePrice key={r.id} value={r.precioTalla20}
                      onCommit={(v) => guardar(r, 'precioTalla20', v)} />
                  </td>
                  <td className="muted cell-action" onClick={() => onEdit(r)}>Editar ›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FotoModal
        refRow={refs.find((x) => x.id === fotoId) || null}
        onClose={() => setFotoId(null)}
        onAssignPhoto={onAssignPhoto}
      />
    </div>
  )
}

// Modal para cambiar la foto de una referencia sin abrir la ficha completa.
function FotoModal({ refRow, onClose, onAssignPhoto }) {
  if (!refRow) return null
  return (
    <Modal open onClose={onClose} size="sm">
      <div className="modal-head">
        <h2 className="modal-title">Foto · {refRow.referencia}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        <PhotoDropzone
          value={refRow.image || null}
          onChange={(dataUrl) => onAssignPhoto && onAssignPhoto(refRow.id, dataUrl)}
        />
      </div>
    </Modal>
  )
}

// Campo de texto editable en línea (nueva referencia / descripción).
// Re-sincroniza con el valor de la ficha cuando cambia y no está en foco,
// para que al recargar o al actualizarse el dato se vea el valor real.
function InlineText({ value, placeholder, accent, wide, onCommit }) {
  const [val, setVal] = useState(value)
  const [foco, setFoco] = useState(false)
  useEffect(() => { if (!foco) setVal(value) }, [value, foco])
  return (
    <input
      className={'cell-input' + (accent ? ' cell-input-accent' : '') + (wide ? ' cell-input-wide' : '')}
      value={val}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onFocus={() => setFoco(true)}
      onBlur={() => { setFoco(false); onCommit(val.trim()) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}

// Precio editable en línea: muestra formateado cuando no está en foco,
// y los dígitos crudos al editar.
function InlinePrice({ value, onCommit }) {
  const [foco, setFoco] = useState(false)
  const [val, setVal] = useState(value ? String(value) : '')
  const n = Number(val) || 0
  return (
    <input
      className="cell-input cell-input-price"
      inputMode="numeric"
      value={foco ? val : (n > 0 ? formatPrice(n) : '')}
      placeholder="$ —"
      onFocus={(e) => { setFoco(true); requestAnimationFrame(() => e.target.select()) }}
      onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => { setFoco(false); onCommit(n) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
    />
  )
}
