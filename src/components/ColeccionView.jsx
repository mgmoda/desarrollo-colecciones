import { useMemo, useState } from 'react'

// Normalización para comparar tipo (case + acentos).
function norm(s) {
  return (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function esTipo(ref, key) {
  return norm(ref.tipo).includes(key)
}
function esUni(ref) { return ref.estampado === 'no' }
function esEst(ref) { return ref.estampado === 'sublimacion' || ref.estampado === 'reactivos' }

// Categorías del dashboard, en orden.
const CATS = [
  { key: 'vestidos-uni', label: 'Vestidos unicolor', tone: 'uni', match: (r) => esTipo(r, 'vestido') && esUni(r) },
  { key: 'vestidos-est', label: 'Vestidos estampados', tone: 'est', match: (r) => esTipo(r, 'vestido') && esEst(r) },
  { key: 'blusas-uni', label: 'Blusas unicolor', tone: 'uni', match: (r) => esTipo(r, 'blusa') && esUni(r) },
  { key: 'blusas-est', label: 'Blusas estampadas', tone: 'est', match: (r) => esTipo(r, 'blusa') && esEst(r) },
  { key: 'pantalones-uni', label: 'Pantalones unicolor', tone: 'uni', match: (r) => esTipo(r, 'pantalon') && esUni(r) },
  { key: 'pantalones-est', label: 'Pantalones estampados', tone: 'est', match: (r) => esTipo(r, 'pantalon') && esEst(r) },
  { key: 'shorts-uni', label: 'Shorts unicolor', tone: 'uni', match: (r) => esTipo(r, 'short') && esUni(r) },
  { key: 'shorts-est', label: 'Shorts estampados', tone: 'est', match: (r) => esTipo(r, 'short') && esEst(r) },
  { key: 'faldas-uni', label: 'Faldas unicolor', tone: 'uni', match: (r) => esTipo(r, 'falda') && esUni(r) },
  { key: 'faldas-est', label: 'Faldas estampadas', tone: 'est', match: (r) => esTipo(r, 'falda') && esEst(r) },
  { key: 'conjuntos', label: 'Conjuntos', tone: 'neutral', match: (r) => esTipo(r, 'conjunto') },
  { key: 'enterizos', label: 'Enterizos', tone: 'neutral', match: (r) => esTipo(r, 'enterizo') },
  { key: 'chaquetas', label: 'Chaquetas', tone: 'neutral', match: (r) => esTipo(r, 'chaqueta') },
]

export default function ColeccionView({ refs, marcas, onOpenRef, onViewImage }) {
  const [marca, setMarca] = useState('')

  // Filtrar por marca si está activa.
  const visibles = useMemo(() => {
    if (!marca) return refs
    return refs.filter((r) => (r.marca || '').toLowerCase() === marca.toLowerCase())
  }, [refs, marca])

  // Construir las filas de categoría.
  const filas = useMemo(() => {
    const usadas = new Set()
    const out = CATS.map((c) => {
      const items = visibles.filter(c.match)
      items.forEach((r) => usadas.add(r.id))
      return { ...c, items }
    })
    // Otros: refs visibles que no encajaron en ninguna categoría conocida.
    const otros = visibles.filter((r) => !usadas.has(r.id))
    if (otros.length) out.push({ key: 'otros', label: 'Otros', tone: 'neutral', items: otros })
    return out
  }, [visibles])

  const totalVisibles = visibles.length

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Colección</h1>
          <p className="view-sub">{totalVisibles} referencias{marca ? ` · ${marca}` : ''}</p>
        </div>
        <div className="opt-group">
          <button type="button" className={'opt-btn' + (!marca ? ' on' : '')} onClick={() => setMarca('')}>Todas</button>
          {marcas.map((m) => (
            <button key={m} type="button" className={'opt-btn' + (marca === m ? ' on' : '')} onClick={() => setMarca(m)}>{m}</button>
          ))}
        </div>
      </div>

      {filas.every((f) => f.items.length === 0) ? (
        <div className="empty-state">
          <p>Sin referencias para mostrar{marca ? ` con marca ${marca}` : ''}.</p>
        </div>
      ) : (
        <div className="col-list">
          {filas.filter((f) => f.items.length > 0).map((f) => (
            <div className="col-row" key={f.key}>
              <div className="col-row-head">
                <span className="col-row-title">{f.label}</span>
                <span className={'col-count tone-' + f.tone}>{f.items.length}</span>
              </div>
              <div className="col-thumbs">
                {f.items.map((r) => (
                  <button key={r.id} className="col-thumb"
                    title={r.referencia}
                    onClick={() => onOpenRef && onOpenRef(r)}>
                    {r.image ? (
                      <img src={r.image} alt={r.referencia} onClick={(e) => { e.stopPropagation(); onViewImage(r.image) }} />
                    ) : (
                      <span className="col-thumb-ph">{r.referencia.slice(0, 8)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
