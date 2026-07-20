import { useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import CatalogoView from './CatalogoView.jsx'
import { medicionInfo } from '../lib/domain.js'

// Pool único de referencias listas para la sesión de fotos.
// Dos zonas apiladas: "Por fotografiar" arriba y "Ya fotografiadas" abajo.
// Sub-bloques por marca dentro de cada zona (como Colección).
// Incluye el modo "Catálogo": armador por pliegos para la diseñadora.
export default function FotosView({ refs, marcas, onOpenRef, onViewImage, onSetFields, catalogos, onSaveCatalogo }) {
  const [q, setQ] = useState('')
  const [marcaF, setMarcaF] = useState('')
  const [modo, setModo] = useState('pool') // 'pool' | 'catalogo'

  const marcaOf = (r) => (r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca')
  const isDescartada = (r) => medicionInfo(r).estado === 'descartada'

  // KPIs por marca: cuántas están listas para foto sobre el total de la
  // colección (excluyendo descartadas, igual que Colección).
  const kpis = useMemo(() => {
    const orden = [...marcas]
    // Solo agregamos "Sin marca" si hay refs sin marca en el total
    const includeSinMarca = refs.some((r) => !isDescartada(r) && marcaOf(r) === 'Sin marca')
    if (includeSinMarca) orden.push('Sin marca')
    const allMarcas = [...orden, 'Total']
    const k = {}
    allMarcas.forEach((m) => { k[m] = { total: 0, listas: 0, fotografiadas: 0 } })
    refs.forEach((r) => {
      if (isDescartada(r)) return
      const m = marcaOf(r)
      const buckets = [m, 'Total']
      buckets.forEach((t) => {
        if (!k[t]) return
        k[t].total++
        if (r.enFotos) {
          k[t].listas++
          if (r.fotografiada) k[t].fotografiadas++
        }
      })
    })
    return { allMarcas, k }
  }, [refs, marcas])

  // Solo las refs en el pool.
  const enPool = useMemo(() => refs.filter((r) => r.enFotos), [refs])

  // Aplicar filtros (búsqueda + marca) al pool.
  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    return enPool.filter((r) => {
      if (marcaF && marcaOf(r) !== marcaF) return false
      if (term && !`${r.referencia} ${r.tipo || ''} ${r.marca || ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [enPool, q, marcaF])

  const pendientes = useMemo(() => filtradas.filter((r) => !r.fotografiada), [filtradas])
  const hechas = useMemo(() => filtradas.filter((r) => r.fotografiada), [filtradas])

  const total = filtradas.length
  const doneCount = hechas.length
  const pct = total ? Math.round((doneCount / total) * 100) : 0

  function toggleFotografiada(r) {
    const wasDone = !!r.fotografiada
    onSetFields && onSetFields(r.id, {
      fotografiada: !wasDone,
      fotografiadaAt: wasDone ? '' : Date.now(),
    })
  }

  function sacarDelPool(r) {
    onSetFields && onSetFields(r.id, {
      enFotos: false,
      enFotosAt: '',
      fotografiada: false,
      fotografiadaAt: '',
    })
  }

  // Agrupa lista por marca respetando el orden de `marcas` (+ Sin marca al final).
  function groupByMarca(list) {
    const map = new Map()
    list.forEach((r) => {
      const m = marcaOf(r)
      if (!map.has(m)) map.set(m, [])
      map.get(m).push(r)
    })
    return [...marcas, 'Sin marca']
      .map((m) => ({ marca: m, items: (map.get(m) || []).slice().sort(byPriceDesc) }))
      .filter((g) => g.items.length > 0)
  }

  const pendientesByMarca = groupByMarca(pendientes)
  const hechasByMarca = groupByMarca(hechas)

  function renderTile(r, done = false) {
    return (
      <div key={r.id} className={'ftile' + (done ? ' ftile-done' : '')}>
        <button className="ftile-inner" onClick={() => onOpenRef && onOpenRef(r)}
          title={`${r.referencia} · clic para abrir la ficha`}>
          <span className="ftile-img">
            {r.image ? (
              <img src={r.image} alt={r.referencia}
                onClick={(e) => { e.stopPropagation(); onViewImage && onViewImage(r.image) }} />
            ) : (
              <span className="ftile-ph">Sin foto</span>
            )}
          </span>
          <span className="ftile-ref">{r.referencia}</span>
        </button>
        {r.marca && (
          <span className={'ftile-brand m-' + r.marca.toLowerCase().replace(/\s+/g, '')} title={r.marca}>
            {r.marca.charAt(0).toUpperCase()}
          </span>
        )}
        <button className={'ftile-tick' + (done ? ' on' : '')}
          onClick={() => toggleFotografiada(r)}
          title={done ? 'Quitar marca de fotografiada' : 'Marcar como fotografiada'}>
          {done ? '✓' : ''}
        </button>
        <button className="ftile-remove" onClick={() => sacarDelPool(r)}
          title="Sacar del pool de fotos">×</button>
      </div>
    )
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Fotos</h1>
          <p className="view-sub">
            {modo === 'pool'
              ? 'Pool de referencias listas para la sesión de fotos'
              : 'Armador de catálogo por pliegos — orden, referencias y colores para la diseñadora'}
          </p>
        </div>
        <div className="view-actions">
          <div className="opt-group">
            <button type="button" className={'opt-btn' + (modo === 'pool' ? ' on' : '')}
              onClick={() => setModo('pool')}>📸 Pool</button>
            <button type="button" className={'opt-btn' + (modo === 'catalogo' ? ' on' : '')}
              onClick={() => setModo('catalogo')}>📖 Catálogo</button>
          </div>
          {modo === 'pool' && (
            <>
              <div className="opt-group">
                <button type="button" className={'opt-btn' + (!marcaF ? ' on' : '')} onClick={() => setMarcaF('')}>Todas</button>
                {marcas.map((m) => (
                  <button key={m} type="button" className={'opt-btn' + (marcaF === m ? ' on' : '')}
                    onClick={() => setMarcaF(marcaF === m ? '' : m)}>{m}</button>
                ))}
              </div>
              <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia…" />
            </>
          )}
        </div>
      </div>

      {modo === 'catalogo' ? (
        <CatalogoView refs={refs} marcas={marcas} catalogos={catalogos || {}}
          onSave={onSaveCatalogo} onViewImage={onViewImage}
          onSetFields={onSetFields} onOpenRef={onOpenRef} />
      ) : (
      <>
      {/* KPIs por marca — cuántas listas del total de la colección */}
      <div className="fotos-kpis">
        {kpis.allMarcas.map((m) => {
          const x = kpis.k[m]
          const isTotal = m === 'Total'
          const pctListas = x.total ? Math.round((x.listas / x.total) * 100) : 0
          return (
            <div key={m} className={'fotos-kpi' + (isTotal ? ' fotos-kpi-total' : '')}>
              <div className="fotos-kpi-name">{m}</div>
              <div className="fotos-kpi-main">
                <span className="fotos-kpi-num">{x.listas}</span>
                <span className="fotos-kpi-slash">/</span>
                <span className="fotos-kpi-den">{x.total}</span>
              </div>
              <div className="fotos-kpi-sub">
                listas de la colección
              </div>
              <div className="fotos-kpi-bar">
                <span className="fotos-kpi-bar-fill" style={{ width: pctListas + '%' }} />
              </div>
              <div className="fotos-kpi-foot">
                <span className="fotos-kpi-pct">{pctListas}%</span>
                {x.fotografiadas > 0 && (
                  <span className="fotos-kpi-chip">✓ {x.fotografiadas} fotografiadas</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {enPool.length === 0 ? (
        <div className="empty-state">
          <p>Aún no hay referencias en el pool.</p>
          <p className="muted">Marca "📸 Lista para foto" en la ficha de las referencias que ya estén listas.</p>
        </div>
      ) : (
        <>
          <div className="fotos-progress">
            <span className="fotos-progress-lbl">Progreso</span>
            <span className="fotos-progress-bar">
              <span className="fotos-progress-fill" style={{ width: pct + '%' }} />
            </span>
            <span className="fotos-progress-num">
              {doneCount} de {total} · {pct}%
            </span>
          </div>

          <div className="fotos-zone">
            <div className="fotos-zone-head fotos-zone-wait">
              <h3>Por fotografiar</h3>
              <span className="muted">· {pendientes.length} refs</span>
            </div>
            {pendientes.length === 0 ? (
              <div className="fotos-empty-zone">🎉 Todas fotografiadas — ¡buen trabajo!</div>
            ) : (
              <div className="col-marca-groups">
                {pendientesByMarca.map((g) => (
                  <div key={g.marca} className="col-marca-group">
                    <div className="col-marca-group-head">
                      <span className={'col-marca-tag m-' + g.marca.toLowerCase().replace(/\s+/g, '')}>{g.marca}</span>
                      <span className="col-marca-group-count">{g.items.length}</span>
                    </div>
                    <div className="fotos-tiles">
                      {g.items.map((r) => renderTile(r, false))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hechas.length > 0 && (
            <div className="fotos-zone">
              <div className="fotos-zone-head fotos-zone-done">
                <h3>Ya fotografiadas</h3>
                <span className="muted">· {hechas.length} refs</span>
              </div>
              <div className="col-marca-groups">
                {hechasByMarca.map((g) => (
                  <div key={g.marca} className="col-marca-group">
                    <div className="col-marca-group-head">
                      <span className={'col-marca-tag m-' + g.marca.toLowerCase().replace(/\s+/g, '')}>{g.marca}</span>
                      <span className="col-marca-group-count">{g.items.length}</span>
                    </div>
                    <div className="fotos-tiles">
                      {g.items.map((r) => renderTile(r, true))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  )
}

// Refs con precio más alto arriba; sin costo al final; empate por referencia.
function byPriceDesc(a, b) {
  const ca = Number(a.costo) || 0
  const cb = Number(b.costo) || 0
  if (cb !== ca) return cb - ca
  return (a.referencia || '').localeCompare(b.referencia || '')
}
