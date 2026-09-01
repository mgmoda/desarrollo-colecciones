import { useEffect, useMemo, useState } from 'react'
import SortTh from './SortTh.jsx'
import SearchInput from './SearchInput.jsx'
import { useSort, sortRows } from '../lib/sort.js'
import { AREAS, formatDate, formatPrice, limiteDiasArea, normRef, ORIGEN_ABBR, TOP_LABEL } from '../lib/constants.js'
import { ordersForArea, refProcesos, claveOrden, esOrdenTop, orderArea } from '../lib/domain.js'
import { diasDesde, diasEntre } from '../lib/dates.js'
import { generateAreaPDF } from '../lib/areaPdf.js'
import TopVinculoModal from './TopVinculoModal.jsx'
import AreaKpis from './AreaKpis.jsx'
import ProcesosTags from './ProcesosTags.jsx'
import ConjuntoModal from './ConjuntoModal.jsx'
import CurvaModal, { MEDIDA_DE_AREA } from './CurvaModal.jsx'
import NotaRefModal from './NotaRefModal.jsx'
import FaseToggles from './FaseToggles.jsx'
import EtapaProceso from './EtapaProceso.jsx'
import RendimientoCorte from './RendimientoCorte.jsx'
import EnviarExternoModal from './EnviarExternoModal.jsx'
import {
  EXTERNO, duracion, enviarExterno, estaAndando, estaFuera, estaListo,
} from '../lib/procesos.js'

