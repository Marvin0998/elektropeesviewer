// app/auth/page.js
// Login & Registrierung

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode]         = useState('login')   // 'login' oder 'register'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const supabase = createClient()

    if (mode === 'register') {
      // Neues Konto erstellen
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Konto erstellt! Bitte bestätige deine E-Mail-Adresse und melde dich an.')
        setMode('login')
      }
    } else {
      // Einloggen
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('E-Mail oder Passwort falsch. Bitte prüfen.')
      } else {
        router.push('/dashboard')
      }
    }

    setLoading(false)
  }

  return (
    <div className="page-narrow">
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🌐</div>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>360° Viewer</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Verwalte deine 360°-Fotos
        </p>
      </div>

      <div className="card">
        {/* Tab-Auswahl */}
        <div style={{ display: 'flex', marginBottom: 24, gap: 8 }}>
          <button
            className="btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              background: mode === 'login' ? 'var(--accent)' : 'transparent',
              color: mode === 'login' ? 'white' : 'var(--text-muted)',
              border: '1px solid var(--border)'
            }}
            onClick={() => { setMode('login'); setError(''); setSuccess('') }}
          >
            Anmelden
          </button>
          <button
            className="btn"
            style={{
              flex: 1,
              justifyContent: 'center',
              background: mode === 'register' ? 'var(--accent)' : 'transparent',
              color: mode === 'register' ? 'white' : 'var(--text-muted)',
              border: '1px solid var(--border)'
            }}
            onClick={() => { setMode('register'); setError(''); setSuccess('') }}
          >
            Registrieren
          </button>
        </div>

        {/* Fehlermeldungen */}
        {error   && <div className="error-msg"   style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="success-msg" style={{ marginBottom: 16 }}>{success}</div>}

        {/* Formular */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">E-Mail-Adresse</label>
            <input
              type="email"
              className="input"
              placeholder="deine@email.de"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Passwort</label>
            <input
              type="password"
              className="input"
              placeholder={mode === 'register' ? 'Mindestens 6 Zeichen' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? 'Bitte warten...' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
