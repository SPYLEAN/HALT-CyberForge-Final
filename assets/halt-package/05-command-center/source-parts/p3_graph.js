function mkq(a,b,bl){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;return{a:{x:a.x,y:a.y},c:{x:mx-dy/L*bl,y:my+dx/L*bl},b:{x:b.x,y:b.y}}}
const lp=(p,q,t)=>({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
function qsplit(q,t){const ab=lp(q.a,q.c,t),bc=lp(q.c,q.b,t),m=lp(ab,bc,t);return[{a:q.a,c:ab,b:m},{a:m,c:bc,b:q.b}]}
function qsub(q,t0,t1){const r=qsplit(q,t1)[0];return t0<=0?r:qsplit(r,t0/t1)[1]}
function qpt(q,t){const ab=lp(q.a,q.c,t),bc=lp(q.c,q.b,t);return lp(ab,bc,t)}
const qd=q=>`M${q.a.x.toFixed(1)} ${q.a.y.toFixed(1)}Q${q.c.x.toFixed(1)} ${q.c.y.toFixed(1)} ${q.b.x.toFixed(1)} ${q.b.y.toFixed(1)}`;
function glyph(n,x,y,o){
 const s=o.off?'#707D84':'#F1F0EA',f='#0B0F11',w=2.8,bar=o.off?'#707D84':'#3E9C86';
 let g='';
 if(n.k==='user')g=`<circle r="11" fill="${f}" stroke="${s}" stroke-width="${w}"/>`;
 else if(n.k==='ses')g=`<rect x="-15" y="-7" width="30" height="14" rx="7" fill="${f}" stroke="${s}" stroke-width="${w}"${n.fc?' stroke-dasharray="2 4"':''}/>`;
 else if(n.k==='api')g=`<polygon points="-14,-9 5,-9 15,0 5,9 -14,9" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>`;
 else if(n.k==='proc')g=`<rect x="-15" y="-10" width="30" height="20" rx="2" fill="${f}" stroke="${s}" stroke-width="${w}"/><rect x="-15" y="5" width="30" height="5" fill="${bar}"/>`;
 else if(n.k==='db')g=`<path d="M-12 -8a12 4.5 0 0 1 24 0v16a12 4.5 0 0 1 -24 0z" fill="${f}" stroke="${s}" stroke-width="${w}"/><path d="M-12 -8a12 4.5 0 0 0 24 0" fill="none" stroke="${s}" stroke-width="${w}"/>`;
 else g=`<polygon points="-13,-10 13,-10 0,13" fill="#D4572F" stroke="#D4572F" stroke-width="2" stroke-linejoin="round"/>`;
 let ev='';
 if(o.ev)ev=`<rect x="9" y="-18" width="8" height="8" fill="#F1F0EA" stroke="#0B0F11" stroke-width="2"/>`;
 return `<g transform="translate(${x} ${y})">${g}${ev}</g>`;
}
// opts: step, layers{obs,inf,fc,biz,plan}, applied (#actions applied), proposed(bool show plan), conflict(bool), path, sel, mini, off, fcAll, noLabels
function gSVG(o){
 const L=o.layers||{obs:1,inf:1,fc:1,biz:1,plan:1},step=o.step==null?6:o.step,ap=o.applied||0,plan=o.proposed||ap>0;
 const mini=o.mini,pset=o.path&&o.path!=='all'?PATHS.find(p=>p.id===o.path).e:null;
 const isCut=e=>e.cut&&((plan||ap>0)&&L.plan!==0&&(!o.conflict||e.cut!=='A3')||(o.conflict&&e.cut==='A3'&&plan));
 const done=e=>{const i=+e.cut[1];return ap>=i};
 const showFc=o.fcAll||(step>=6&&L.fc);
 let out='',lab='',rings='';
 // dependencies
 if(L.biz!==0){
  DEPS.forEach(d=>{const a=NODES[d[0]],b=NODES[d[1]],q=qsub(mkq(a,b,d[2]||0),.12,.88);const off=o.off&&!['supp'].includes(d[0]);
   out+=`<path d="${qd(q)}" fill="none" stroke="${off?'#707D84':'#3E9C86'}" stroke-width="2" ${off?'stroke-dasharray="3 5" opacity=".6"':''}/>`});
  SPINE.forEach(d=>{const a=NODES[d[0]],b=NODES[d[1]],q=qsub(mkq(a,b,d[2]),.1,.9);const off=o.off&&d[0]!=='staff';
   out+=`<path d="${qd(q)}" fill="none" stroke="${off?'#707D84':'#3E9C86'}" stroke-width="${off?3:7}" ${off?'stroke-dasharray="3 6"':'stroke-opacity=".9"'} stroke-linecap="butt"/>`});
 }
 EDGES.forEach(e=>{
  if(e.k==='obs'&&(!L.obs||e.st>step))return;
  if(e.k==='inf'&&(!L.inf||e.st>step))return;
  if(e.k==='fc'&&!showFc)return;
  const a=NODES[e.a],b=NODES[e.b],full=mkq(a,b,e.bl),q=qsub(full,.07,.93);
  const dim=pset&&pset.indexOf(e.id)<0;const op=dim?.12:1;
  const sty=e.k==='obs'?'stroke="#D4572F" stroke-width="3"':e.k==='fc'?'stroke="#D4572F" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"':'stroke="#9AA3A8" stroke-width="2" stroke-dasharray="6 4"';
  let body;
  if(isCut(e)&&(e.cut&&(done(e)||o.conflict&&e.cut==='A3'&&false))){
   const [p1,p2]=qsplit(q,.5);
   body=`<path d="${qd(p1)}" fill="none" ${sty}/><path d="${qd(p2)}" fill="none" ${sty.replace(/stroke="#D4572F"/,'stroke="#D4572F" stroke-opacity=".3"')}/>`;
   const m=qpt(q,.5);rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="8" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2.6"/><circle r="2.8" fill="#3E9C86"/></g>`;
  }else{
   body=`<path d="${qd(q)}" fill="none" ${sty}/>`;
   if(isCut(e)&&(plan||ap>0)&&L.plan!==0&&!mini){const m=qpt(q,.5);const bad=o.conflict&&e.cut==='A3';
    rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="8" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2" stroke-dasharray="3 3"/>${bad?'<path d="M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5" stroke="#F1F0EA" stroke-width="2"/>':''}</g>`}
   else if(isCut(e)&&mini){const m=qpt(q,.5);rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="6" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2.4"/><circle r="2.2" fill="#3E9C86"/></g>`}
  }
  if(e.k==='obs'){const m=qpt(q,.5);body+=`<rect x="${(m.x-4).toFixed(1)}" y="${(m.y-4).toFixed(1)}" width="8" height="8" fill="#F1F0EA" stroke="#0B0F11" stroke-width="2"/>`}
  out+=`<g data-ent="e:${e.id}" class="gn" opacity="${op}"><path d="${qd(q)}" fill="none" stroke="transparent" stroke-width="16"/>${body}</g>`;
 });
 out+=rings;
 // nodes
 Object.keys(NODES).forEach(k=>{
  const n=NODES[k];
  if(n.st&&n.st>step)return;
  if(n.fc&&!showFc)return;
  if(!L.obs&&n.k!=='api'&&!n.biz&&!n.fc)return;
  if(n.biz&&!L.biz&&!['fapi','db','pay','payroll','recon'].includes(k))return;
  const off=o.off&&n.biz&&k!=='staff'&&k!=='supp'?1:0;
  const ev=(['user','s1','s2','grant'].includes(k)&&step>=(n.st||1))?1:0;
  const sel=o.sel===k;
  const dim=pset&&!EDGES.some(e=>pset.indexOf(e.id)>-1&&(e.a===k||e.b===k))?.2:1;
  let g=glyph(n,n.x,n.y,{off,ev:ev&&!mini});
  if(sel)g=`<circle cx="${n.x}" cy="${n.y}" r="${mini?22:24}" fill="none" stroke="#F1F0EA" stroke-width="1.5" stroke-dasharray="3 3"/>`+g;
  const hit=`<circle cx="${n.x}" cy="${n.y}" r="24" fill="transparent"/>`;
  let label='';
  if(!mini||['fapi','db','grant'].includes(k)&&o.noLabels!==1){
   const cls=n.k==='att'?'gl e':n.fc?'gl e':off?'gl d':n.biz?'gl':'gl';
   label=`<text class="${cls}" x="${n.x}" y="${n.y+(n.k==='db'?30:28)}" text-anchor="middle">${n.l}</text>`;
  }
  out+=`<g data-ent="n:${k}" class="gn" opacity="${dim}" tabindex="${mini?-1:0}" role="button" aria-label="${n.l}">${hit}${g}${label}</g>`;
 });
 if(!mini){
  if(showFc)out+=`<text class="gl e" x="940" y="26" text-anchor="end">FORECAST LAYER · NOT OBSERVED</text>`;
  if(o.off)out+=`<text class="gl d" x="690" y="418" text-anchor="middle">OFFLINE · SIMULATED</text>`;
 }
 return `<svg viewBox="0 0 960 440" role="img" aria-label="ThreadGraph" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}
const legendHTML=`<div class="chips" style="gap:16px;font-size:11.5px;color:var(--text2);font-family:var(--fm);letter-spacing:.05em;text-transform:uppercase">
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#D4572F" stroke-width="3"/><rect x="11" y="2" width="8" height="8" fill="#F1F0EA"/></svg> Observed</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#9AA3A8" stroke-width="2" stroke-dasharray="6 4"/></svg> Inferred</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#D4572F" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/></svg> Forecast</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#3E9C86" stroke-width="2"/></svg> Business</span>
<span><svg width="20" height="14"><circle cx="10" cy="7" r="5.5" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2.2"/><circle cx="10" cy="7" r="2" fill="#3E9C86"/></svg> Cut applied</span>
<span><svg width="20" height="14"><circle cx="10" cy="7" r="5.5" fill="none" stroke="#F1F0EA" stroke-width="1.6" stroke-dasharray="3 3"/></svg> Proposed</span></div>`;
