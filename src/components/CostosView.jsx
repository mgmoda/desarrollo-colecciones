import { useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { formatPrice, TOP_LABEL } from '../lib/constants.js'
import { refTelas, telaResuelta } from '../lib/domain.js'

const telasTexto = (r) => refTelas(r).map((t) => t.nombre).filter(Boolean).join(' / ')
const preciosTexto = (r, cat) => refTelas(r).map((t) => formatPrice(telaResuelta(t, cat).precio)).filter(Boolean).join(' / ')
const primerPrecio = (r, cat) => { const p = refTelas(r).map((t) => Number(telaResuelta(t, cat).precio)).filter((n) => n > 0); return p.length ? p[0] : 0 }

export default function CostosView({ refs, telasCatalog = [], onEdit, onNew, onViewImage }) {
  const [q, setQ] = useState('')
  const [soloSinCosto, setSoloSinCosto] = useState(false)
  const { sortKey, sortDir, toggle } = useSort('referencia', 'asc')

  const rows = useMemo(() => {
    let list = refs
    if (soloSinCosto) list = list.filter((r) => !(Number(r.costo) > 0))
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((r) =>
        [r.referencia, r.tipo, telasTexto(r)].some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      referencia: (r) => r.referencia,
      tipo: (r) => r.tipo,
      tela: (r) => telasTexto(r),
      colorMuestra: (r) => r.colorMuestra,
      precioTela: (r) => primerPrecio(r, telasCatalog),
      costo: (r) => Number(r.costo),
      topIncluido: (r) => r.topIncluido || '',
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [refs, q, soloSinCosto, sortKey, sortDir, telasCatalog])

  const thProps = { sortKey, sortDir, onSort: toggle }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Costos</h1>
          <p className="view-sub">Captura manual de precios por referencia · {rows.length} registros</p>
        </div>
        <div className="view-actions">
          <label className="check">
            <input type="checkbox" checked={soloSinCosto}
              onChange={(e) => setSoloSinCosto(e.target.checked)} /> Sin costo
          </label>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar…" />
          <button className="btn btn-primary" onClick={onNew}>+ Referencia</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state"><p>Sin registros.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Foto</th>
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Tipo" col="tipo" {...thProps} />
                <SortTh label="Tela" col="tela" {...thProps} />
                <SortTh label="Color muestra" col="colorMuestra" {...thProps} />
                <SortTh label="Precio tela" col="precioTela" {...thProps} />
                <SortTh label="Costo" col="costo" {...thProps} />
                <SortTh label="Top / forro" col="topIncluido" {...thProps} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-click" onClick={() => onEdit(r)}>
                  <td className="cell-photo">
                    {r.image ? (
                      <img src={r.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                        onClick={(e) => { e.stopPropagation(); onViewImage(r.image) }} />
                    ) : <span className="thumb empty">—</span>}
                  </td>
                  <td className="strong">{r.referencia}</td>
                  <td>{r.tipo}</td>
                  <td>{telasTexto(r)}</td>
                  <td>{r.colorMuestra}</td>
                  <td className="num">{preciosTexto(r, telasCatalog)}</td>
                  <td className="num strong">{formatPrice(r.costo)}</td>
                  <td>{TOP_LABEL[r.topIncluido] || '—'}</td>
                  <td className="muted">Editar ›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
