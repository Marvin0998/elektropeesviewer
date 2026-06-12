// app/project/[id]/page.js
// Projektseite: Fotos anzeigen & hochladen

'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

export default function ProjectPage() {
  const router  = useRouter()
  const params  = useParams()
  const id      = params.id   // Die Projekt-ID aus der URL

  const [user, setUser]         = useState(null)
  const [project, setProject]   = useState(null)
  const [photos, setPhotos]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError]       = useState('')
  const [dragover, setDragover] = useState(false)
  const fileInputRef = useRef()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)

      // Projekt laden
      const { data: proj } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single()

      if (!proj) { router.push('/dashboard'); return }
      setProject(proj)

      // Fotos laden
      await loadPhotos(supabase)
      setLoading(false)
    }
    load()
  }, [id, router])

  async function loadPhotos(supabase) {
    if (!supabase) supabase = createClient()
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    setPhotos(data || [])
  }

  // Datei-Upload verarbeiten
  async function handleFiles(files) {
    const file = files[0]
    if (!file) return

    // Nur Bilder erlauben
    if (!file.type.startsWith('image/')) {
      setError('Bitte nur Bilddateien hochladen (JPG, PNG).')
      return
    }

    setError('')
    setUploading(true)
    setUploadProgress(0)

    const supabase = createClient()

    // Eindeutiger Dateiname: user-id/timestamp-dateiname.jpg
    const fileName = `${user.id}/${Date.now()}-${file.name.replace(/\s/g, '_')}`

    // Bild in Supabase Storage hochladen
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, file, {
        onUploadProgress: (progress) => {
          setUploadProgress(Math.round((progress.loaded / progress.total) * 100))
        }
      })

    if (uploadError) {
      setError('Upload fehlgeschlagen: ' + uploadError.message)
      setUploading(false)
      return
    }

    // Öffentliche URL des Bildes holen
    const { data: { publicUrl } } = supabase.storage
      .from('photos')
      .getPublicUrl(fileName)

    // Foto in Datenbank speichern
    const { error: dbError } = await supabase
      .from('photos')
      .insert({
        project_id: id,
        user_id: user.id,
        name: file.name.replace(/\.[^.]+$/, ''),  // Name ohne Dateiendung
        storage_path: fileName,
        public_url: publicUrl
      })

    if (dbError) {
      setError('Datenbankfehler: ' + dbError.message)
    } else {
      await loadPhotos()
    }

    setUploading(false)
    setUploadProgress(0)
  }

  async function deletePhoto(photo) {
    if (!confirm(`"${photo.name}" löschen? Alle Notizen gehen verloren.`)) return
    const supabase = createClient()
    await supabase.storage.from('photos').remove([photo.storage_path])
    await supabase.from('photos').delete().eq('id', photo.id)
    await loadPhotos()
  }

  if (loading) return <><Navbar /><div className="spinner" /></>

  return (
    <>
      <Navbar userEmail={user?.email} />

      <main className="page">
        {/* Breadcrumb + Titel */}
        <div style={{ marginBottom: 32 }}>
          <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14 }}>
            ← Alle Projekte
          </Link>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>📁 {project.name}</h1>
          {project.description && (
            <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{project.description}</p>
          )}
        </div>

        {/* Fehleranzeige */}
        {error && <div className="error-msg" style={{ marginBottom: 20 }}>{error}</div>}

        {/* Upload-Bereich */}
        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          style={{ marginBottom: 32 }}
          onClick={() => fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={e => { e.preventDefault(); setDragover(false); handleFiles(e.dataTransfer.files) }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={e => handleFiles(e.target.files)}
          />
          {uploading ? (
            <div>
              <div style={{ marginBottom: 8 }}>📤 Wird hochgeladen... {uploadProgress}%</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: uploadProgress + '%' }} />
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>360°-Foto hier ablegen</div>
              <div style={{ fontSize: 13 }}>oder klicken zum Auswählen · JPG, PNG</div>
            </>
          )}
        </div>

        {/* Fotos-Überschrift */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            Fotos ({photos.length})
          </h2>
        </div>

        {/* Foto-Karten oder leerer Zustand */}
        {photos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🖼️</div>
            <h3>Noch keine Fotos</h3>
            <p>Lade dein erstes 360°-Foto hoch!</p>
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map(photo => (
              <div key={photo.id} style={{ position: 'relative' }}>
                <Link href={`/viewer/${photo.id}`} className="photo-card">
                  {/* Vorschaubild */}
                  <img
                    src={photo.public_url}
                    alt={photo.name}
                    className="photo-thumbnail"
                    onError={e => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                  <div className="photo-thumb-placeholder" style={{ display: 'none' }}>🖼️</div>

                  <div className="photo-card-body">
                    <div className="photo-card-name">🌐 {photo.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(photo.created_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                </Link>

                {/* Löschen-Button */}
                <button
                  className="btn btn-danger"
                  style={{ position: 'absolute', top: 8, right: 8, fontSize: 12, padding: '4px 8px' }}
                  onClick={() => deletePhoto(photo)}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
