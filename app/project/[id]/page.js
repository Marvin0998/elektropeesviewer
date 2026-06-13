// app/project/[id]/page.js
// Projektseite: Fotos anzeigen & hochladen (Multi-Upload)

'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const id     = params.id

  const [user, setUser]       = useState(null)
  const [project, setProject] = useState(null)
  const [photos, setPhotos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [dragover, setDragover] = useState(false)

  // Multi-Upload State
  const [uploadQueue, setUploadQueue]   = useState([])  // { file, name, status, progress }
  const [isUploading, setIsUploading]   = useState(false)

  const fileInputRef = useRef()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
      if (!proj) { router.push('/dashboard'); return }
      setProject(proj)
      await loadPhotos(supabase)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function loadPhotos(supabase) {
    if (!supabase) supabase = createClient()
    const { data } = await supabase.from('photos').select('*').eq('project_id', id).order('created_at', { ascending: false })
    setPhotos(data || [])
  }

  // Dateien zur Queue hinzufügen
  function addFiles(files) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) { setError('Bitte nur Bilddateien (JPG, PNG)'); return }
    setError('')
    const newItems = imageFiles.map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      name: file.name.replace(/\.[^.]+$/, ''),
      status: 'waiting',   // waiting | uploading | done | error
      progress: 0
    }))
    setUploadQueue(prev => [...prev, ...newItems])
  }

  // Alle Dateien in der Queue hochladen
  async function startUpload() {
    if (isUploading) return
    setIsUploading(true)
    const supabase = createClient()

    setUploadQueue(prev => prev.map(item =>
      item.status === 'waiting' ? { ...item, status: 'uploading' } : item
    ))

    for (const item of uploadQueue.filter(i => i.status === 'waiting' || i.status === 'uploading')) {
      try {
        // Status: uploading
        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i))

        const fileName = `${user.id}/${Date.now()}-${item.file.name.replace(/\s/g, '_')}`

        // Upload
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, item.file)

        if (uploadError) throw uploadError

        // Fortschritt simulieren
        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, progress: 70 } : i))

        // Public URL
        const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)

        // In DB speichern
        await supabase.from('photos').insert({
          project_id: id,
          user_id: user.id,
          name: item.name,
          storage_path: fileName,
          public_url: publicUrl
        })

        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', progress: 100 } : i))

      } catch (err) {
        setUploadQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', progress: 0 } : i))
      }
    }

    await loadPhotos()
    setIsUploading(false)
  }

  // Queue leeren (nur fertige/fehlerhafte)
  function clearDone() {
    setUploadQueue(prev => prev.filter(i => i.status === 'waiting'))
  }

  async function deletePhoto(photo) {
    if (!confirm(`"${photo.name}" löschen?`)) return
    const supabase = createClient()
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photo.id)
    await loadPhotos()
  }

  if (loading) return <><Navbar /><div className="spinner" /></>

  const waitingCount = uploadQueue.filter(i => i.status === 'waiting').length
  const doneCount    = uploadQueue.filter(i => i.status === 'done').length
  const hasQueue     = uploadQueue.length > 0

  return (
    <>
      <Navbar userEmail={user?.email} />
      <main className="page">

        {/* Breadcrumb + Titel */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/dashboard" style={{ color:'var(--text-muted)', textDecoration:'none', fontSize:14 }}>← Alle Projekte</Link>
          <h1 style={{ fontSize:28, fontWeight:700, marginTop:8 }}>📁 {project.name}</h1>
          {project.description && <p style={{ color:'var(--text-muted)', marginTop:4 }}>{project.description}</p>}
        </div>

        {error && <div className="error-msg" style={{ marginBottom:20 }}>{error}</div>}

        {/* Upload-Bereich */}
        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          style={{ marginBottom: hasQueue ? 0 : 32, borderRadius: hasQueue ? '10px 10px 0 0' : 10 }}
          onClick={() => fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={e => { e.preventDefault(); setDragover(false); addFiles(e.dataTransfer.files) }}
        >
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e => addFiles(e.target.files)} />
          <div style={{ fontSize:36, marginBottom:12 }}>📷</div>
          <div style={{ fontWeight:500, marginBottom:4 }}>360°-Fotos hier ablegen</div>
          <div style={{ fontSize:13 }}>Mehrere Fotos gleichzeitig möglich · JPG, PNG</div>
        </div>

        {/* Upload-Queue */}
        {hasQueue && (
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 10px 10px', marginBottom:32, overflow:'hidden' }}>

            {/* Queue-Header */}
            <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:500 }}>
                {isUploading ? `⏳ Wird hochgeladen...` : `${uploadQueue.length} Foto${uploadQueue.length===1?'':'s'} bereit`}
              </span>
              <div style={{ display:'flex', gap:8 }}>
                {doneCount > 0 && !isUploading && (
                  <button className="btn btn-outline" style={{ fontSize:12, padding:'5px 12px' }} onClick={clearDone}>
                    ✓ Erledigte entfernen
                  </button>
                )}
                {waitingCount > 0 && !isUploading && (
                  <button className="btn btn-primary" style={{ fontSize:12, padding:'5px 14px' }} onClick={startUpload}>
                    ↑ {waitingCount} Foto{waitingCount===1?'':'s'} hochladen
                  </button>
                )}
              </div>
            </div>

            {/* Dateiliste */}
            <div style={{ maxHeight:280, overflowY:'auto' }}>
              {uploadQueue.map(item => (
                <div key={item.id} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'10px 20px', borderBottom:'1px solid var(--border)',
                  background: item.status==='done' ? 'rgba(34,197,94,0.05)' : item.status==='error' ? 'rgba(239,68,68,0.05)' : 'transparent'
                }}>
                  {/* Status-Icon */}
                  <div style={{ fontSize:18, flexShrink:0 }}>
                    {item.status==='waiting'   && '⏸'}
                    {item.status==='uploading' && '⏳'}
                    {item.status==='done'      && '✅'}
                    {item.status==='error'     && '❌'}
                  </div>

                  {/* Name + Fortschritt */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {item.name}
                    </div>
                    {item.status==='uploading' && (
                      <div className="progress-bar" style={{ marginTop:4 }}>
                        <div className="progress-fill" style={{ width: item.progress+'%' }} />
                      </div>
                    )}
                    {item.status==='done'  && <div style={{ fontSize:11, color:'var(--success)', marginTop:2 }}>Hochgeladen</div>}
                    {item.status==='error' && <div style={{ fontSize:11, color:'var(--danger)', marginTop:2 }}>Fehler beim Hochladen</div>}
                  </div>

                  {/* Dateigröße */}
                  <div style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                  </div>

                  {/* Entfernen (nur wenn nicht am Hochladen) */}
                  {item.status !== 'uploading' && (
                    <button onClick={() => setUploadQueue(prev => prev.filter(i => i.id !== item.id))}
                      style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:16, flexShrink:0 }}>×</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fotos-Überschrift */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>Fotos ({photos.length})</h2>
        </div>

        {/* Foto-Karten */}
        {photos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🖼️</div>
            <h3>Noch keine Fotos</h3>
            <p>Lade dein erstes 360°-Foto hoch!</p>
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map(photo => (
              <div key={photo.id} style={{ position:'relative' }}>
                <Link href={`/viewer/${photo.id}`} className="photo-card">
                  <img src={photo.public_url} alt={photo.name} className="photo-thumbnail"
                    onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                  <div className="photo-thumb-placeholder" style={{ display:'none' }}>🖼️</div>
                  <div className="photo-card-body">
                    <div className="photo-card-name">🌐 {photo.name}</div>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
                      {new Date(photo.created_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                </Link>
                <button className="btn btn-danger"
                  style={{ position:'absolute', top:8, right:8, fontSize:12, padding:'4px 8px' }}
                  onClick={() => deletePhoto(photo)}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
