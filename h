warning: in the working copy of 'app/components/AnnotationLayer.js', CRLF will be replaced by LF the next time Git touches it
[1mdiff --git a/app/components/AnnotationLayer.js b/app/components/AnnotationLayer.js[m
[1mindex 819b5cf..6599285 100644[m
[1m--- a/app/components/AnnotationLayer.js[m
[1m+++ b/app/components/AnnotationLayer.js[m
[36m@@ -88,17 +88,17 @@[m [mexport function AnnShape({item,isPreview=false,selected=false,showLabels=true,on[m
   const p_start2=firstSeg?.length>=2?firstSeg[1]:null[m
   const p_end2=lastSeg?.length>=2?lastSeg[lastSeg.length-2]:null[m
 [m
[31m-  function Arrow({p1,p2}){[m
[32m+[m[32m  function arrow(p1,p2){[m
     if(!p1||!p2)return null[m
     const a=Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI[m
     return<polygon points="-10,5 0,0 -10,-5" fill={color} opacity={opacity} transform={`translate(${p2.x},${p2.y}) rotate(${a})`}/>[m
   }[m
[31m-  function Tick({pt,p2}){[m
[32m+[m[32m  function tick(pt,p2){[m
     if(!pt||!p2)return null[m
     const a=Math.atan2(p2.y-pt.y,p2.x-pt.x),px=Math.sin(a)*12,py=-Math.cos(a)*12[m
     return<line x1={pt.x-px} y1={pt.y-py} x2={pt.x+px} y2={pt.y+py} stroke={color} strokeWidth={2} opacity={opacity} strokeLinecap="round"/>[m
   }[m
[31m-  function MidLabel({pt}){[m
[32m+[m[32m  function midLabel(pt){[m
     if(!label||!pt||type==='text')return null[m
     const w=label.length*8+18[m
     return<g opacity={opacity} style={{display:showLabels?undefined:'none'}}><rect x={pt.x-w/2} y={pt.y-13} width={w} height={22} rx={5} fill="rgba(0,0,0,0.82)"/><text x={pt.x} y={pt.y+4} textAnchor="middle" fill={color} fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">{label}</text></g>[m
[36m@@ -138,8 +138,8 @@[m [mexport function AnnShape({item,isPreview=false,selected=false,showLabels=true,on[m
   return<g key={id||'prev'} {...props} opacity={opacity}>[m
     {selected&&segments.map((seg,i)=><polyline key={'hl'+i} points={ptsToStr(seg)} fill="none" stroke="white" strokeWidth={8} opacity={0.2}/>)}[m
     {segments.map((seg,i)=><polyline key={i} points={ptsToStr(seg)} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round"/>)}[m
[31m-    {type==='measure'&&<><Arrow p1={p_start2} p2={start}/><Arrow p1={p_end2} p2={end}/><Tick pt={start} p2={end}/><Tick pt={end} p2={start}/></>}[m
[31m-    {type==='arrow'&&<Arrow p1={p_end2} p2={end}/>}[m
[31m-    <MidLabel pt={midScreen}/>[m
[32m+[m[32m    {type==='measure'&&<>{arrow(p_start2,start)}{arrow(p_end2,end)}{tick(start,end)}{tick(end,start)}</>}[m
[32m+[m[32m    {type==='arrow'&&arrow(p_end2,end)}[m
[32m+[m[32m    {midLabel(midScreen)}[m
   </g>[m
 }[m
