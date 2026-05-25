// Campo de búsqueda con botón "✕" para borrar todo de un clic.
export default function SearchInput({ value, onChange, placeholder, className }) {
  return (
    <div className={'search-box' + (className ? ' ' + className : '')}>
      <input
        className="input search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')}
          title="Borrar búsqueda" aria-label="Borrar búsqueda">✕</button>
      )}
    </div>
  )
}
