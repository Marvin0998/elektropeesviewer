'use client'
import { useEffect, useRef, useState } from 'react'

const SEGMENTS = 32
const D2R = Math.PI / 180

export function useProjection(pannellumRef, viewerRef, annotations, viewerSize) {
  const [svgData, setSvgData] = useState([])
  const animRef = useRef(null)

  function worldToScreen(yaw, pitch) {
    if (!pannellumRef.current || !viewerRef.current) return null
    const pn = pannellumRef.current
    const rect = viewerRef.current.getBoundingClientRect()
    const W = rect.width, H = rect.height
    const hfovR = pn.getHfov()*D2R, vYawR = pn.getYaw()*D2R, vPitR = pn.getPitch()*D2R
    const pYawR = yaw*D2R, pPitR = pitch*D2R
    const px=Math.cos(pPitR)*Math.sin(pYawR),py=Math.sin(pPitR),pz=Math.cos(pPitR)*Math.cos(pYawR)
    const cx=Math.cos(vPitR)*Math.sin(vYawR),cy=Math.sin(vPitR),cz=Math.cos(vPitR)*Math.cos(vYawR)
    const dot=px*cx+py*cy+pz*cz
    if(dot<=0.001) return null
    const rx=Math.cos(vYawR),ry=0,rz=-Math.sin(vYawR)
    const ux=-Math.sin(vPitR)*Math.sin(vYawR),uy=Math.cos(vPitR),uz=-Math.sin(vPitR)*Math.cos(vYawR)
    const xp=(px*rx+py*ry+pz*rz)/dot,yp=(px*ux+py*uy+pz*uz)/dot
    const f=W/(2*Math.tan(hfovR/2))
    const sx=W/2+xp*f,sy=H/2-yp*f
    if(sx<-200||sx>W+200||sy<-200||sy>H+200) return null
    return {x:sx,y:sy}
  }

  function toVec(y,p){return{x:Math.cos(p*D2R)*Math.sin(y*D2R),y:Math.sin(p*D2R),z:Math.cos(p*D2R)*Math.cos(y*D2R)}}
  function fromVec(v){return{yaw:Math.atan2(v.x,v.z)/D2R,pitch:Math.asin(Math.max(-1,Math.min(1,v.y)))/D2R}}
  function slerp(a,b,t){
    const dot=Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y+a.z*b.z)),th=Math.acos(dot)
    if(Math.abs(th)<0.0001)return{...a}
    const s=Math.sin(th)
    return{x:(Math.sin((1-t)*th)/s)*a.x+(Math.sin(t*th)/s)*b.x,y:(Math.sin((1-t)*th)/s)*a.y+(Math.sin(t*th)/s)*b.y,z:(Math.sin((1-t)*th)/s)*a.z+(Math.sin(t*th)/s)*b.z}
  }

  function geodesicToPolyline(y1,p1,y2,p2){
    const va=toVec(y1,p1),vb=toVec(y2,p2),segs=[];let cur=[]
    for(let i=0;i<=SEGMENTS;i++){
      const v=slerp(va,vb,i/SEGMENTS),pt=fromVec(v),s=worldToScreen(pt.yaw,pt.pitch)
      if(s){cur.push(s)}else{if(cur.length>1)segs.push(cur);cur=[]}
    }
    if(cur.length>1)segs.push(cur);return segs
  }

  function rectCorners(y1,p1,y2,p2){
    const c=[worldToScreen(y1,p1),worldToScreen(y2,p1),worldToScreen(y2,p2),worldToScreen(y1,p2)]
    return c.some(x=>!x)?null:c
  }

  useEffect(()=>{
    function tick(){
      if(!pannellumRef.current){animRef.current=requestAnimationFrame(tick);return}
      setSvgData(annotations.map(ann=>{
        const segs=geodesicToPolyline(ann.x1,ann.y1,ann.x2,ann.y2)
        const mg=fromVec(slerp(toVec(ann.x1,ann.y1),toVec(ann.x2,ann.y2),0.5))
        return{
          ...ann,
          segments:segs,
          midScreen:worldToScreen(mg.yaw,mg.pitch),
          start:worldToScreen(ann.x1,ann.y1),
          end:worldToScreen(ann.x2,ann.y2),
          rectCorners:ann.type==='rect'?rectCorners(ann.x1,ann.y1,ann.x2,ann.y2):null
        }
      }))
      animRef.current=requestAnimationFrame(tick)
    }
    animRef.current=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(animRef.current)
  },[annotations,viewerSize])

  return{svgData,worldToScreen}
}

