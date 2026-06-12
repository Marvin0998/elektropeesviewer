// app/dashboard/page.js
// Dashboard mit Teilen-Funktion

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

  // Teilen
  const [shareModal, setShareModal]   = useState(null)  // projekt
  const [shareLinks, setShareLinks]   = useState([])
  const [shareLabel, setShareLabel]   = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [copiedToken, setCopiedToken] = useState(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      await loadProjects(supabase)
      setLoading(false)
    }
    load()
  }, [router])

  async function loadProjects(supabase) {
    if (!supabase) supabase = createClient()
    const { data } = await supabase.from('projects').select('id, name, description, created_at').order('created_at', { ascending: false })
    setProjects(data || [])
  }

  async function createProject(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.from('projects').insert({ name: newName.trim(), description: newDesc.trim(), user_id: user.id })
    if (error) { setError('Fehler beim Erstellen.') } else { setNewName(''); setNewDesc(''); setShowModal(false); await loadProjects() }
    setSaving(false)
  }

  async function deleteProject(id) {
    if (!confirm('Projekt und alle Fotos löschen?')) return
    await createClient().from('projects').delete().eq('id', id)
    await loadProjects()
  }

  // ---- Teilen ----
  async function openShare(project) {
    setShareModal(project)
    setShareLabel('')
    setShareLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('share_links').select('*').eq('project_id', project.id).order('created_at', { ascending: false })
    setShareLinks(data || [])
    setShareLoading(false)
  }

  async function createShareLink(e) {
    e.preventDefault()
    if (!shareModal) return
    const supabase = createClient()
    await supabase.from('share_links').insert({ project_id: shareModal.id, user_id: user.id, label: shareLabel.trim() || 'Teilen-Link' })
    const { data } = await supabase.from('share_links').select('*').eq('project_id', shareModal.id).order('created_at', { ascending: false })
    setShareLinks(data || [])
    setShareLabel('')
  }

  async function deleteShareLink(id) {
    if (!confirm('Link löschen? Der Kunde kann dann nicht mehr zugreifen.')) return
    await createClient().from('share_links').delete().eq('id', id)
    const { data } = await createClient().from('share_links').select('*').eq('project_id', shareModal.id).order('created_at', { ascending: false })
    setShareLinks(data || [])
  }

  function copyLink(token) {
    const url = `${window.location.origin}/share/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  if (loading) return <><Navbar /><div className="spinner" /></>

  return (
    <>
      <Navbar userEmail={user?.email} />
      <main className="page">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32 }}>
          <div>
            <h1 style={{ fontSize:28, fontWeight:700 }}>Meine Projekte</h1>
            <p style={{ color:'var(--text-muted)', marginTop:4 }}>{projects.length} {projects.length===1?'Projekt':'Projekte'}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Neues Projekt</button>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <h3>Noch keine Projekte</h3>
            <p>Erstelle dein erstes Projekt</p>
            <button className="btn btn-primary" style={{ marginTop:20 }} onClick={() => setShowModal(true)}>Erstes Projekt erstellen</button>
          </div>
        ) : (
          <div className="grid">
            {projects.map(project => (
              <div key={project.id} className="card" style={{ position:'relative' }}>
                <Link href={`/project/${project.id}`} style={{ textDecoration:'none', color:'inherit', display:'block', marginBottom:16 }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>📁</div>
                  <h2 style={{ fontSize:18, fontWeight:600, marginBottom:6 }}>{project.name}</h2>
                  {project.description && <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:8 }}>{project.description}</p>}
                  <p style={{ fontSize:12, color:'var(--text-muted)' }}>Erstellt: {new Date(project.created_at).toLocaleDateString('de-DE')}</p>
                </Link>

                {/* Aktions-Buttons */}
                <div style={{ display:'flex', gap:8, borderTop:'1px solid var(--border)', paddingTop:12, marginTop:4 }}>
                  <button className="btn btn-outline" style={{ flex:1, justifyContent:'center', fontSize:12, padding:'6px 8px' }}
                    onClick={() => openShare(project)}>
                    🔗 Teilen
                  </button>
                  <button className="btn btn-danger" style={{ fontSize:12, padding:'6px 10px' }}
                    onClick={() => deleteProject(project.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Neues Projekt Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Neues Projekt erstellen</h2>
            {error && <div className="error-msg" style={{ marginBottom:16 }}>{error}</div>}
            <form onSubmit={createProject}>
              <div className="form-group">
                <label className="label">Projektname *</label>
                <input className="input" placeholder="z.B. Wohnung Musterstraße" value={newName} onChange={e=>setNewName(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label className="label">Beschreibung (optional)</label>
                <textarea className="input" placeholder="Kurze Notiz..." value={newDesc} onChange={e=>setNewDesc(e.target.value)} rows={3} />
              </div>
              <div className="form-row">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Erstelle...':'Erstellen'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Teilen Modal */}
      {shareModal && (
        <div className="modal-overlay" onClick={() => setShareModal(null)}>
          <div className="modal" style={{ maxWidth:520 }} onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">🔗 Projekt teilen: {shareModal.name}</h2>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20 }}>
              Kunden bekommen einen Link und können das Projekt <strong>nur ansehen</strong> — kein Login, kein Bearbeiten.
            </p>

            {/* Neuen Link erstellen */}
            <form onSubmit={createShareLink} style={{ display:'flex', gap:8, marginBottom:20 }}>
              <input className="input" placeholder="Bezeichnung (z.B. Kunde Müller)" value={shareLabel} onChange={e=>setShareLabel(e.target.value)} style={{ flex:1 }} />
              <button type="submit" className="btn btn-primary" style={{ whiteSpace:'nowrap' }}>+ Link erstellen</button>
            </form>

            {/* Bestehende Links */}
            {shareLoading ? (
              <div className="spinner" style={{ margin:'20px auto' }} />
            ) : shareLinks.length === 0 ? (
              <div style={{ textAlign:'center', color:'var(--text-muted)', padding:'20px 0', fontSize:13 }}>
                Noch keine Links erstellt.
              </div>
            ) : (
              <div>
                {shareLinks.map(link => (
                  <div key={link.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg3)', borderRadius:8, marginBottom:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500 }}>{link.label || 'Teilen-Link'}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {window.location.origin}/share/{link.token}
                      </div>
                    </div>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize:12, padding:'5px 10px', whiteSpace:'nowrap', flexShrink:0 }}
                      onClick={() => copyLink(link.token)}
                    >
                      {copiedToken === link.token ? '✓ Kopiert!' : '📋 Kopieren'}
                    </button>
                    <button onClick={() => deleteShareLink(link.id)}
                      style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:16, flexShrink:0 }}>🗑</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop:20, textAlign:'right' }}>
              <button className="btn btn-outline" onClick={() => setShareModal(null)}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
