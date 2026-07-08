import { useMemo, useState } from 'react'
import SearchInput from './SearchInput.jsx'
import { formatDate, ORIGEN_ABBR, AREAS } from '../lib/constants.js'
import { diasDesde } from '../lib/dates.js'
import { generateAutorizacionesPDF } from '../lib/autorizacionesPdf.js'

const UMBRAL_ROJO = 7

function estadoMP(tracks, flags, origen, flagKey) {
  const imported = (tracks || []).some((t) => t.origen === origen)
  if (imported) return 'programada'
  const flag = (flags || {})[flagKey]
  if (flag && flag.si) return 'autorizada'
  if (flag === 'no') return 'no'
  return 'none'
}

function etapaTexto(tracks) {
  if (!tracks || !tracks.length) return ''
  return tracks.map((t) => `${ORIGEN_ABBR[t.origen]}: ${t.area ? AREAS[t.area].label : 'Sin iniciar'}`).join(' · ')
}

// Clave única para selección (un mismo ref puede aparecer en ambas tablas).
const selKey = (tipo, refId) => `${tipo}:${refId}`

// Vista de control: autorizaciones que YO marqué en la ficha pero que aún
// NO aparecen en el archivo importado (no se han programado).
export default function AutorizacionesView({ refs, tracksByRef, marcas, onOpenRef, onViewImage }) {
  const [q, setQ] = useState('')
  const [marcaF, setMarcaF] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [busyPdf, setBusyPdf] = useState(false)

  const { muestrasList, produccionList, extrasList } = useMemo(() => {
    const muestras = []
    const produccion = []
    const extras = []
    refs.forEach((r) => {
      const tracks = tracksByRef && tracksByRef.get(r.id)
      const eM = estadoMP(tracks, r.flags, 'muestra', 'muestras')
      const eP = estadoMP(tracks, r.flags, 'produccion', 'produccion')
      if (eM === 'autorizada') {
        const fecha = (r.flags && r.flags.muestras && r.flags.muestras.fecha) || ''
        muestras.push({ ref: r, tracks, fecha, dias: diasDesde(fecha) })
      }
      if (eP === 'autorizada') {
        const fecha = (r.flags && r.flags.produccion && r.flags.produccion.fecha) || ''
        produccion.push({ ref: r, tracks, fecha, dias: diasDesde(fecha) })
      }
      // Producción extra pendiente: flag marcado + aún no importada la producción.
      if (r.produccionExtra && eP !== 'programada') {
        const ts = Number(r.produccionExtraFecha) || 0
        const fecha = ts ? new Date(ts).toISOString().slice(0, 10) : ''
        const dias = ts ? Math.floor((Date.now() - ts) / 86400000) : null
        extras.push({ ref: r, tracks, fecha, dias })
      }
    })
    const sortByDias = (a, b) => (b.dias != null ? b.dias : -1) - (a.dias != null ? a.dias : -1)
    muestras.sort(sortByDias)
    produccion.sort(sortByDias)
    extras.sort(sortByDias)
    return { muestrasList: muestras, produccionList: produccion, extrasList: extras }
  }, [refs, tracksByRef])

  function aplicarFiltro(list) {
    const term = q.trim().toLowerCase()
    return list.filter(({ ref }) => {
      if (marcaF && ref.marca !== marcaF) return false
      if (term && !`${ref.referencia} ${ref.tipo || ''} ${ref.comentario || ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }
  const muestrasFiltradas = aplicarFiltro(muestrasList)
  const produccionFiltradas = aplicarFiltro(produccionList)
  const extrasFiltradas = aplicarFiltro(extrasList)

  const maxDiasMuestras = muestrasList.reduce((m, x) => Math.max(m, x.dias || 0), 0)
  const maxDiasProduccion = produccionList.reduce((m, x) => Math.max(m, x.dias || 0), 0)
  const maxDiasExtras = extrasList.reduce((m, x) => Math.max(m, x.dias || 0), 0)

  // --- Selección ---
  function toggleSel(tipo, refId) {
    setSelected((s) => {
      const n = new Set(s); const k = selKey(tipo, refId)
      n.has(k) ? n.delete(k) : n.add(k); return n
    })
  }
  function toggleAll(tipo, lista) {
    const allOn = lista.length > 0 && lista.every((x) => selected.has(selKey(tipo, x.ref.id)))
    setSelected((s) => {
      const n = new Set(s)
      if (allOn) lista.forEach((x) => n.delete(selKey(tipo, x.ref.id)))
      else lista.forEach((x) => n.add(selKey(tipo, x.ref.id)))
      return n
    })
  }
  function isSel(tipo, refId) { return selected.has(selKey(tipo, refId)) }

  // Items seleccionados (incluyendo los tres tipos), filtrados por la vista actual.
  const itemsSel = useMemo(() => {
    const out = []
    muestrasFiltradas.forEach((x) => { if (isSel('muestras', x.ref.id)) out.push({ tipo: 'muestras', ...x }) })
    produccionFiltradas.forEach((x) => { if (isSel('produccion', x.ref.id)) out.push({ tipo: 'produccion', ...x }) })
    extrasFiltradas.forEach((x) => { if (isSel('extra', x.ref.id)) out.push({ tipo: 'extra', ...x }) })
    return out
  }, [muestrasFiltradas, produccionFiltradas, extrasFiltradas, selected])

  async function generarPdf() {
    if (itemsSel.length === 0) return
    setBusyPdf(true)
    try {
      const payload = itemsSel.map((it) => ({
        referencia: it.ref.referencia,
        marca: it.ref.marca || '',
        tipo: it.tipo,
        fecha: it.fecha,
        dias: it.dias,
        image: it.ref.image || '',
      }))
      await generateAutorizacionesPDF(payload)
    } finally {
      setBusyPdf(false)
    }
  }

  function renderTabla(titulo, lista, color, tipo) {
    const allOn = lista.length > 0 && lista.every((x) => isSel(tipo, x.ref.id))
    if (lista.length === 0) {
      return (
        <div className="aut-block">
          <h3 className={'aut-block-title ' + color}>{titulo}</h3>
          <div className="empty-state"><p>No hay autorizaciones pendientes en este filtro.</p></div>
        </div>
      )
    }
    return (
      <div className="aut-block">
        <h3 className={'aut-block-title ' + color}>{titulo} <span className="muted">({lista.length})</span></h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-check">
                  <input type="checkbox" checked={allOn} onChange={() => toggleAll(tipo, lista)} title="Seleccionar todo lo visible" />
                </th>
                <th>Foto</th>
                <th>Referencia</th>
                <th>Marca</th>
                <th>Autorizada</th>
                <th>Esperando</th>
                <th>Etapa actual</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(({ ref, tracks, fecha, dias }) => {
                const sel = isSel(tipo, ref.id)
                return (
                  <tr key={ref.id}
                    className={'row-click' + (sel ? ' row-sel' : '')}
                    onClick={() => onOpenRef && onOpenRef(ref)}>
                    <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSel(tipo, ref.id)} />
                    </td>
                    <td className="cell-photo">
                      {ref.image ? (
                        <img src={ref.image} alt={ref.referencia} className="thumb" title="Ampliar foto"
                          onClick={(e) => { e.stopPropagation(); onViewImage(ref.image) }} />
                      ) : <span className="thumb empty">—</span>}
                    </td>
                    <td className="strong">{ref.referencia}</td>
                    <td>{ref.marca || '—'}</td>
                    <td>{formatDate(fecha) || '—'}</td>
                    <td className="num">
                      {dias == null ? '—' : (
                        <span className={'tag' + (dias >= UMBRAL_ROJO ? ' tag-warn' : '')}>{dias} d</span>
                      )}
                    </td>
                    <td className="muted">{etapaTexto(tracks)}</td>
                    <td className="muted">{ref.comentario || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Autorizaciones</h1>
          <p className="view-sub">Pendientes de programar en el sistema (Excel)</p>
        </div>
        <div className="view-actions">
          <div className="opt-group">
            <button type="button" className={'opt-btn' + (!marcaF ? ' on' : '')} onClick={() => setMarcaF('')}>Todas</button>
            {marcas.map((m) => (
              <button key={m} type="button" className={'opt-btn' + (marcaF === m ? ' on' : '')} onClick={() => setMarcaF(m)}>{m}</button>
            ))}
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia…" />
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-marcas aut-kpis">
        <div className={'kpi-marca aut-kpi mu'}>
          <div className="kpi-marca-name">Muestras pendientes</div>
          <div className="kpi-marca-main">
            <span className="kpi-marca-num">{muestrasList.length}</span>
            <span className="kpi-marca-num-sub">referencias</span>
          </div>
          <div className="kpi-marca-chips">
            <span className={'kpi-chip' + (maxDiasMuestras >= UMBRAL_ROJO ? ' rep' : ' warn')}>
              {maxDiasMuestras > 0 ? `La más antigua hace ${maxDiasMuestras} días` : 'Sin demoras'}
            </span>
          </div>
        </div>
        <div className={'kpi-marca aut-kpi pr'}>
          <div className="kpi-marca-name">Producción pendiente</div>
          <div className="kpi-marca-main">
            <span className="kpi-marca-num">{produccionList.length}</span>
            <span className="kpi-marca-num-sub">referencias</span>
          </div>
          <div className="kpi-marca-chips">
            <span className={'kpi-chip' + (maxDiasProduccion >= UMBRAL_ROJO ? ' rep' : ' warn')}>
              {maxDiasProduccion > 0 ? `La más antigua hace ${maxDiasProduccion} días` : 'Sin demoras'}
            </span>
          </div>
        </div>
        <div className={'kpi-marca aut-kpi ex'}>
          <div className="kpi-marca-name">Producción extra pendiente</div>
          <div className="kpi-marca-main">
            <span className="kpi-marca-num">{extrasList.length}</span>
            <span className="kpi-marca-num-sub">referencias</span>
          </div>
          <div className="kpi-marca-chips">
            <span className={'kpi-chip' + (maxDiasExtras >= UMBRAL_ROJO ? ' rep' : ' warn')}>
              {maxDiasExtras > 0 ? `La más antigua hace ${maxDiasExtras} días` : 'Sin demoras'}
            </span>
          </div>
        </div>
      </div>

      {/* Barra de acción: seleccionados + PDF */}
      <div className="aut-actionbar">
        <div>
          <strong>{itemsSel.length}</strong> seleccionadas
          {itemsSel.length > 0 && (
            <span className="muted">
              {' '}· {itemsSel.filter((x) => x.tipo === 'muestras').length} muestras · {itemsSel.filter((x) => x.tipo === 'produccion').length} producción · {itemsSel.filter((x) => x.tipo === 'extra').length} extra
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {itemsSel.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Limpiar</button>
          )}
          <button className="btn btn-primary" disabled={itemsSel.length === 0 || busyPdf}
            onClick={generarPdf}>
            {busyPdf ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>

      {renderTabla('Autorizadas para Muestras', muestrasFiltradas, 'mu', 'muestras')}
      {renderTabla('Autorizadas para Producción', produccionFiltradas, 'pr', 'produccion')}
      {renderTabla('Autorizadas para Producción extra', extrasFiltradas, 'ex', 'extra')}
    </div>
  )
}
