'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useProjection, AnnShape } from '@/components/AnnotationLayer'

export default function ShareViewerPage() {
  const params  = useParams()
  const token   = params.token
  const photoId = params.photoId

  const [photo, setPhoto]       = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [notes, setNotes]       = useState([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeNote, setActiveNote] = useState(null)
  const [viewerSize, setViewerSize] = useState({ w:800, h:600 })
  const [showLabels, setShowLabels] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const viewerRef    = useRef(null)
  const pannellumRef = useRef(null)

  const { svgData } = useProjection(pannellumRef, viewerRef, annotations, viewerSize)

  useEffect(() => {
    async function load() {
      const sb = createClient()
      const { data: link } = await sb.from('share_links').select('project_id').eq('token', token).single()
      if (!link) { setNotFound(true); setLoading(false); return }
      const { data: proj } = await sb.from('projects').select('name').eq('id', link.project_id).single()
      setProjectName(proj?.name||'')
      const { data: ph } = await sb.from('photos').select('*').eq('id', photoId).eq('project_id', link.project_id).single()
      if (!ph) { setNotFound(true); setLoading(false); return }
      setPhoto(ph)
      const [{ data: anns }, { data: nts }] = await Promise.all([
        sb.from('annotations').select('*').eq('photo_id', photoId),
        sb.from('notes').select('*').eq('photo_id', photoId)
      ])
      setAnnotations(anns||[])
      setNotes(nts||[])
      setLoading(false)
    }
    load()
  }, [token, photoId])

  useEffect(() => {
    if (loading||!photo) return
    function init() {
      if (!viewerRef.current||pannellumRef.current) return
      pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
        type:'equirectangular', panorama:photo.public_url,
        autoLoad:true, showControls:true, mouseZoom:true, hfov:100,
        hotSpots: notes.map(n=>({
          id:'note-'+n.id, pitch:n.pitch, yaw:n.yaw, type:'info',
          text:`<strong>${n.title}</strong>${n.content?'<br>'+n.content:''}`,
          cssClass:'note-hotspot',
          createTooltipFunc:(el)=>{
            const sz=n.icon_size||24
            el.style.fontSize=sz+'px'
            el.style.cursor='pointer'
            el.style.lineHeight='1'
            el.style.filter='drop-shadow(0 2px 4px rgba(0,0,0,0.8))'
            el.textContent=n.icon||'📌'
            el.onclick=()=>setActiveNote(n)
          }
        }))
      })
      if(viewerRef.current){const r=viewerRef.current.getBoundingClientRect();setViewerSize({w:r.width,h:r.height})}
    }
    if(!window.pannellum){const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';s.onload=init;document.head.appendChild(s)}else{init()}
  }, [loading, photo, notes])

  useEffect(()=>{
    function onResize(){if(viewerRef.current){const r=viewerRef.current.getBoundingClientRect();setViewerSize({w:r.width,h:r.height})}}
    window.addEventListener('resize',onResize);return()=>window.removeEventListener('resize',onResize)
  },[])

  function toggleFullscreen(){
    if(!document.fullscreenElement){
      document.documentElement.requestFullscreen?.().catch(()=>{})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(()=>{})
      setIsFullscreen(false)
    }
  }
  useEffect(()=>{
    function onFsChange(){setIsFullscreen(!!document.fullscreenElement)}
    document.addEventListener('fullscreenchange',onFsChange)
    return()=>document.removeEventListener('fullscreenchange',onFsChange)
  },[])

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)'}}><div className="spinner"/></div>
  if(notFound) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg)',color:'var(--text)'}}><div style={{fontSize:48,marginBottom:16}}>🔒</div><h1>Link ungültig</h1></div>

  return (
    <>
      <nav className="navbar">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <img src="/logo.png" alt="Elektro Pees" style={{height:36,width:'auto'}}/>
          <div style={{lineHeight:1.2}}>
            <div style={{fontSize:13,fontWeight:700}}>360° Viewer</div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>by Elektro Pees</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <Link href={`/share/${token}`} style={{display:'flex',alignItems:'center',gap:8,background:'var(--bg3)',border:'1px solid var(--border)',color:'var(--text)',textDecoration:'none',padding:'8px 16px',borderRadius:10,fontSize:14,fontWeight:600}}>
            <span style={{fontSize:18}}>←</span><span>{projectName}</span>
          </Link>
          <div style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.3)',color:'#22c55e',padding:'5px 12px',borderRadius:20,fontSize:12}}>👁 Nur-Lesen</div>
        </div>
      </nav>

      <div style={{height:'calc(100vh - 65px)',position:'relative'}}>
        <div ref={viewerRef} style={{width:'100%',height:'100%'}}/>

        {/* Annotations — identischer Renderer wie Admin, nur ohne Click-Handler */}
        <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:20,pointerEvents:'none'}}>
          {svgData.map(item=><AnnShape key={item.id} item={item} showLabels={showLabels}/>)}
        </svg>

        {/* Oben-links: Vollbild + Labels Toggle */}
        <div style={{position:'absolute',top:12,left:12,zIndex:30,display:'flex',gap:8,alignItems:'center'}}>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen?'Vollbild beenden':'Vollbild'}
            style={{width:40,height:40,borderRadius:10,border:'none',cursor:'pointer',background:'rgba(0,0,0,0.7)',color:'white',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)',boxShadow:'0 2px 8px rgba(0,0,0,0.4)'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isFullscreen
                ? <><polyline points="8 3 3 3 3 8"/><line x1="3" y1="3" x2="10" y2="10"/><polyline points="16 21 21 21 21 16"/><line x1="14" y1="14" x2="21" y2="21"/></>
                : <><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="14" y2="10"/><polyline points="9 21 3 21 3 15"/><line x1="3" y1="21" x2="10" y2="14"/></>
              }
            </svg>
          </button>
          <button
            onClick={()=>setShowLabels(v=>!v)}
            title={showLabels?'Labels ausblenden':'Labels einblenden'}
            style={{width:40,height:40,borderRadius:10,border:'none',cursor:'pointer',background:showLabels?'rgba(0,0,0,0.7)':'rgba(255,149,0,0.85)',color:'white',fontSize:14,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)',boxShadow:'0 2px 8px rgba(0,0,0,0.4)',position:'relative'}}>
            T
            {!showLabels&&<span style={{position:'absolute',top:3,right:3,width:7,height:7,borderRadius:'50%',background:'white'}}/>}
          </button>
          <div style={{background:'rgba(0,0,0,0.65)',color:'white',padding:'6px 14px',borderRadius:8,fontSize:13,backdropFilter:'blur(4px)'}}>
            🌐 {photo.name}
          </div>
        </div>

        {activeNote&&(
          <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',zIndex:30,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 20px',minWidth:260,maxWidth:380}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{fontWeight:600,fontSize:15}}>{activeNote.icon||'📌'} {activeNote.title}</div>
              <button onClick={()=>setActiveNote(null)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            {activeNote.content&&<div style={{fontSize:13,color:'var(--text-muted)',marginTop:6}}>{activeNote.content}</div>}
          </div>
        )}
      </div>

      <style>{`
        .pnlm-hotspot-base{cursor:pointer!important;background:transparent!important;border:none!important;width:auto!important;height:auto!important;}
        .note-hotspot{background:transparent!important;border:none!important;}
        .pnlm-tooltip{background:rgba(0,0,0,0.85)!important;border-radius:8px!important;font-size:13px!important;}
      `}</style>
    </>
  )
}
