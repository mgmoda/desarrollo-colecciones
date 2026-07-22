import { useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { formatPrice } from '../lib/constants.js'
import { medicionInfo } from '../lib/domain.js'

// Captura de precios de lista para la diseñadora. Solo referencias
// aprobadas, filtradas por marca. Columnas editables en línea:
// nueva referencia, descripción y los dos precios por rango de talla.
export default function CostosView({ refs, marcas = [], onEdit, onNew, onViewImage, onSetFields }) {
  const [q, setQ] = useState('')
  const [marcaF, setMarcaF] = useState('')
  const { sortKey, sortDir, toggle } = useSort('referencia', 'asc')

  const marcaOf = (r) => (r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca')
  const esAprobada = (r) => medicionInfo(r).estado === 'aprobada'

  const rows = useMemo(() => {
    // Base: solo aprobadas y de una marca real (Mariset / Casania).
    let list = refs.filter((r) => esAprobada(r) && marcas.includes(r.marca))
    if (marcaF) list = list.filter((r) => r.marca === marcaF)
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
  const guardar = (r, campo, valor) => {
    if (String(r[campo] ?? '') === String(valor ?? '')) return
    onSetFields && onSetFields(r.id, { [campo]: valor })
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-photo">
                    {r.image ? (
                      <img src={r.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                        onClick={() => onViewImage(r.image)} />
                    ) : <span className="thumb empty">—</span>}
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
    </div>
  )
}

// Campo de texto editable en línea (nueva referencia / descripción).
function InlineText({ value, placeholder, accent, wide, onCommit }) {
  const [val, setVal] = useState(value)
  return (
    <input
      className={'cell-input' + (accent ? ' cell-input-accent' : '') + (wide ? ' cell-input-wide' : '')}
      value={val}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val.trim())}
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
