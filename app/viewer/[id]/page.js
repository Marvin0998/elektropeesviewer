'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import { useProjection, AnnShape } from '@/components/AnnotationLayer'

const SelectIcon = () => (
  <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
    <path d="M 8 18 A 10 10 0 0 1 28 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <polygon points="28,18 23,13 32,12" fill="currentColor"/>
    <path d="M 28 18 A 10 10 0 0 1 8 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <polygon points="8,18 13,23 4,24" fill="currentColor"/>
    <text x="18" y="21" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">360°</text>
  </svg>
)

const PIN_ICONS = ['📌','📍','⚠️','💡','🔧','🔴','✅','❗','📷','🔌','⚡','🛠️','📋','🔎']
const COLORS = ['#ff3b3b','#ff9500','#ffcc00','#34c759','#007aff','#ffffff','#1a1a1a']
const TOOLS = [
  { id: 'select',  icon: <SelectIcon />, label: 'Drehen / Auswählen' },
  { id: 'measure', icon: '↔', label: 'Bemaßung' },
  { id: 'arrow',   icon: '➜', label: 'Pfeil' },
  { id: 'line',    icon: '╱', label: 'Linie' },
  { id: 'rect',    icon: '▭', label: 'Rechteck' },
  { id: 'text',    icon: 'T', label: 'Text' },
  { id: 'note',    icon: '📌', label: 'Notiz-Pin' },
]
const D2R = Math.PI / 180

