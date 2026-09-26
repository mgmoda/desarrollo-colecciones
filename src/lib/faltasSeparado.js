// ════════════════════════════════════════════════════════════════════════
// SEPARADO INCOMPLETO (Pedidos → Despachos, 26-sep-2026).
// Un cliente tiene "separado incompleto" cuando alguna línea (referencia +
// color) ya tiene unidades separadas en SYD pero le falta alguna talla para
// quedar completa: el despacho se frena por una o dos prendas. Aquí se
// encuentran esas tallas y se dice dónde está cada una: libre en bodega
// (se separa hoy), en taller (con nombre y días), en corte, por programar
// (ningún lote la trae) o en referencia cerrada. Mismas cuentas de Por
// referencia (libres) y del panel de producción (lotes).
// ════════════════════════════════════════════════════════════════════════
import { armarPorReferencia, calcularLibres } from './porReferencia.js'
import { produccionDe } from './produccionRef.js'

const n0 = (v) => Math.max(0, Number(v) || 0)
const up = (s) => String(s || '').trim().toUpperCase()
const ordenTalla = (a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b))

export const DONDE = {
  libre: { label: 'Libre en bodega', clase: 'lib', hacer: 'separar en SYD' },
  taller: { label: 'En taller', clase: 'tal', hacer: 'esperar la entrega del taller' },
  corte: { label: 'En corte', clase: 'cor', hacer: 'esperar el lote' },
  programar: { label: 'Por programar', clase: 'prog', hacer: 'meter la talla en el próximo corte' },
  cerrada: { label: 'Producción cerrada', clase: 'cer', hacer: 'enviar incompleto o quitar la talla del pedido' },
  sinLote: { label: 'Sin lote con esa talla', clase: 'prog', hacer: 'revisar en Programaciones' },
}

// Para cada cliente con separado incompleto: sus tallas faltantes y dónde
// están. Devuelve un Map cliente → { faltas, nTallas, nUnid, todasLibres }.
//   clientes: los de armarDespachos; datos: { filasSyd, orders, refs,
//   programaciones, procesos, cerradas }.
export function faltasSeparado(clientes, datos) {
  const { filasSyd, orders, refs, programaciones, procesos, cerradas } = datos || {}
  const out = new Map()
  if (!clientes || !clientes.length) return out
  let porRef = null // se arma solo si hace falta (cuesta)
  const libresCache = new Map()
  const prodCache = new Map()
  const libresDe = (ref) => {
    if (!libresCache.has(ref)) {
      if (!porRef) porRef = new Map(armarPorReferencia(filasSyd || [], orders || [], refs || []).map((r) => [r.ref, r]))
      const r = porRef.get(ref)
      libresCache.set(ref, r ? calcularLibres(r).libre : {})
    }
    return libresCache.get(ref)
  }
  const prodDe = (ref) => {
    if (!prodCache.has(ref)) prodCache.set(ref, produccionDe({ ref, lineas: [], filasSyd, orders, refs, programaciones, procesos, cerrada: !!(cerradas && cerradas.has(ref)) }))
    return prodCache.get(ref)
  }
  clientes.forEach((c) => {
    if (!(c.separadoVig > 0)) return
    const faltas = []
    c.lineas.forEach((l) => {
      if (!(l.sepVig > 0)) return
      Object.keys(l.tallas || {}).sort(ordenTalla).forEach((t) => {
        const ya = Math.max(n0((l.sepTallas || {})[t]), n0((l.factTallas || {})[t]))
        const n = n0(l.tallas[t]) - ya
        if (n <= 0) return
        const ref = up(l.ref)
        const color = up(l.color)
        const lib = n0(libresDe(ref)[color + '|' + t])
        let donde = 'sinLote', detalle = ''
        if (lib >= n) { donde = 'libre'; detalle = `${lib} libre${lib === 1 ? '' : 's'}` } else {
          const pr = prodDe(ref)
          const trae = (o) => o.colores.some((x) => (x.colorPedido ? up(x.colorPedido) : x.color) === color && n0(x.tallas[t]) > 0)
          const enCamino = pr.ordenes.filter((o) => o.area !== 'bodega' && trae(o))
          const tal = enCamino.find((o) => o.area === 'talleres' || o.area === 'entrega')
          if (tal) { donde = 'taller'; detalle = `${tal.taller || 'taller'}${tal.pasos[4] && tal.pasos[4].fechaTxt ? ` · desde ${tal.pasos[4].fechaTxt}` : ''}${tal.diasTaller != null ? ` · ${tal.diasTaller} ${tal.diasTaller === 1 ? 'día' : 'días'}` : ''}` } else if (enCamino.length) { donde = 'corte'; detalle = `orden ${enCamino[0].orden} · ${enCamino[0].etapa.label.toLowerCase()}` } else if (cerradas && cerradas.has(ref)) { donde = 'cerrada' } else if ((pr.porProgramar.colores || []).some((x) => x.color === color && n0(x.tallas[t]) > 0)) { donde = 'programar'; detalle = 'ningún lote trae esta talla' } else if (lib > 0) { donde = 'libre'; detalle = `solo ${lib} libre${lib === 1 ? '' : 's'}` }
        }
        faltas.push({
          ref, descripcion: l.descripcion || '', color, talla: t, n, lib, donde, detalle,
          sep: ya, vend: n0(l.tallas[t]), sepLinea: n0(l.separado), vendLinea: n0(l.vendido),
        })
      })
    })
    if (!faltas.length) return
    out.set(c.cliente, {
      faltas, nTallas: faltas.length, nUnid: faltas.reduce((a, f) => a + f.n, 0),
      todasLibres: faltas.every((f) => f.donde === 'libre' && f.lib >= f.n),
    })
  })
  return out
}

const tallasTxt = (n) => `${n === 1 ? 'Falta' : 'Faltan'} ${n} talla${n === 1 ? '' : 's'}`
const corta = (f) => `${f.ref} ${f.color} talla ${f.talla}`

// La decisión del cliente cuando le faltan tallas: manda sobre las demás
// salvo "No despachar" y "Completo".
export function decisionConFaltas(decision, f) {
  if (!f || !decision || decision.key === 'no' || decision.key === 'completo') return decision
  if (f.todasLibres) {
    return { key: 'completar', label: 'Completar ya', motivo: f.faltas.slice(0, 2).map((x) => `${corta(x)} · ${x.lib} libre${x.lib === 1 ? '' : 's'} en bodega`).join(' · ') + (f.faltas.length > 2 ? ` · +${f.faltas.length - 2}` : '') }
  }
  return {
    key: 'faltaTalla', label: tallasTxt(f.nTallas),
    motivo: f.faltas.slice(0, 2).map((x) => `${corta(x)} · ${DONDE[x.donde].label.toLowerCase()}`).join(' · ') + (f.faltas.length > 2 ? ` · +${f.faltas.length - 2}` : ''),
  }
}

export const FILTROS_FALTAS = [
  { key: 'incompleto', label: 'Separado incompleto', f: (c) => !!c.faltas, clase: 'amb' },
  { key: 'completar', label: 'Se completan ya', f: (c) => !!(c.faltas && c.faltas.todasLibres), clase: 'ok' },
]