export function AnnShape({item,isPreview=false,selected=false,onClick,onDoubleClick}){
  const{segments,midScreen,start,end,color,type,label,id,rectCorners}=item
  const data = item.data || {}
  const opacity = data.opacity ?? 1
  const sw=selected?3:2
  const dash=isPreview?'8 4':undefined
  const props={onClick,onDoubleClick,style:onClick?{cursor:'pointer'}:{}}

  function ptsToStr(pts){return pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
  const firstSeg=segments?.[0],lastSeg=segments?.[segments.length-1]
  const p_start2=firstSeg?.length>=2?firstSeg[1]:null
  const p_end2=lastSeg?.length>=2?lastSeg[lastSeg.length-2]:null

  function Arrow({p1,p2}){
    if(!p1||!p2)return null
    const a=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI
    return<polygon points="-10,5 0,0 -10,-5" fill={color} opacity={opacity} transform={`translate(${p2.x},${p2.y}) rotate(${a})`}/>
  }
  function Tick({pt,p2}){
    if(!pt||!p2)return null
    const a=Math.atan2(p2.y-pt.y,p2.x-pt.x),px=Math.sin(a)*12,py=-Math.cos(a)*12
    return<line x1={pt.x-px} y1={pt.y-py} x2={pt.x+px} y2={pt.y+py} stroke={color} strokeWidth={2} opacity={opacity} strokeLinecap="round"/>
  }
  function MidLabel({pt}){
    if(!label||!pt||type==='text')return null
    const w=label.length*8+18
    return<g opacity={opacity}><rect x={pt.x-w/2} y={pt.y-13} width={w} height={22} rx={5} fill="rgba(0,0,0,0.82)"/><text x={pt.x} y={pt.y+4} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>
  }

  // RECHTECK
  if(type==='rect'){
    if(!rectCorners)return null
    const ptStr=rectCorners.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const cx=rectCorners.reduce((s,p)=>s+p.x,0)/4
    const cy=rectCorners.reduce((s,p)=>s+p.y,0)/4
    const fillOpacity=(data?.fillOpacity??0.5)*opacity  // füllfarbe × gesamtopacity
    const strokeOpacity=opacity
    return<g key={id||'prev'} {...props}>
      {selected&&<polygon points={ptStr} fill="white" opacity={0.1}/>}
      <polygon points={ptStr} stroke={color} strokeWidth={sw} strokeOpacity={strokeOpacity} fill={color} fillOpacity={fillOpacity} strokeDasharray={dash}/>
      {label&&<g opacity={opacity}><rect x={cx-label.length*4-6} y={cy-13} width={label.length*8+12} height={22} rx={5} fill="rgba(0,0,0,0.82)"/><text x={cx} y={cy+4} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>}
    </g>
  }

  // TEXT
  if(type==='text'){
    if(!start||!label)return null
    const fontSize=data?.size||15
    const bg=data?.bg||'rgba(0,0,0,0.85)'
    const lines=label.split('\n')
    const lineH=fontSize*1.3
    const maxW=Math.max(...lines.map(l=>l.length))*fontSize*0.62+16
    const totalH=lines.length*lineH+8
    return<g key={id||'prev'} {...props} opacity={opacity}>
      {selected&&<rect x={start.x-6} y={start.y-6} width={maxW+8} height={totalH+8} rx={7} fill="#4f6ef7" opacity={0.3}/>}
      <rect x={start.x-4} y={start.y-4} width={maxW} height={totalH} rx={5} fill={bg}/>
      {lines.map((line,i)=>(
        <text key={i} x={start.x+4} y={start.y+fontSize+i*lineH} fill={color} fontSize={fontSize} fontWeight={700} fontFamily="Inter,sans-serif">{line}</text>
      ))}
      {selected&&<text x={start.x} y={start.y-12} fill="rgba(255,255,255,0.7)" fontSize={10} fontFamily="Inter,sans-serif">✎ Bearbeiten</text>}
    </g>
  }

  // Text and rect already returned above — only lines reach here
  if(type==='text'||type==='rect') return null
  if(!segments||segments.length===0)return null

  return<g key={id||'prev'} {...props} opacity={opacity}>
    {selected&&segments.map((seg,i)=><polyline key={'hl'+i} points={ptsToStr(seg)} fill="none" stroke="white" strokeWidth={8} opacity={0.2}/>)}
    {segments.map((seg,i)=><polyline key={i} points={ptsToStr(seg)} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round"/>)}
    {type==='measure'&&<><Arrow p1={p_start2} p2={start}/><Arrow p1={p_end2} p2={end}/><Tick pt={start} p2={end}/><Tick pt={end} p2={start}/></>}
    {type==='arrow'&&<Arrow p1={p_end2} p2={end}/>}
    <MidLabel pt={midScreen}/>
  </g>
}
