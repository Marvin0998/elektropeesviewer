'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function SharePage() {
  const params = useParams()
  const token  = params.token

  const [project, setProject] = useState(null)
  const [photos, setPhotos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shareLabel, setShareLabel] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // 1. Token in share_links suchen
      const { data: link, error: linkErr } = await supabase
        .from('share_links')
        .select('project_id, label')
        .eq('token', token)
        .single()

      if (linkErr || !link) { setNotFound(true); setLoading(false); return }

      // 2. Projekt laden
      const { data: proj } = await supabase
        .from('projects')
        .select('*')
        .eq('id', link.project_id)
        .single()

      if (!proj) { setNotFound(true); setLoading(false); return }
      setProject(proj)
      setShareLabel(link?.label || '')

      // 3. Fotos laden
      const { data: photoList } = await supabase
        .from('photos')
        .select('*')
        .eq('project_id', link.project_id)
        .order('created_at')

      // 4. Annotations + Notes pro Foto
      const photosWithData = await Promise.all((photoList || []).map(async ph => {
        const [{ data: anns }, { data: nts }] = await Promise.all([
          supabase.from('annotations').select('*').eq('photo_id', ph.id),
          supabase.from('notes').select('*').eq('photo_id', ph.id)
        ])
        return { ...ph, annotations: anns || [], notes: nts || [] }
      }))

      setPhotos(photosWithData)
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)' }}>
      <div className="spinner" />
    </div>
  )

  if (notFound) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', color:'var(--text)' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
      <h1 style={{ fontSize:24, fontWeight:700, marginBottom:8 }}>Link ungültig</h1>
      <p style={{ color:'var(--text-muted)' }}>Dieser Link existiert nicht oder ist abgelaufen.</p>
    </div>
  )

  return (
    <>
      <nav className="navbar">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" alt="Elektro Pees" style={{ height:36, width:'auto' }} />
          <div style={{ lineHeight:1.2 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>360° Viewer</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>by Elektro Pees</div>
          </div>
        </div>
        <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', color:'#22c55e', padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:500 }}>
          👁 Nur-Lesen Ansicht
        </div>
      </nav>

      <main className="page">
        {/* Willkommens-Header */}
        <div style={{ marginBottom:40, padding:'28px 32px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, borderLeft:'4px solid var(--accent)' }}>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Willkommen</div>
          <h1 style={{ fontSize:26, fontWeight:700, marginBottom:6 }}>
            {shareLabel || 'Ihr Projekt'}
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
            <span style={{ fontSize:14, color:'var(--text-muted)' }}>📁</span>
            <span style={{ fontSize:15, fontWeight:600 }}>{project.name}</span>
            {project.description && <span style={{ fontSize:13, color:'var(--text-muted)' }}>· {project.description}</span>}
          </div>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:10 }}>{photos.length} {photos.length===1?'Foto':'Fotos'} · Bereitgestellt von Elektro Pees</p>
        </div>

        {photos.length === 0 ? (
          <div className="empty-state"><div className="empty-state-icon">🖼️</div><h3>Keine Fotos</h3></div>
        ) : (
          <div className="photo-grid">
            {photos.map(photo => (
              <Link key={photo.id} href={`/share/${token}/viewer/${photo.id}`} className="photo-card">
                <img src={photo.public_url} alt={photo.name} className="photo-thumbnail"
                  onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                <div className="photo-thumb-placeholder" style={{ display:'none' }}>🖼️</div>
                <div className="photo-card-body">
                  <div className="photo-card-name">🌐 {photo.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4, display:'flex', gap:10 }}>
                    {photo.annotations?.length > 0 && <span>✏️ {photo.annotations.length} Markierungen</span>}
                    {photo.notes?.length > 0 && <span>📌 {photo.notes.length} Pins</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div style={{ marginTop:60, textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
          <img src="/logo.png" alt="Elektro Pees" style={{ height:28, opacity:0.5, marginBottom:8 }} />
          <p>Diese Ansicht wurde von Elektro Pees geteilt.</p>
        </div>
      </main>
    </>
  )
}