export default function ViewerPage() {
  const router = useRouter()
  const params = useParams()
  const photoId = params.id

  const [user, setUser]       = useState(null)
  const [photo, setPhoto]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTool, setActiveTool]   = useState('select')
  const [activeColor, setActiveColor] = useState('#ff3b3b')
  const [annotations, setAnnotations] = useState([])
  const [notes, setNotes]             = useState([])
  const [selected, setSelected]       = useState(null)
  const [sidebarTab, setSidebarTab]   = useState('annotations')
  const [drawing, setDrawing]         = useState(null)
  const [drawStart, setDrawStart]     = useState(null)
  const [viewerSize, setViewerSize]   = useState({ w:800, h:600 })

  // Text drag
  const [draggingText, setDraggingText] = useState(null)

  // Modals
  const [showLabelInput, setShowLabelInput]       = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState(null)
  const [labelValue, setLabelValue]               = useState('')
  const [showNoteModal, setShowNoteModal]         = useState(false)
  const [editingNote, setEditingNote]             = useState(null)
  const [noteTitle, setNoteTitle]                 = useState('')
  const [noteContent, setNoteContent]             = useState('')
  const [noteIcon, setNoteIcon]                   = useState('📌')
  const [noteIconSize, setNoteIconSize]           = useState(24)
  const [saving, setSaving]                       = useState(false)
  const [showTextEdit, setShowTextEdit]           = useState(false)
  const [editTextAnn, setEditTextAnn]             = useState(null)
  const [editTextLabel, setEditTextLabel]         = useState('')
  const [editTextColor, setEditTextColor]         = useState('#ffffff')
  const [editTextBg, setEditTextBg]               = useState('rgba(0,0,0,0.85)')
  const [editTextSize, setEditTextSize]           = useState(15)

  // Rechteck bearbeiten
  const [showRectEdit, setShowRectEdit]   = useState(false)
  const [editRectAnn, setEditRectAnn]     = useState(null)
  const [editRectLabel, setEditRectLabel] = useState('')
  const [editRectColor, setEditRectColor] = useState('#ff3b3b')
  const [editRectFillOp, setEditRectFillOp] = useState(0.5)
  const [editRectOp, setEditRectOp]       = useState(1.0)

  // Allgemeine Opacity für alle Typen
  const [editTextOp, setEditTextOp]       = useState(1.0)

  const viewerRef    = useRef(null)
  const pannellumRef = useRef(null)

  const { svgData, worldToScreen } = useProjection(pannellumRef, viewerRef, annotations, viewerSize)

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
          const sz = n.icon_size || 24
          el.style.fontSize = sz+'px'
          el.style.cursor = 'pointer'
          el.style.lineHeight = '1'
          el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
          el.textContent = n.icon || '📌'
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
    const dx=cx+xp*rx-yp*ux,dy=cy+xp*ry-yp*uy,dz=cz+xp*rz-yp*uz
    const len=Math.hypot(dx,dy,dz)
    return { yaw: Math.atan2(dx/len,dz/len)/D2R, pitch: Math.asin(Math.max(-1,Math.min(1,dy/len)))/D2R }
  }

  // ---- Maus ----
  function handleMouseDown(e) {
    if (activeTool==='select') {
      // Text-Drag starten: Rechtsklick oder Ctrl+Klick auf selektierten Text
      const selAnn = svgData.find(a => a.id===selected && a.type==='text')
      if (selAnn && (e.button===2 || e.ctrlKey)) {
        e.preventDefault()
        setDraggingText(selAnn)
      }
      return
    }
    if (activeTool==='note') {
      const w=screenToWorld(e.clientX,e.clientY)
      window.__pendingNoteCoords=w||{yaw:0,pitch:0}
      setEditingNote(null);setNoteTitle('');setNoteContent('');setNoteIcon('📌');setNoteIconSize(24);setShowNoteModal(true);return
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
    // Text verschieben
    if (draggingText) {
      e.preventDefault()
      // Visuelles Feedback: Annotation live verschieben (ohne DB)
      return
    }
    if (!drawing) return
    e.preventDefault()
    const w=screenToWorld(e.clientX,e.clientY)
    if(w) setDrawing(d=>({...d,end:w}))
  }

  async function handleMouseUp(e) {
    // Text-Drop
    if (draggingText) {
      const w = screenToWorld(e.clientX, e.clientY)
      if (w) {
        await createClient().from('annotations').update({ x1:w.yaw, y1:w.pitch, x2:w.yaw, y2:w.pitch }).eq('id', draggingText.id)
        await loadAnnotations()
      }
      setDraggingText(null)
      return
    }
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
      await commitAnnotation(finished,'')
    }
    setDrawing(null);setDrawStart(null)
  }

  async function commitAnnotation(ann,label) {
    await createClient().from('annotations').insert({
      photo_id:photoId,user_id:user.id,
      type:ann.type,label:label||ann.label||'',color:ann.color,
      x1:ann.start?.yaw??ann.x1,y1:ann.start?.pitch??ann.y1,
      x2:ann.end?.yaw??ann.x2,y2:ann.end?.pitch??ann.y2,
      data:ann.data||{}
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

  function openRectEdit(ann) {
    setEditRectAnn(ann)
    setEditRectLabel(ann.label||'')
    setEditRectColor(ann.color||'#ff3b3b')
    setEditRectFillOp(ann.data?.fillOpacity??0.5)
    setEditRectOp(ann.data?.opacity??1.0)
    setShowRectEdit(true)
  }

  async function saveRectEdit(e) {
    e.preventDefault()
    await createClient().from('annotations').update({
      label: editRectLabel,
      color: editRectColor,
      data: { fillOpacity: editRectFillOp, opacity: editRectOp }
    }).eq('id', editRectAnn.id)
    setShowRectEdit(false); await loadAnnotations()
  }

  function openTextEdit(ann) {
    setEditTextAnn(ann);setEditTextLabel(ann.label||'')
    setEditTextColor(ann.color||'#ffffff')
    setEditTextBg(ann.data?.bg||'rgba(0,0,0,0.85)')
    setEditTextSize(ann.data?.size||15)
    setEditTextOp(ann.data?.opacity??1.0)
    setShowTextEdit(true)
  }

  async function saveTextEdit(e) {
    e.preventDefault()
    await createClient().from('annotations').update({
      label:editTextLabel, color:editTextColor,
      data:{bg:editTextBg, size:editTextSize, opacity:editTextOp}
    }).eq('id',editTextAnn.id)
    setShowTextEdit(false);await loadAnnotations()
  }

  function openEditNote(note) {
    setEditingNote(note);setNoteTitle(note.title);setNoteContent(note.content||'')
    setNoteIcon(note.icon||'📌');setNoteIconSize(note.icon_size||24);setShowNoteModal(true)
  }

  async function saveNote(e) {
    e.preventDefault();if(!noteTitle.trim())return;setSaving(true)
    const sb=createClient()
    if(editingNote){
      await sb.from('notes').update({title:noteTitle.trim(),content:noteContent.trim(),icon:noteIcon,icon_size:noteIconSize}).eq('id',editingNote.id)
    } else {
      const c=window.__pendingNoteCoords||{yaw:0,pitch:0}
      await sb.from('notes').insert({photo_id:photoId,user_id:user.id,title:noteTitle.trim(),content:noteContent.trim(),yaw:c.yaw,pitch:c.pitch,icon:noteIcon,icon_size:noteIconSize})
    }
    await loadNotes();setShowNoteModal(false);setSaving(false)
  }

  async function deleteNote(nId) {
    if(!confirm('Notiz löschen?'))return
    await createClient().from('notes').delete().eq('id',nId)
    await loadNotes();setShowNoteModal(false)
  }

  const isDrawTool = activeTool!=='select'
  const cursorStyle = draggingText ? 'grabbing' : isDrawTool ? 'crosshair' : 'default'

  if(loading) return <><Navbar/><div className="spinner"/></>

  return (
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
            {activeTool==='select' && (selected && svgData.find(a=>a.id===selected&&(a.type==='text'||a.type==='rect'))
              ? '→ Oben: ✎ Bearbeiten Button · Ctrl+Ziehen = Text verschieben'
              : 'Ziehen = Drehen · Annotation anklicken = auswählen')}
            {activeTool==='measure' &&'↔ Klicken & Ziehen → Bemaßungslinie'}
            {activeTool==='arrow'   &&'➜ Klicken & Ziehen → Pfeil'}
            {activeTool==='line'    &&'╱ Klicken & Ziehen → Linie'}
            {activeTool==='rect'    &&'▭ Klicken & Ziehen → Rechteck'}
            {activeTool==='text'    &&'T Klicken → Text platzieren'}
            {activeTool==='note'    &&'📌 Klicken → Pin setzen'}
          </div>

          {/* Schwebender Bearbeiten-Button wenn Text/Rect ausgewählt */}
          {selected && svgData.find(a=>a.id===selected&&(a.type==='text'||a.type==='rect')) && (
            <div style={{position:'absolute',top:60,left:'50%',transform:'translateX(-50%)',zIndex:31,display:'flex',gap:8}}>
              <button className="btn btn-primary" style={{fontSize:13,padding:'7px 16px',boxShadow:'0 2px 12px rgba(0,0,0,0.5)'}}
                onClick={()=>{
                  const ann=svgData.find(a=>a.id===selected)
                  if(ann?.type==='text')openTextEdit(ann)
                  else if(ann?.type==='rect')openRectEdit(ann)
                }}>
                ✎ Bearbeiten
              </button>
              <button className="btn btn-danger" style={{fontSize:13,padding:'7px 14px',boxShadow:'0 2px 12px rgba(0,0,0,0.5)'}}
                onClick={()=>deleteAnnotation(selected)}>
                🗑
              </button>
            </div>
          )}

          <div ref={viewerRef} style={{width:'100%',height:'100%'}}
            onContextMenu={e=>{
              if(selected && svgData.find(a=>a.id===selected&&a.type==='text')){e.preventDefault()}
            }}
          />
          {/* Unsichtbarer Layer der Pannellum-Doppelklick-Zoom verhindert */}
          <div
            style={{position:'absolute',inset:0,zIndex:19,pointerEvents:'none'}}
            onDoubleClick={e=>{
              e.preventDefault()
              e.stopPropagation()
              // Prüfen ob ein Text oder Rect unter dem Cursor ist
              const ann = svgData.find(a=>(a.type==='text'||a.type==='rect')&&a.start&&Math.hypot((a.start.x||0)-e.clientX+viewerRef.current?.getBoundingClientRect().left,(a.start.y||0)-e.clientX)<80)
            }}
          />

          <svg
            style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:20,pointerEvents:isDrawTool||draggingText?'all':'none',cursor:cursorStyle}}
            onMouseDown={e=>{
              if(activeTool==='select'&&!draggingText) return
              handleMouseDown(e)
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={e=>{
              e.preventDefault()
              e.stopPropagation()
              // Doppelklick: prüfe ob Text/Rect getroffen
              const rect=viewerRef.current?.getBoundingClientRect()
              if(!rect) return
              const hit=svgData.find(a=>{
                if(a.type==='text'&&a.start){
                  const fontSize=a.data?.size||15
                  const w=(a.label||'').length*fontSize*0.62+16
                  return e.clientX>=rect.left+a.start.x-4&&e.clientX<=rect.left+a.start.x+w&&e.clientY>=rect.top+a.start.y-fontSize-4&&e.clientY<=rect.top+a.start.y+fontSize+12
                }
                if(a.type==='rect'&&a.rectCorners){
                  const xs=a.rectCorners.map(p=>p.x),ys=a.rectCorners.map(p=>p.y)
                  const mx=e.clientX-rect.left,my=e.clientY-rect.top
                  return mx>=Math.min(...xs)&&mx<=Math.max(...xs)&&my>=Math.min(...ys)&&my<=Math.max(...ys)
                }
                return false
              })
              if(hit){
                if(hit.type==='text') openTextEdit(hit)
                if(hit.type==='rect') openRectEdit(hit)
              }
            }}
            onContextMenu={e=>e.preventDefault()}
          >
            {/* Transparenter Hintergrund damit Pannellum Events bekommt im Select-Modus */}
            {activeTool==='select'&&!draggingText&&<rect x="0" y="0" width="100%" height="100%" fill="transparent" style={{pointerEvents:'none'}}/>}
            {/* Gespeicherte Annotations */}
            {svgData.map(item=>(
              <AnnShape key={item.id} item={item} selected={selected===item.id}
                onClick={(e)=>{if(e){e.stopPropagation()}; setSelected(selected===item.id?null:item.id)}}
                onDoubleClick={undefined}
              />
            ))}

            {/* Klick-Flächen für Linien im Select-Modus */}
            {activeTool==='select'&&svgData.filter(i=>i.type!=='text'&&i.segments?.flat().length>1).map(item=>(
              <polyline key={'hit-'+item.id}
                points={item.segments.flat().map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                fill="none" stroke="transparent" strokeWidth={24}
                style={{cursor:'pointer',pointerEvents:'all'}}
                onClick={()=>setSelected(selected===item.id?null:item.id)}
              />
            ))}
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
                <div key={ann.id}
                  onClick={()=>{setSelected(selected===ann.id?null:ann.id)}}

                  style={{padding:'9px 12px',marginBottom:6,borderRadius:8,cursor:'pointer',background:selected===ann.id?'var(--bg3)':'transparent',border:`1px solid ${selected===ann.id?'var(--accent)':'var(--border)'}`,display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:ann.color,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{ann.type==='measure'?'↔ ':ann.type==='arrow'?'➜ ':ann.type==='line'?'╱ ':ann.type==='rect'?'▭ ':'T '}{ann.label||<span style={{color:'var(--text-muted)',fontStyle:'italic'}}>kein Label</span>}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{ann.type==='text'||ann.type==='rect'?'Klick → dann ✎ Bearbeiten':TOOLS.find(t=>t.id===ann.type)?.label}</div>
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
                  <span style={{fontSize:note.icon_size||24}}>{note.icon||'📌'}</span>
                  <div style={{flex:1,minWidth:0}}>
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
                <label className="label">{pendingAnnotation?.type==='measure'?'Maßangabe (z.B. 2,40 m)':'Text (Enter = neue Zeile)'}</label>
                {pendingAnnotation?.type==='measure'
                  ? <input className="input" placeholder="z.B. 2,40 m" value={labelValue} onChange={e=>setLabelValue(e.target.value)} autoFocus/>
                  : <textarea className="input" placeholder="Text eingeben..." value={labelValue} onChange={e=>setLabelValue(e.target.value)} autoFocus rows={3} style={{resize:'vertical'}}/>
                }
              </div>
              <div className="form-row">
                <button type="button" className="btn btn-outline" onClick={()=>{setShowLabelInput(false);setPendingAnnotation(null)}}>Abbrechen</button>
                <button type="submit" className="btn btn-primary">Einfügen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rechteck bearbeiten */}
      {showRectEdit&&(
        <div className="modal-overlay" onClick={()=>setShowRectEdit(false)}>
          <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">▭ Rechteck bearbeiten</h2>
            <form onSubmit={saveRectEdit}>
              <div className="form-group">
                <label className="label">Beschriftung (optional)</label>
                <input className="input" value={editRectLabel} onChange={e=>setEditRectLabel(e.target.value)} placeholder="z.B. Zensiert" autoFocus/>
              </div>
              <div className="form-group">
                <label className="label">Farbe</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {COLORS.map(col=>(
                    <button key={col} type="button" onClick={()=>setEditRectColor(col)} style={{width:30,height:30,borderRadius:'50%',cursor:'pointer',border:editRectColor===col?'3px solid white':'2px solid transparent',background:col,boxShadow:editRectColor===col?'0 0 0 2px var(--accent)':'none'}}/>
                  ))}
                  {/* Schwarz als Extra */}
                  {['#000000','#333333','#666666'].map(col=>(
                    <button key={col} type="button" onClick={()=>setEditRectColor(col)} style={{width:30,height:30,borderRadius:'50%',cursor:'pointer',border:editRectColor===col?'3px solid white':'2px solid transparent',background:col,boxShadow:editRectColor===col?'0 0 0 2px var(--accent)':'none'}}/>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Fülltransparenz: {Math.round((1-editRectFillOp)*100)}% transparent</label>
                <input type="range" min={0} max={1} step={0.05} value={editRectFillOp} onChange={e=>setEditRectFillOp(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                  <span>Komplett gefüllt</span><span>Durchsichtig</span>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Gesamttransparenz: {Math.round((1-editRectOp)*100)}% transparent</label>
                <input type="range" min={0.1} max={1} step={0.05} value={editRectOp} onChange={e=>setEditRectOp(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}}/>
              </div>
              {/* Live-Vorschau */}
              <div style={{marginBottom:16,padding:16,background:'repeating-linear-gradient(45deg,#333 0,#333 10px,#222 10px,#222 20px)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',minHeight:60}}>
                <div style={{width:120,height:50,background:editRectColor,opacity:editRectFillOp,border:'2px solid '+editRectColor,borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:12,fontWeight:700}}>{editRectLabel||'Vorschau'}</div>
              </div>
              <div className="form-row">
                <button type="button" className="btn btn-danger" style={{marginRight:'auto'}} onClick={()=>{deleteAnnotation(editRectAnn.id);setShowRectEdit(false)}}>🗑 Löschen</button>
                <button type="button" className="btn btn-outline" onClick={()=>setShowRectEdit(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Text bearbeiten */}
      {showTextEdit&&(
        <div className="modal-overlay" onClick={()=>setShowTextEdit(false)}>
          <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">✎ Text bearbeiten</h2>
            <form onSubmit={saveTextEdit}>
              <div className="form-group">
                <label className="label">Text (Enter = neue Zeile)</label>
                <textarea className="input" value={editTextLabel} onChange={e=>setEditTextLabel(e.target.value)} autoFocus rows={4} style={{resize:'vertical'}}/>
              </div>
              <div className="form-group">
                <label className="label">Schriftfarbe</label>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {COLORS.map(col=>(
                    <button key={col} type="button" onClick={()=>setEditTextColor(col)} style={{width:30,height:30,borderRadius:'50%',cursor:'pointer',border:editTextColor===col?'3px solid white':'2px solid transparent',background:col,boxShadow:editTextColor===col?'0 0 0 2px var(--accent)':'none'}}/>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Hintergrund</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {[['rgba(0,0,0,0.85)','⬛ Schwarz'],['rgba(255,255,255,0.92)','⬜ Weiß'],['rgba(79,110,247,0.9)','🟦 Blau'],['rgba(239,68,68,0.9)','🟥 Rot'],['rgba(34,197,94,0.9)','🟩 Grün'],['rgba(255,149,0,0.9)','🟧 Orange'],['transparent','✖ Keiner']].map(([val,name])=>(
                    <button key={val} type="button" onClick={()=>setEditTextBg(val)} style={{padding:'5px 10px',borderRadius:6,border:editTextBg===val?'2px solid var(--accent)':'1px solid var(--border)',background:val==='transparent'?'var(--bg3)':val,color:val.includes('255,255,255')?'#000':'white',fontSize:11,cursor:'pointer'}}>{name}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Schriftgröße: {editTextSize}px</label>
                <input type="range" min={10} max={48} value={editTextSize} onChange={e=>setEditTextSize(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}}/>
              </div>
              <div className="form-group">
                <label className="label">Transparenz: {Math.round((1-editTextOp)*100)}% transparent</label>
                <input type="range" min={0.1} max={1} step={0.05} value={editTextOp} onChange={e=>setEditTextOp(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)'}}/>
              </div>
              {/* Live-Vorschau */}
              <div style={{marginBottom:16,padding:16,background:'var(--bg3)',borderRadius:8,textAlign:'center',minHeight:50,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{background:editTextBg,color:editTextColor,fontSize:editTextSize,fontWeight:700,padding:'4px 12px',borderRadius:5,fontFamily:'Inter,sans-serif'}}>{editTextLabel||'Vorschau'}</span>
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

      {/* Notiz-Modal mit Icon + Größe */}
      {showNoteModal&&(
        <div className="modal-overlay" onClick={()=>setShowNoteModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">{editingNote?`${noteIcon} Pin bearbeiten`:'Neuer Pin'}</h2>
            <form onSubmit={saveNote}>
              <div className="form-group">
                <label className="label">Icon auswählen</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                  {PIN_ICONS.map(icon=>(
                    <button key={icon} type="button" onClick={()=>setNoteIcon(icon)} style={{width:40,height:40,borderRadius:8,border:noteIcon===icon?'2px solid var(--accent)':'1px solid var(--border)',background:noteIcon===icon?'rgba(79,110,247,0.15)':'transparent',fontSize:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.1s'}}>{icon}</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Icon-Größe: <span style={{color:'var(--text)'}}>{noteIconSize}px</span></label>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <input type="range" min={16} max={48} value={noteIconSize} onChange={e=>setNoteIconSize(Number(e.target.value))} style={{flex:1,accentColor:'var(--accent)'}}/>
                  <span style={{fontSize:noteIconSize,lineHeight:1}}>{noteIcon}</span>
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
        .pnlm-hotspot-base { cursor:pointer!important; background:transparent!important; border:none!important; width:auto!important; height:auto!important; }
        .note-hotspot { background:transparent!important; border:none!important; }
        .pnlm-tooltip { background:rgba(0,0,0,0.85)!important; border-radius:8px!important; font-size:13px!important; }
      `}</style>
    </>
  )
}
