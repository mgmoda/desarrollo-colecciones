import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { produccionDe, diasTxt } from '../lib/produccionRef.js'

// ════════════════════════════════════════════════════════════════════════
// PANEL "EN QUÉ VA" de una referencia, desde la ventana del cliente.
// Se abre a la derecha, encima de la ventana, y muestra cada orden con su
// etapa, su taller, sus días y su curva por color y talla; abajo los libres
// hoy y la respuesta lista para el cliente. Las cuentas están en
// lib/produccionRef.js.
// ════════════════════════════════════════════════════════════════════════

const num = (n) => Number(n || 0).toLocaleString('es-CO')

function Cel({ n, cls }) {
  return n ? <td className={'num' + (cls ? ' ' + cls : '')}>{num(n)}</td> : <td className="num pp-z">·</td>
}

// La curva de una orden: una fila por color con lo cortado por talla; si el
// taller ya entregó, debajo lo entregado por talla con las faltantes en rojo.
function Curva({ o }) {
  const t = o.tallas
  return (
    <table className="pp-curva">
      <thead>
        <tr><th>Color</th>{t.map((x) => <th key={x} className="num">{x}</th>)}<th className="num">Unid</th><th className="num">Entregó taller</th></tr>
      </thead>
      <tbody>
        {o.colores.map((c) => (
          <FilaColor key={c.color} c={c} t={t} conEntrega={o.entregoTaller > 0} />
        ))}
        {o.colores.length > 1 && (
          <tr className="pp-tot">
            <td>Total</td>
            {t.map((x) => <Cel key={x} n={o.colores.reduce((n, c) => n + (c.tallas[x] || 0), 0)} />)}
            <td className="num">{num(o.colores.reduce((n, c) => n + c.unid, 0))}</td>
            <td className={'num' + (o.entregoTaller ? ' pp-ok' : ' pp-z')}>{o.entregoTaller ? num(o.colores.reduce((n, c) => n + c.entUnid, 0)) : '·'}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function FilaColor({ c, t, conEntrega }) {
  const falto = c.unid - c.entUnid
  return (
    <>
      <tr>
        <td>{c.color}{c.colorPedido && c.colorPedido !== c.color && <span className="muted"> = {c.colorPedido}</span>}</td>
        {t.map((x) => <Cel key={x} n={c.tallas[x]} />)}
        <td className="num"><b>{num(c.unid)}</b></td>
        <td className={'num' + (conEntrega ? (falto > 0 ? ' pp-f' : ' pp-ok') : ' pp-z')}>
          {conEntrega ? num(c.entUnid) : '·'}
        </td>
      </tr>
      {conEntrega && falto > 0 && (
        <tr className="pp-fila-t">
          <td>entregó por talla</td>
          {t.map((x) => {
            const e = c.ent[x] || 0
            const f = (c.tallas[x] || 0) - e
            return <td key={x} className={'num' + (f > 0 ? ' pp-f' : e ? '' : ' pp-z')}>{e || (f > 0 ? 0 : '·')}</td>
          })}
          <td className="num">{num(c.entUnid)}</td>
          <td className="num pp-f">faltan {num(falto)}</td>
        </tr>
      )}
    </>
  )
}

function Orden({ o }) {
  return (
    <div className="pp-lote">
      <div className="pp-cab">
        <div>
          <b>Orden {o.orden}</b>
          <span className="muted">
            {' · '}{o.muestra ? 'Muestra' : 'Producción'}{o.pieza ? ` · ${o.pieza}` : ''}
            {o.fechaOCTxt ? ` · orden de corte ${o.fechaOCTxt}` : ''} · {num(o.cant)} und
            {o.programada && o.programada !== o.cant ? ` (programadas ${num(o.programada)})` : ''}
          </span>
        </div>
        <span className={'pp-chip ' + o.etapa.clase + (o.tarde ? ' tarde' : '')}>{o.chip}</span>
      </div>
      <div className="pp-ruta">
        {o.pasos.map((p) => (
          <span key={p.key} className={'pp-paso ' + p.estado + (p.tarde ? ' tarde' : '')} title={p.estado === 'salto' ? 'Sin fecha en Factory' : ''}>
            <i />{p.label}{p.fechaTxt && <b>{p.fechaTxt}</b>}{p.extra && <em>{p.extra}</em>}
          </span>
        ))}
      </div>
      {o.colores.length > 0 && <Curva o={o} />}
      {(o.faltoTaller.length > 0 || o.entroSinDigitar || (o.area === 'bodega' && o.entro !== o.entregoTaller && o.entregoTaller > 0)) && (
        <div className="pp-nota">
          {o.faltoTaller.length > 0 && <>El taller entregó {num(o.entregoTaller)} de {num(o.cant)}: falta {o.faltoTaller.map((f) => `${f.n} en talla ${f.talla}${o.colores.length > 1 ? ' ' + f.color : ''}`).join(', ')}. </>}
          {o.entroSinDigitar && <>Muestra entregada por el taller sin entrada a bodega digitada en Factory: cuenta como entrada. </>}
          {o.area === 'bodega' && o.entregoTaller > 0 && o.entro !== o.entregoTaller && !o.entroSinDigitar && <>A bodega entraron {num(o.entro)} y el taller entregó {num(o.entregoTaller)}. </>}
        </div>
      )}
    </div>
  )
}

export default function ProduccionPanel({ codigo, descripcion, cliente, lineas, cerrada, datos, onClose }) {
  const p = useMemo(() => produccionDe({ ref: codigo, lineas, cerrada, ...datos }), [codigo, lineas, cerrada, datos])

  // Escape cierra este panel y no la ventana del cliente que está detrás.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const pideTxt = p.pendiente.length
    ? p.pendiente.map((c) => `${c.color} ${num(c.n)}`).join(' · ')
    : 'nada pendiente de esta referencia'
  const tallasLib = p.libres.tallas
  const coloresLib = [...new Set([...p.libres.colores, ...p.pendiente.map((c) => c.color)])]

  return createPortal(
    // Los eventos de React suben por el árbol de componentes, no por el DOM:
    // sin este freno el clic llegaría al fondo de la ventana del cliente y
    // la cerraría.
    <div className="pp-raiz" onMouseDown={(e) => e.stopPropagation()}>
      <div className="pp-velo" onMouseDown={onClose} />
      <aside className="pp-panel" role="dialog" aria-label={`Producción de ${p.ref}`}>
        <button type="button" className="icon-btn pp-x" onClick={onClose} aria-label="Cerrar">✕</button>
        <h3 className="modal-title pp-titulo">{p.ref}{descripcion ? <span className="muted"> · {descripcion}</span> : null}</h3>
        <p className="eb-meta">
          {cliente} pide <b>{num(p.pendiente.reduce((n, c) => n + c.n, 0))}</b> pendientes: {pideTxt}
          {p.cerrada && <> <span className="tag dsp-tag pp-cerrada">Producción cerrada</span></>}
        </p>

        <div className="pp-kp">
          <div><span>Programado</span><b>{num(p.cifras.programado)}</b><em>{p.cifras.ordenes === 1 ? '1 orden' : `${p.cifras.ordenes} órdenes`}{p.esConjunto ? ' · conjunto' : ''}</em></div>
          <div><span>Cortado</span><b>{num(p.cifras.cortado)}</b><em>{p.cifras.cortado < p.cifras.programado ? `faltan ${num(p.cifras.programado - p.cifras.cortado)}` : p.cifras.programado ? 'todo' : 'sin orden'}</em></div>
          <div><span>Entregó taller</span><b>{num(p.cifras.entrego)}</b><em>{p.cifras.enTaller ? `${num(p.cifras.enTaller)} en taller` : p.cifras.cortado > p.cifras.entrego ? `faltan ${num(p.cifras.cortado - p.cifras.entrego)}` : p.cifras.cortado ? 'todo' : 'nada cortado'}</em></div>
          <div><span>En bodega</span><b>{num(p.cifras.bodega)}</b><em>{num(p.libres.conNombre)} con nombre</em></div>
          <div><span>Libres hoy</span><b className="pp-ok">{num(p.libres.total)}</b><em>{p.libres.colores.length ? p.libres.colores.join(' · ') : 'nada libre'}</em></div>
        </div>

        {p.tela && (p.tela.label || p.tela.movimientos.length > 0) && (
          <div className="pp-tela">
            <b>{p.tela.label || 'En proceso'}.</b>{' '}
            {p.tela.movimientos.map((m) => `${m.proceso} ${m.color}${m.cant ? ` ${num(m.cant)} und` : ''}${m.dias != null ? ` · hace ${diasTxt(m.dias)}` : ''}`).join(' · ')}
          </div>
        )}

        <p className="pp-tit">{p.ordenes.length ? `Órdenes de la referencia · ${p.ordenes.length === 1 ? 'una' : p.ordenes.length} · de la más reciente a la más vieja` : 'Órdenes de la referencia'}</p>
        {p.ordenes.length === 0 && (
          <div className="pp-vacio">Sin orden de corte todavía{p.tela && p.tela.label ? ` · ${p.tela.label.toLowerCase()}` : ''}.</div>
        )}
        {p.grupos.map((g) => (
          <div key={g.pieza || 'u'}>
            {p.esConjunto && <p className="pp-pieza">{g.pieza} <span className="muted">· {g.ordenes.length === 1 ? '1 orden' : `${g.ordenes.length} órdenes`}</span></p>}
            {g.ordenes.map((o) => <Orden key={o.orden} o={o} />)}
          </div>
        ))}

        <p className="pp-tit">Libres hoy en bodega · lo que se puede separar ya</p>
        <div className="pp-libres">
          <div className="pp-libres-cab">
            Entró <b>{num(p.libres.entro)}</b> · con nombre o facturado <b>{num(p.libres.conNombre)}</b> · libres <b className="pp-ok">{num(p.libres.total)}</b>
            <span className="muted"> · mismo cálculo de Por referencia</span>
          </div>
          {(coloresLib.length > 0) ? (
            <table className="pp-curva">
              <thead><tr><th>Color</th>{tallasLib.map((t) => <th key={t} className="num">{t}</th>)}<th className="num">Libres</th><th className="num">Pide {cliente.split(' ')[0]}</th></tr></thead>
              <tbody>
                {coloresLib.map((c) => {
                  const pide = p.pendiente.find((x) => x.color === c)
                  const lib = tallasLib.reduce((n, t) => n + (p.libres.libre[c + '|' + t] || 0), 0)
                  const faltan = pide ? Object.keys(pide.tallas).filter((t) => (p.libres.libre[c + '|' + t] || 0) < pide.tallas[t]) : []
                  return (
                    <tr key={c}>
                      <td>{c}</td>
                      {tallasLib.map((t) => {
                        const l = p.libres.libre[c + '|' + t] || 0
                        const n = pide ? pide.tallas[t] || 0 : 0
                        return <td key={t} className={'num' + (l ? (n && l < n ? ' pp-f' : ' pp-ok') : n ? ' pp-f' : ' pp-z')}>{l || (n ? 0 : '·')}</td>
                      })}
                      <td className={'num' + (lib ? ' pp-ok' : ' pp-z')}><b>{lib || '·'}</b></td>
                      <td className="num">{pide ? <>{num(pide.n)}{faltan.length ? <span className="pp-f"> · falta talla {faltan.join(', ')}</span> : null}</> : <span className="pp-z">·</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="pp-vacio">Nada libre y nada pendiente.</div>}
          {p.libres.avisos.length > 0 && <div className="pp-nota">{p.libres.avisos.join('. ')}.</div>}
        </div>

        {p.respuesta.length > 0 && (
          <div className="pp-resp">
            <b>Para contestarle:</b>
            <ul>{p.respuesta.map((r) => <li key={r.color}><b>{r.color}</b>: {r.texto}.</li>)}</ul>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}
