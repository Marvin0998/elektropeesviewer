'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

const SelectIcon = () => (
  <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
    <path d="M 8 18 A 10 10 0 0 1 28 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <polygon points="28,18 23,13 32,12" fill="currentColor"/>
    <path d="M 28 18 A 10 10 0 0 1 8 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <polygon points="8,18 13,23 4,24" fill="currentColor"/>
    <text x="18" y="21" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">360°</text>
  </svg>
)

// Pin-Icons zur Auswahl
const PIN_ICONS = ['📌','📍','⚠️','💡','🔧','🔴','✅','❗','📷','🔌','⚡','🛠️','📋','🔎']

const TOOLS = [
  { id: 'select',  icon: <SelectIcon />, label: 'Drehen / Auswählen' },
  { id: 'measure', icon: '↔', label: 'Bemaßung' },
  { id: 'arrow',   icon: '➜', label: 'Pfeil' },
  { id: 'line',    icon: '╱', label: 'Linie' },
  { id: 'rect',    icon: '▭', label: 'Rechteck' },
  { id: 'text',    icon: 'T', label: 'Text' },
  { id: 'note',    icon: '📌', label: 'Notiz-Pin' },
]
const COLORS = ['#ff3b3b','#ff9500','#ffcc00','#34c759','#007aff','#ffffff','#1a1a1a']
const SEGMENTS = 32
const D2R = Math.PI / 180

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
  const [drawing, setDrawing]         = useState(null)
  const [drawStart, setDrawStart]     = useState(null)
  const [svgData, setSvgData]         = useState([])
  const [viewerSize, setViewerSize]   = useState({ w: 800, h: 600 })

  // Modals
  const [showLabelInput, setShowLabelInput]       = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState(null)
  const [labelValue, setLabelValue]               = useState('')
  const [editingAnnotation, setEditingAnnotation] = useState(null) // für Text-Bearbeitung

  const [showNoteModal, setShowNoteModal] = useState(false)
  const [editingNote, setEditingNote]     = useState(null)
  const [noteTitle, setNoteTitle]         = useState('')
  const [noteContent, setNoteContent]     = useState('')
  const [noteIcon, setNoteIcon]           = useState('📌')
  const [saving, setSaving] = useState(false)

  // Text-Edit Modal
  const [showTextEdit, setShowTextEdit]   = useState(false)
  const [editTextAnn, setEditTextAnn]     = useState(null)
  const [editTextLabel, setEditTextLabel] = useState('')
  const [editTextColor, setEditTextColor] = useState('#ff3b3b')
  const [editTextBg, setEditTextBg]       = useState('rgba(0,0,0,0.85)')
  const [editTextSize, setEditTextSize]   = useState(15)

  const viewerRef    = useRef(null)
  const pannellumRef = useRef(null)
  const animFrameRef = useRef(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUser(user)
      const { data: ph } = await supabase.from('photos').select('*, projects(id, name)').eq('id', photoId).single()
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

  function initPannellum(nts) {
    if (!viewerRef.current) return
    if (pannellumRef.current) { pannellumRef.current.destroy(); pannellumRef.current = null }
    pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
      type: 'equirectangular', panorama: photo.public_url,
      autoLoad: true, showControls: true, mouseZoom: true, hfov: 100,
      hotSpots: nts.map(n => ({
        id: 'note-'+n.id, pitch: n.pitch, yaw: n.yaw, type: 'info',
        text: `<strong>${n.title}</strong>${n.content?'<br>'+n.content:''}`,
        cssClass: 'note-hotspot',
        createTooltipFunc: (el) => {
          el.style.fontSize = '20px'
          el.style.cursor = 'pointer'
          el.style.userSelect = 'none'
          el.textContent = n.icon || '📌'
          el.title = n.title
          el.onclick = () => openEditNote(n)
        }
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
  useEffect(() => { window.addEventListener('resize', updateSize); return () => window.removeEventListener('resize', updateSize) }, [])

  // ---- Projektion ----
  function worldToScreen(yaw, pitch) {
    if (!pannellumRef.current || !viewerRef.current) return null
    const pn = pannellumRef.current
    const rect = viewerRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const hfovR = pn.getHfov()*D2R, vYawR = pn.getYaw()*D2R, vPitR = pn.getPitch()*D2R
    const pYawR = yaw*D2R, pPitR = pitch*D2R
    const px = Math.cos(pPitR)*Math.sin(pYawR), py = Math.sin(pPitR), pz = Math.cos(pPitR)*Math.cos(pYawR)
    const cx = Math.cos(vPitR)*Math.sin(vYawR), cy = Math.sin(vPitR), cz = Math.cos(vPitR)*Math.cos(vYawR)
    const dot = px*cx+py*cy+pz*cz
    if (dot<=0.001) return null
    const rx=Math.cos(vYawR),ry=0,rz=-Math.sin(vYawR)
    const ux=-Math.sin(vPitR)*Math.sin(vYawR),uy=Math.cos(vPitR),uz=-Math.sin(vPitR)*Math.cos(vYawR)
    const xp=(px*rx+py*ry+pz*rz)/dot, yp=(px*ux+py*uy+pz*uz)/dot
    const f=W/(2*Math.tan(hfovR/2))
    const sx=W/2+xp*f, sy=H/2-yp*f
    if (sx<-200||sx>W+200||sy<-200||sy>H+200) return null
    return {x:sx,y:sy}
  }

  function screenToWorld(clientX, clientY) {
    if (!pannellumRef.current || !viewerRef.current) return null
    const pn = pannellumRef.current
    const rect = viewerRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const hfovR = pn.getHfov()*D2R, vYawR = pn.getYaw()*D2R, vPitR = pn.getPitch()*D2R
    const f = W/(2*Math.tan(hfovR/2))
    const xp = (clientX-rect.left-W/2)/f, yp = (clientY-rect.top-H/2)/f
    const cx=Math.cos(vPitR)*Math.sin(vYawR),cy=Math.sin(vPitR),cz=Math.cos(vPitR)*Math.cos(vYawR)
    const rx=Math.cos(vYawR),ry=0,rz=-Math.sin(vYawR)
    const ux=-Math.sin(vPitR)*Math.sin(vYawR),uy=Math.cos(vPitR),uz=-Math.sin(vPitR)*Math.cos(vYawR)
    const dx=cx+xp*rx-yp*ux, dy=cy+xp*ry-yp*uy, dz=cz+xp*rz-yp*uz
    const len=Math.hypot(dx,dy,dz)
    return { yaw: Math.atan2(dx/len,dz/len)/D2R, pitch: Math.asin(Math.max(-1,Math.min(1,dy/len)))/D2R }
  }

  function toVec(y,p){return{x:Math.cos(p*D2R)*Math.sin(y*D2R),y:Math.sin(p*D2R),z:Math.cos(p*D2R)*Math.cos(y*D2R)}}
  function fromVec(v){return{yaw:Math.atan2(v.x,v.z)/D2R,pitch:Math.asin(Math.max(-1,Math.min(1,v.y)))/D2R}}
  function slerp(a,b,t){
    const dot=Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y+a.z*b.z)),th=Math.acos(dot)
    if(Math.abs(th)<0.0001)return{...a}
    const s=Math.sin(th)
    return{x:(Math.sin((1-t)*th)/s)*a.x+(Math.sin(t*th)/s)*b.x,y:(Math.sin((1-t)*th)/s)*a.y+(Math.sin(t*th)/s)*b.y,z:(Math.sin((1-t)*th)/s)*a.z+(Math.sin(t*th)/s)*b.z}
  }
  function geodesicToPolyline(y1,p1,y2,p2,n=SEGMENTS){
    const va=toVec(y1,p1),vb=toVec(y2,p2),segs=[];let cur=[]
    for(let i=0;i<=n;i++){const v=slerp(va,vb,i/n),pt=fromVec(v),s=worldToScreen(pt.yaw,pt.pitch);if(s){cur.push(s)}else{if(cur.length>1)segs.push(cur);cur=[]}}
    if(cur.length>1)segs.push(cur);return segs
  }
  function ptsToStr(pts){return pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}

  function rectToScreenCorners(y1,p1,y2,p2){
    const corners=[worldToScreen(y1,p1),worldToScreen(y2,p1),worldToScreen(y2,p2),worldToScreen(y1,p2)]
    if(corners.some(c=>!c)) return null
    return corners
  }

  useEffect(() => {
    function tick() {
      if (!pannellumRef.current){animFrameRef.current=requestAnimationFrame(tick);return}
      setSvgData(annotations.map(ann=>{
        const segs=geodesicToPolyline(ann.x1,ann.y1,ann.x2,ann.y2)
        const mg=fromVec(slerp(toVec(ann.x1,ann.y1),toVec(ann.x2,ann.y2),0.5))
        const rectCorners=ann.type==='rect'?rectToScreenCorners(ann.x1,ann.y1,ann.x2,ann.y2):null
        return{...ann,segments:segs,midScreen:worldToScreen(mg.yaw,mg.pitch),start:worldToScreen(ann.x1,ann.y1),end:worldToScreen(ann.x2,ann.y2),rectCorners}
      }))
      animFrameRef.current=requestAnimationFrame(tick)
    }
    animFrameRef.current=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(animFrameRef.current)
  },[annotations,viewerSize])

  // ---- Maus ----
  function handleMouseDown(e) {
    if (activeTool==='select') return
    if (activeTool==='note') {
      const w=screenToWorld(e.clientX,e.clientY)
      window.__pendingNoteCoords=w||{yaw:0,pitch:0}
      setEditingNote(null);setNoteTitle('');setNoteContent('');setNoteIcon('📌');setShowNoteModal(true);return
    }
    if (activeTool==='text') {
      const w=screenToWorld(e.clientX,e.clientY)
      if(!w) return
      setPendingAnnotation({type:'text',color:activeColor,start:w,end:w,data:{bg:'rgba(0,0,0,0.85)',size:15}})
      setLabelValue('');setShowLabelInput(true);return
    }
    e.preventDefault()
    const w=screenToWorld(e.clientX,e.clientY)
    if(!w) return
    setDrawStart(w)
    setDrawing({type:activeTool,color:activeColor,start:w,end:w})
  }

  function handleMouseMove(e) {
    if (!drawing) return
    e.preventDefault()
    const w=screenToWorld(e.clientX,e.clientY)
    if(w) setDrawing(d=>({...d,end:w}))
  }

  function handleMouseUp(e) {
    if (!drawing) return
    e.preventDefault()
    const w=screenToWorld(e.clientX,e.clientY)
    if(!w||!drawStart){setDrawing(null);setDrawStart(null);return}
    const dist=Math.hypot(w.yaw-drawStart.yaw,w.pitch-drawStart.pitch)
    if(dist<0.3){setDrawing(null);setDrawStart(null);return}
    const finished={...drawing,end:w}
    if(['measure','arrow'].includes(drawing.type)){
      setPendingAnnotation(finished);setLabelValue('');setShowLabelInput(true)
    } else {
      commitAnnotation(finished,'')
    }
    setDrawing(null);setDrawStart(null)
  }

  async function commitAnnotation(ann,label) {
    const d = ann.data || {}
    await createClient().from('annotations').insert({
      photo_id:photoId,user_id:user.id,
      type:ann.type,label:label||ann.label||'',color:ann.color,
      x1:ann.start?.yaw??ann.x1,y1:ann.start?.pitch??ann.y1,
      x2:ann.end?.yaw??ann.x2,y2:ann.end?.pitch??ann.y2,
      data:d
    })
    await loadAnnotations()
  }

  async function confirmLabel(e) {
    e.preventDefault()
    if(pendingAnnotation) await commitAnnotation(pendingAnnotation,labelValue)
    setShowLabelInput(false);setPendingAnnotation(null);setLabelValue('')
  }

  async function deleteAnnotation(id) {
    await createClient().from('annotations').delete().eq('id',id)
    setSelected(null);await loadAnnotations()
  }

  // Text bearbeiten
  function openTextEdit(ann) {
    setEditTextAnn(ann)
    setEditTextLabel(ann.label||'')
    setEditTextColor(ann.color||'#ff3b3b')
    setEditTextBg(ann.data?.bg||'rgba(0,0,0,0.85)')
    setEditTextSize(ann.data?.size||15)
    setShowTextEdit(true)
  }

  async function saveTextEdit(e) {
    e.preventDefault()
    await createClient().from('annotations').update({
      label: editTextLabel,
      color: editTextColor,
      data: { bg: editTextBg, size: editTextSize }
    }).eq('id', editTextAnn.id)
    setShowTextEdit(false)
    await loadAnnotations()
  }

  // Text verschieben: bei Klick auf Text im Select-Modus → neu positionieren
  async function moveTextTo(ann, clientX, clientY) {
    const w = screenToWorld(clientX, clientY)
    if (!w) return
    await createClient().from('annotations').update({ x1: w.yaw, y1: w.pitch, x2: w.yaw, y2: w.pitch }).eq('id', ann.id)
    await loadAnnotations()
  }

  // ---- Preview ----
  function getPreview() {
    if(!drawing) return null
    const segs=geodesicToPolyline(drawing.start.yaw,drawing.start.pitch,drawing.end.yaw,drawing.end.pitch)
    const rectCorners=drawing.type==='rect'?rectToScreenCorners(drawing.start.yaw,drawing.start.pitch,drawing.end.yaw,drawing.end.pitch):null
    return{...drawing,segments:segs,start:worldToScreen(drawing.start.yaw,drawing.start.pitch),end:worldToScreen(drawing.end.yaw,drawing.end.pitch),midScreen:null,rectCorners}
  }

  // ---- Rendern ----
  function renderAnn(item,isPreview) {
    const{segments,midScreen,start,end,color,type,label,id,rectCorners,data}=item
    const isSel=!isPreview&&selected===id
    const sw=isSel?3:2
    const dash=isPreview?'8 4':undefined
    const clickFn=isPreview?undefined:()=>setSelected(isSel?null:id)
    const firstSeg=segments?.[0],lastSeg=segments?.[segments.length-1]
    const p_start2=firstSeg?.length>=2?firstSeg[1]:null
    const p_end2=lastSeg?.length>=2?lastSeg[lastSeg.length-2]:null

    function Arrow({p1,p2}){if(!p1||!p2)return null;const a=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI;return<polygon points="-10,5 0,0 -10,-5" fill={color} transform={`translate(${p2.x},${p2.y}) rotate(${a})`}/>}
    function Tick({pt,p2}){if(!pt||!p2)return null;const a=Math.atan2(p2.y-pt.y,p2.x-pt.x),px=Math.sin(a)*12,py=-Math.cos(a)*12;return<line x1={pt.x-px} y1={pt.y-py} x2={pt.x+px} y2={pt.y+py} stroke={color} strokeWidth={2} strokeLinecap="round"/>}
    function MidLabel({pt}){
      if(!label||!pt||type==='text') return null
      const w=label.length*8+18
      return<g><rect x={pt.x-w/2} y={pt.y-13} width={w} height={22} rx={5} fill="rgba(0,0,0,0.82)"/><text x={pt.x} y={pt.y+4} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>
    }

    if(type==='rect'){
      if(!rectCorners) return null
      const ptStr=rectCorners.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      const cx=rectCorners.reduce((s,p)=>s+p.x,0)/4,cy=rectCorners.reduce((s,p)=>s+p.y,0)/4
      return(
        <g key={id||'prev'} onClick={clickFn} style={clickFn?{cursor:'pointer'}:{}}>
          {isSel&&<polygon points={ptStr} fill="white" opacity={0.1}/>}
          <polygon points={ptStr} stroke={color} strokeWidth={sw} fill={color} fillOpacity={0.08} strokeDasharray={dash}/>
          {label&&<g><rect x={cx-label.length*4-6} y={cy-13} width={label.length*8+12} height={22} rx={5} fill="rgba(0,0,0,0.82)"/><text x={cx} y={cy+4} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>}
        </g>
      )
    }

    if(type==='text'){
      if(!start) return null
      const txt=label||'...'
      const fontSize=data?.size||15
      const bg=data?.bg||'rgba(0,0,0,0.85)'
      const w=txt.length*fontSize*0.6+16
      return(
        <g key={id||'prev'}
          onClick={isPreview?undefined:(e)=>{e.stopPropagation();setSelected(isSel?null:id)}}
          onDoubleClick={isPreview?undefined:(e)=>{e.stopPropagation();openTextEdit(item)}}
          style={{cursor:isPreview?'default':'pointer'}}>
          {isSel&&<rect x={start.x-6} y={start.y-fontSize-8} width={w+4} height={fontSize+16} rx={7} fill="var(--accent)" opacity={0.3}/>}
          <rect x={start.x-4} y={start.y-fontSize-4} width={w} height={fontSize+12} rx={5} fill={bg}/>
          <text x={start.x+4} y={start.y+4} fill={color} fontSize={fontSize} fontWeight={700} fontFamily="Inter,sans-serif">{txt}</text>
          {isSel&&<text x={start.x+w-2} y={start.y-fontSize-10} fill="white" fontSize={10} fontFamily="Inter,sans-serif">✎ Doppelklick zum Bearbeiten</text>}
        </g>
      )
    }

    if(!segments||segments.length===0) return null

    return(
      <g key={id||'prev'} onClick={clickFn} style={clickFn?{cursor:'pointer'}:{}}>
        {isSel&&segments.map((seg,i)=><polyline key={'hl'+i} points={ptsToStr(seg)} fill="none" stroke="white" strokeWidth={8} opacity={0.2}/>)}
        {segments.map((seg,i)=><polyline key={i} points={ptsToStr(seg)} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round"/>)}
        {type==='measure'&&<><Arrow p1={p_start2} p2={start}/><Arrow p1={p_end2} p2={end}/><Tick pt={start} p2={end}/><Tick pt={end} p2={start}/></>}
        {type==='arrow'&&<Arrow p1={p_end2} p2={end}/>}
        <MidLabel pt={midScreen}/>
      </g>
    )
  }

  // ---- Notizen ----
  function openEditNote(note){setEditingNote(note);setNoteTitle(note.title);setNoteContent(note.content||'');setNoteIcon(note.icon||'📌');setShowNoteModal(true)}
  async function saveNote(e){
    e.preventDefault();if(!noteTitle.trim())return;setSaving(true)
    const supabase=createClient()
    if(editingNote){await supabase.from('notes').update({title:noteTitle.trim(),content:noteContent.trim(),icon:noteIcon}).eq('id',editingNote.id)}
    else{const c=window.__pendingNoteCoords||{yaw:0,pitch:0};await supabase.from('notes').insert({photo_id:photoId,user_id:user.id,title:noteTitle.trim(),content:noteContent.trim(),yaw:c.yaw,pitch:c.pitch,icon:noteIcon})}
    await loadNotes();setShowNoteModal(false);setSaving(false)
  }
  async function deleteNote(nId){
    if(!confirm('Notiz löschen?'))return
    await createClient().from('notes').delete().eq('id',nId)
    await loadNotes();setShowNoteModal(false)
  }

  const preview=getPreview()
  const isDrawTool=activeTool!=='select'
  if(loading) return <><Navbar/><div className="spinner"/></>

  return(
    <>
      <Navbar userEmail={user?.email}/>
      <div style={{display:'flex',height:'calc(100vh - 65px)',overflow:'hidden'}}>

        {/* Werkzeugleiste */}
        <div style={{width:56,background:'var(--bg2)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 0',gap:4,zIndex:20,flexShrink:0}}>
          {TOOLS.map(t=>(
            <button key={t.id} title={t.label} onClick={()=>{setActiveTool(t.id);setSelected(null)}} style={{width:40,height:40,borderRadius:8,border:'none',cursor:'pointer',background:activeTool===t.id?'var(--accent)':'transparent',color:activeTool===t.id?'white':'var(--text-muted)',fontSize:18,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}>{t.icon}</button>
          ))}
          <div style={{width:32,height:1,background:'var(--border)',margin:'6px 0'}}/>
          {COLORS.map(col=>(
            <button key={col} onClick={()=>setActiveColor(col)} style={{width:22,height:22,borderRadius:'50%',cursor:'pointer',outline:'none',background:col,border:activeColor===col?'2px solid white':'2px solid transparent',boxShadow:activeColor===col?'0 0 0 2px var(--accent)':'none'}}/>
          ))}
          {selected&&<><div style={{width:32,height:1,background:'var(--border)',margin:'6px 0'}}/><button onClick={()=>deleteAnnotation(selected)} style={{width:40,height:40,borderRadius:8,border:'none',cursor:'pointer',background:'rgba(239,68,68,0.15)',color:'#ef4444',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>🗑</button></>}
        </div>

        {/* Viewer */}
        <div style={{flex:1,position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:12,left:12,zIndex:30}}>
            <Link href={`/project/${photo.projects?.id}`} style={{display:'flex',alignItems:'center',gap:8,background:'rgba(0,0,0,0.7)',color:'white',padding:'8px 16px',borderRadius:10,fontSize:14,fontWeight:600,textDecoration:'none',backdropFilter:'blur(4px)',border:'1px solid rgba(255,255,255,0.15)'}}>
              <span style={{fontSize:18}}>←</span><span>{photo.projects?.name||'Zurück'}</span>
            </Link>
          </div>

          <div style={{position:'absolute',bottom:12,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.65)',color:'white',padding:'6px 16px',borderRadius:20,fontSize:12,zIndex:30,whiteSpace:'nowrap',pointerEvents:'none'}}>
            {activeTool==='select'  &&'Ziehen = Drehen · Text: Klick = auswählen, Doppelklick = bearbeiten'}
            {activeTool==='measure' &&'↔ Klicken & Ziehen → Bemaßungslinie'}
            {activeTool==='arrow'   &&'➜ Klicken & Ziehen → Pfeil'}
            {activeTool==='line'    &&'╱ Klicken & Ziehen → Linie'}
            {activeTool==='rect'    &&'▭ Klicken & Ziehen → Rechteck'}
            {activeTool==='text'    &&'T Klicken → Text platzieren'}
            {activeTool==='note'    &&'📌 Klicken → Pin setzen'}
          </div>

          <div ref={viewerRef} style={{width:'100%',height:'100%'}}/>

          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:20,pointerEvents:isDrawTool?'all':'none',cursor:isDrawTool?'crosshair':'default'}}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            {svgData.map(item=>renderAnn(item,false))}
            {activeTool==='select'&&svgData.filter(i=>i.type!=='text').map(item=>(
              item.segments?.flat().length>1?(
                <polyline key={'hit-'+item.id} points={ptsToStr(item.segments.flat())} fill="none" stroke="transparent" strokeWidth={24} style={{cursor:'pointer',pointerEvents:'all'}} onClick={()=>setSelected(selected===item.id?null:item.id)}/>
              ):null
            ))}
            {preview&&renderAnn(preview,true)}
          </svg>
        </div>

        {/* Sidebar */}
        <div style={{width:270,background:'var(--bg2)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden',flexShrink:0}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
            {[{id:'annotations',label:`✏️ Zeichnungen (${annotations.length})`},{id:'notes',label:`📌 Pins (${notes.length})`}].map(tab=>(
              <button key={tab.id} onClick={()=>setSidebarTab(tab.id)} style={{flex:1,padding:'11px 6px',border:'none',cursor:'pointer',fontSize:11,fontWeight:500,background:sidebarTab===tab.id?'var(--bg3)':'transparent',color:sidebarTab===tab.id?'var(--text)':'var(--text-muted)',borderBottom:sidebarTab===tab.id?'2px solid var(--accent)':'2px solid transparent'}}>{tab.label}</button>
            ))}
          </div>
          {sidebarTab==='annotations'&&(
            <div style={{flex:1,overflowY:'auto',padding:12}}>
              {annotations.length===0?(<div style={{textAlign:'center',color:'var(--text-muted)',paddingTop:40,fontSize:13}}><div style={{fontSize:32,marginBottom:8}}>✏️</div>Werkzeug wählen &amp; zeichnen!</div>)
              :annotations.map(ann=>(
                <div key={ann.id} onClick={()=>{setSelected(selected===ann.id?null:ann.id);if(ann.type==='text')openTextEdit(ann)}} style={{padding:'9px 12px',marginBottom:6,borderRadius:8,cursor:'pointer',background:selected===ann.id?'var(--bg3)':'transparent',border:`1px solid ${selected===ann.id?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:ann.color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{ann.type==='measure'?'↔ ':ann.type==='arrow'?'➜ ':ann.type==='line'?'╱ ':ann.type==='rect'?'▭ ':'T '}{ann.label||<span style={{color:'var(--text-muted)',fontStyle:'italic'}}>kein Label</span>}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{TOOLS.find(t=>t.id===ann.type)?.label}{ann.type==='text'&&' · Klick zum Bearbeiten'}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();deleteAnnotation(ann.id)}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14}}>🗑</button>
                </div>
              ))}
            </div>
          )}
          {sidebarTab==='notes'&&(
            <div style={{flex:1,overflowY:'auto',padding:12}}>
              <button className="btn btn-primary" style={{width:'100%',justifyContent:'center',marginBottom:12,fontSize:13}} onClick={()=>{setActiveTool('note');setSidebarTab('annotations')}}>+ Neuen Pin setzen</button>
              {notes.length===0?(<div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,paddingTop:20}}><div style={{fontSize:32,marginBottom:8}}>📌</div>Noch keine Pins.</div>)
              :notes.map(note=>(
                <div key={note.id} className="card" style={{marginBottom:8,padding:'10px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}} onClick={()=>openEditNote(note)}>
                  <span style={{fontSize:20}}>{note.icon||'📌'}</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{note.title}</div>
                    {note.content&&<div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{note.content}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Label-Eingabe */}
      {showLabelInput&&(
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:360}}>
            <h2 className="modal-title">{pendingAnnotation?.type==='measure'?'↔ Maß eingeben':pendingAnnotation?.type==='arrow'?'➜ Pfeil beschriften':'T Text eingeben'}</h2>
            <form onSubmit={confirmLabel}>
              <div className="form-group">
                <label className="label">{pendingAnnotation?.type==='measure'?'Maßangabe':'Text / Beschriftung'}</label>
                <input className="input" placeholder={pendingAnnotation?.type==='measure'?'z.B. 2,40 m':'Text eingeben...'} value={labelValue} onChange={e=>setLabelValue(e.target.value)} autoFocus/>
              </div>
              <div className="form-row">
                <button type="button" className="btn btn-outline" onClick={()=>{setShowLabelInput(false);setPendingAnnotation(null)}}>Abbrechen</button>
                <button type="submit" className="btn btn-primary">Einfügen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Text bearbeiten */}
      {showTextEdit&&(
        <div className="modal-overlay" onClick={()=>setShowTextEdit(false)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">✎ Text bearbeiten</h2>
            <form onSubmit={saveTextEdit}>
              <div className="form-group">
                <label className="label">Text</label>
                <input className="input" value={editTextLabel} onChange={e=>setEditTextLabel(e.target.value)} autoFocus/>
              </div>
              <div className="form-group">
                <label className="label">Schriftfarbe</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {COLORS.map(col=>(
                    <button key={col} type="button" onClick={()=>setEditTextColor(col)} style={{width:28,height:28,borderRadius:'50%',cursor:'pointer',border:editTextColor===col?'3px solid white':'2px solid transparent',background:col,boxShadow:editTextColor===col?'0 0 0 2px var(--accent)':'none'}}/>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Hintergrund</label>
                <div style={{display:'flex',gap:8}}>
                  {[['rgba(0,0,0,0.85)','Schwarz'],['rgba(255,255,255,0.9)','Weiß'],['rgba(79,110,247,0.9)','Blau'],['rgba(239,68,68,0.9)','Rot'],['transparent','Keiner']].map(([val,name])=>(
                    <button key={val} type="button" onClick={()=>setEditTextBg(val)} style={{padding:'4px 10px',borderRadius:6,border:editTextBg===val?'2px solid var(--accent)':'1px solid var(--border)',background:val==='transparent'?'var(--bg3)':val,color:val==='rgba(255,255,255,0.9)'?'#000':'white',fontSize:11,cursor:'pointer'}}>{name}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Schriftgröße: {editTextSize}px</label>
                <input type="range" min={10} max={40} value={editTextSize} onChange={e=>setEditTextSize(Number(e.target.value))} style={{width:'100%'}}/>
              </div>
              {/* Vorschau */}
              <div style={{marginBottom:16,padding:12,background:'var(--bg3)',borderRadius:8,textAlign:'center'}}>
                <span style={{background:editTextBg,color:editTextColor,fontSize:editTextSize,fontWeight:700,padding:'4px 10px',borderRadius:5,fontFamily:'Inter,sans-serif'}}>{editTextLabel||'Vorschau'}</span>
              </div>
              <div className="form-row">
                <button type="button" className="btn btn-danger" style={{marginRight:'auto'}} onClick={()=>{deleteAnnotation(editTextAnn.id);setShowTextEdit(false)}}>🗑 Löschen</button>
                <button type="button" className="btn btn-outline" onClick={()=>setShowTextEdit(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notiz-Modal mit Icon-Auswahl */}
      {showNoteModal&&(
        <div className="modal-overlay" onClick={()=>setShowNoteModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">{editingNote?'Pin bearbeiten':'Neuer Pin'}</h2>
            <form onSubmit={saveNote}>
              <div className="form-group">
                <label className="label">Icon auswählen</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:4}}>
                  {PIN_ICONS.map(icon=>(
                    <button key={icon} type="button" onClick={()=>setNoteIcon(icon)} style={{width:38,height:38,borderRadius:8,border:noteIcon===icon?'2px solid var(--accent)':'1px solid var(--border)',background:noteIcon===icon?'var(--bg3)':'transparent',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Titel *</label>
                <input className="input" placeholder="z.B. Kabelweg" value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} required autoFocus/>
              </div>
              <div className="form-group">
                <label className="label">Details (optional)</label>
                <textarea className="input" rows={3} value={noteContent} onChange={e=>setNoteContent(e.target.value)}/>
              </div>
              <div className="form-row">
                {editingNote&&<button type="button" className="btn btn-danger" style={{marginRight:'auto'}} onClick={()=>deleteNote(editingNote.id)}>🗑 Löschen</button>}
                <button type="button" className="btn btn-outline" onClick={()=>setShowNoteModal(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Speichern...':'Speichern'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .pnlm-hotspot-base { cursor: pointer !important; background: transparent !important; border: none !important; }
        .note-hotspot { background: transparent !important; border: none !important; font-size: 22px; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.8)); }
        .pnlm-tooltip { background: rgba(0,0,0,0.85) !important; border-radius: 8px !important; font-size: 13px !important; }
      `}</style>
    </>
  )
}
