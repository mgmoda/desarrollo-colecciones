// Puente seguro con la API de Coordinadora (Suite Logística).
// Las credenciales viven SOLO en los secretos de Supabase:
//   COORDINADORA_KEY, COORDINADORA_SECRET, COORDINADORA_ENV ("test" | "prod").
// El navegador nunca las ve: llama a esta función con su sesión de Supabase y
// solo los correos autorizados pueden usarla.
const AUTORIZADOS = ['diego_monsalve87@hotmail.com']
const CUENTA = { nit: '901682300', idProceso: 46846, division: '01', tipoCuenta: 1, codigoPais: 170 }
// Remitente fijo (del reporte de guías 2026): siempre despacha MG Moda desde Bucaramanga.
const REMITENTE = { nombre: 'Mg Moda SAS', direccion: 'Calle 35 # 27-47 Piso 1', dane: '68001000', identificacion: '901682300', tipoDocumento: 31 }
const BASE = { test: 'https://api-test.coordinadora.tech', prod: 'https://api.coordinadora.tech' }

let tokenCache: { valor: string; vence: number } | null = null

function base() { return (Deno.env.get('COORDINADORA_ENV') || 'test') === 'prod' ? BASE.prod : BASE.test }

async function token(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.vence) return tokenCache.valor
  const key = Deno.env.get('COORDINADORA_KEY'), secret = Deno.env.get('COORDINADORA_SECRET')
  if (!key || !secret) throw new Error('Faltan los secretos COORDINADORA_KEY / COORDINADORA_SECRET en Supabase')
  const r = await fetch(`${base()}/oauth/token?grant_type=client_credentials`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${key}:${secret}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`Token ${r.status}: ${txt.slice(0, 300)}`)
  const j = JSON.parse(txt)
  const valor = j.access_token || j.acces_token
  if (!valor) throw new Error('La respuesta del token no trae access_token: ' + txt.slice(0, 200))
  tokenCache = { valor, vence: Date.now() + Math.max(60, (Number(j.expires_in) || 3599) - 120) * 1000 }
  return valor
}

async function api(ruta: string, body: unknown) {
  const t = await token()
  const r = await fetch(base() + ruta, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  let data: unknown = txt
  try { data = JSON.parse(txt) } catch { /* texto plano */ }
  return { ok: r.ok, status: r.status, data }
}

// Quién llama: se lee el correo del JWT de Supabase (verify_jwt ya validó la firma).
function correoDe(req: Request): string {
  const h = req.headers.get('Authorization') || ''
  const jwt = h.replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return String(payload.email || '').toLowerCase()
  } catch { return '' }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const correo = correoDe(req)
  if (!AUTORIZADOS.includes(correo)) return json({ error: 'No autorizado' }, 403)
  let cuerpo: any = {}
  try { cuerpo = await req.json() } catch { /* sin cuerpo */ }
  const accion = String(cuerpo.accion || '')
  try {
    switch (accion) {
      case 'ping': {
        // Solo comprueba que las credenciales sirven (pide un token).
        await token()
        return json({ ok: true, ambiente: base(), cuenta: { nit: CUENTA.nit, idProceso: CUENTA.idProceso, division: CUENTA.division } })
      }
      case 'cotizar': {
        // { destino (DANE 8 dígitos), valoracion, detalle:[{alto,ancho,largo,peso,unidades}] }
        const b = {
          nit: CUENTA.nit, div: CUENTA.division, cuenta: String(CUENTA.tipoCuenta), producto: '0',
          codigo_postal_origen: '', codigo_postal_destino: '',
          origen: String(cuerpo.origen || Deno.env.get('COORDINADORA_ORIGEN_DANE') || REMITENTE.dane), destino: String(cuerpo.destino || ''),
          valoracion: Number(cuerpo.valoracion) || 0, nivel_servicio: '',
          detalle: (cuerpo.detalle || []).map((d: any) => ({ ubl: '0', alto: String(d.alto), ancho: String(d.ancho), largo: String(d.largo), peso: String(d.peso), unidades: String(d.unidades || 1) })),
        }
        return json(await api('/cotizador/nacional', b))
      }
      case 'guia': {
        // El cuerpo ya viene armado por la app (remitente, destinatario, detalle…);
        // aquí solo se completan los datos de la cuenta, que no viajan al navegador.
        const g = cuerpo.guia || {}
        const b = {
          identificacion: CUENTA.nit, idProceso: CUENTA.idProceso, divisionCliente: CUENTA.division,
          codigoPais: CUENTA.codigoPais, tipoCuenta: CUENTA.tipoCuenta, tipoGuia: 1, fuente: 'integracion',
          usuario: correo, quienPagaEnvio: '1', nivelServicio: 1, tipoProducto: 4, tipoEnvioEspecial: false,
          ...g,
          datosRemitente: {
            identificacionRemitente: REMITENTE.identificacion, tipoDocumentoRemitente: REMITENTE.tipoDocumento,
            nombreRemitente: REMITENTE.nombre, direccionRemitente: REMITENTE.direccion, codigoCiudadRemitente: REMITENTE.dane,
            indicativoRemitente: '57', celularRemitente: Deno.env.get('COORDINADORA_REMITENTE_CEL') || '',
            correoRemitente: Deno.env.get('COORDINADORA_REMITENTE_CORREO') || correo,
            ...(g.datosRemitente || {}),
          },
        }
        const r = await api('/suite/guias', b)
        // El número de guía tiene 11 dígitos; se busca en la respuesta venga con el nombre que venga.
        const txt = JSON.stringify(r.data)
        const m = txt.match(/"(?:codigo_?remision|codigoRemision|guia|numero_?guia|numeroGuia|codigoGuia)"\s*:\s*"?(\d{11})"?/i) || txt.match(/\b(\d{11})\b/)
        return json({ enviado: b, guia: m ? m[1] : null, ...r })
      }
      case 'etiqueta': {
        // { guias: ['12345678901'] } → imagen base64
        return json(await api('/etiquetas/imprimir', { tipo_etiqueta: '55', guias: cuerpo.guias || [] }))
      }
      case 'recogida': {
        return json(await api('/recolecciones/solicitudes-recogidas', cuerpo.recogida || {}))
      }
      default:
        return json({ error: 'Acción desconocida: ' + accion }, 400)
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
