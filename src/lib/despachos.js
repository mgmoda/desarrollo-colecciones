// ════════════════════════════════════════════════════════════════════════
// DESPACHOS — cuánto tiene separado cada cliente, cuánto se le facturó y
// cuánto le falta de verdad.
// ────────────────────────────────────────────────────────────────────────
// Todo sale del informe de SYD (pedidos_syd): cada línea trae su `estado`
// —vendido, separado, facturado o pendiente (subtotal)— clasificado por la
// regla del archivo de pendientes (texto de Combin + Tipo). Desde el 18 de
// septiembre de 2026 SYD manda las líneas "Separado" con pedido, color y
// tallas, así que lo separado y lo facturado de SYD MANDAN; lo registrado a
// mano en dev_despachos solo se usa en la línea donde SYD no trae nada.
// Las referencias cerradas y las novedades del cliente sí se registran acá,
// en dev_despachos, con tres clases de renglón:
//   l|CLIENTE|REF|COLOR → { separado, facturado, usuario, at }
//   r|REF               → { cerrada, usuario, at }
//   c|CLIENTE           → { novedad, nota, usuario, at }
//
// Las cuentas siguen las reglas del archivo de pendientes que se llevaba
// antes (reglas_migracion_pendientes). La llave que manda es
// cliente + referencia + color: lo separado de un color se cruza contra lo
// facturado de ESE color, y solo lo que sobra sigue contando como separado.
// ════════════════════════════════════════════════════════════════════════

export const TALLAS = ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24']
export const NOVEDAD_NO_RECIBE = 'NO RECIBE MÁS'

const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')
export const idLinea = (cliente, ref, color) => `l|${norm(cliente)}|${norm(ref)}|${norm(color)}`
export const idRef = (ref) => `r|${norm(ref)}`
export const idCliente = (cliente) => `c|${norm(cliente)}`

// Con cuánto separado, sobre lo pendiente que sí sale, se considera que el
// cliente ya se puede despachar en parte.
export const UMBRAL_PARCIAL = 0.6

const n0 = (v) => Math.max(0, Number(v) || 0)

// Arma, por cliente, sus líneas (referencia × color) con lo vendido de SYD y
// lo registrado acá, y calcula las cifras del tablero.
export function armarDespachos(filasSyd, registros) {
  const reg = registros || {}
  const clientes = new Map()
  ;(filasSyd || []).forEach((r) => {
    const nombre = String(r.cliente || '').trim()
    if (!nombre) return
    if (!clientes.has(nombre)) {
      clientes.set(nombre, {
        cliente: nombre, ciudad: r.ciudad || '', codigo: r.codigo_cliente || '',
        inactiva: !!r.inactiva, observacion: r.observacion || '', lineas: new Map(),
      })
    }
    const c = clientes.get(nombre)
    const ref = norm(r.referencia)
    const color = norm(r.color)
    const k = `${ref}|${color}`
    if (!c.lineas.has(k)) {
      c.lineas.set(k, {
        id: idLinea(nombre, ref, color), ref, color,
        descripcion: r.descripcion || '', precio: Number(r.precio) || 0,
        vendido: 0, valor: 0, tallas: {}, pedidos: [], obs: '',
      })
    }
    const l = c.lineas.get(k)
    const estado = r.estado || 'vendido'
    if (estado === 'pendiente') return // subtotal del informe, no es una línea
    if (estado === 'separado' || estado === 'facturado') {
      const destino = estado === 'separado' ? 'sydSep' : 'sydFact'
      if (!l[destino]) l[destino] = {}
      Object.entries(r.tallas || {}).forEach(([t, v]) => { l[destino][t] = (l[destino][t] || 0) + (Number(v) || 0) })
      if (!l.descripcion && r.descripcion) l.descripcion = r.descripcion
      return
    }
    l.vendido += n0(r.unid)
    l.valor += Number(r.total) || 0
    if (r.pedido && !l.pedidos.includes(r.pedido)) l.pedidos.push(r.pedido)
    if (!l.obs && r.observacion) l.obs = r.observacion
    if (!l.descripcion && r.descripcion) l.descripcion = r.descripcion
    Object.entries(r.tallas || {}).forEach(([t, v]) => { l.tallas[t] = (l.tallas[t] || 0) + (Number(v) || 0) })
  })

  return [...clientes.values()].map((c) => medirCliente(c, reg))
}

