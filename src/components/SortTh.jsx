// Encabezado de columna ordenable. Clic alterna asc/desc.
export default function SortTh({ label, col, sortKey, sortDir, onSort, className }) {
  const active = sortKey === col
  return (
    <th
      className={'sort-th' + (active ? ' active' : '') + (className ? ' ' + className : '')}
      onClick={() => onSort(col)}
      role="button"
      title="Ordenar"
    >
      <span className="sort-th-label">{label}</span>
      <span className="sort-ind">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  )
}
