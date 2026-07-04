'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id

  const [user, setUser]       = useState(null)
  const [project, setProject] = useState(null)
  const [photos, setPhotos]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [dragover, setDragover] = useState(false)
  const [uploadQueue, setUploadQueue] = useState([])
  const [isUploading, setIsUploading] = useState(false)

  // Drag-to-sort state
  const [sortMode, setSortMode]       = useState(false)
  const [dragSortIdx, setDragSortIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [saving, setSaving]           = useState(false)

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
    const { data } = await supabase
      .from('photos').select('*').eq('project_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setPhotos(data || [])
  }

  // ---- Upload ----
  function addFiles(files) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) { setError('Bitte nur Bilddateien (JPG, PNG)'); return }
    setError('')
    const newItems = imageFiles.map(file => ({
      id: Math.random().toString(36).slice(2),
      file, name: file.name.replace(/\.[^.]+$/, ''),
      status: 'waiting', progress: 0
    }))
    setUploadQueue(prev => [...prev, ...newItems])
  }

  async function startUpload() {
    if (isUploading) return
    setIsUploading(true)
    const supabase = createClient()
    const waiting = uploadQueue.filter(i => i.status === 'waiting')
    setUploadQueue(prev => prev.map(i => i.status==='waiting' ? {...i, status:'uploading'} : i))

    for (const item of waiting) {
      try {
        setUploadQueue(prev => prev.map(i => i.id===item.id ? {...i,status:'uploading',progress:10} : i))
        const fileName = `${user.id}/${Date.now()}-${item.file.name.replace(/\s/g,'_')}`
        const { error: uploadError } = await supabase.storage.from('photos').upload(fileName, item.file)
        if (uploadError) throw uploadError
        setUploadQueue(prev => prev.map(i => i.id===item.id ? {...i,progress:80} : i))
        const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName)
        const maxOrder = photos.reduce((m,p) => Math.max(m, p.sort_order||0), 0)
        await supabase.from('photos').insert({
          project_id: id, user_id: user.id,
          name: item.name, storage_path: fileName,
          public_url: publicUrl, sort_order: maxOrder + 1
        })
        setUploadQueue(prev => prev.map(i => i.id===item.id ? {...i,status:'done',progress:100} : i))
      } catch {
        setUploadQueue(prev => prev.map(i => i.id===item.id ? {...i,status:'error',progress:0} : i))
      }
    }
    await loadPhotos()
    setIsUploading(false)
  }

  // ---- Drag-to-Sort ----
  function onDragStart(e, idx) {
    setDragSortIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, idx) {
    e.preventDefault()
    setDragOverIdx(idx)
  }
  function onDragEnd() {
    if (dragSortIdx === null || dragOverIdx === null || dragSortIdx === dragOverIdx) {
      setDragSortIdx(null); setDragOverIdx(null); return
    }
    const reordered = [...photos]
    const [moved] = reordered.splice(dragSortIdx, 1)
    reordered.splice(dragOverIdx, 0, moved)
    setPhotos(reordered)
    setDragSortIdx(null); setDragOverIdx(null)
  }

  async function saveOrder() {
    setSaving(true)
    const supabase = createClient()
    await Promise.all(photos.map((photo, idx) =>
      supabase.from('photos').update({ sort_order: idx + 1 }).eq('id', photo.id)
    ))
    setSaving(false)
    setSortMode(false)
  }

  async function deletePhoto(photo) {
    if (!confirm(`"${photo.name}" löschen?`)) return
    const supabase = createClient()
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photo.id)
    await loadPhotos()
  }

  if (loading) return <><Navbar /><div className="spinner" /></>

  const waitingCount = uploadQueue.filter(i => i.status==='waiting').length
  const doneCount    = uploadQueue.filter(i => i.status==='done').length
  const hasQueue     = uploadQueue.length > 0

  return (
    <>
      <Navbar userEmail={user?.email} />
      <main className="page">

        {/* Header */}
        <div style={{ marginBottom:32 }}>
          <Link href="/dashboard" style={{ color:'var(--text-muted)', textDecoration:'none', fontSize:14 }}>← Alle Projekte</Link>
          <h1 style={{ fontSize:28, fontWeight:700, marginTop:8 }}>📁 {project.name}</h1>
          {project.description && <p style={{ color:'var(--text-muted)', marginTop:4 }}>{project.description}</p>}
        </div>

        {error && <div className="error-msg" style={{ marginBottom:20 }}>{error}</div>}

        {/* Upload-Zone */}
        {!sortMode && (
          <>
            <div
              className={`upload-zone ${dragover?'dragover':''}`}
              style={{ marginBottom: hasQueue ? 0 : 32, borderRadius: hasQueue ? '10px 10px 0 0' : 10 }}
              onClick={() => fileInputRef.current.click()}
              onDragOver={e=>{e.preventDefault();setDragover(true)}}
              onDragLeave={()=>setDragover(false)}
              onDrop={e=>{e.preventDefault();setDragover(false);addFiles(e.dataTransfer.files)}}
            >
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={e=>addFiles(e.target.files)}/>
              <div style={{ fontSize:36, marginBottom:12 }}>📷</div>
              <div style={{ fontWeight:500, marginBottom:4 }}>360°-Fotos hier ablegen</div>
              <div style={{ fontSize:13 }}>Mehrere Fotos gleichzeitig möglich · JPG, PNG</div>
            </div>

            {hasQueue && (
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 10px 10px', marginBottom:32, overflow:'hidden' }}>
                <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>
                    {isUploading ? '⏳ Wird hochgeladen...' : `${uploadQueue.length} Foto${uploadQueue.length===1?'':'s'} bereit`}
                  </span>
                  <div style={{ display:'flex', gap:8 }}>
                    {doneCount>0&&!isUploading&&<button className="btn btn-outline" style={{ fontSize:12, padding:'5px 12px' }} onClick={()=>setUploadQueue(p=>p.filter(i=>i.status==='waiting'))}>✓ Erledigte entfernen</button>}
                    {waitingCount>0&&!isUploading&&<button className="btn btn-primary" style={{ fontSize:12, padding:'5px 14px' }} onClick={startUpload}>↑ {waitingCount} Foto{waitingCount===1?'':'s'} hochladen</button>}
                  </div>
                </div>
                <div style={{ maxHeight:280, overflowY:'auto' }}>
                  {uploadQueue.map(item=>(
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px', borderBottom:'1px solid var(--border)', background:item.status==='done'?'rgba(34,197,94,0.05)':item.status==='error'?'rgba(239,68,68,0.05)':'transparent' }}>
                      <div style={{ fontSize:18, flexShrink:0 }}>{item.status==='waiting'?'⏸':item.status==='uploading'?'⏳':item.status==='done'?'✅':'❌'}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                        {item.status==='uploading'&&<div className="progress-bar" style={{ marginTop:4 }}><div className="progress-fill" style={{ width:item.progress+'%' }}/></div>}
                        {item.status==='done'&&<div style={{ fontSize:11, color:'var(--success)', marginTop:2 }}>Hochgeladen</div>}
                        {item.status==='error'&&<div style={{ fontSize:11, color:'var(--danger)', marginTop:2 }}>Fehler</div>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>{(item.file.size/1024/1024).toFixed(1)} MB</div>
                      {item.status!=='uploading'&&<button onClick={()=>setUploadQueue(p=>p.filter(i=>i.id!==item.id))} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:16, flexShrink:0 }}>×</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Fotos-Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ fontSize:18, fontWeight:600 }}>Fotos ({photos.length})</h2>
          <div style={{ display:'flex', gap:8 }}>
            {!sortMode && photos.length > 1 && (
              <button className="btn btn-outline" style={{ fontSize:13 }} onClick={()=>setSortMode(true)}>
                ⇅ Reihenfolge ändern
              </button>
            )}
            {sortMode && (
              <>
                <button className="btn btn-outline" style={{ fontSize:13 }} onClick={()=>{setSortMode(false);loadPhotos()}}>
                  Abbrechen
                </button>
                <button className="btn btn-primary" style={{ fontSize:13 }} onClick={saveOrder} disabled={saving}>
                  {saving ? 'Speichern...' : '✓ Reihenfolge speichern'}
                </button>
              </>
            )}
          </div>
        </div>

        {sortMode && (
          <div style={{ background:'rgba(79,110,247,0.08)', border:'1px solid rgba(79,110,247,0.3)', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:'var(--text-muted)' }}>
            ↕ Fotos per Drag & Drop in die gewünschte Reihenfolge ziehen, dann <strong>Reihenfolge speichern</strong> klicken.
          </div>
        )}

        {/* Foto-Grid */}
        {photos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🖼️</div>
            <h3>Noch keine Fotos</h3>
            <p>Lade dein erstes 360°-Foto hoch!</p>
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map((photo, idx) => (
              <div
                key={photo.id}
                style={{
                  position: 'relative',
                  opacity: dragSortIdx===idx ? 0.4 : 1,
                  transform: dragOverIdx===idx&&dragSortIdx!==idx ? 'scale(1.03)' : 'scale(1)',
                  transition: 'transform 0.15s, opacity 0.15s',
                  cursor: sortMode ? 'grab' : 'default'
                }}
                draggable={sortMode}
                onDragStart={sortMode ? e=>onDragStart(e,idx) : undefined}
                onDragOver={sortMode ? e=>onDragOver(e,idx) : undefined}
                onDragEnd={sortMode ? onDragEnd : undefined}
              >
                {/* Nummer-Badge im Sort-Modus */}
                {sortMode && (
                  <div style={{
                    position:'absolute', top:8, left:8, zIndex:10,
                    background:'var(--accent)', color:'white',
                    width:26, height:26, borderRadius:'50%',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight:700, boxShadow:'0 2px 6px rgba(0,0,0,0.4)'
                  }}>{idx+1}</div>
                )}

                {/* Drag-Handle im Sort-Modus */}
                {sortMode && (
                  <div style={{
                    position:'absolute', top:8, right:8, zIndex:10,
                    background:'rgba(0,0,0,0.6)', color:'white',
                    padding:'4px 8px', borderRadius:6, fontSize:16
                  }}>⠿</div>
                )}

                {sortMode ? (
                  // Im Sort-Modus: nicht klickbar
                  <div className="photo-card" style={{ cursor:'grab', textDecoration:'none', display:'block' }}>
                    <img src={photo.public_url} alt={photo.name} className="photo-thumbnail"
                      onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}}/>
                    <div className="photo-thumb-placeholder" style={{ display:'none' }}>🖼️</div>
                    <div className="photo-card-body">
                      <div className="photo-card-name">🌐 {photo.name}</div>
                    </div>
                  </div>
                ) : (
                  <Link href={`/viewer/${photo.id}`} className="photo-card">
                    <img src={photo.public_url} alt={photo.name} className="photo-thumbnail"
                      onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex'}}/>
                    <div className="photo-thumb-placeholder" style={{ display:'none' }}>🖼️</div>
                    <div className="photo-card-body">
                      <div className="photo-card-name">🌐 {photo.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
                        {new Date(photo.created_at).toLocaleDateString('de-DE')}
                      </div>
                    </div>
                  </Link>
                )}

                {!sortMode && (
                  <button className="btn btn-danger"
                    style={{ position:'absolute', top:8, right:8, fontSize:12, padding:'4px 8px' }}
                    onClick={()=>deletePhoto(photo)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