function medirCliente(c, reg) {
  const lineas = [...c.lineas.values()].sort((a, b) => a.ref.localeCompare(b.ref) || a.color.localeCompare(b.color))
  // Lo facturado por referencia decide si lo vendido sin cubrir es "abierto".
  const factPorRef = {}
  lineas.forEach((l) => {
    const d = reg[l.id] || {}
    // Separado y facturado se registran por talla; el total se guarda
    // también, para las cuentas y para lo registrado antes sin tallas.
    // Si SYD trae separado o facturado de esta línea, eso manda. Se sigue la
    // regla del archivo de pendientes: separado vigente = separado −
    // facturado del mismo color (nunca negativo).
    const deSyd = !!(l.sydSep || l.sydFact)
    l.deSyd = deSyd
    if (deSyd) {
      l.factTallas = { ...(l.sydFact || {}) }
      l.sepTallas = { ...(l.sydSep || {}) }
      l.separado = Object.values(l.sepTallas).reduce((a, b) => a + b, 0)
      l.facturado = Object.values(l.factTallas).reduce((a, b) => a + b, 0)
    } else {
      l.sepTallas = d.sepTallas || {}
      l.factTallas = d.factTallas || {}
      l.separado = n0(d.separado)
      l.facturado = n0(d.facturado)
    }
    l.registro = d
    l.cerrada = !!((reg[idRef(l.ref)] || {}).cerrada)
    factPorRef[l.ref] = (factPorRef[l.ref] || 0) + l.facturado
  })
  let vendido = 0, facturado = 0, separadoVig = 0, cerrado = 0, abierto = 0, valorV = 0
  lineas.forEach((l) => {
    vendido += l.vendido; facturado += l.facturado; valorV += l.valor
    l.sepVig = Math.max(l.separado - l.facturado, 0)
    separadoVig += l.sepVig
    const noCubierto = Math.max(l.vendido - Math.max(l.separado, l.facturado), 0)
    l.cerradoNC = 0; l.abierto = 0
    if (l.cerrada && l.facturado === 0 && noCubierto > 0) { l.cerradoNC = noCubierto; cerrado += noCubierto }
    else if (!l.cerrada && !factPorRef[l.ref] && noCubierto > 0) { l.abierto = noCubierto; abierto += noCubierto }
    l.faltante = l.sepVig + l.abierto
    l.estado = l.cerrada ? 'cerrada'
      : l.facturado >= l.vendido && l.vendido > 0 ? 'facturado'
        : l.sepVig > 0 && !l.abierto ? 'separado'
          : l.abierto > 0 ? 'porSeparar' : ''
  })
  const pendiente = Math.max(vendido - facturado, 0)
  const faltante = separadoVig + abierto
  const precioEst = vendido ? valorV / vendido : 0
  const base = pendiente - cerrado
  const cubierto = base > 0 ? Math.min(1, separadoVig / base) : 1
  const nov = reg[idCliente(c.cliente)] || {}
  const novedad = nov.novedad || ''
  return {
    ...c, lineas, vendido, facturado, pendiente, separadoVig, cerrado, abierto, faltante,
    valorFalt: faltante * precioEst, cubierto, novedad, novedadNota: nov.nota || '', novedadReg: nov,
    refs: new Set(lineas.map((l) => l.ref)).size,
    decision: decisionDe({ novedad, pendiente, separadoVig, abierto, cubierto }),
  }
}

// Qué hacer con el cliente, y por qué, en una frase.
export function decisionDe({ novedad, pendiente, separadoVig, abierto, cubierto }) {
  if (novedad) return { key: 'no', label: 'No despachar', motivo: novedad.toLowerCase() }
  if (pendiente === 0) return { key: 'completo', label: 'Completo', motivo: 'todo facturado' }
  if (separadoVig === 0) return { key: 'esperar', label: 'Esperar', motivo: 'nada separado' }
  if (abierto === 0) return { key: 'despachar', label: 'Despachar', motivo: 'todo lo abierto está separado' }
  const pct = Math.round(cubierto * 100)
  if (cubierto >= UMBRAL_PARCIAL) return { key: 'parcial', label: 'Parcial', motivo: `${pct} % separado` }
  return { key: 'esperar', label: 'Esperar', motivo: `solo ${pct} % separado` }
}

export const FILTROS = [
  { key: 'todos', label: 'Todos', f: () => true },
  { key: 'despachar', label: 'Listos para despachar', f: (c) => c.decision.key === 'despachar' },
  { key: 'parcial', label: 'Parcial', f: (c) => c.decision.key === 'parcial' },
  { key: 'conSep', label: 'Con separado', f: (c) => c.separadoVig > 0 },
  { key: 'sinSep', label: 'Sin nada separado', f: (c) => c.separadoVig === 0 && c.pendiente > 0 },
  { key: 'novedad', label: 'No recibe más', f: (c) => !!c.novedad },
]

export function totales(lista) {
  const t = { vendido: 0, facturado: 0, pendiente: 0, separadoVig: 0, cerrado: 0, abierto: 0, faltante: 0, valorFalt: 0, listos: 0 }
  lista.forEach((c) => {
    Object.keys(t).forEach((k) => { if (k !== 'listos') t[k] += c[k] || 0 })
    if (c.decision.key === 'despachar') t.listos += 1
  })
  return t
}

export const sumaTallas = (t) => Object.values(t || {}).reduce((n, v) => n + (Number(v) || 0), 0)
export const marcaDe = (ref) => {
  const l = String(ref || '').trim().charAt(0).toUpperCase()
  return l === 'C' ? 'Casania' : l === 'M' ? 'Mariset' : 'Otra'
}
