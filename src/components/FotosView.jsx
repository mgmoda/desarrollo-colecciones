import { useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'

// Pool único de referencias listas para la sesión de fotos.
// Dos zonas apiladas: "Por fotografiar" arriba y "Ya fotografiadas" abajo.
// Sub-bloques por marca dentro de cada zona (como Colección).
export default function FotosView({ refs, marcas, onOpenRef, onViewImage, onSetFields }) {
  const [q, setQ] = useState('')
  const [marcaF, setMarcaF] = useState('')

  const marcaOf = (r) => (r.marca && marcas.includes(r.marca) ? r.marca : 'Sin marca')

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
          <p className="view-sub">Pool de referencias listas para la sesión de fotos</p>
        </div>
        <div className="view-actions">
          <div className="opt-group">
            <button type="button" className={'opt-btn' + (!marcaF ? ' on' : '')} onClick={() => setMarcaF('')}>Todas</button>
            {marcas.map((m) => (
              <button key={m} type="button" className={'opt-btn' + (marcaF === m ? ' on' : '')}
                onClick={() => setMarcaF(marcaF === m ? '' : m)}>{m}</button>
            ))}
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia…" />
        </div>
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
