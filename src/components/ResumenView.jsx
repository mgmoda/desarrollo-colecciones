import { useEffect, useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { RESUMEN_FLAGS, ORIGEN_ABBR, AREAS, TOP_LABEL, formatPrice, procesoColor } from '../lib/constants.js'
import { areaIndex, medicionInfo, MEDICION_RANK, refTelas, telaDisponible, refProcesos } from '../lib/domain.js'
import { generateResumenPDF } from '../lib/resumenPdf.js'

function telasTexto(r) {
  return refTelas(r).map((t) => t.nombre).filter(Boolean).join(' / ')
}
function telaTip(r) {
  const disp = refTelas(r).filter((t) => t.disponible)
  if (!disp.length) return 'Tela lista'
  return 'Tela lista · ' + disp.map((t) => `${t.nombre || 'tela'}${t.metros ? ' ' + t.metros + ' m' : ''}${t.nota ? ' (' + t.nota + ')' : ''}`).join(' · ')
}

const MED_LABEL = { pendiente: 'Pendiente', repeticion: 'Repetición', aprobada: 'Aprobada', descartada: 'Descartada' }
const MED_CLS = { pendiente: 'flag-none', repeticion: 'flag-no', aprobada: 'flag-yes', descartada: 'flag-desc' }

// Muestras / Producción: combina tu decisión (flag manual) con lo que
// confirman los archivos importados.
//  programada = el import de ese tipo ya trae la referencia (ya se ejecutó)
//  autorizada = la marcaste en Sí (comité), pero aún no aparece en el import
//  no = descartada · none = sin decidir
const MP_RANK = { none: 0, no: 1, autorizada: 2, programada: 3 }
const MP_LABEL = { none: '—', no: 'No', autorizada: 'Autorizada', programada: 'Programada' }
const MP_CLS = { none: 'flag-none', no: 'flag-no', autorizada: 'flag-warn', programada: 'flag-yes' }

function estadoMP(tracks, flags, origen, flagKey) {
  const imported = (tracks || []).some((t) => t.origen === origen)
  if (imported) return 'programada'
  const flag = (flags || {})[flagKey]
  if (flag && flag.si) return 'autorizada'
  if (flag === 'no') return 'no'
  return 'none'
}

function EstadoMP({ state }) {
  const tip = state === 'programada' ? 'Programada (confirmada por el archivo importado)'
    : state === 'autorizada' ? 'Autorizada en comité · falta programar'
    : state === 'no' ? 'Descartada' : 'Sin decidir'
  return <span className={'flag ' + MP_CLS[state]} title={tip}>{MP_LABEL[state]}</span>
}

const UMBRAL_EXTRA_ROJO = 7

// Celda de Producción con soporte para "Producción extra".
// - state 'none' + sin extra → muestra botón "+ Extra"
// - state 'none' + con extra → muestra chip "Extra" + días esperando
// - state 'programada'/'autorizada'/'no' → muestra ese estado
//   y si hay extra, un chip pequeño "Extra" al lado como identificador
function ProduccionCell({ item, state, onToggleExtra }) {
  const isExtra = !!item.produccionExtra
  const dias = isExtra && item.produccionExtraFecha
    ? Math.floor((Date.now() - Number(item.produccionExtraFecha)) / 86400000)
    : null

  function toggle(e) { e.stopPropagation(); onToggleExtra && onToggleExtra(item) }

  // Programada / autorizada / no → estado normal + chip Extra pequeño si aplica
  if (state !== 'none') {
    return (
      <span className="prod-cell">
        <EstadoMP state={state} />
        {isExtra && (
          <span className="flag-extra flag-extra-sm" title="Autorizada como producción extra" onClick={toggle}>
            Extra
          </span>
        )}
      </span>
    )
  }
  // Sin decidir + con marca extra → chip Extra + días esperando
  if (isExtra) {
    return (
      <span className="prod-cell">
        <span className="flag-extra" onClick={toggle}
          title="Autorizada como producción extra · clic para quitar">
          Extra
        </span>
        {dias != null && (
          <span className={'flag flag-small ' + (dias >= UMBRAL_EXTRA_ROJO ? 'flag-no' : 'flag-warn')}
            title={`Esperando programación hace ${dias} día(s)`}>
            {dias}d
          </span>
        )}
      </span>
    )
  }
  // Sin decidir y sin marca → botón para autorizar en 1 clic
  return (
    <button className="btn-extra-add" onClick={toggle}
      title="Autorizar como producción extra (un solo clic)">
      + Extra
    </button>
  )
}

// Celda derivada del proceso de medición (estado + fecha + días en tooltip).
function MedicionChip({ refRow }) {
  const m = medicionInfo(refRow)
  const fecha = m.estado === 'aprobada' ? m.aprobacion : m.ultima
  const tip = m.estado === 'pendiente'
    ? 'Sin medir'
    : `${MED_LABEL[m.estado]}${fecha ? ' · ' + fecha : ''}${m.dias != null ? ' · ' + m.dias + ' días' : ''}`
  return (
    <span className={'flag ' + MED_CLS[m.estado]} title={tip}>
      {MED_LABEL[m.estado]}{m.estado === 'aprobada' && m.dias != null ? ` · ${m.dias}d` : ''}
    </span>
  )
}

function EtapaCell({ tracks, onOpen }) {
  if (!tracks || tracks.length === 0) return <span className="muted">—</span>
  return (
    <span className="etapa-cell" onClick={(e) => { e.stopPropagation(); onOpen() }} title="Ver etapa">
      {tracks.map((t) => (
        <span key={t.origen} className={'flag flag-area area-' + (t.area || 'none')}>
          <b>{ORIGEN_ABBR[t.origen]}</b> {t.area ? AREAS[t.area].label : 'Sin iniciar'}
        </span>
      ))}
    </span>
  )
}

// Chips de los procesos especiales de la referencia. Al hacer clic en uno,
// filtra la tabla por ese proceso.
function ProcesosCell({ refRow, onFiltrar }) {
  const lista = refProcesos(refRow)
  if (!lista.length) return <span className="muted">—</span>
  return (
    <span className="proc-cell">
      {lista.map((p) => {
        const c = procesoColor(p)
        return (
          <span key={p} className="proc-tag" title={`Filtrar por ${p}`}
            style={{ background: c.bg, color: c.fg, borderColor: c.bd }}
            onClick={(e) => { e.stopPropagation(); onFiltrar(p) }}>
            {p}
          </span>
        )
      })}
    </span>
  )
}

function flagRank(v) { return v && v.si ? 2 : v === 'no' ? 1 : 0 }

// Indicador compacto: Sí / No / — (la fecha se muestra en el tooltip).
function FlagChip({ value }) {
  if (value && value.si) return <span className="flag flag-yes" title={value.fecha || 'Sí'}>Sí</span>
  if (value === 'no') return <span className="flag flag-no">No</span>
  return <span className="flag flag-none">—</span>
}

export default function ResumenView({ refs, marcas = [], procesosCatalogo = [], tracksByRef, pendientesSignal, onEdit, onNew, onViewImage, onOpenDetail, onToggleExtra }) {
  const [q, setQ] = useState('')
  const [marcaF, setMarcaF] = useState('')
  const [procesoF, setProcesoF] = useState('')
  const [soloAprobadas, setSoloAprobadas] = useState(false)
  const [soloRepetidas, setSoloRepetidas] = useState(false)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [soloConjuntos, setSoloConjuntos] = useState(false)
  const [ocultarDescartadas, setOcultarDescartadas] = useState(false)
  const [soloAprobadasLimpias, setSoloAprobadasLimpias] = useState(false)
  const [soloCostosPorRevisar, setSoloCostosPorRevisar] = useState(false)
  const [soloCostosRevisados, setSoloCostosRevisados] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const { sortKey, sortDir, toggle } = useSort('referencia', 'asc')

  function toggleSel(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function etapaTexto(r) {
    const tracks = tracksByRef && tracksByRef.get(r.id)
    if (!tracks || !tracks.length) return ''
    return tracks.map((t) => `${ORIGEN_ABBR[t.origen]}: ${t.area ? AREAS[t.area].label : 'Sin iniciar'}`).join(' · ')
  }

  // Cuando llega la señal desde Inicio, activa el filtro de pendientes.
  useEffect(() => {
    if (pendientesSignal) setSoloPendientes(true)
  }, [pendientesSignal])

  // Veces que la referencia aparece en las órdenes importadas (para duplicados).
  function veces(r) {
    const tracks = tracksByRef && tracksByRef.get(r.id)
    if (!tracks || !tracks.length) return 0
    return tracks.reduce((s, t) => s + t.orders.length, 0)
  }

  // Para ordenar por etapa: menor índice de área entre sus pistas (lo más atrasado).
  function etapaRank(r) {
    const tracks = tracksByRef && tracksByRef.get(r.id)
    if (!tracks || !tracks.length) return 99
    return Math.min(...tracks.map((t) => { const i = areaIndex(t.area); return i < 0 ? 0 : i }))
  }

  const rows = useMemo(() => {
    let list = refs
    if (marcaF) list = list.filter((r) => r.marca === marcaF)
    if (procesoF) list = list.filter((r) => refProcesos(r).some((p) => p.toLowerCase() === procesoF.toLowerCase()))
    if (soloAprobadas) list = list.filter((r) => medicionInfo(r).estado === 'aprobada')
    if (soloRepetidas) list = list.filter((r) => veces(r) > 1)
    if (soloPendientes) list = list.filter((r) => r.pendiente)
    if (soloConjuntos) list = list.filter((r) => r.conjunto && r.conjuntoRef)
    if (ocultarDescartadas) list = list.filter((r) => medicionInfo(r).estado !== 'descartada')
    if (soloAprobadasLimpias) list = list.filter((r) => { const m = medicionInfo(r); return m.estado === 'aprobada' && m.repeticiones === 0 })
    if (soloCostosPorRevisar) list = list.filter((r) => Number(r.costo) > 0 && !r.costoRevisado)
    if (soloCostosRevisados) list = list.filter((r) => Number(r.costo) > 0 && r.costoRevisado)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((r) =>
        [r.referencia, r.nuevaRef, r.tipo, telasTexto(r), r.comentario]
          .some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      foto: (r) => (r.image ? 1 : 0),
      referencia: (r) => r.referencia,
      refInterna: (r) => r.refInterna || '',
      procesos: (r) => refProcesos(r).length,
      veces: (r) => veces(r),
      tipo: (r) => r.tipo,
      tela: (r) => telasTexto(r),
      topForro: (r) => r.topIncluido || '',
      etapa: (r) => etapaRank(r),
      costos_auto: (r) => (Number(r.costo) > 0 ? 1 : 0),
      muestras_mp: (r) => MP_RANK[estadoMP(tracksByRef && tracksByRef.get(r.id), r.flags, 'muestra', 'muestras')],
      produccion_mp: (r) => MP_RANK[estadoMP(tracksByRef && tracksByRef.get(r.id), r.flags, 'produccion', 'produccion')],
      medicion: (r) => MEDICION_RANK[medicionInfo(r).estado],
      repeticion: (r) => { const m = medicionInfo(r); return m.diasRepeticion != null ? m.diasRepeticion : (m.repeticiones > 0 ? 0 : -1) },
      cantidad: (r) => Number(r.cantidad),
      costo: (r) => Number(r.costo),
    }
    RESUMEN_FLAGS.forEach((f) => { accessors['flag_' + f.key] = (r) => flagRank((r.flags || {})[f.key]) })
    return sortRows(list, accessors[sortKey], sortDir)
  }, [refs, q, marcaF, procesoF, soloAprobadas, soloRepetidas, soloPendientes, soloConjuntos, ocultarDescartadas, soloAprobadasLimpias, soloCostosPorRevisar, soloCostosRevisados, sortKey, sortDir, tracksByRef])

  const repetidasCount = useMemo(
    () => refs.filter((r) => veces(r) > 1).length,
    [refs, tracksByRef],
  )
  // Procesos presentes en las referencias de la marca activa, con su conteo.
  const procesosConteo = useMemo(() => {
    const base = marcaF ? refs.filter((r) => r.marca === marcaF) : refs
    const mapa = new Map()
    base.forEach((r) => refProcesos(r).forEach((p) => mapa.set(p, (mapa.get(p) || 0) + 1)))
    procesosCatalogo.forEach((p) => { if (!mapa.has(p)) mapa.set(p, 0) })
    return [...mapa.entries()]
      .map(([nombre, n]) => ({ nombre, n }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
  }, [refs, marcaF, procesosCatalogo])

  const pendientesCount = useMemo(() => refs.filter((r) => r.pendiente).length, [refs])
  const conjuntosCount = useMemo(() => refs.filter((r) => r.conjunto && r.conjuntoRef).length, [refs])
  const costosRevisadosCount = useMemo(() => refs.filter((r) => Number(r.costo) > 0 && r.costoRevisado).length, [refs])
  const costosPorRevisarCount = useMemo(() => refs.filter((r) => Number(r.costo) > 0 && !r.costoRevisado).length, [refs])

  const thProps = { sortKey, sortDir, onSort: toggle }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }
  function generatePdf() {
    const chosen = rows.filter((r) => selected.has(r.id))
    if (!chosen.length) return
    const items = chosen.map((r) => ({
      referencia: r.referencia,
      tipo: r.tipo,
      tela: refTelas(r).map((t) => t.nombre).filter(Boolean).join(' / '),
      costo: formatPrice(r.costo),
      etapa: etapaTexto(r),
      medicion: MED_LABEL[medicionInfo(r).estado],
      comentario: r.comentario,
      image: r.image || null,
    }))
    generateResumenPDF(items, 'Referencias seleccionadas')
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Resumen de producción</h1>
          <p className="view-sub">
            {rows.length} referencias{repetidasCount > 0 ? ` · ${repetidasCount} repetidas` : ''}
            {pendientesCount > 0 ? ` · ${pendientesCount} con pendiente` : ''}
            {(costosRevisadosCount + costosPorRevisarCount) > 0 && (
              <>
                {' '}·{' '}
                <span title="Costos revisados / por revisar" style={{ color: '#1f7a44' }}>
                  {costosRevisadosCount} ✓
                </span>
                {' / '}
                <span style={{ color: '#b23121' }}>{costosPorRevisarCount} por revisar</span>
              </>
            )}
          </p>
        </div>
        <div className="view-actions">
          {marcas.length > 0 && (
            <div className="opt-group">
              <button type="button" className={'opt-btn' + (!marcaF ? ' on' : '')} onClick={() => setMarcaF('')}>Todas</button>
              {marcas.map((m) => (
                <button key={m} type="button" className={'opt-btn' + (marcaF === m ? ' on' : '')}
                  onClick={() => setMarcaF(marcaF === m ? '' : m)}>{m}</button>
              ))}
            </div>
          )}
          <label className="check check-ok">
            <input type="checkbox" checked={soloAprobadas}
              onChange={(e) => setSoloAprobadas(e.target.checked)} /> Solo aprobadas
          </label>
          {procesosConteo.length > 0 && (
            <div className="proc-filtro">
              <button type="button" className={'proc-f-btn' + (!procesoF ? ' on' : '')}
                onClick={() => setProcesoF('')}>Todos los procesos</button>
              {procesosConteo.map(({ nombre, n }) => {
                const c = procesoColor(nombre)
                const on = procesoF.toLowerCase() === nombre.toLowerCase()
                return (
                  <button key={nombre} type="button"
                    className={'proc-f-btn' + (on ? ' on' : '')}
                    style={on ? { background: c.bg, color: c.fg, borderColor: c.bd } : undefined}
                    onClick={() => setProcesoF(on ? '' : nombre)}>
                    {nombre} <b>{n}</b>
                  </button>
                )
              })}
            </div>
          )}
          {pendientesCount > 0 && (
            <label className="check check-alert">
              <input type="checkbox" checked={soloPendientes}
                onChange={(e) => setSoloPendientes(e.target.checked)} /> Solo pendientes
            </label>
          )}
          {conjuntosCount > 0 && (
            <label className="check">
              <input type="checkbox" checked={soloConjuntos}
                onChange={(e) => setSoloConjuntos(e.target.checked)} /> Solo conjuntos
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={soloRepetidas}
              onChange={(e) => setSoloRepetidas(e.target.checked)} /> Solo repetidas
          </label>
          <label className="check">
            <input type="checkbox" checked={ocultarDescartadas}
              onChange={(e) => setOcultarDescartadas(e.target.checked)} /> Ocultar descartadas
          </label>
          <label className="check check-ok">
            <input type="checkbox" checked={soloAprobadasLimpias}
              onChange={(e) => setSoloAprobadasLimpias(e.target.checked)} /> Aprobadas sin repetición
          </label>
          <label className="check check-alert">
            <input type="checkbox" checked={soloCostosPorRevisar}
              onChange={(e) => {
                setSoloCostosPorRevisar(e.target.checked)
                if (e.target.checked) setSoloCostosRevisados(false)
              }} /> Costos por revisar ({costosPorRevisarCount})
          </label>
          <label className="check check-ok">
            <input type="checkbox" checked={soloCostosRevisados}
              onChange={(e) => {
                setSoloCostosRevisados(e.target.checked)
                if (e.target.checked) setSoloCostosPorRevisar(false)
              }} /> Costos revisados ({costosRevisadosCount})
          </label>
          {selected.size > 0 && (
            <button className="btn btn-primary" onClick={generatePdf}>Generar PDF ({selected.size})</button>
          )}
          <SearchInput value={q} onChange={setQ} placeholder="Buscar referencia, tela…" />
          <button className="btn btn-primary" onClick={onNew}>+ Referencia</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>Aún no hay referencias.</p>
          <p className="muted">Importa los archivos del sistema o agrega una referencia manual.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-compact">
            <thead>
              <tr>
                <th className="cell-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Seleccionar todo" />
                </th>
                <SortTh label="Foto" col="foto" {...thProps} />
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Cód. interno" col="refInterna" {...thProps} />
                <SortTh label="Veces" col="veces" className="num" {...thProps} />
                <SortTh label="Etapa actual" col="etapa" {...thProps} />
                <SortTh label="Tipo" col="tipo" {...thProps} />
                <SortTh label="Procesos" col="procesos" {...thProps} />
                <SortTh label="Tela" col="tela" {...thProps} />
                <SortTh label="Top/Forro" col="topForro" {...thProps} />
                <SortTh label="Costos" col="costos_auto" {...thProps} className="th-flag" />
                <SortTh label="Muestras" col="muestras_mp" {...thProps} className="th-flag" />
                <SortTh label="Producción" col="produccion_mp" {...thProps} className="th-flag" />
                <SortTh label="Medición" col="medicion" {...thProps} className="th-flag" />
                <SortTh label="Repetición" col="repeticion" {...thProps} className="th-flag" />
                <SortTh label="Entrega" col="flag_entrega" {...thProps} className="th-flag" />
                <SortTh label="Cant" col="cantidad" className="num" {...thProps} />
                <SortTh label="Costo" col="costo" className="num" {...thProps} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}
                  className={'row-click' + (selected.has(r.id) ? ' row-sel' : '') + (medicionInfo(r).estado === 'aprobada' ? ' row-aprobada' : medicionInfo(r).estado === 'descartada' ? ' row-descartada' : '')}
                  onClick={() => onEdit(r)}>
                  <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                  </td>
                  <td className="cell-photo">
                    {r.image ? (
                      <img src={r.image} alt={r.referencia} className="thumb" title="Ampliar foto"
                        onClick={(e) => { e.stopPropagation(); onViewImage(r.image) }} />
                    ) : (
                      <span className="thumb empty">—</span>
                    )}
                  </td>
                  <td className="strong">
                    {r.pendiente && (
                      <span className="pend-dot" title={r.pendienteNota || 'Pendiente por resolver'}>⚠</span>
                    )}
                    {r.referencia}
                    {r.conjunto && r.conjuntoRef && (
                      <span className="conj-chip" title={`En conjunto con ${r.conjuntoRef}`}>⇄ Conjunto · {r.conjuntoRefFinal || r.conjuntoRef}</span>
                    )}
                  </td>
                  <td className="nueva-ref">
                    {r.refInterna ? r.refInterna : <span className="muted">—</span>}
                  </td>
                  <td className="num">
                    {(() => {
                      const n = veces(r)
                      return (
                        <span
                          className={'veces-cell' + (n > 1 ? ' tag tag-warn' : ' muted')}
                          onClick={(e) => { e.stopPropagation(); onOpenDetail(r.id) }}
                          title="Ver detalle de etapas"
                        >
                          {n > 1 ? `${n}×` : (n || '—')}
                        </span>
                      )
                    })()}
                  </td>
                  <td>
                    <EtapaCell
                      tracks={tracksByRef && tracksByRef.get(r.id)}
                      onOpen={() => onOpenDetail(r.id)}
                    />
                  </td>
                  <td>{r.tipo}</td>
                  <td><ProcesosCell refRow={r} onFiltrar={setProcesoF} /></td>
                  <td>
                    {telasTexto(r)}
                    {telaDisponible(r) && (
                      <span className="tela-chip" title={telaTip(r)}>✓ Tela</span>
                    )}
                  </td>
                  <td>
                    {r.topIncluido === 'top' && <span className="top-chip top">Top</span>}
                    {r.topIncluido === 'forrada' && <span className="top-chip forrada">Forrada</span>}
                  </td>
                  <td className="td-flag">
                    {Number(r.costo) > 0
                      ? <span className="flag flag-yes" title={formatPrice(r.costo)}>Sí</span>
                      : <span className="flag flag-no">No</span>}
                  </td>
                  <td className="td-flag"><EstadoMP state={estadoMP(tracksByRef && tracksByRef.get(r.id), r.flags, 'muestra', 'muestras')} /></td>
                  <td className="td-flag" onClick={(e) => e.stopPropagation()}>
                    <ProduccionCell
                      item={r}
                      state={estadoMP(tracksByRef && tracksByRef.get(r.id), r.flags, 'produccion', 'produccion')}
                      onToggleExtra={onToggleExtra} />
                  </td>
                  <td className="td-flag"><MedicionChip refRow={r} /></td>
                  <td className="td-flag">
                    {(() => {
                      const m = medicionInfo(r)
                      if (m.repeticiones <= 0) return <span className="flag flag-none">—</span>
                      const dr = m.diasRepeticion
                      return (
                        <span className={'flag ' + (dr != null ? 'flag-no' : 'flag-none')}
                          title={dr != null ? `${dr} días en repetición` : `${m.repeticiones} repetición(es), ya aprobada`}>
                          {m.repeticiones}×{dr != null ? ` · ${dr}d` : ''}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="td-flag"><FlagChip value={(r.flags || {}).entrega} /></td>
                  <td className="num">{r.cantidad}</td>
                  <td className="num">
                    {Number(r.costo) > 0 && (
                      <>
                        <span className={r.costoRevisado ? 'costo-final' : 'costo-tentativo'}>
                          {formatPrice(r.costo)}
                        </span>
                        {r.costoRevisado
                          ? <span className="costo-check" title="Costo revisado (final)">✓</span>
                          : <span className="costo-tent-tag" title="Costo tentativo (no revisado)">·</span>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
