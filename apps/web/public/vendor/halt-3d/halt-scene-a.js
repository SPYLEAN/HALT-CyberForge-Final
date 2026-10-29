/* HaltScene part A: model data + procedural geometry factory. Requires THREE r128. */
const HM={
 nodes:{
  staff:{t:'user',x:-10.4,y:-2.6,l:'Finance staff'},
  phish:{t:'app',x:-10.4,y:5.4,h:1,l:'Attacker infrastructure'},
  adev:{t:'device',x:-10.4,y:0.9,h:1,l:'Unknown device'},
  user:{t:'user',x:-7,y:3.4,l:'M. Verma'},
  dev1:{t:'device',x:-7,y:-1.0,l:'Managed laptop'},
  grant:{t:'app',x:-4.6,y:5.8,h:1,l:'DocuSync Pro'},
  tok:{t:'token',x:-4.6,y:2.4,l:'Refresh token'},
  s1:{t:'token',x:-4.6,y:-2.6,l:'Session S-1'},
  s2:{t:'token',x:-4.6,y:-4.7,l:'Session S-2'},
  fapi:{t:'service',x:5.0,y:5.0,l:'Finance API',b:1},
  payroll:{t:'service',x:7.9,y:3.0,l:'Payroll',b:1},
  pay:{t:'service',x:7.9,y:-1.8,l:'Payment processing',b:1},
  recon:{t:'service',x:5.0,y:-5.0,l:'Reconciliation',b:1},
  db:{t:'database',x:10.9,y:0.6,l:'Finance database'}
 },
 techOrder:['phish','adev','user','grant','tok','s1','s2','dev1'],
 bizOrder:['fapi','payroll','pay','recon'],
 // k: obs | inf | fc | dep ; cut: blocked marker lands on this edge in Safe Containment
 edges:[
  {id:'e1',a:'phish',b:'user',k:'obs',o:0},{id:'e2',a:'adev',b:'user',k:'obs',o:1},{id:'e3',a:'user',b:'grant',k:'obs',o:2},
  {id:'e4',a:'adev',b:'s1',k:'obs',o:4,bl:-1.2},{id:'e5',a:'adev',b:'s2',k:'obs',o:5,bl:-2.4},
  {id:'e6',a:'s1',b:'fapi',k:'obs',o:6,bl:1.5,cut:1},{id:'e7',a:'s2',b:'pay',k:'obs',o:7,bl:-1.2,cut:1},
  {id:'i1',a:'grant',b:'tok',k:'inf',o:4,bl:.5},{id:'i2',a:'tok',b:'s1',k:'inf',o:5,bl:.4},{id:'i3',a:'tok',b:'s2',k:'inf',o:6,bl:-.8},
  {id:'f1',a:'grant',b:'fapi',k:'fc',bl:1.6,cut:1},{id:'f2',a:'fapi',b:'db',k:'fc',bl:-1.2},{id:'f3',a:'pay',b:'db',k:'fc',bl:-1},
  {id:'f4',a:'grant',b:'recon',k:'fc',bl:3.6,cut:1},{id:'f5',a:'recon',b:'db',k:'fc',bl:-1.4},{id:'f6',a:'grant',b:'payroll',k:'fc',bl:-.8,cut:1},{id:'f7',a:'payroll',b:'db',k:'fc',bl:1}
 ],
 spine:{fapi:[2.3,3.4],payroll:[2.3,1.7],pay:[2.3,-1.6],recon:[2.3,-3.4]},
 hostile:[[-10.4,5.4],[-5,4.8],[-2.16,3.4],[-2.16,0.6],[-2.16,-0.6],[-2.16,-3.2],[1.0,-4.7],[5.8,-3.4],[10.2,-0.4]],
 ops:[[-10.4,-2.6],[-6,-1.3],[-2.16,0],[2.16,0],[5.5,-0.6],[10.2,0.5]],
 cutAt:[-2.16,0],
 futurePanels:{A:{y:6.4},B:{y:0},C:{y:-6.4}}
};
const HC={ink:0x0E1214,bone:0xF1F0EA,ember:0xD4572F,verd:0x3E9C86,neu:0x707D84,dis:0x59656B,verdLight:0xBFE3DA};
// ---- geometry helpers
function mergeGeos(list){let pos=[],nor=[],idx=[],off=0;list.forEach(g=>{const p=g.attributes.position.array,n=g.attributes.normal?g.attributes.normal.array:null;for(let i=0;i<p.length;i++)pos.push(p[i]);for(let i=0;i<p.length;i++)nor.push(n?n[i]:0);const ix=g.index?Array.from(g.index.array):Array.from({length:p.length/3},(_,i)=>i);ix.forEach(i=>idx.push(i+off));off+=p.length/3});
 const m=new THREE.BufferGeometry();m.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));m.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));m.setIndex(idx);return m}
