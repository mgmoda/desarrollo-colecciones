import { useEffect, useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { RESUMEN_FLAGS, ORIGEN_ABBR, AREAS, formatPrice } from '../lib/constants.js'
import { areaIndex, medicionInfo, MEDICION_RANK, refTelas, telaDisponible } from '../lib/domain.js'

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

// Celda derivada del proceso de medición (estado + fecha + días en tooltip).
function MedicionChip({ ref }) {
  const m = medicionInfo(ref)
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

function flagRank(v) { return v && v.si ? 2 : v === 'no' ? 1 : 0 }

// Indicador compacto: Sí / No / — (la fecha se muestra en el tooltip).
function FlagChip({ value }) {
  if (value && value.si) return <span className="flag flag-yes" title={value.fecha || 'Sí'}>Sí</span>
  if (value === 'no') return <span className="flag flag-no">No</span>
  return <span className="flag flag-none">—</span>
}

export default function ResumenView({ refs, tracksByRef, pendientesSignal, onEdit, onNew, onViewImage, onOpenDetail }) {
  const [q, setQ] = useState('')
  const [soloRepetidas, setSoloRepetidas] = useState(false)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [soloConjuntos, setSoloConjuntos] = useState(false)
  const { sortKey, sortDir, toggle } = useSort('referencia', 'asc')

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
    if (soloRepetidas) list = list.filter((r) => veces(r) > 1)
    if (soloPendientes) list = list.filter((r) => r.pendiente)
    if (soloConjuntos) list = list.filter((r) => r.conjunto && r.conjuntoRef)
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((r) =>
        [r.referencia, r.tipo, telasTexto(r), r.comentario]
          .some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      referencia: (r) => r.referencia,
      veces: (r) => veces(r),
      tipo: (r) => r.tipo,
      tela: (r) => telasTexto(r),
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
  }, [refs, q, soloRepetidas, soloPendientes, soloConjuntos, sortKey, sortDir, tracksByRef])

  const repetidasCount = useMemo(
    () => refs.filter((r) => veces(r) > 1).length,
    [refs, tracksByRef],
  )
  const pendientesCount = useMemo(() => refs.filter((r) => r.pendiente).length, [refs])
  const conjuntosCount = useMemo(() => refs.filter((r) => r.conjunto && r.conjuntoRef).length, [refs])

  const thProps = { sortKey, sortDir, onSort: toggle }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Resumen de producción</h1>
          <p className="view-sub">
            {rows.length} referencias{repetidasCount > 0 ? ` · ${repetidasCount} repetidas` : ''}
            {pendientesCount > 0 ? ` · ${pendientesCount} con pendiente` : ''}
          </p>
        </div>
        <div className="view-actions">
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
          <table className="data-table">
            <thead>
              <tr>
                <th>Foto</th>
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Veces" col="veces" {...thProps} />
                <SortTh label="Etapa actual" col="etapa" {...thProps} />
                <SortTh label="Tipo" col="tipo" {...thProps} />
                <SortTh label="Tela" col="tela" {...thProps} />
                <SortTh label="Costos" col="costos_auto" {...thProps} className="th-flag" />
                <SortTh label="Muestras" col="muestras_mp" {...thProps} className="th-flag" />
                <SortTh label="Producción" col="produccion_mp" {...thProps} className="th-flag" />
                <SortTh label="Medición" col="medicion" {...thProps} className="th-flag" />
                <SortTh label="Repetición" col="repeticion" {...thProps} className="th-flag" />
                <SortTh label="Entrega" col="flag_entrega" {...thProps} className="th-flag" />
                <SortTh label="Cant" col="cantidad" {...thProps} />
                <SortTh label="Costo" col="costo" {...thProps} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}
                  className={'row-click' + (medicionInfo(r).estado === 'aprobada' ? ' row-aprobada' : medicionInfo(r).estado === 'descartada' ? ' row-descartada' : '')}
                  onClick={() => onEdit(r)}>
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
                      <span className="conj-chip" title={`En conjunto con ${r.conjuntoRef}`}>⇄ Conjunto · {r.conjuntoRef}</span>
                    )}
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
                  <td>
                    {telasTexto(r)}
                    {telaDisponible(r) && (
                      <span className="tela-chip" title={telaTip(r)}>✓ Tela</span>
                    )}
                  </td>
                  <td className="td-flag">
                    {Number(r.costo) > 0
                      ? <span className="flag flag-yes" title={formatPrice(r.costo)}>Sí</span>
                      : <span className="flag flag-no">No</span>}
                  </td>
                  <td className="td-flag"><EstadoMP state={estadoMP(tracksByRef && tracksByRef.get(r.id), r.flags, 'muestra', 'muestras')} /></td>
                  <td className="td-flag"><EstadoMP state={estadoMP(tracksByRef && tracksByRef.get(r.id), r.flags, 'produccion', 'produccion')} /></td>
                  <td className="td-flag"><MedicionChip ref={r} /></td>
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
                  <td className="num">{formatPrice(r.costo)}</td>
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
