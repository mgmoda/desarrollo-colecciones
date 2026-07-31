import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { DOMINIO_INTERNO, correoDeUsuario } from '../lib/usuarios.js'

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: correoDeUsuario(usuario),
      password,
    })
    setBusy(false)
    if (err) setError('Usuario o contraseña incorrectos.')
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark">MG</div>
        <h1 className="login-title">Desarrollo de Colecciones</h1>
        <p className="login-sub">Inicia sesión para continuar</p>

        <div className="field">
          <label className="field-label">Usuario</label>
          <input
            className="input"
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="marcela"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoFocus
          />
          <p className="field-hint">
            Solo tu usuario. Si entras con correo, escríbelo completo.
          </p>
        </div>
        <div className="field">
          <label className="field-label">Contraseña</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <p className="field-error">{error}</p>}

        <button
          className="btn btn-primary btn-block"
          type="submit"
          disabled={busy}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
