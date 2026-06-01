import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
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
  const [drilldown, setDrilldown] = useState(null) // { title, items } o null

  const marcaOf = (r) => (r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca')
  const isDraft = (r) => !(tracksByRef && tracksByRef.get(r.id) && tracksByRef.get(r.id).length > 0)
  // Las descartadas NO suman en categorías ni borradores; se aíslan en su propia área.
  const isDescartada = (r) => medicionInfo(r).estado === 'descartada'
  function showRefs(title, list) {
    if (!list || list.length === 0) return
    setDrilldown({ title, items: list })
  }
  function pairsRefsByMarca(m) {
    const out = []
    buildConjuntoPairs(refs).forEach((p) => {
      const pm = (p.top.marca && marcas.includes(p.top.marca)) ? p.top.marca : 'Sin marca'
      if (m === 'Total' || pm === m) { out.push(p.top); out.push(p.bottom) }
    })
    return out
  }

  // Filtrar por marca si está activa.
  const visibles = useMemo(() => {
    if (!marca) return refs
    return refs.filter((r) => (r.marca || '').toLowerCase() === marca.toLowerCase())
  }, [refs, marca])

  // Construir las filas de categoría.
  // Las descartadas se EXCLUYEN de las categorías y aparecen en su propia fila al final.
  const filas = useMemo(() => {
    const activas = visibles.filter((r) => !isDescartada(r))
    const descartadas = visibles.filter(isDescartada)
    const usadas = new Set()
    const out = CATS.map((c) => {
      const items = activas.filter(c.match)
      items.forEach((r) => usadas.add(r.id))
      return { ...c, items }
    })
    // Conjuntos = pares enlazados (solo si ambas prendas están activas).
    const pairs = buildConjuntoPairs(activas)
    pairs.forEach((p) => { usadas.add(p.top.id); usadas.add(p.bottom.id) })
    if (pairs.length) {
      out.push({ key: 'conjuntos-pairs', label: 'Conjuntos', tone: 'neutral', items: pairs, pairsMode: true })
    }
    // Otros: refs activas que no encajaron en ninguna categoría conocida.
    const otros = activas.filter((r) => !usadas.has(r.id))
    if (otros.length) out.push({ key: 'otros', label: 'Otros', tone: 'neutral', items: otros })
    // Área separada para descartadas (al final, no suman a categorías).
    if (descartadas.length) {
      out.push({ key: 'descartadas', label: 'Descartadas', tone: 'descartada', items: descartadas })
    }
    return out
  }, [visibles])

  const totalActivas = visibles.filter((r) => !isDescartada(r)).length
  const totalDescartadas = visibles.length - totalActivas

  // KPIs por marca: referencias activas, aprobadas, repetición, borradores y descartadas.
  // Las descartadas NO suman en refs/borradores; se cuentan aparte.
  const kpis = useMemo(() => {
    const allMarcas = [...marcas, 'Sin marca', 'Total']
    const k = {}
    allMarcas.forEach((m) => { k[m] = { refs: 0, aprobadas: 0, repeticion: 0, borradores: 0, descartadas: 0 } })
    refs.forEach((r) => {
      const m = r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca'
      const buckets = [m, 'Total']
      const estado = medicionInfo(r).estado
      const hasOrders = tracksByRef && tracksByRef.get(r.id) && tracksByRef.get(r.id).length > 0
      buckets.forEach((t) => {
        if (estado === 'descartada') {
          k[t].descartadas++
          return
        }
        k[t].refs++
        if (estado === 'aprobada') k[t].aprobadas++
        if (estado === 'repeticion') k[t].repeticion++
        if (!hasOrders) k[t].borradores++
      })
    })
    return { allMarcas, k }
  }, [refs, marcas, tracksByRef])

  // Resumen comparativo: categoría × marca (siempre con TODAS las refs,
  // sin importar el filtro actual, para poder comparar entre marcas).
  const resumen = useMemo(() => {
    const allMarcas = [...marcas, 'Sin marca']
    const matrix = {}
    CATS.forEach((c) => {
      matrix[c.key] = { label: c.label, tone: c.tone, total: 0 }
      allMarcas.forEach((m) => { matrix[c.key][m] = 0 })
    })
    refs.forEach((r) => {
      if (isDescartada(r)) return // las descartadas NO suman en categorías
      CATS.forEach((c) => {
        if (c.match(r)) {
          const m = r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca'
          matrix[c.key][m] = (matrix[c.key][m] || 0) + 1
          matrix[c.key].total++
        }
      })
    })
    // Conjuntos (pares) por marca: se atribuye a la marca de la prenda de arriba.
    // Excluir pares donde alguna prenda esté descartada.
    const pairs = buildConjuntoPairs(refs).filter((p) => !isDescartada(p.top) && !isDescartada(p.bottom))
    const conjuntos = { total: pairs.length }
    allMarcas.forEach((m) => { conjuntos[m] = 0 })
    pairs.forEach((p) => {
      const m = p.top.marca && marcas.includes(p.top.marca) ? p.top.marca : 'Sin marca'
      conjuntos[m]++
    })
    // Borradores: total por marca (excluyendo descartadas).
    const borradores = { total: 0 }
    allMarcas.forEach((m) => { borradores[m] = 0 })
    refs.forEach((r) => {
      if (isDescartada(r)) return
      const hasOrders = tracksByRef && tracksByRef.get(r.id) && tracksByRef.get(r.id).length > 0
      if (!hasOrders) {
        const m = r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca'
        borradores[m]++
        borradores.total++
      }
    })
    // Descartadas: contador separado por marca.
    const descartadas = { total: 0 }
    allMarcas.forEach((m) => { descartadas[m] = 0 })
    refs.forEach((r) => {
      if (!isDescartada(r)) return
      const m = r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca'
      descartadas[m]++
      descartadas.total++
    })
    // Borradores desglosados por categoría × marca.
    const borrPorCat = {}
    CATS.forEach((c) => {
      borrPorCat[c.key] = { label: c.label, total: 0 }
      allMarcas.forEach((m) => { borrPorCat[c.key][m] = 0 })
    })
    borrPorCat.sinClas = { label: 'Sin clasificar (tipo/estampado vacíos)', total: 0 }
    allMarcas.forEach((m) => { borrPorCat.sinClas[m] = 0 })
    refs.forEach((r) => {
      if (isDescartada(r)) return
      const hasOrders = tracksByRef && tracksByRef.get(r.id) && tracksByRef.get(r.id).length > 0
      if (hasOrders) return
      const marca = r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca'
      let matched = false
      for (const c of CATS) {
        if (c.match(r)) {
          borrPorCat[c.key][marca]++
          borrPorCat[c.key].total++
          matched = true
          break
        }
      }
      if (!matched) {
        borrPorCat.sinClas[marca]++
        borrPorCat.sinClas.total++
      }
    })
    // Total general = solo referencias ACTIVAS (descartadas se cuentan aparte).
    const totales = { total: 0 }
    allMarcas.forEach((m) => { totales[m] = 0 })
    refs.forEach((r) => {
      if (isDescartada(r)) return
      const m = r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca'
      totales[m]++
      totales.total++
    })
    return { allMarcas, matrix, conjuntos, borradores, borrPorCat, totales, descartadas }
  }, [refs, marcas, tracksByRef])

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
          <p className="view-sub">
            {totalActivas} referencias activas
            {totalDescartadas > 0 && <span className="muted"> · {totalDescartadas} descartadas (no suman)</span>}
            {marca ? ` · ${marca}` : ''}
          </p>
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

      {/* Tarjetas KPI por marca */}
      <div className="kpi-marcas">
        {kpis.allMarcas.map((m) => {
          const x = kpis.k[m]
          const isTotal = m === 'Total'
          return (
            <div className={'kpi-marca' + (isTotal ? ' is-total' : '')} key={m}>
              <div className="kpi-marca-name">{m}</div>
              <div className="kpi-marca-main">
                <span className="kpi-marca-num">{x.refs}</span>
                <span className="kpi-marca-num-sub">referencias</span>
              </div>
              <div className="kpi-marca-chips">
                <span className="kpi-chip ok">{x.aprobadas} aprobadas</span>
                <span className="kpi-chip rep">{x.repeticion} repetición</span>
                <span className="kpi-chip warn">{x.borradores} borrador</span>
                {x.descartadas > 0 && (
                  <span className="kpi-chip desc">{x.descartadas} descartadas</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Resumen general comparativo (no se ve afectado por el filtro) */}
      <div className="col-summary">
        <div className="col-summary-head">
          <h3 className="col-summary-title">Resumen por categoría</h3>
          <span className="muted">Todas las marcas · {refs.length} referencias</span>
        </div>
        <div className="table-wrap">
          <table className="data-table col-summary-table">
            <thead>
              <tr>
                <th>Categoría</th>
                {resumen.allMarcas.map((m) => <th key={m} className="num">{m}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {CATS.map((c) => {
                const row = resumen.matrix[c.key]
                if (!row || row.total === 0) return null
                return (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    {resumen.allMarcas.map((m) => (
                      <td key={m} className={'num' + (row[m] > 0 ? ' clickable' : '')}
                        onClick={() => showRefs(`${c.label} · ${m}`, refs.filter((r) => c.match(r) && marcaOf(r) === m))}>
                        {row[m] || 0}
                      </td>
                    ))}
                    <td className={'num strong' + (row.total > 0 ? ' clickable' : '')}
                      onClick={() => showRefs(c.label, refs.filter(c.match))}>
                      {row.total}
                    </td>
                  </tr>
                )
              })}
              {resumen.conjuntos.total > 0 && (
                <tr>
                  <td>Conjuntos (pares enlazados)</td>
                  {resumen.allMarcas.map((m) => (
                    <td key={m} className={'num' + (resumen.conjuntos[m] > 0 ? ' clickable' : '')}
                      onClick={() => showRefs(`Conjuntos · ${m}`, pairsRefsByMarca(m))}>
                      {resumen.conjuntos[m] || 0}
                    </td>
                  ))}
                  <td className="num strong clickable"
                    onClick={() => showRefs('Conjuntos · Todos', pairsRefsByMarca('Total'))}>
                    {resumen.conjuntos.total}
                  </td>
                </tr>
              )}
              <tr className="col-summary-total">
                <td>Total activas</td>
                {resumen.allMarcas.map((m) => (
                  <td key={m} className={'num strong' + (resumen.totales[m] > 0 ? ' clickable' : '')}
                    onClick={() => showRefs(`Total · ${m}`, refs.filter((r) => marcaOf(r) === m && !isDescartada(r)))}>
                    {resumen.totales[m] || 0}
                  </td>
                ))}
                <td className="num strong clickable"
                  onClick={() => showRefs('Todas las referencias activas', refs.filter((r) => !isDescartada(r)))}>
                  {resumen.totales.total}
                </td>
              </tr>
              {resumen.descartadas.total > 0 && (
                <tr className="col-summary-desc">
                  <td>Descartadas <span className="muted">(no suman)</span></td>
                  {resumen.allMarcas.map((m) => (
                    <td key={m} className={'num' + (resumen.descartadas[m] > 0 ? ' clickable' : '')}
                      onClick={() => showRefs(`Descartadas · ${m}`, refs.filter((r) => isDescartada(r) && marcaOf(r) === m))}>
                      {resumen.descartadas[m] || 0}
                    </td>
                  ))}
                  <td className="num strong clickable"
                    onClick={() => showRefs('Descartadas', refs.filter(isDescartada))}>
                    {resumen.descartadas.total}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Borradores por categoría — para saber qué tipo de prendas hay pendientes */}
      {resumen.borradores.total > 0 && (
        <div className="col-summary col-summary-borr-block">
          <div className="col-summary-head">
            <h3 className="col-summary-title">⚠ Borradores por categoría</h3>
            <span className="muted">{resumen.borradores.total} borradores sin orden en Excel</span>
          </div>
          <div className="table-wrap">
            <table className="data-table col-summary-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  {resumen.allMarcas.map((m) => <th key={m} className="num">{m}</th>)}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {CATS.map((c) => {
                  const row = resumen.borrPorCat[c.key]
                  if (!row || row.total === 0) return null
                  return (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      {resumen.allMarcas.map((m) => (
                        <td key={m} className={'num' + (row[m] > 0 ? ' clickable' : '')}
                          onClick={() => showRefs(`Borrador · ${c.label} · ${m}`, refs.filter((r) => isDraft(r) && c.match(r) && marcaOf(r) === m))}>
                          {row[m] || 0}
                        </td>
                      ))}
                      <td className={'num strong' + (row.total > 0 ? ' clickable' : '')}
                        onClick={() => showRefs(`Borrador · ${c.label}`, refs.filter((r) => isDraft(r) && c.match(r)))}>
                        {row.total}
                      </td>
                    </tr>
                  )
                })}
                {resumen.borrPorCat.sinClas.total > 0 && (
                  <tr>
                    <td className="muted">{resumen.borrPorCat.sinClas.label}</td>
                    {resumen.allMarcas.map((m) => (
                      <td key={m} className={'num' + (resumen.borrPorCat.sinClas[m] > 0 ? ' clickable' : '')}
                        onClick={() => showRefs(`Borrador · Sin clasificar · ${m}`, refs.filter((r) => isDraft(r) && !CATS.some((c) => c.match(r)) && marcaOf(r) === m))}>
                        {resumen.borrPorCat.sinClas[m] || 0}
                      </td>
                    ))}
                    <td className={'num strong' + (resumen.borrPorCat.sinClas.total > 0 ? ' clickable' : '')}
                      onClick={() => showRefs('Borrador · Sin clasificar', refs.filter((r) => isDraft(r) && !CATS.some((c) => c.match(r))))}>
                      {resumen.borrPorCat.sinClas.total}
                    </td>
                  </tr>
                )}
                <tr className="col-summary-total">
                  <td>Total borradores</td>
                  {resumen.allMarcas.map((m) => (
                    <td key={m} className={'num strong' + (resumen.borradores[m] > 0 ? ' clickable' : '')}
                      onClick={() => showRefs(`Borradores · ${m}`, refs.filter((r) => isDraft(r) && marcaOf(r) === m))}>
                      {resumen.borradores[m] || 0}
                    </td>
                  ))}
                  <td className="num strong clickable"
                    onClick={() => showRefs('Todos los borradores', refs.filter(isDraft))}>
                    {resumen.borradores.total}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
      <Modal open={!!drilldown} onClose={() => setDrilldown(null)} size="lg">
        <div className="modal-head">
          <h2 className="modal-title">{drilldown && drilldown.title}</h2>
          <button className="icon-btn" onClick={() => setDrilldown(null)} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ marginBottom: 10 }}>
            {drilldown ? `${drilldown.items.length} referencias` : ''}
          </p>
          <div className="col-thumbs">
            {drilldown && drilldown.items.map((r) => renderTile(r))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