const tallerDe = (o) => (o.stages && o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || ''

// Días que lleva abierta una etapa medida por el sistema. Nulo si está
// cerrada o si nadie la ha empezado: así el orden las deja al final.
function diasAbierta(proc, etapa) {
  const et = (proc || {})[etapa]
  if (!estaAndando(et)) return null
  const d = duracion(et)
  return d ? d.dias : null
}

// Días que el taller tuvo el lote: del envío a la entrega de ensamble.
function diasEnTaller(o) {
  const envio = (o.stages && o.stages.envioEnsamble && o.stages.envioEnsamble.fecha) || ''
  const entrega = (o.stages && o.stages.entregaEnsamble && o.stages.entregaEnsamble.fecha) || ''
  return envio && entrega ? diasEntre(envio, entrega) : null
}

const STAGE_LABEL = {
  ordenCorte: 'Orden corte', trazo: 'Trazo', entregaCorte: 'Corte',
  alistamiento: 'Alistamiento', envioEnsamble: 'Envío a taller',
  entregaEnsamble: 'Entrega ensamble', revisado: 'Revisado', entradaBodega: 'Entrada bodega',
}

// Celda Top/Forro. Si la prenda lleva top incluido —o si la fila ES un top—
// se puede abrir para ver dónde va la otra orden y en qué taller está.
// Celda Producto. Si la prenda va en conjunto, se abre para ver dónde está la
// otra prenda: el conjunto se despacha completo, así que las dos tienen que
// entrar a ensamble a la par.
function ProductoCell({ orden, vinculo, onAbrir }) {
  if (!vinculo || !vinculo.pareja) return <>{orden.producto}</>
  const desfasadas = orderArea(orden) !== orderArea(vinculo.pareja)
  const etapa = orderArea(vinculo.pareja)
  const etiqueta = etapa ? AREAS[etapa].label : 'Sin iniciar'
  const otra = (vinculo.ficha && vinculo.ficha.tipo) || 'la otra prenda'
  return (
    <button type="button" className="conj-link" onClick={() => onAbrir(orden)}
      title={`${otra}: orden ${vinculo.pareja.orden}, en ${etiqueta}`
        + (desfasadas ? ' — va desfasada de esta' : '')}>
      <span>{orden.producto}</span>
      <span className={'tag conj-tag' + (desfasadas ? ' tag-warn' : '')}>
        {desfasadas ? '⚠ ' : ''}{etiqueta}
      </span>
    </button>
  )
}

function TopCell({ orden, refRow, topLinks, onAbrir }) {
  const esTop = esOrdenTop(orden)
  const marca = refRow && refRow.topIncluido
  if (!esTop && !marca) return <span className="muted">—</span>
  if (!esTop && marca !== 'top') {
    return <span className="tag">{TOP_LABEL[marca] || marca}</span>
  }
  const clave = claveOrden(orden)
  const v = esTop ? topLinks.porTop.get(clave) : topLinks.porBase.get(clave)
  const pareja = v && (esTop ? v.base : v.top)
  const etiqueta = esTop ? 'Top de prenda' : (TOP_LABEL[marca] || marca)
  return (
    <button type="button"
      className={'tag tag-link' + (pareja ? '' : ' tag-link-vacio')}
      onClick={() => onAbrir(orden)}
      title={pareja
        ? `${esTop ? 'Prenda' : 'Top'}: orden ${pareja.orden} — clic para ver dónde va`
        : `${esTop ? 'Sin prenda vinculada' : 'Top aún no programado'} — clic para vincular a mano`}>
      {etiqueta}
      <span className="tag-link-sig">{pareja ? `#${pareja.orden}` : '—'}</span>
    </button>
  )
}

export default function AreaView({ areaKey, orders, refMap, onViewImage, onOpenRef, onSetFields, fasesOcultas, onToggleFase, puedeFiltrar, topLinks, onVincularTop, conjuntoLinks, faltantesPorRef, onIrAFaltantes, procesos = {}, usuario, onGuardarProceso }) {
  const [topDe, setTopDe] = useState(null) // orden cuyo vínculo de top se está viendo
  const [conjuntoDe, setConjuntoDe] = useState(null) // orden cuyo conjunto se está viendo
  const [curvaDe, setCurvaDe] = useState(null) // orden cuya curva de tallas se está viendo
  const [notaDe, setNotaDe] = useState(null)   // orden cuya nota se está escribiendo
  // En la mesa de corte se puede pasar de las órdenes al rendimiento de las
  // etapas que el sistema mide (doblado y corte).
  const [vista, setVista] = useState('ordenes')
  // Dónde está el corte: en casa o donde Diego. Es la misma tabla filtrada.
  const [donde, setDonde] = useState('')
  const [enviando, setEnviando] = useState(null)
  const ocultas = fasesOcultas || new Set()
  const area = AREAS[areaKey]
  const [q, setQ] = useState('')
  const [tallerSel, setTallerSel] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  // La tabla abre ordenada por días, de mayor a menor, para que lo más demorado
  // quede de primero. En Entrega ensamble no hay espera que contar: ahí lo que
  // ordena es cuánto se demoró el taller con el lote.
  const { sortKey, sortDir, toggle } = useSort(areaKey === 'entrega' ? 'diasTaller' : 'atraso', 'desc')

  // Limpia la selección al cambiar de área.
  useEffect(() => { setSelected(new Set()) }, [areaKey])

  function toggleSel(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const baseStage = area.base
  // El taller solo existe una vez el lote salió: en Por enviar a taller la
  // columna venía siempre vacía, así que ahí no se muestra.
  const showTaller = areaKey === 'talleres' || areaKey === 'entrega'
  // En Entrega ensamble ya no hay atraso; lo que importa es cuánto se demoró
  // el taller con el lote, del envío a la entrega.
  const showDiasTaller = areaKey === 'entrega'
  // Lo que se le paga al taller por ensamblar. Se muestra donde se decide el
  // despacho, que es cuando el dato sirve para algo.
  const showValorTaller = areaKey === 'alistamiento'
  const showAtraso = areaKey !== 'entrega' // en entrega ya ingresó: no hay atraso
  // Entre el trazo y el corte, Factory registra el doblado y alistamiento de la
  // tela. Sin eso, Corte muestra iguales dos cosas distintas: lo que espera que
  // doblen la tela y lo que ya está doblado esperando la tijera.
  // Doblado y corte medidos por el sistema: solo en la mesa de corte, que es
  // donde están las órdenes esperando que alguien las doble y las corte.
  // Todos los ven; marcarlos es de quien maneja la mesa.
  const showProcesos = areaKey === 'corte'
  const puedeProcesos = !!onGuardarProceso
  const limiteDias = limiteDiasArea(areaKey)
  const pendienteLabel = area.next ? STAGE_LABEL[area.next] : 'Recibido'

  // Las fases apagadas no cuentan en ninguna parte: ni en la tabla ni en los
  // KPIs. La semana mira todas las órdenes, no solo las de esta etapa, porque
  // lo ya trazado hoy salió de Trazos.
  const visibles = useMemo(() => orders.filter((o) => !ocultas.has(o.origen)), [orders, ocultas])
  const enEtapa = useMemo(() => ordersForArea(visibles, areaKey), [visibles, areaKey])

  // Talleres presentes en la etapa, con cuántas órdenes tiene cada uno.
  const talleres = useMemo(() => {
    const m = new Map()
    enEtapa.forEach((o) => {
      const t = tallerDe(o)
      if (t) m.set(t, (m.get(t) || 0) + 1)
    })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [enEtapa])

  const rows = useMemo(() => {
    let list = enEtapa
    if (tallerSel) list = list.filter((o) => tallerDe(o) === tallerSel)
    if (donde) list = list.filter((o) => (donde === 'diego') === estaFuera(procesos[o.orden]))
    const term = q.trim().toLowerCase()
    if (term) {
      list = list.filter((o) =>
        [o.referencia, o.producto, o.empresa, o.orden, tallerDe(o),
          refProcesos(refMap.get(o.referencia)).join(' ')]
          .some((v) => String(v || '').toLowerCase().includes(term)),
      )
    }
    const accessors = {
      fase: (o) => o.origen,
      orden: (o) => o.orden,
      referencia: (o) => o.referencia,
      producto: (o) => o.producto,
      taller: (o) => tallerDe(o),
      procesos: (o) => refProcesos(refMap.get(o.referencia)).join(', '),
      topForro: (o) => (refMap.get(o.referencia) || {}).topIncluido || '',
      fecha: (o) => (o.stages[baseStage] || {}).fecha,
      cant: (o) => Number((o.stages[baseStage] || {}).cant),
      atraso: (o) => diasDesde((o.stages[baseStage] || {}).fecha),
      diasTaller: (o) => diasEnTaller(o),
      valorTaller: (o) => Number(o.valorTaller) || 0,
      // Por estas dos se ordena para ver primero lo que lleva más días
      // abierto; lo cerrado y lo que no ha empezado quedan al final.
      procDoblado: (o) => diasAbierta(procesos[o.orden], 'doblado'),
      procCorte: (o) => diasAbierta(procesos[o.orden], 'corte'),
    }
    return sortRows(list, accessors[sortKey], sortDir)
  }, [enEtapa, q, tallerSel, donde, procesos, sortKey, sortDir, baseStage, refMap])

  // Lo que está donde Diego ahora mismo: cuántas órdenes, cuántas unidades y
  // —lo que de verdad importa— hace cuántos días salió la más vieja.
  const fuera = useMemo(() => {
    const list = enEtapa.filter((o) => estaFuera(procesos[o.orden]))
    const dias = list.map((o) => duracion(procesos[o.orden].corte).dias)
    return {
      n: list.length,
      unid: list.reduce((n, o) => n + (Number((o.stages.ordenCorte || {}).cant) || 0), 0),
      masVieja: dias.length ? Math.max(...dias) : 0,
      refVieja: list.length
        ? list[dias.indexOf(Math.max(...dias))].referencia
        : '',
    }
  }, [enEtapa, procesos])

  const thProps = { sortKey, sortDir, onSort: toggle }

  const allSelected = rows.length > 0 && rows.every((o) => selected.has(o.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((o) => o.id)))
  }

  function generatePdf() {
    const chosen = rows.filter((o) => selected.has(o.id))
    if (!chosen.length) return
    const items = chosen.map((o) => {
      const base = o.stages[baseStage] || {}
      const ref = refMap.get(o.referencia)
      const cant = (base.cant || (o.stages.ordenCorte || {}).cant || '')
      // En talleres el papel se usa para reclamar: lo que importa es con quién
      // está el lote, cuántas unidades son y hace cuántos días salió.
      const lineas = showTaller
        ? [
          { texto: `Orden ${o.orden}${cant ? ` · ${cant} unidades` : ''}`, gris: true },
          { texto: `Taller: ${tallerDe(o) || '—'}`, fuerte: true },
        ]
        : [
          { texto: [o.producto, o.empresa].filter(Boolean).join(' · '), gris: true },
          { texto: `${STAGE_LABEL[baseStage]}: ${formatDate(base.fecha) || '—'}` },
          { texto: pendienteLabel ? `Pendiente: ${pendienteLabel}` : '', gris: true },
        ]
      return {
        referencia: o.referencia,
        lineas,
        atraso: showAtraso ? diasDesde(base.fecha) : null,
        diasLabel: showTaller ? 'en el taller' : 'en esta etapa',
        limiteDias,
        image: ref && ref.image ? ref.image : null,
      }
    })
    generateAreaPDF(areaKey, items)
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{area.label}</h1>
          <p className="view-sub">
            {area.responsable ? `Responsable: ${area.responsable} · ` : ''}
            {rows.length} {rows.length === 1 ? 'orden' : 'órdenes'} en esta etapa
          </p>
        </div>
        <div className="view-actions">
          {showProcesos && (
            <div className="dis-filtros">
              <button type="button" className={'proc-f-btn' + (vista === 'ordenes' ? ' on' : '')}
                onClick={() => setVista('ordenes')}>Órdenes</button>
              <button type="button" className={'proc-f-btn' + (vista === 'rendimiento' ? ' on' : '')}
                onClick={() => setVista('rendimiento')}>Rendimiento</button>
            </div>
          )}
          <FaseToggles ocultas={ocultas} onToggle={onToggleFase} puedeCambiar={puedeFiltrar} />
          {selected.size > 0 && showProcesos && puedeProcesos && donde !== 'diego' && (
            <button className="btn btn-ext"
              onClick={() => setEnviando(rows.filter((o) => selected.has(o.id)))}>
              Enviar donde {EXTERNO} ({selected.size})
            </button>
          )}
          {selected.size > 0 && (
            <button className="btn btn-primary" onClick={generatePdf}>
              Generar PDF ({selected.size})
            </button>
          )}
          {showTaller && talleres.length > 0 && (
            <select className="input select filtro-taller" value={tallerSel}
              onChange={(e) => setTallerSel(e.target.value)}
              title="Ver solo las órdenes de un taller">
              <option value="">Todos los talleres ({enEtapa.length})</option>
              {talleres.map(([nombre, n]) => (
                <option key={nombre} value={nombre}>{nombre} ({n})</option>
              ))}
            </select>
          )}
          <SearchInput value={q} onChange={setQ}
            placeholder={showTaller ? 'Buscar referencia, taller…' : 'Buscar referencia, producto…'} />
        </div>
      </div>

      {showProcesos && vista === 'rendimiento' ? (
        // El rendimiento mira TODAS las órdenes, no solo las que siguen
        // esperando corte: una orden ya cortada se fue de esta mesa, pero su
        // tiempo es justamente lo que hay que medir.
        <RendimientoCorte orders={orders} procesos={procesos} />
      ) : (
      <>
      {showProcesos && (fuera.n > 0 || donde) && (
        <div className="dis-filtros" style={{ marginBottom: 14 }}>
          <button type="button" className={'proc-f-btn' + (!donde ? ' on' : '')}
            onClick={() => setDonde('')}>Todas <b>{enEtapa.length}</b></button>
          <button type="button" className={'proc-f-btn ext' + (donde === 'diego' ? ' on' : '')}
            title={`La tela está donde ${EXTERNO}`}
            onClick={() => setDonde(donde === 'diego' ? '' : 'diego')}>
            Corte externo <b>{fuera.n}</b>
          </button>
        </div>
      )}

      {showProcesos && donde === 'diego' && fuera.n > 0 ? (
        <div className="prog-kpis">
          <div className="prog-kpi"><span>Órdenes afuera</span><b>{fuera.n}</b>
            <em>de {enEtapa.length} en la mesa</em></div>
          <div className="prog-kpi"><span>Unidades afuera</span>
            <b>{fuera.unid.toLocaleString('es-CO')}</b>
            <em>esperando volver cortadas</em></div>
          <div className={'prog-kpi' + (fuera.masVieja > 5 ? ' alerta' : '')}>
            <span>La más antigua</span><b>{fuera.masVieja} d</b>
            <em>{fuera.refVieja}</em></div>
          <div className="prog-kpi"><span>Sin salir</span>
            <b>{enEtapa.length - fuera.n}</b><em>siguen en casa</em></div>
        </div>
      ) : (
        <AreaKpis areaKey={areaKey} orders={visibles} enEtapa={enEtapa}
          refMap={refMap} onViewImage={onViewImage} onOpenRef={onOpenRef} />
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>No hay órdenes en esta etapa.</p>
          <p className="muted">Importa los archivos del sistema para ver datos aquí.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="cell-check">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Seleccionar todo" />
                </th>
                <th>Foto</th>
                <SortTh label="Fase" col="fase" {...thProps} />
                <SortTh label="# Orden" col="orden" {...thProps} />
                <SortTh label="Referencia" col="referencia" {...thProps} />
                <SortTh label="Producto" col="producto" {...thProps} />
                <SortTh label="Procesos" col="procesos" {...thProps} />
                <SortTh label="Top/Forro" col="topForro" {...thProps} />
                {showTaller && <SortTh label="Taller" col="taller" {...thProps} />}
                {showValorTaller && <SortTh label="Valor taller" col="valorTaller" className="num" {...thProps} />}
                <SortTh label={STAGE_LABEL[baseStage]} col="fecha" {...thProps} />
                <SortTh label="Cant" col="cant" className="num" {...thProps} />
                {showProcesos && <SortTh label="Doblando" col="procDoblado" {...thProps} />}
                {showProcesos && <SortTh label="Cortando" col="procCorte" {...thProps} />}
                {showAtraso && <SortTh label="Días" col="atraso" className="num" {...thProps} />}
                {showDiasTaller && <SortTh label="Días en taller" col="diasTaller" className="num" {...thProps} />}
                <th>Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const ref = refMap.get(o.referencia)
                const base = o.stages[baseStage] || {}
                const taller = (o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || ''
                const atraso = diasDesde(base.fecha)
                const dias = showDiasTaller ? diasEnTaller(o) : null
                const canOpen = !!(onOpenRef && ref)
                return (
                  <tr key={o.id}
                    className={(selected.has(o.id) ? 'row-sel' : '') + ' row-click'
                      + (showProcesos && estaFuera(procesos[o.orden]) ? ' row-ext' : '')}
                    onClick={() => setCurvaDe(o)}
                    title="Ver la curva de tallas y colores de esta orden">
                    <td className="cell-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSel(o.id)} />
                    </td>
                    <td className="cell-photo">
                      {ref && ref.image ? (
                        <img src={ref.image} alt={o.referencia} className="thumb"
                          title="Ampliar foto"
                          onClick={(e) => { e.stopPropagation(); onViewImage(ref.image) }} />
                      ) : (
                        <span className="thumb empty" title={canOpen ? 'Sin foto — clic en la fila para agregar' : ''}>＋</span>
                      )}
                    </td>
                    <td><span className={'origen-chip o-' + o.origen}>{ORIGEN_ABBR[o.origen] || o.origen}</span></td>
                    <td className="mono">{o.orden}</td>
                    <td className="strong">
                      {o.referencia}
                      {showProcesos && estaFuera(procesos[o.orden]) && (
                        <span className="tag tag-ext" title={`La tela está donde ${EXTERNO}`}>
                          Donde {EXTERNO}
                        </span>
                      )}
                      {(() => {
                        const fs = faltantesPorRef && faltantesPorRef.get(normRef(o.referencia))
                        if (!fs || !fs.length) return null
                        // El faltante viaja con la prenda: si va camino al taller
                        // y le falta una pieza, tiene que verse aquí.
                        return (
                          <button type="button" className="tag tag-warn fal-tag"
                            onClick={(e) => { e.stopPropagation(); onIrAFaltantes && onIrAFaltantes() }}
                            title={fs.map((f) => `${f.descripcion} — ${f.estado === 'gestion' ? 'llegó, falta cortar' : 'con Ninfa'}`).join('\n')}>
                            ⚠ Pendiente{fs.length > 1 ? ` ×${fs.length}` : ''}
                          </button>
                        )
                      })()}
                      {/* Nota de la referencia: por qué está frenada. Se
                          escribe desde aquí, que es donde se ve el problema. */}
                      {onSetFields && (
                        <button type="button"
                          className={'nota-btn' + (ref && ref.pendienteNota ? ' con' : '')}
                          onClick={(e) => { e.stopPropagation(); setNotaDe(o) }}
                          title={ref && ref.pendienteNota ? 'Editar la nota' : 'Escribir por qué está frenada'}>
                          {ref && ref.pendienteNota ? ref.pendienteNota : '+ nota'}
                        </button>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <ProductoCell orden={o} vinculo={conjuntoLinks.get(claveOrden(o))}
                        onAbrir={setConjuntoDe} />
                    </td>
                    <td><ProcesosTags refRow={ref} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <TopCell orden={o} refRow={ref} topLinks={topLinks} onAbrir={setTopDe} />
                    </td>
                    {showTaller && <td className="cel-taller" title={taller}>{taller}</td>}
                    {showValorTaller && (
                      <td className="num" title={o.valorTaller
                        ? 'Valor de ensamble de la ficha del producto en Factory'
                        : 'La ficha del producto no tiene valor de ensamble'}>
                        {o.valorTaller ? formatPrice(o.valorTaller) : <span className="muted">—</span>}
                      </td>
                    )}
                    <td>{formatDate(base.fecha)}</td>
                    <td className="num">{base.cant}</td>
                    {/* El clic se queda en la casilla: la fila entera abre la
                        curva de tallas, y marcar el doblado no es pedir eso. */}
                    {showProcesos && (
                      <td className="cel-proc" onClick={(ev) => ev.stopPropagation()}>
                        <EtapaProceso etapa="doblado" proc={procesos[o.orden]}
                          usuario={usuario} puedeEditar={puedeProcesos}
                          onCambiar={(p) => onGuardarProceso(o.orden, p)} />
                      </td>
                    )}
                    {showProcesos && (
                      <td className="cel-proc" onClick={(ev) => ev.stopPropagation()}>
                        <EtapaProceso etapa="corte" proc={procesos[o.orden]}
                          usuario={usuario} puedeEditar={puedeProcesos}
                          onCambiar={(p) => onGuardarProceso(o.orden, p)} />
                      </td>
                    )}
                    {showAtraso && (
                      <td className="num">
                        {atraso == null ? '' : (
                          <span className={'tag' + (atraso > limiteDias ? ' tag-warn' : '')}
                            title={atraso > limiteDias
                              ? `Lleva más de ${limiteDias} días en esta etapa`
                              : `${atraso} ${atraso === 1 ? 'día' : 'días'} en esta etapa`}>
                            {atraso} d
                          </span>
                        )}
                      </td>
                    )}
                    {showDiasTaller && (
                      <td className="num">
                        {dias == null ? <span className="muted">—</span> : (
                          <span className={'tag' + (dias < 0 ? ' tag-warn' : '')}
                            title={dias < 0
                              ? 'La entrega quedó registrada antes del envío'
                              : `Enviado ${formatDate(o.stages.envioEnsamble.fecha)}`}>
                            {dias} d
                          </span>
                        )}
                      </td>
                    )}
                    <td><span className="tag">{pendienteLabel}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

      {enviando && (
        <EnviarExternoModal ordenes={enviando}
          onConfirmar={(iso) => {
            enviando.forEach((o) => onGuardarProceso(
              o.orden, enviarExterno(procesos[o.orden], usuario, iso),
            ))
            setEnviando(null)
            setSelected(new Set())
            setDonde('diego')
          }}
          onClose={() => setEnviando(null)} />
      )}

      {notaDe && (
        <NotaRefModal orden={notaDe} refRow={refMap.get(notaDe.referencia)}
          onGuardar={(campos) => onSetFields && onSetFields(notaDe.referencia, campos)}
          onClose={() => setNotaDe(null)} />
      )}

      {curvaDe && (
        <CurvaModal orden={curvaDe} medidaInicial={MEDIDA_DE_AREA[areaKey]}
          refMap={refMap} onClose={() => setCurvaDe(null)}
          onOpenRef={onOpenRef} onViewImage={onViewImage} />
      )}

      <ConjuntoModal orden={conjuntoDe}
        vinculo={conjuntoDe ? conjuntoLinks.get(claveOrden(conjuntoDe)) : null}
        refMap={refMap} onViewImage={onViewImage} onClose={() => setConjuntoDe(null)} />

      <TopVinculoModal orden={topDe} orders={orders} refMap={refMap} topLinks={topLinks}
        onVincular={onVincularTop} onClose={() => setTopDe(null)} />
    </div>
  )
}