function outline(shape,inner,depth){ // ring-shaped outline of a closed shape: shape with a scaled hole
 const pts=shape.getPoints(32),s=new THREE.Shape(pts),h=new THREE.Path(pts.map(p=>new THREE.Vector2(p.x*inner,p.y*inner)).reverse());s.holes.push(h);
 return new THREE.ExtrudeGeometry(s,{depth:depth||.12,bevelEnabled:false})}
const shp={
 user:()=>{const s=new THREE.Shape();s.absarc(0,0,.42,0,Math.PI*2,false);return s},
 device:()=>{const s=new THREE.Shape();[[-.5,.32],[.5,.32],[.5,-.3],[-.5,-.3]].forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));return s},
 token:()=>{const s=new THREE.Shape();[[0,.5],[.5,0],[0,-.5],[-.5,0]].forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));return s},
 app:()=>{const s=new THREE.Shape();for(let i=0;i<6;i++){const a=i/6*Math.PI*2+Math.PI/6;i?s.lineTo(Math.cos(a)*.48,Math.sin(a)*.48):s.moveTo(Math.cos(a)*.48,Math.sin(a)*.48)}return s},
 service:()=>{const s=new THREE.Shape(),w=.58,h=.4;s.moveTo(-w,-h);s.lineTo(w,-h);s.lineTo(w,h);s.lineTo(-w,h);return s},
 database:()=>{const s=new THREE.Shape(),w=.42;s.moveTo(-w,.36);s.absellipse(0,.36,w,.14,Math.PI,0,true);s.lineTo(w,-.36);s.absellipse(0,-.36,w,.14,0,Math.PI,true);s.lineTo(-w,.36);return s}};
function nodeGeo(t,dep){const g=outline(shp[t](),t==='user'?.7:.72,dep);g.translate(0,0,-(dep||.12)/2);return g}
const GEO={};
function geo(name){if(GEO[name])return GEO[name];let g;
 if(shp[name])g=nodeGeo(name);
 else if(name==='svcbar'){g=new THREE.BoxGeometry(.86,.13,.14);g.translate(0,-.18,0)}
 else if(name==='dbRing'){g=new THREE.TorusGeometry(.7,.035,6,32)}
 else if(name==='evidence')g=new THREE.BoxGeometry(.2,.2,.2);
 else if(name==='forecast'){const l=[];for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=new THREE.BoxGeometry(.1,.04,.04);b.rotateZ(a+Math.PI/2);b.translate(Math.cos(a)*.3,Math.sin(a)*.3,0);l.push(b)}g=mergeGeos(l)}
 else if(name==='approval'){const a=new THREE.TorusGeometry(.3,.035,6,28),b=new THREE.TorusGeometry(.19,.035,6,24);g=mergeGeos([a,b])}
 else if(name==='blockRing')g=new THREE.TorusGeometry(.26,.055,8,28);
 else if(name==='blockCore')g=new THREE.SphereGeometry(.1,12,12);
 else if(name==='preserved'){g=new THREE.CylinderGeometry(.075,.075,.9,10);g.rotateZ(Math.PI/2)}
 else if(name==='dot')g=new THREE.SphereGeometry(.05,6,6);
 else if(name==='dash')g=new THREE.BoxGeometry(.15,.04,.04);
 GEO[name]=g;return g}
// tube helpers (index count per length segment = radial*6)
function mkTube(curve,r,segs,radial,mat){const m=new THREE.Mesh(new THREE.TubeGeometry(curve,segs,r,radial,false),mat);m.userData={segs,radial};return m}
function drawRange(m,a,b){const s=m.userData.segs,per=m.userData.radial*6;a=Math.max(0,Math.min(1,a));b=Math.max(a,Math.min(1,b));const i0=Math.round(a*s),i1=Math.round(b*s);m.geometry.setDrawRange(i0*per,(i1-i0)*per);m.visible=i1>i0}
function curveFrom(pts,z){return new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],z||0)),false,'catmullrom',.5)}
function bezEase(p){if(p==='linear')return t=>t;const [x1,y1,x2,y2]=p;const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
 const sx=t=>((ax*t+bx)*t+cx)*t,sy=t=>((ay*t+by)*t+cy)*t,dx=t=>(3*ax*t+2*bx)*t+cx;
 return x=>{if(x<=0)return 0;if(x>=1)return 1;let t=x;for(let i=0;i<6;i++){const e=sx(t)-x,d=dx(t);if(Math.abs(e)<1e-5)break;if(Math.abs(d)<1e-6)break;t-=e/d}return sy(Math.max(0,Math.min(1,t)))}}
const smooth=(t,a,b)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t)};
