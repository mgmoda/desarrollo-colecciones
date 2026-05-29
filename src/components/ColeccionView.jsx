import { useMemo, useState } from 'react'
import { medicionInfo } from '../lib/domain.js'
import { formatPrice } from '../lib/constants.js'

const STATE_LABEL = { aprobada: 'Aprobada', repeticion: 'Repetición', descartada: 'Descartada' }

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

// Detecta si una referencia es "de arriba" (blusa/camisa/top/chaqueta) o
// "de abajo" (pantalón/short/falda) para ordenar la pareja en el conjunto.
function isTop(r) { return ['blusa', 'camisa', 'top', 'chaqueta'].some((k) => esTipo(r, k)) }
function isBottom(r) { return ['pantalon', 'short', 'falda'].some((k) => esTipo(r, k)) }

// Empareja referencias enlazadas por conjunto/conjuntoRef en {top, bottom}.
function buildConjuntoPairs(refs) {
  const byId = new Map(refs.map((r) => [r.id, r]))
  const used = new Set()
  const pairs = []
  refs.forEach((r) => {
    if (used.has(r.id)) return
    if (!r.conjunto || !r.conjuntoRef) return
    const partner = byId.get(r.conjuntoRef)
    if (!partner || used.has(partner.id)) return
    let top, bottom
    if (isTop(r)) { top = r; bottom = partner }
    else if (isBottom(r)) { top = partner; bottom = r }
    else if (isTop(partner)) { top = partner; bottom = r }
    else { top = r; bottom = partner }
    pairs.push({ top, bottom })
    used.add(r.id); used.add(partner.id)
  })
  return pairs
}

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
  { key: 'enterizos', label: 'Enterizos', tone: 'neutral', match: (r) => esTipo(r, 'enterizo') },
  { key: 'chaquetas', label: 'Chaquetas', tone: 'neutral', match: (r) => esTipo(r, 'chaqueta') },
]

export default function ColeccionView({ refs, marcas, tracksByRef, onOpenRef, onNew, onViewImage }) {
  const [marca, setMarca] = useState('')
  const [ocultarPrecios, setOcultarPrecios] = useState(false)

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
    // Conjuntos = pares enlazados (blusa arriba + pantalón abajo, etc.).
    const pairs = buildConjuntoPairs(visibles)
    pairs.forEach((p) => { usadas.add(p.top.id); usadas.add(p.bottom.id) })
    if (pairs.length) {
      out.push({ key: 'conjuntos-pairs', label: 'Conjuntos', tone: 'neutral', items: pairs, pairsMode: true })
    }
    // Otros: refs visibles que no encajaron en ninguna categoría conocida.
    const otros = visibles.filter((r) => !usadas.has(r.id))
    if (otros.length) out.push({ key: 'otros', label: 'Otros', tone: 'neutral', items: otros })
    return out
  }, [visibles])

  const totalVisibles = visibles.length

  // Renderiza una miniatura individual (reutilizada en categorías y pares).
  function renderTile(r) {
    const estado = medicionInfo(r).estado
    const label = STATE_LABEL[estado]
    const hasOrders = (tracksByRef && tracksByRef.get(r.id) && tracksByRef.get(r.id).length > 0)
    const isDraft = !label && !hasOrders
    const stripText = label || (isDraft ? 'Borrador' : ' ')
    const stripCls = label ? 's-' + estado : isDraft ? 's-draft' : 's-none'
    return (
      <button key={r.id} className="col-thumb"
        title={`${r.referencia}${r.marca ? ' · ' + r.marca : ''}${isDraft ? ' · borrador (sin orden en Excel)' : ''} · clic para ver la ficha`}
        onClick={() => onOpenRef && onOpenRef(r)}>
        <span className={'col-state ' + stripCls}>{stripText}</span>
        {r.marca && (
          <span className={'col-marca m-' + r.marca.toLowerCase()} title={r.marca}>
            {r.marca.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="col-thumb-img">
          {r.image ? (
            <img src={r.image} alt={r.referencia} />
          ) : (
            <span className="col-thumb-ph">Sin foto</span>
          )}
        </span>
        <span className="col-thumb-ref">{r.referencia}</span>
        {!ocultarPrecios && Number(r.costo) > 0 && (
          <span className="col-thumb-price">{formatPrice(r.costo)}</span>
        )}
      </button>
    )
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Colección</h1>
          <p className="view-sub">{totalVisibles} referencias{marca ? ` · ${marca}` : ''}</p>
        </div>
        <div className="view-actions">
          <label className="check">
            <input type="checkbox" checked={ocultarPrecios}
              onChange={(e) => setOcultarPrecios(e.target.checked)} /> Ocultar precios
          </label>
          <div className="opt-group">
            <button type="button" className={'opt-btn' + (!marca ? ' on' : '')} onClick={() => setMarca('')}>Todas</button>
            {marcas.map((m) => (
              <button key={m} type="button" className={'opt-btn' + (marca === m ? ' on' : '')} onClick={() => setMarca(m)}>{m}</button>
            ))}
          </div>
          {onNew && (
            <button className="btn btn-primary" onClick={onNew}>+ Nueva referencia</button>
          )}
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
                {f.pairsMode
                  ? f.items.map((p) => (
                    <div className="col-pair" key={p.top.id + '__' + p.bottom.id}>
                      {renderTile(p.top)}
                      {renderTile(p.bottom)}
                    </div>
                  ))
                  : f.items.map((r) => renderTile(r))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
