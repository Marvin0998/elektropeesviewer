// app/dashboard/page.js
// Dashboard: Alle Projekte auf einen Blick

'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser]           = useState(null)
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName]     = useState('')
  const [newDesc, setNewDesc]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Beim Laden: User & Projekte holen
  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Benutzer prüfen
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)

      // Projekte laden
      await loadProjects(supabase)
      setLoading(false)
    }
    load()
  }, [router])

  async function loadProjects(supabase) {
    if (!supabase) supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false })
    setProjects(data || [])
  }

  // Neues Projekt erstellen
  async function createProject(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase
      .from('projects')
      .insert({ name: newName.trim(), description: newDesc.trim(), user_id: user.id })

    if (error) {
      setError('Fehler beim Erstellen. Bitte nochmal versuchen.')
    } else {
      setNewName('')
      setNewDesc('')
      setShowModal(false)
      await loadProjects()
    }
    setSaving(false)
  }

  // Projekt löschen
  async function deleteProject(id) {
    if (!confirm('Projekt und alle Fotos löschen? Das kann nicht rückgängig gemacht werden.')) return
    const supabase = createClient()
    await supabase.from('projects').delete().eq('id', id)
    await loadProjects()
  }

  if (loading) return (
    <><Navbar /><div className="spinner" /></>
  )

  return (
    <>
      <Navbar userEmail={user?.email} />

      <main className="page">
        {/* Kopfzeile */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700 }}>Meine Projekte</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
              {projects.length} {projects.length === 1 ? 'Projekt' : 'Projekte'}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Neues Projekt
          </button>
        </div>

        {/* Projektliste oder leerer Zustand */}
        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <h3>Noch keine Projekte</h3>
            <p>Erstelle dein erstes Projekt, um 360°-Fotos hinzuzufügen.</p>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowModal(true)}>
              Erstes Projekt erstellen
            </button>
          </div>
        ) : (
          <div className="grid">
            {projects.map(project => (
              <div key={project.id} className="card" style={{ position: 'relative' }}>
                <Link href={`/project/${project.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  {/* Projekt-Icon */}
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
                  <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{project.name}</h2>
                  {project.description && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                      {project.description}
                    </p>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Erstellt: {new Date(project.created_at).toLocaleDateString('de-DE')}
                  </p>
                </Link>

                {/* Löschen-Button */}
                <button
                  className="btn btn-danger"
                  style={{ position: 'absolute', top: 16, right: 16, fontSize: 12, padding: '5px 10px' }}
                  onClick={() => deleteProject(project.id)}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Neues Projekt */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Neues Projekt erstellen</h2>

            {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

            <form onSubmit={createProject}>
              <div className="form-group">
                <label className="label">Projektname *</label>
                <input
                  className="input"
                  placeholder="z.B. Wohnung Musterstraße"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="label">Beschreibung (optional)</label>
                <textarea
                  className="input"
                  placeholder="Kurze Notiz zum Projekt..."
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Abbrechen
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Wird erstellt...' : 'Erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
