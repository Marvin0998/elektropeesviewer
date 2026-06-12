// app/viewer/[id]/page.js
// 360°-Viewer — Geodätische Linien (Option A)

'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

const TOOLS = [
  { id: 'select',  icon: '🌐', label: 'Drehen / Auswählen' },
  { id: 'measure', icon: '↔', label: 'Bemaßung' },
  { id: 'arrow',   icon: '➜', label: 'Pfeil' },
  { id: 'line',    icon: '╱', label: 'Linie' },
  { id: 'rect',    icon: '▭', label: 'Rechteck' },
  { id: 'text',    icon: 'T', label: 'Text' },
  { id: 'note',    icon: '📌', label: 'Notiz-Pin' },
]
const COLORS = ['#ff3b3b','#ff9500','#ffcc00','#34c759','#007aff','#ffffff','#1a1a1a']
const SEGMENTS = 32  // Anzahl Unterteilungen pro Linie

export default function ViewerPage() {
  const router  = useRouter()
  const params  = useParams()
  const photoId = params.id

  const [user, setUser]     = useState(null)
  const [photo, setPhoto]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTool, setActiveTool]   = useState('select')
  const [activeColor, setActiveColor] = useState('#ff3b3b')
  const [annotations, setAnnotations] = useState([])
  const [notes, setNotes]             = useState([])
  const [selected, setSelected]       = useState(null)
  const [sidebarTab, setSidebarTab]   = useState('annotations')

  const [drawing, setDrawing]     = useState(null)
  const [drawStart, setDrawStart] = useState(null)

  const [showLabelInput, setShowLabelInput]       = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState(null)
  const [labelValue, setLabelValue]               = useState('')

  const [showNoteModal, setShowNoteModal] = useState(false)
  const [editingNote, setEditingNote]     = useState(null)
  const [noteTitle, setNoteTitle]         = useState('')
  const [noteContent, setNoteContent]     = useState('')
  const [saving, setSaving] = useState(false)

  const viewerRef    = useRef(null)
  const pannellumRef = useRef(null)
  const animFrameRef = useRef(null)
  const [svgData, setSvgData]     = useState([])
  const [viewerSize, setViewerSize] = useState({ w: 800, h: 600 })

  // ---- Laden ----
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: ph } = await supabase
        .from('photos').select('*, projects(id, name)').eq('id', photoId).single()
      if (!ph) { router.push('/dashboard'); return }
      setPhoto(ph)
      await Promise.all([loadAnnotations(supabase), loadNotes(supabase)])
      setLoading(false)
    }
    load()
  }, [photoId, router])

  async function loadAnnotations(sb) {
    if (!sb) sb = createClient()
    const { data } = await sb.from('annotations').select('*').eq('photo_id', photoId).order('created_at')
    setAnnotations(data || [])
  }
  async function loadNotes(sb) {
    if (!sb) sb = createClient()
    const { data } = await sb.from('notes').select('*').eq('photo_id', photoId).order('created_at')
    setNotes(data || [])
  }

  // ---- Pannellum ----
  function initPannellum(nts) {
    if (!viewerRef.current) return
    if (pannellumRef.current) { pannellumRef.current.destroy(); pannellumRef.current = null }
    pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
      type: 'equirectangular', panorama: photo.public_url,
      autoLoad: true, showControls: true, mouseZoom: true, hfov: 100,
      hotSpots: nts.map(n => ({
        id: 'note-' + n.id, pitch: n.pitch, yaw: n.yaw, type: 'info',
        text: `<strong>${n.title}</strong>${n.content ? '<br>' + n.content : ''}`,
        cssClass: 'note-hotspot',
        clickHandlerFunc: () => openEditNote(n)
      }))
    })
    updateSize()
  }

  useEffect(() => {
    if (loading || !photo) return
    function start() { initPannellum(notes) }
    if (!window.pannellum) {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js'
      s.onload = start; document.head.appendChild(s)
    } else { start() }
  }, [loading, photo])

  useEffect(() => { if (photo && window.pannellum) initPannellum(notes) }, [notes])

  function updateSize() {
    if (viewerRef.current) {
      const r = viewerRef.current.getBoundingClientRect()
      setViewerSize({ w: r.width, h: r.height })
    }
  }
  useEffect(() => {
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // ============================================================
  // KERN: Geodätische Interpolation + Projektion
  // ============================================================

  // Grad → Radiant
  const toRad = d => d * Math.PI / 180
  const toDeg = r => r * 180 / Math.PI

  // Kugelkoordinaten (yaw/pitch in Grad) → 3D-Einheitsvektor
  function toVec(yaw, pitch) {
    const y = toRad(yaw)
    const p = toRad(pitch)
    return {
      x: Math.cos(p) * Math.sin(y),
      y: Math.sin(p),
      z: Math.cos(p) * Math.cos(y)
    }
  }

  // 3D-Einheitsvektor → (yaw, pitch) in Grad
  function fromVec(v) {
    const pitch = toDeg(Math.asin(Math.max(-1, Math.min(1, v.y))))
    const yaw   = toDeg(Math.atan2(v.x, v.z))
    return { yaw, pitch }
  }

  // Sphärische lineare Interpolation (SLERP) zwischen zwei Punkten
  // t: 0..1, gibt Punkt auf dem Großkreis zurück
  function slerp(a, b, t) {
    const dot = Math.max(-1, Math.min(1, a.x*b.x + a.y*b.y + a.z*b.z))
    const theta = Math.acos(dot)
    if (Math.abs(theta) < 0.0001) return { ...a }
    const sin = Math.sin(theta)
    const sa  = Math.sin((1-t) * theta) / sin
    const sb  = Math.sin(t     * theta) / sin
    return { x: sa*a.x + sb*b.x, y: sa*a.y + sb*b.y, z: sa*a.z + sb*b.z }
  }

  // Geodätische Punkte: n Schritte auf dem Großkreis von (yaw1,pitch1) nach (yaw2,pitch2)
  function geodesicPoints(yaw1, pitch1, yaw2, pitch2, n) {
    const va = toVec(yaw1, pitch1)
    const vb = toVec(yaw2, pitch2)
    const pts = []
    for (let i = 0; i <= n; i++) {
      const v = slerp(va, vb, i / n)
      pts.push(fromVec(v))
    }
    return pts
  }

  // Winkel → Bildschirm-Pixel
  // Echte Perspektivprojektion (identisch zu Pannellums interner Rechnung)
  function worldToScreen(yaw, pitch) {
    if (!pannellumRef.current || !viewerRef.current) return null
    const pn = pannellumRef.current
    const rect = viewerRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height

    const D2R = Math.PI / 180
    const hfovR  = pn.getHfov()   * D2R
    const vYawR  = pn.getYaw()    * D2R
    const vPitR  = pn.getPitch()  * D2R
    const pYawR  = yaw   * D2R
    const pPitR  = pitch * D2R

    // Weltpunkt auf Einheitskugel
    const px = Math.cos(pPitR) * Math.sin(pYawR)
    const py = Math.sin(pPitR)
    const pz = Math.cos(pPitR) * Math.cos(pYawR)

    // Kamera-Blickvektor
    const cx = Math.cos(vPitR) * Math.sin(vYawR)
    const cy = Math.sin(vPitR)
    const cz = Math.cos(vPitR) * Math.cos(vYawR)

    // Punkt hinter der Kamera → unsichtbar
    const dot = px*cx + py*cy + pz*cz
    if (dot <= 0.001) return null

    // Kamera-Rechtsvector (Kreuzprodukt von Blick und Welt-Oben, dann normieren)
    const rx = Math.cos(vYawR), ry = 0, rz = -Math.sin(vYawR)

    // Kamera-Oben-Vektor (Kreuzprodukt von Rechts und Blick)
    const ux = -Math.sin(vPitR)*Math.sin(vYawR)
    const uy =  Math.cos(vPitR)
    const uz = -Math.sin(vPitR)*Math.cos(vYawR)

    // Projektion auf Bildebene
    const xp = (px*rx + py*ry + pz*rz) / dot
    const yp = (px*ux + py*uy + pz*uz) / dot

    // Bildschirm-Pixel: hfov bestimmt Skalierung
    const f  = W / (2 * Math.tan(hfovR / 2))
    const sx = W / 2 + xp * f
    const sy = H / 2 - yp * f

    // Weit außerhalb → nicht rendern
    if (sx < -200 || sx > W+200 || sy < -200 || sy > H+200) return null
    return { x: sx, y: sy }
  }

  // Geodätische Linie als SVG-Polyline-Punkte berechnen
  function geodesicToPolyline(yaw1, pitch1, yaw2, pitch2, n = SEGMENTS) {
    const pts = geodesicPoints(yaw1, pitch1, yaw2, pitch2, n)
    // In sichtbare Segmente aufteilen (Lücken wenn Punkte außer Sicht)
    const segments = []
    let current = []
    for (const pt of pts) {
      const s = worldToScreen(pt.yaw, pt.pitch)
      if (s) {
        current.push(s)
      } else {
        if (current.length > 1) segments.push(current)
        current = []
      }
    }
    if (current.length > 1) segments.push(current)
    return segments
  }

  // Punkte → SVG-Polyline-String "x1,y1 x2,y2 ..."
  function ptsToStr(pts) {
    return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  }

  // ---- Live-Loop: SVG bei jedem Frame neu berechnen ----
  useEffect(() => {
    function tick() {
      if (!pannellumRef.current) { animFrameRef.current = requestAnimationFrame(tick); return }
      const computed = annotations.map(ann => {
        const segments = geodesicToPolyline(ann.x1, ann.y1, ann.x2, ann.y2)
        const midPt = worldToScreen(
          (ann.x1 + ann.x2) / 2,
          (ann.y1 + ann.y2) / 2
        )
        // Mittelpunkt auf der Geodäte
        const midGeo = fromVec(slerp(toVec(ann.x1, ann.y1), toVec(ann.x2, ann.y2), 0.5))
        const midScreen = worldToScreen(midGeo.yaw, midGeo.pitch)
        // Endpunkte für Pfeile
        const start = worldToScreen(ann.x1, ann.y1)
        const end   = worldToScreen(ann.x2, ann.y2)
        return { ...ann, segments, midScreen, start, end }
      })
      setSvgData(computed)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [annotations, viewerSize])

  // ---- Pixel → Winkel (inverse Perspektivprojektion) ----
  function screenToWorld(clientX, clientY) {
    if (!pannellumRef.current || !viewerRef.current) return null
    const pn = pannellumRef.current
    const rect = viewerRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const D2R = Math.PI / 180
    const hfovR = pn.getHfov() * D2R
    const vYawR = pn.getYaw()  * D2R
    const vPitR = pn.getPitch()* D2R
    const f  = W / (2 * Math.tan(hfovR / 2))
    const xp = (clientX - rect.left - W/2) / f
    const yp = (clientY - rect.top  - H/2) / f
    const cx = Math.cos(vPitR)*Math.sin(vYawR)
    const cy = Math.sin(vPitR)
    const cz = Math.cos(vPitR)*Math.cos(vYawR)
    const rx = Math.cos(vYawR), ry = 0, rz = -Math.sin(vYawR)
    const ux = -Math.sin(vPitR)*Math.sin(vYawR)
    const uy = Math.cos(vPitR)
    const uz = -Math.sin(vPitR)*Math.cos(vYawR)
    const dx = cx + xp*rx - yp*ux
    const dy = cy + xp*ry - yp*uy
    const dz = cz + xp*rz - yp*uz
    const len = Math.hypot(dx, dy, dz)
    return {
      yaw:   Math.atan2(dx/len, dz/len) / D2R,
      pitch: Math.asin(Math.max(-1, Math.min(1, dy/len))) / D2R
    }
  }

  // ---- Zeichnen ----
  function handleMouseDown(e) {
    if (activeTool === 'select') return
    if (activeTool === 'note') {
      const w = screenToWorld(e.clientX, e.clientY)
      window.__pendingNoteCoords = w || { yaw: 0, pitch: 0 }
      setEditingNote(null); setNoteTitle(''); setNoteContent('')
      setShowNoteModal(true)
      return
    }
    e.preventDefault()
    const w = screenToWorld(e.clientX, e.clientY)
    if (!w) return
    setDrawStart(w)
    setDrawing({ type: activeTool, color: activeColor, start: w, end: w })
  }

  function handleMouseMove(e) {
    if (!drawing) return
    e.preventDefault()
    const w = screenToWorld(e.clientX, e.clientY)
    if (w) setDrawing(d => ({ ...d, end: w }))
  }

  function handleMouseUp(e) {
    if (!drawing) return
    e.preventDefault()
    const w = screenToWorld(e.clientX, e.clientY)
    if (!w) { setDrawing(null); setDrawStart(null); return }
    const dist = Math.hypot(w.yaw - drawStart.yaw, w.pitch - drawStart.pitch)
    if (dist < 0.3) { setDrawing(null); setDrawStart(null); return }
    const finished = { ...drawing, end: w }
    if (['measure','arrow','text'].includes(drawing.type)) {
      setPendingAnnotation(finished); setLabelValue(''); setShowLabelInput(true)
    } else {
      commitAnnotation(finished, '')
    }
    setDrawing(null); setDrawStart(null)
  }

  async function commitAnnotation(ann, label) {
    await createClient().from('annotations').insert({
      photo_id: photoId, user_id: user.id,
      type: ann.type, label: label || '',
      color: ann.color,
      x1: ann.start?.yaw   ?? ann.x1,
      y1: ann.start?.pitch ?? ann.y1,
      x2: ann.end?.yaw     ?? ann.x2,
      y2: ann.end?.pitch   ?? ann.y2,
      data: {}
    })
    await loadAnnotations()
  }

  async function confirmLabel(e) {
    e.preventDefault()
    if (pendingAnnotation) await commitAnnotation(pendingAnnotation, labelValue)
    setShowLabelInput(false); setPendingAnnotation(null); setLabelValue('')
  }

  async function deleteAnnotation(id) {
    await createClient().from('annotations').delete().eq('id', id)
    setSelected(null); await loadAnnotations()
  }

  // ---- Vorschau geodätische Linie ----
  function getPreviewSegments() {
    if (!drawing) return null
    return {
      segments: geodesicToPolyline(drawing.start.yaw, drawing.start.pitch, drawing.end.yaw, drawing.end.pitch),
      start: worldToScreen(drawing.start.yaw, drawing.start.pitch),
      end:   worldToScreen(drawing.end.yaw,   drawing.end.pitch),
      mid:   (() => { const mg = fromVec(slerp(toVec(drawing.start.yaw, drawing.start.pitch), toVec(drawing.end.yaw, drawing.end.pitch), 0.5)); return worldToScreen(mg.yaw, mg.pitch) })(),
      color: drawing.color,
      type:  drawing.type
    }
  }

  // ---- SVG-Linie rendern ----
  function renderAnnotationSVG(item, isPreview) {
    const { segments, midScreen, start, end, color, type, label, id } = item
    if (!segments || segments.length === 0) return null
    const isSel = !isPreview && selected === id
    const sw    = isSel ? 3 : 2
    const dash  = isPreview ? '8 4' : undefined
    const clickFn = isPreview ? undefined : () => setSelected(isSel ? null : id)

    // Label-Box in der Mitte
    function MidLabel({ pt }) {
      if (!label || !pt) return null
      const w = label.length * 8 + 18
      return (
        <g>
          <rect x={pt.x - w/2} y={pt.y - 13} width={w} height={22} rx={5} fill="rgba(0,0,0,0.82)" />
          <text x={pt.x} y={pt.y + 4} textAnchor="middle" fill={color}
            fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text>
        </g>
      )
    }

    // Pfeilspitze: von p1 nach p2 zeigend
    function ArrowHead({ p1, p2 }) {
      if (!p1 || !p2) return null
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI
      return (
        <polygon
          points="-10,5 0,0 -10,-5"
          fill={color}
          transform={`translate(${p2.x},${p2.y}) rotate(${angle})`}
        />
      )
    }

    // Senkrechter Endstrich für Bemaßung
    function EndTick({ pt, p2 }) {
      if (!pt || !p2) return null
      // Winkel der Linie berechnen und 90° dazu
      const angle = Math.atan2(p2.y - pt.y, p2.x - pt.x)
      const px = Math.sin(angle) * 12
      const py = -Math.cos(angle) * 12
      return (
        <line
          x1={pt.x - px} y1={pt.y - py}
          x2={pt.x + px} y2={pt.y + py}
          stroke={color} strokeWidth={2} strokeLinecap="round"
        />
      )
    }

    const firstSeg = segments[0]
    const lastSeg  = segments[segments.length - 1]
    // Punkte direkt an den Linie-Enden für Pfeile/Ticks
    const p_start   = start  // worldToScreen des Startpunkts
    const p_end     = end    // worldToScreen des Endpunkts
    // Zweiter Punkt vom Anfang / vorletzter am Ende für Richtungsberechnung
    const p_start2  = firstSeg && firstSeg.length >= 2 ? firstSeg[1] : null
    const p_end2    = lastSeg  && lastSeg.length  >= 2 ? lastSeg[lastSeg.length - 2] : null

    return (
      <g key={id || 'preview'} onClick={clickFn} style={clickFn ? { cursor: 'pointer' } : {}}>
        {/* Selektions-Highlight */}
        {isSel && segments.map((seg, i) => (
          <polyline key={'hl'+i} points={ptsToStr(seg)}
            fill="none" stroke="white" strokeWidth={8} opacity={0.2} />
        ))}

        {/* Geodätische Polylinien */}
        {segments.map((seg, i) => (
          <polyline key={i} points={ptsToStr(seg)}
            fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash}
            strokeLinecap="round" strokeLinejoin="round"
          />
        ))}

        {/* Bemaßung: Pfeile + Endstriche */}
        {type === 'measure' && (
          <>
            <ArrowHead p1={p_start2} p2={p_start} />
            <ArrowHead p1={p_end2}   p2={p_end} />
            <EndTick pt={p_start} p2={p_end} />
            <EndTick pt={p_end}   p2={p_start} />
          </>
        )}

        {/* Pfeil: nur Spitze am Ende */}
        {type === 'arrow' && <ArrowHead p1={p_end2} p2={p_end} />}

        {/* Mittelpunkt-Label */}
        <MidLabel pt={midScreen || item.mid} />

        {/* Text-Annotation */}
        {type === 'text' && start && (
          <g>
            <rect x={start.x - 4} y={start.y - 20} width={(label||'').length*9+14} height={26} rx={5} fill="rgba(0,0,0,0.8)" />
            <text x={start.x + 3} y={start.y + 2} fill={color} fontSize={16} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text>
          </g>
        )}
      </g>
    )
  }

  const previewData = drawing ? getPreviewSegments() : null
  const isDrawTool  = activeTool !== 'select' && activeTool !== 'note'

  // Notizen
  function openEditNote(note) {
    setEditingNote(note); setNoteTitle(note.title); setNoteContent(note.content || ''); setShowNoteModal(true)
  }
  async function saveNote(e) {
    e.preventDefault(); if (!noteTitle.trim()) return; setSaving(true)
    const supabase = createClient()
    if (editingNote) {
      await supabase.from('notes').update({ title: noteTitle.trim(), content: noteContent.trim() }).eq('id', editingNote.id)
    } else {
      const c = window.__pendingNoteCoords || { yaw: 0, pitch: 0 }
      await supabase.from('notes').insert({
        photo_id: photoId, user_id: user.id,
        title: noteTitle.trim(), content: noteContent.trim(),
        yaw: c.yaw, pitch: c.pitch
      })
    }
    await loadNotes(); setShowNoteModal(false); setSaving(false)
  }
  async function deleteNote(nId) {
    if (!confirm('Notiz löschen?')) return
    await createClient().from('notes').delete().eq('id', nId)
    await loadNotes(); setShowNoteModal(false)
  }

  if (loading) return <><Navbar /><div className="spinner" /></>

  return (
    <>
      <Navbar userEmail={user?.email} />
      <div style={{ display: 'flex', height: 'calc(100vh - 65px)', overflow: 'hidden' }}>

        {/* Werkzeugleiste */}
        <div style={{
          width: 56, background: 'var(--bg2)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '12px 0', gap: 4, zIndex: 20, flexShrink: 0
        }}>
          {TOOLS.map(t => (
            <button key={t.id} title={t.label} onClick={() => { setActiveTool(t.id); setSelected(null) }} style={{
              width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: activeTool === t.id ? 'var(--accent)' : 'transparent',
              color: activeTool === t.id ? 'white' : 'var(--text-muted)',
              fontSize: t.id === 'note' ? 16 : 18, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
            }}>{t.icon}</button>
          ))}
          <div style={{ width: 32, height: 1, background: 'var(--border)', margin: '6px 0' }} />
          {COLORS.map(col => (
            <button key={col} title={col} onClick={() => setActiveColor(col)} style={{
              width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', outline: 'none',
              background: col, border: activeColor === col ? '2px solid white' : '2px solid transparent',
              boxShadow: activeColor === col ? '0 0 0 2px var(--accent)' : 'none'
            }} />
          ))}
          {selected && <>
            <div style={{ width: 32, height: 1, background: 'var(--border)', margin: '6px 0' }} />
            <button title="Löschen" onClick={() => deleteAnnotation(selected)} style={{
              width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>🗑</button>
          </>}
        </div>

        {/* Viewer */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.65)', color: 'white', padding: '6px 16px',
            borderRadius: 20, fontSize: 12, zIndex: 30, whiteSpace: 'nowrap', pointerEvents: 'none'
          }}>
            {activeTool==='select'  && '↖ Ziehen = Drehen · Linie anklicken = Auswählen'}
            {activeTool==='measure' && '↔ Klicken & Ziehen → Bemaßungslinie'}
            {activeTool==='arrow'   && '➜ Klicken & Ziehen → Pfeil'}
            {activeTool==='line'    && '╱ Klicken & Ziehen → Linie'}
            {activeTool==='rect'    && '▭ Klicken & Ziehen → Rechteck'}
            {activeTool==='text'    && 'T Klicken & Ziehen → Text'}
            {activeTool==='note'    && '📌 Klicken → Pin setzen'}
          </div>

          <div ref={viewerRef} style={{ width: '100%', height: '100%' }} />

          {/* SVG-Overlay mit geodätischen Linien */}
          <svg style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 20,
            pointerEvents: isDrawTool ? 'all' : 'none',
            cursor: isDrawTool ? 'crosshair' : 'default'
          }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Gespeicherte Annotations */}
            {svgData.map(item => renderAnnotationSVG(item, false))}

            {/* Unsichtbare dicke Klick-Flächen im Select-Modus */}
            {activeTool === 'select' && svgData.map(item =>
              item.segments?.flat().length > 1 ? (
                <polyline key={'hit-'+item.id}
                  points={ptsToStr(item.segments.flat())}
                  fill="none" stroke="transparent" strokeWidth={24}
                  style={{ cursor: 'pointer', pointerEvents: 'all' }}
                  onClick={() => setSelected(selected === item.id ? null : item.id)}
                />
              ) : null
            )}

            {/* Vorschau */}
            {previewData && renderAnnotationSVG({
              ...previewData,
              id: 'preview', label: '',
              midScreen: previewData.mid
            }, true)}
          </svg>
        </div>

        {/* Sidebar */}
        <div style={{
          width: 270, background: 'var(--bg2)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0
        }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'annotations', label: `✏️ Zeichnungen (${annotations.length})` },
              { id: 'notes', label: `📌 Pins (${notes.length})` }
            ].map(tab => (
              <button key={tab.id} onClick={() => setSidebarTab(tab.id)} style={{
                flex: 1, padding: '11px 6px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                background: sidebarTab === tab.id ? 'var(--bg3)' : 'transparent',
                color: sidebarTab === tab.id ? 'var(--text)' : 'var(--text-muted)',
                borderBottom: sidebarTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent'
              }}>{tab.label}</button>
            ))}
          </div>

          {sidebarTab === 'annotations' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {annotations.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text-muted)', paddingTop:40, fontSize:13 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>✏️</div>
                  Werkzeug wählen &amp; zeichnen!
                </div>
              ) : annotations.map(ann => (
                <div key={ann.id} onClick={() => setSelected(selected===ann.id?null:ann.id)} style={{
                  padding:'9px 12px', marginBottom:6, borderRadius:8, cursor:'pointer',
                  background: selected===ann.id ? 'var(--bg3)' : 'transparent',
                  border: `1px solid ${selected===ann.id ? 'var(--accent)' : 'var(--border)'}`,
                  display:'flex', alignItems:'center', gap:8
                }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:ann.color, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>
                      {ann.type==='measure'?'↔ ':ann.type==='arrow'?'➜ ':ann.type==='line'?'╱ ':ann.type==='rect'?'▭ ':'T '}
                      {ann.label || <span style={{ color:'var(--text-muted)', fontStyle:'italic' }}>kein Label</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{TOOLS.find(t=>t.id===ann.type)?.label}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();deleteAnnotation(ann.id)}}
                    style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:14 }}>🗑</button>
                </div>
              ))}
            </div>
          )}

          {sidebarTab === 'notes' && (
            <div style={{ flex:1, overflowY:'auto', padding:12 }}>
              <button className="btn btn-primary"
                style={{ width:'100%', justifyContent:'center', marginBottom:12, fontSize:13 }}
                onClick={() => { setActiveTool('note'); setSidebarTab('annotations') }}>
                + Neuen Pin setzen
              </button>
              {notes.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13, paddingTop:20 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📌</div>Noch keine Pins.
                </div>
              ) : notes.map(note => (
                <div key={note.id} className="card"
                  style={{ marginBottom:8, padding:'10px 12px', cursor:'pointer' }}
                  onClick={() => openEditNote(note)}>
                  <div style={{ fontSize:13, fontWeight:500 }}>📌 {note.title}</div>
                  {note.content && <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>{note.content}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Label-Eingabe */}
      {showLabelInput && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:360 }}>
            <h2 className="modal-title">
              {pendingAnnotation?.type==='measure' ? '↔ Maß eingeben' : pendingAnnotation?.type==='arrow' ? '➜ Pfeil beschriften' : 'T Text eingeben'}
            </h2>
            <form onSubmit={confirmLabel}>
              <div className="form-group">
                <label className="label">{pendingAnnotation?.type==='measure' ? 'Maßangabe (z.B. 2,40 m)' : 'Beschriftung'}</label>
                <input className="input"
                  placeholder={pendingAnnotation?.type==='measure' ? 'z.B. 2,40 m' : 'Text eingeben...'}
                  value={labelValue} onChange={e=>setLabelValue(e.target.value)} autoFocus />
              </div>
              <div className="form-row">
                <button type="button" className="btn btn-outline" onClick={()=>{setShowLabelInput(false);setPendingAnnotation(null)}}>Abbrechen</button>
                <button type="submit" className="btn btn-primary">Einfügen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notiz-Modal */}
      {showNoteModal && (
        <div className="modal-overlay" onClick={()=>setShowNoteModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">{editingNote ? '✏️ Pin bearbeiten' : '📌 Neuer Pin'}</h2>
            <form onSubmit={saveNote}>
              <div className="form-group">
                <label className="label">Titel *</label>
                <input className="input" placeholder="z.B. Kabelweg" value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} required autoFocus />
              </div>
              <div className="form-group">
                <label className="label">Details (optional)</label>
                <textarea className="input" rows={3} value={noteContent} onChange={e=>setNoteContent(e.target.value)} />
              </div>
              <div className="form-row">
                {editingNote && <button type="button" className="btn btn-danger" style={{marginRight:'auto'}} onClick={()=>deleteNote(editingNote.id)}>🗑 Löschen</button>}
                <button type="button" className="btn btn-outline" onClick={()=>setShowNoteModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Speichern...':'Speichern'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .note-hotspot { background:#4f6ef7; border-radius:50%; width:20px; height:20px; border:2px solid white; cursor:pointer; }
        .pnlm-tooltip { background:rgba(0,0,0,0.85)!important; border-radius:8px!important; font-size:13px!important; }
      `}</style>
    </>
  )
}
