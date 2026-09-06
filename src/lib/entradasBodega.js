// Entrada a bodega registrada desde el sistema.
//
// Factory tiene su propia entrada de producto terminado, pero en la práctica
// casi nunca se digita: 400 órdenes recibidas del taller sin entrada. Aquí se
// registra desde Revisión, con la curva de la orden, y lo que no entra queda
// como pendiente en la misma fila. No se escribe nada en Factory.
//
// La llave es el NÚMERO DE ORDEN (igual que doblado y corte): el sync de
// Factory reemplaza dev_orders y les cambia el id cada dos minutos.

import { isoLocal } from './dates.js'

const clave = (f) => `${f.color}|${f.talla}`

// Lo que llegó del taller, por color y talla. Factory no reparte la entrega
// de ensamble por talla, así que se toma lo cortado —que es lo que fue al
// taller—; si la orden no tiene curva, una sola fila con el total.
export function recibidoPorTalla(o) {
  const curva = Array.isArray(o.curva) ? o.curva : []
  const filas = curva
    .map((c) => ({
      color: c.color || '',
      talla: String(c.talla || ''),
      cant: Number(c.corte) || Number(c.trazo) || Number(c.prog) || 0,
    }))
    .filter((f) => f.cant > 0)
  if (filas.length) return filas
  const st = (o.stages || {})
  const cant = Number((st.entregaEnsamble || st.ordenCorte || {}).cant) || 0
  return cant > 0 ? [{ color: '', talla: '', cant }] : []
}

// Recibido, ya entrado y lo que falta, por color y talla, y los totales.
export function pendientesDe(o, registro) {
  const entradas = (registro && registro.entradas) || []
  const entrado = new Map()
  entradas.forEach((e) => (e.curva || []).forEach((c) => {
    const k = `${c.color || ''}|${String(c.talla || '')}`
    entrado.set(k, (entrado.get(k) || 0) + (Number(c.cant) || 0))
  }))
  const filas = recibidoPorTalla(o).map((f) => {
    const ya = entrado.get(clave(f)) || 0
    return { ...f, entrado: ya, falta: Math.max(0, f.cant - ya) }
  })
  const suma = (k) => filas.reduce((n, f) => n + f[k], 0)
  return { filas, recibido: suma('cant'), entrado: suma('entrado'), falta: suma('falta'), entradas }
}

// "ROJO 12 ×2, 14 ×1 · AZUL 14 ×1": lo que falta, dicho corto para la fila.
export function resumenFalta(p) {
  const porColor = new Map()
  p.filas.filter((f) => f.falta > 0).forEach((f) => {
    if (!porColor.has(f.color)) porColor.set(f.color, [])
    porColor.get(f.color).push(f.talla ? `${f.talla} ×${f.falta}` : `×${f.falta}`)
  })
  return [...porColor.entries()]
    .map(([color, partes]) => `${color ? color + ' ' : ''}${partes.join(', ')}`)
    .join(' · ')
}

// Arma la entrada que se guarda: solo las casillas con cantidad.
export function nuevaEntrada({ fecha, usuario, nota, filas }) {
  const curva = filas.filter((f) => f.cant > 0)
    .map((f) => ({ color: f.color, talla: f.talla, cant: f.cant }))
  return {
    id: Math.random().toString(36).slice(2, 10),
    fecha: fecha || isoLocal(new Date()),
    at: Date.now(),
    usuario: usuario || '',
    nota: (nota || '').trim(),
    unid: curva.reduce((n, c) => n + c.cant, 0),
    curva,
  }
}

// Las órdenes con lo registrado aquí encima. La que ya entró completa recibe
// la etapa entradaBodega como si Factory la hubiera registrado —así sale de
// Revisión y cuenta en Entrada a bodega sin tocar nada más—, marcada con
// `sistema` para saber de dónde salió. Si Factory ya la tiene, manda Factory.
export function aplicarEntradas(orders, entradas) {
  if (!entradas || !Object.keys(entradas).length) return orders
  return orders.map((o) => {
    const reg = entradas[String(o.orden)]
    if (!reg || !reg.entradas || !reg.entradas.length) return o
    const conReg = { ...o, entradasBodega: reg }
    const p = pendientesDe(o, reg)
    const st = o.stages || {}
    if (p.falta > 0 || (st.entradaBodega && st.entradaBodega.fecha)) return conReg
    const ultima = reg.entradas.reduce((m, e) => (e.fecha > m ? e.fecha : m), '')
    return {
      ...conReg,
      stages: { ...st, entradaBodega: { fecha: ultima, cant: String(p.entrado), sistema: true } },
    }
  })
}
