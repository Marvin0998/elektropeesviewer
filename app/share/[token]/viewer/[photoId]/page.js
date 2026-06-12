// app/share/[token]/viewer/[photoId]/page.js
// Kunden-Viewer: 360° mit Annotationen, aber KEIN Bearbeiten

'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const SEGMENTS = 32
const D2R = Math.PI / 180

export default function ShareViewerPage() {
  const params  = useParams()
  const token   = params.token
  const photoId = params.photoId

  const [photo, setPhoto]           = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [notes, setNotes]           = useState([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [svgData, setSvgData]       = useState([])
  const [activeNote, setActiveNote] = useState(null)

  const viewerRef    = useRef(null)
  const pannellumRef = useRef(null)
  const animFrameRef = useRef(null)
  const [viewerSize, setViewerSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_shared_project', { p_token: token })
      if (error || !data) { setNotFound(true); setLoading(false); return }

      const ph = (data.photos || []).find(p => p.id === photoId)
      if (!ph) { setNotFound(true); setLoading(false); return }

      setPhoto(ph)
      setAnnotations(ph.annotations || [])
      setNotes(ph.notes || [])
      setProjectName(data.project?.name || '')
      setLoading(false)
    }
    load()
  }, [token, photoId])

  // Pannellum init
  useEffect(() => {
    if (loading || !photo) return
    function init() {
      if (!viewerRef.current || pannellumRef.current) return
      pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
        type: 'equirectangular',
        panorama: photo.public_url,
        autoLoad: true, showControls: true, mouseZoom: true, hfov: 100,
        hotSpots: notes.map(n => ({
          id: 'note-' + n.id, pitch: n.pitch, yaw: n.yaw, type: 'info',
          text: `<strong>${n.title}</strong>${n.content ? '<br>' + n.content : ''}`,
          cssClass: 'note-hotspot',
          clickHandlerFunc: () => setActiveNote(n)
        }))
      })
      updateSize()
    }
    if (!window.pannellum) {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js'
      s.onload = init; document.head.appendChild(s)
    } else { init() }
    return () => { cancelAnimationFrame(animFrameRef.current) }
  }, [loading, photo, notes])

  function updateSize() {
    if (viewerRef.current) {
      const r = viewerRef.current.getBoundingClientRect()
      setViewerSize({ w: r.width, h: r.height })
    }
  }
  useEffect(() => { window.addEventListener('resize', updateSize); return () => window.removeEventListener('resize', updateSize) }, [])

  // Projektion
  function worldToScreen(yaw, pitch) {
    if (!pannellumRef.current || !viewerRef.current) return null
    const pn = pannellumRef.current
    const rect = viewerRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const hfovR = pn.getHfov() * D2R
    const vYawR = pn.getYaw()  * D2R
    const vPitR = pn.getPitch()* D2R
    const pYawR = yaw   * D2R
    const pPitR = pitch * D2R
    const px = Math.cos(pPitR)*Math.sin(pYawR)
    const py = Math.sin(pPitR)
    const pz = Math.cos(pPitR)*Math.cos(pYawR)
    const cx = Math.cos(vPitR)*Math.sin(vYawR)
    const cy = Math.sin(vPitR)
    const cz = Math.cos(vPitR)*Math.cos(vYawR)
    const dot = px*cx + py*cy + pz*cz
    if (dot <= 0.001) return null
    const rx = Math.cos(vYawR), ry = 0, rz = -Math.sin(vYawR)
    const ux = -Math.sin(vPitR)*Math.sin(vYawR)
    const uy = Math.cos(vPitR)
    const uz = -Math.sin(vPitR)*Math.cos(vYawR)
    const xp = (px*rx + py*ry + pz*rz) / dot
    const yp = (px*ux + py*uy + pz*uz) / dot
    const f  = W / (2 * Math.tan(hfovR / 2))
    const sx = W/2 + xp*f, sy = H/2 - yp*f
    if (sx < -200 || sx > W+200 || sy < -200 || sy > H+200) return null
    return { x: sx, y: sy }
  }

  function toVec(y, p) { return { x: Math.cos(p*D2R)*Math.sin(y*D2R), y: Math.sin(p*D2R), z: Math.cos(p*D2R)*Math.cos(y*D2R) } }
  function fromVec(v) { return { yaw: Math.atan2(v.x,v.z)/D2R, pitch: Math.asin(Math.max(-1,Math.min(1,v.y)))/D2R } }
  function slerp(a, b, t) {
    const dot = Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y+a.z*b.z))
    const th = Math.acos(dot); if (Math.abs(th)<0.0001) return {...a}
    const s = Math.sin(th)
    return { x:(Math.sin((1-t)*th)/s)*a.x+(Math.sin(t*th)/s)*b.x, y:(Math.sin((1-t)*th)/s)*a.y+(Math.sin(t*th)/s)*b.y, z:(Math.sin((1-t)*th)/s)*a.z+(Math.sin(t*th)/s)*b.z }
  }
  function geodesicToPolyline(y1,p1,y2,p2) {
    const va=toVec(y1,p1), vb=toVec(y2,p2)
    const segs=[]; let cur=[]
    for(let i=0;i<=SEGMENTS;i++) {
      const v=slerp(va,vb,i/SEGMENTS), pt=fromVec(v), s=worldToScreen(pt.yaw,pt.pitch)
      if(s){cur.push(s)}else{if(cur.length>1)segs.push(cur);cur=[]}
    }
    if(cur.length>1)segs.push(cur)
    return segs
  }
  function ptsToStr(pts) { return pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }

  // Live-Loop
  useEffect(() => {
    function tick() {
      if (!pannellumRef.current) { animFrameRef.current = requestAnimationFrame(tick); return }
      setSvgData(annotations.map(ann => {
        const segs = geodesicToPolyline(ann.x1,ann.y1,ann.x2,ann.y2)
        const mg = fromVec(slerp(toVec(ann.x1,ann.y1),toVec(ann.x2,ann.y2),0.5))
        return { ...ann, segments: segs, midScreen: worldToScreen(mg.yaw,mg.pitch), start: worldToScreen(ann.x1,ann.y1), end: worldToScreen(ann.x2,ann.y2) }
      }))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [annotations, viewerSize])

  function renderLine(item) {
    const { segments, midScreen, start, end, color, type, label, id } = item
    if (!segments || segments.length === 0) return null
    const sw = 2
    const firstSeg = segments[0], lastSeg = segments[segments.length-1]
    const p_start2 = firstSeg?.length >= 2 ? firstSeg[1] : null
    const p_end2   = lastSeg?.length  >= 2 ? lastSeg[lastSeg.length-2] : null

    function Arrow({p1,p2}) {
      if(!p1||!p2) return null
      const a = Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI
      return <polygon points="-10,5 0,0 -10,-5" fill={color} transform={`translate(${p2.x},${p2.y}) rotate(${a})`} />
    }
    function Tick({pt,p2}) {
      if(!pt||!p2) return null
      const a = Math.atan2(p2.y-pt.y,p2.x-pt.x)
      const px=Math.sin(a)*12, py=-Math.cos(a)*12
      return <line x1={pt.x-px} y1={pt.y-py} x2={pt.x+px} y2={pt.y+py} stroke={color} strokeWidth={2} strokeLinecap="round" />
    }
    function MidLabel({pt}) {
      if(!label||!pt) return null
      const w=label.length*8+18
      return <g><rect x={pt.x-w/2} y={pt.y-13} width={w} height={22} rx={5} fill="rgba(0,0,0,0.82)"/><text x={pt.x} y={pt.y+4} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>
    }

    return (
      <g key={id}>
        {segments.map((seg,i)=>(
          <polyline key={i} points={ptsToStr(seg)} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {type==='measure' && <><Arrow p1={p_start2} p2={start}/><Arrow p1={p_end2} p2={end}/><Tick pt={start} p2={end}/><Tick pt={end} p2={start}/></>}
        {type==='arrow'   && <Arrow p1={p_end2} p2={end}/>}
        <MidLabel pt={midScreen}/>
        {type==='text' && start && (
          <g><rect x={start.x-4} y={start.y-20} width={(label||'').length*9+14} height={26} rx={5} fill="rgba(0,0,0,0.8)"/><text x={start.x+3} y={start.y+2} fill={color} fontSize={16} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>
        )}
      </g>
    )
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)'}}><div className="spinner"/></div>
  if (notFound) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text)',background:'var(--bg)'}}>🔒 Link ungültig</div>

  return (
    <>
      <nav className="navbar">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" alt="Elektro Pees" style={{ height:36 }} />
          <div style={{ lineHeight:1.2 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>360° Viewer</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>by Elektro Pees</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href={`/share/${token}`} style={{ color:'var(--text-muted)', textDecoration:'none', fontSize:13 }}>
            ← {projectName}
          </Link>
          <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', color:'#22c55e', padding:'5px 12px', borderRadius:20, fontSize:12 }}>
            👁 Nur-Lesen
          </div>
        </div>
      </nav>

      <div style={{ height:'calc(100vh - 65px)', position:'relative' }}>
        <div ref={viewerRef} style={{ width:'100%', height:'100%' }} />

        {/* SVG Annotations (nicht klickbar zum Bearbeiten) */}
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:20, pointerEvents:'none' }}>
          {svgData.map(item => renderLine(item))}
        </svg>

        {/* Foto-Name */}
        <div style={{ position:'absolute', top:12, left:12, zIndex:30, background:'rgba(0,0,0,0.65)', color:'white', padding:'6px 14px', borderRadius:8, fontSize:13 }}>
          🌐 {photo.name}
        </div>

        {/* Notiz-Detail wenn angeklickt */}
        {activeNote && (
          <div style={{ position:'absolute', bottom:20, left:'50%', transform:'translateX(-50%)', zIndex:30, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', minWidth:260, maxWidth:380 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ fontWeight:600, fontSize:15 }}>📌 {activeNote.title}</div>
              <button onClick={()=>setActiveNote(null)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
            </div>
            {activeNote.content && <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:6 }}>{activeNote.content}</div>}
          </div>
        )}
      </div>

      <style>{`
        .note-hotspot { background:#4f6ef7; border-radius:50%; width:20px; height:20px; border:2px solid white; cursor:pointer; }
        .pnlm-tooltip { background:rgba(0,0,0,0.85)!important; border-radius:8px!important; font-size:13px!important; }
      `}</style>
    </>
  )
}
