import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { formatDate } from '../lib/constants.js'
import { isoLocal } from '../lib/dates.js'
import { nuevaEntrada, pendientesDe } from '../lib/entradasBodega.js'

const tallerDe = (o) => (o.stages && o.stages.envioEnsamble && o.stages.envioEnsamble.taller) || ''
const nombreDe = (email) => {
  const n = String(email || '').split('@')[0]
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

// Ingresar a bodega una orden que volvió del taller. La curva viene llena con
// lo que falta por entrar: si entra todo se confirma y ya; si algo no entra
// se baja esa casilla y el resto queda pendiente en la orden.
export default function EntradaBodegaModal({ orden, refRow, usuario, onGuardar, onClose }) {
  const pend = useMemo(() => pendientesDe(orden, orden.entradasBodega), [orden])
  const [cant, setCant] = useState(() => {
    const m = {}
    pend.filas.forEach((f) => { m[`${f.color}|${f.talla}`] = f.falta })
    return m
  })
  const [fecha, setFecha] = useState(() => isoLocal(new Date()))
  const [nota, setNota] = useState('')

  // Solo lo que falta: en una segunda entrada no se muestran las tallas que
  // ya entraron completas.
  const conFalta = useMemo(() => pend.filas.filter((f) => f.falta > 0), [pend])
  const colores = useMemo(() => [...new Set(conFalta.map((f) => f.color))], [conFalta])
  const tallas = useMemo(
    () => [...new Set(conFalta.map((f) => f.talla))].sort((a, b) => Number(a) - Number(b)),
    [conFalta],
  )
  const fila = (color, talla) => pend.filas.find((f) => f.color === color && f.talla === talla)
  const valor = (f) => (f ? Math.max(0, Math.min(f.falta, Number(cant[`${f.color}|${f.talla}`]) || 0)) : 0)
  const porColor = (color) => pend.filas.filter((f) => f.color === color).reduce((n, f) => n + valor(f), 0)
  const porTalla = (talla) => pend.filas.filter((f) => f.talla === talla).reduce((n, f) => n + valor(f), 0)
  const ingresan = pend.filas.reduce((n, f) => n + valor(f), 0)
  const quedan = pend.falta - ingresan
  const ya = pend.entradas.length
    ? pend.entradas.reduce((m, e) => (e.fecha > m ? e : m), pend.entradas[0])
    : null

  function cambiar(f, v) {
    setCant((m) => ({ ...m, [`${f.color}|${f.talla}`]: v === '' ? 0 : Number(v) }))
  }

  function guardar() {
    const filas = pend.filas.map((f) => ({ color: f.color, talla: f.talla, cant: valor(f) }))
    onGuardar(nuevaEntrada({ fecha, usuario: nombreDe(usuario), nota, filas }))
  }

  const ent = orden.stages.entregaEnsamble || {}
  return (
    <Modal open onClose={onClose} size="lg">
      <div className="modal-head">
        <div className="eb-head">
          {refRow && refRow.image && <img src={refRow.image} alt="" className="eb-foto" />}
          <div>
            <h2 className="modal-title">Ingresar a bodega · {orden.referencia}</h2>
            <p className="eb-meta">
              Orden {orden.orden} · {orden.producto}
              {tallerDe(orden) ? ` · Taller ${tallerDe(orden)}` : ''}
              {ent.fecha ? ` · llegó el ${formatDate(ent.fecha)}` : ''}
              {' · '}<b>{pend.falta.toLocaleString('es-CO')} unidades</b>
              {pend.entrado > 0 ? ` pendientes de ${pend.recibido}` : ' por ingresar'}
              {ya ? ` · ya entraron ${pend.entrado} el ${formatDate(ya.fecha)}${ya.usuario ? ` (${ya.usuario})` : ''}` : ''}
            </p>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <div className="modal-body">
        {pend.falta === 0 ? (
          <p className="field-hint" style={{ marginTop: 0 }}>Esta orden ya entró completa.</p>
        ) : (
          <>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Las casillas traen lo que falta por entrar. Cambia solo las que no entren completas.
            </p>
            <div className="eb-grid-wrap">
              <table className="eb-grid">
                <thead>
                  <tr>
                    <th>Color</th>
                    {tallas.map((t) => <th key={t}>{t || 'Unid'}</th>)}
                    <th className="num">Ingresa</th>
                  </tr>
                </thead>
                <tbody>
                  {colores.map((color) => {
                    const faltaColor = pend.filas.filter((f) => f.color === color).reduce((n, f) => n + f.falta, 0)
                    const suma = porColor(color)
                    return (
                      <tr key={color || '—'}>
                        <td>
                          <b>{color || 'Sin color'}</b>
                          <span className="eb-sub">{faltaColor} por ingresar</span>
                        </td>
                        {tallas.map((t) => {
                          const f = fila(color, t)
                          if (!f || f.falta === 0) return <td key={t} className="muted">—</td>
                          const v = valor(f)
                          return (
                            <td key={t}>
                              <input type="number" min="0" max={f.falta}
                                className={'eb-inp' + (v < f.falta ? ' parcial' : '')}
                                value={cant[`${f.color}|${f.talla}`] ?? f.falta}
                                onChange={(e) => cambiar(f, e.target.value)}
                                onFocus={(e) => e.target.select()} />
                              {v < f.falta && <span className="eb-sub">de {f.falta}</span>}
                            </td>
                          )
                        })}
                        <td className="num">
                          <b>{suma}</b>
                          {suma < faltaColor && <span className="eb-sub">de {faltaColor}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Ingresa</td>
                    {tallas.map((t) => <td key={t}>{porTalla(t)}</td>)}
                    <td className="num">{ingresan} <span className="eb-sub-inline">de {pend.falta}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="eb-campos">
              <label className="field-label">Fecha</label>
              <input className="input" type="date" value={fecha} max={isoLocal(new Date())}
                onChange={(e) => setFecha(e.target.value)} style={{ width: 150 }} />
              <label className="field-label">Nota</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder={quedan > 0 ? `Opcional: por qué no entran los ${quedan} (reproceso, mancha…)` : 'Opcional'} />
            </div>
          </>
        )}
      </div>
      <div className="modal-foot spread">
        <div className="eb-res">
          {pend.falta === 0 ? '' : (
            <>
              Ingresan <b>{ingresan} de {pend.falta}</b>
              {quedan > 0
                ? <> · <span className="eb-amb">quedan {quedan} pendientes</span> y la orden sigue en Revisión</>
                : <> · la orden queda completa y sale de Revisión</>}
            </>
          )}
        </div>
        <div>
          <button className="btn" onClick={onClose}>Cancelar</button>{' '}
          <button className="btn btn-primary" disabled={ingresan === 0 || !fecha} onClick={guardar}>
            Registrar entrada · {ingresan}
          </button>
        </div>
      </div>
    </Modal>
  )
}
