import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { ORIGENES } from '../lib/constants.js'

// La curva de una orden: cantidades por talla y color, en cada etapa.
// Viene de Factory con la sincronización (campo `curva` de la orden):
// [{ color, talla, prog, trazo, corte, env, ent }]

const MEDIDAS = [
  ['prog', 'Programado'],
  ['trazo', 'Trazado'],
  ['corte', 'Entrega corte'],
  ['env', 'Env. taller'],
  ['ent', 'Recibido'],
]

// La medida que se abre por defecto según la etapa desde la que se hizo clic.
export const MEDIDA_DE_AREA = {
  ordencorte: 'prog', trazos: 'prog', corte: 'trazo',
  enviar: 'corte', talleres: 'env', entrega: 'ent',
}

function filas(curva) {
  if (!curva) return []
  return Array.isArray(curva) ? curva : [curva]
}

export default function CurvaModal({ orden, medidaInicial, refMap, onClose, onOpenRef, onViewImage }) {
  const [medida, setMedida] = useState(medidaInicial || 'prog')
  const rows = filas(orden && orden.curva)
  const ficha = orden ? refMap.get(orden.referencia) : null

  const { tallas, colores, celdas, totCol, totFila, totales } = useMemo(() => {
    const tSet = new Set()
    const cSet = new Set()
    const mapa = new Map() // color|talla -> {prog,trazo,...}
    rows.forEach((r) => {
      const t = String(r.talla || '').trim()
      const c = String(r.color || '').trim() || '—'
      if (!t) return
      tSet.add(t); cSet.add(c)
      const k = c + '|' + t
      const prev = mapa.get(k) || {}
      MEDIDAS.forEach(([m]) => { prev[m] = (prev[m] || 0) + (Number(r[m]) || 0) })
      mapa.set(k, prev)
    })
    // Tallas en orden natural (06, 08, 10…, luego letras).
    const tallas = [...tSet].sort((a, b) => {
      const na = parseInt(a, 10); const nb = parseInt(b, 10)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      if (Number.isFinite(na)) return -1
      if (Number.isFinite(nb)) return 1
      return a.localeCompare(b)
    })
    const colores = [...cSet].sort()
    const celdas = (c, t, m) => (mapa.get(c + '|' + t) || {})[m] || 0
    const totCol = (t, m) => colores.reduce((s, c) => s + celdas(c, t, m), 0)
    const totFila = (c, m) => tallas.reduce((s, t) => s + celdas(c, t, m), 0)
    const totales = {}
    MEDIDAS.forEach(([m]) => { totales[m] = colores.reduce((s, c) => s + totFila(c, m), 0) })
    return { tallas, colores, celdas, totCol, totFila, totales }
  }, [rows])

  if (!orden) return null

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="modal-head">
        <div className="cur-head">
          {ficha && ficha.image ? (
            <img className="cur-foto" src={ficha.image} alt={orden.referencia}
              onClick={() => onViewImage && onViewImage(ficha.image)} title="Ampliar foto" />
          ) : (
            <span className="cur-foto cur-foto-vacia">＋</span>
          )}
          <div>
            <h2>{orden.referencia}</h2>
            <p className="modal-sub">
              Orden {orden.orden} · {ORIGENES[orden.origen] || orden.origen}
              {orden.producto && orden.producto !== orden.referencia && <> · {orden.producto}</>}
            </p>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="modal-body">
        {rows.length === 0 ? (
          <div className="empty-state">
            <p>Esta orden aún no tiene la curva cargada.</p>
            <p className="muted">
              La curva por tallas llega desde Factory con la sincronización;
              estará disponible en la próxima actualización.
            </p>
          </div>
        ) : (
          <>
            <div className="cur-medidas">
              {MEDIDAS.map(([m, label]) => (
                <button key={m} type="button"
                  className={'opt-btn' + (medida === m ? ' on' : '')}
                  onClick={() => setMedida(m)}>
                  {label} <b>{totales[m].toLocaleString('es-CO')}</b>
                </button>
              ))}
            </div>

            <div className="table-wrap">
              <table className="data-table cur-tabla">
                <thead>
                  <tr>
                    <th>Color</th>
                    {tallas.map((t) => <th key={t} className="num">{t}</th>)}
                    <th className="num cur-total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {colores.map((c) => (
                    <tr key={c}>
                      <th scope="row">{c}</th>
                      {tallas.map((t) => {
                        const v = celdas(c, t, medida)
                        return <td key={t} className={'num' + (v ? '' : ' cur-cero')}>{v || '·'}</td>
                      })}
                      <td className="num cur-total">{totFila(c, medida).toLocaleString('es-CO')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {tallas.map((t) => (
                      <td key={t} className="num">{totCol(t, medida).toLocaleString('es-CO')}</td>
                    ))}
                    <td className="num cur-total">{totales[medida].toLocaleString('es-CO')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="modal-foot spread">
        {ficha && onOpenRef ? (
          <button className="btn" onClick={() => { onClose(); onOpenRef(ficha) }}>Ver ficha</button>
        ) : <span />}
        <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  )
}
