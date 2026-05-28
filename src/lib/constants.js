// ---------- Etapas del flujo de producción ----------
// El orden refleja el recorrido de una prenda dentro del sistema.
export const STAGES = [
  { key: 'ordenCorte', label: 'Orden corte', hasDias: false },
  { key: 'trazo', label: 'Trazo', hasDias: true },
  { key: 'entregaCorte', label: 'Entrega corte', hasDias: true },
  { key: 'alistamiento', label: 'Alistamiento', hasDias: true },
  { key: 'envioEnsamble', label: 'Envío ensamble', hasDias: true, hasTaller: true },
  { key: 'entregaEnsamble', label: 'Entrega ensamble', hasDias: true },
  { key: 'revisado', label: 'Revisado', hasDias: true },
  { key: 'entradaBodega', label: 'Entrada bodega', hasDias: true },
]

// Áreas de trabajo. Cada orden cae en el área de su ÚLTIMA etapa cumplida:
//   base  = etapa ya cumplida que define el área (y desde cuya fecha se cuenta el atraso)
//   next  = etapa siguiente que aún NO se ha cumplido (lo pendiente)
// El atraso = días desde la fecha de `base` hasta hoy (en 'entrega' no aplica).
export const AREAS = {
  trazos: { label: 'Trazos', responsable: 'Marcela', base: 'ordenCorte', next: 'trazo' },
  corte: { label: 'Corte', responsable: 'Mónica', base: 'trazo', next: 'entregaCorte' },
  enviar: { label: 'Por enviar', responsable: '', base: 'entregaCorte', next: 'envioEnsamble' },
  talleres: { label: 'En talleres', responsable: '', base: 'envioEnsamble', next: 'entregaEnsamble' },
  entrega: { label: 'Entrega ensamble', responsable: '', base: 'entregaEnsamble', next: null },
}

export const ORIGENES = {
  premuestra: 'Premuestra',
  muestra: 'Muestra',
  produccion: 'Producción',
}

export const ORIGEN_ABBR = {
  premuestra: 'Pre',
  muestra: 'Mue',
  produccion: 'Pro',
}

// Acabado del top: prenda con top aparte incluido, o prenda forrada
// (p. ej. delanteros forrados, sin pieza suelta).
export const TOP_OPTIONS = [
  { v: '', l: 'Sin definir' },
  { v: 'top', l: 'Top incluido (prenda aparte)' },
  { v: 'forrada', l: 'Forrada' },
]
export const TOP_LABEL = { top: 'Top incluido', forrada: 'Forrada' }

// ---------- Catálogos editables (valores por defecto) ----------
export const DEFAULT_TIPOS = [
  'Blusa', 'Vestido', 'Pantalón', 'Conjunto', 'Falda', 'Short', 'Chaqueta', 'Enterizo',
]

export const DEFAULT_MARCAS = ['Mariset', 'Casania']

export const DEFAULT_TELAS = [
  'Crochet', 'Lino', 'Algodón', 'Punto', 'Chalís', 'Seda', 'Jean', 'Lycra',
]

export const DEFAULT_COLORS = [
  { name: 'Blanco', hex: '#ffffff' },
  { name: 'Negro', hex: '#1a1a1a' },
  { name: 'Gris', hex: '#9aa0a6' },
  { name: 'Beige', hex: '#d8c9af' },
  { name: 'Rojo', hex: '#c0392b' },
  { name: 'Vino', hex: '#6e1f2e' },
  { name: 'Rosado', hex: '#e8a0bf' },
  { name: 'Fucsia', hex: '#c2185b' },
  { name: 'Naranja', hex: '#e8762c' },
  { name: 'Amarillo', hex: '#f1c40f' },
  { name: 'Verde', hex: '#2e9e5b' },
  { name: 'Verde oliva', hex: '#6b7a3a' },
  { name: 'Azul claro', hex: '#7fb3d5' },
  { name: 'Azul', hex: '#2e6fb0' },
  { name: 'Azul marino', hex: '#1f2a44' },
  { name: 'Morado', hex: '#7d3c98' },
  { name: 'Café', hex: '#6b4423' },
  { name: 'Dorado', hex: '#c8a04a' },
  { name: 'Plateado', hex: '#c4c8cc' },
  { name: 'Estampado', hex: 'linear' },
]

// Banderas del resumen de producción: cada hito es '' (sin marcar), 'no', o
// 'si' con una fecha. Replicamos el "SI - dd/mm/aaaa" del Excel.
// Estados marcados a mano (Sí/No/—). NO incluye:
//  - "Costos": se calcula solo según el costo ingresado.
//  - "Medición"/"Repetición": se derivan de la bitácora de mediciones.
export const RESUMEN_FLAGS = [
  { key: 'muestras', label: 'Muestras' },
  { key: 'produccion', label: 'Producción' },
  { key: 'entrega', label: 'Entrega' },
]

export function capitalize(text) {
  const t = (text || '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

export function normRef(ref) {
  // El sistema a veces trae la referencia con la palabra "CONJUNTO" pegada
  // (ej. "MG-B872 CONJUNTO"); la quitamos para que coincida con la
  // referencia real (MG-B872) y se relacione con foto, resumen, etc.
  return (ref || '').toString().toUpperCase()
    .replace(/\bCONJUNTO\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatPrice(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}

export function formatDate(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d)) return typeof value === 'string' ? value : ''
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
