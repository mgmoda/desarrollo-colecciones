// Los empleados entran con usuario y contraseña, sin correo. Supabase Auth
// necesita un correo, así que se le arma uno interno a partir del usuario:
// "marcela" -> "marcela@mgmoda.local". Nunca sale a la vista.
//
// Quien ya tenga una cuenta con correo real lo escribe completo y se respeta.
export const DOMINIO_INTERNO = 'mgmoda.local'

export function correoDeUsuario(entrada) {
  const v = String(entrada || '').trim().toLowerCase()
  if (!v) return ''
  return v.includes('@') ? v : `${v}@${DOMINIO_INTERNO}`
}

// Cómo mostrar a quien tiene la sesión abierta: el usuario, sin el dominio
// interno; si entró con correo real, el correo tal cual.
export function nombreDeSesion(user) {
  const email = (user && user.email) || ''
  if (!email) return ''
  return email.endsWith(`@${DOMINIO_INTERNO}`) ? email.split('@')[0] : email
}
