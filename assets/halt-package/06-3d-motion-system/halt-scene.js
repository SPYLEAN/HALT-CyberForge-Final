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

/* HaltScene part B: Core builder, asset kit, and the scene class. */
const LS=0.09; // logo units -> world
const lx=x=>(x-48)*LS, ly=y=>(48-y)*LS;
function logoShape(p){const s=new THREE.Shape();p.forEach((q,i)=>i?s.lineTo(lx(q[0]),ly(q[1])):s.moveTo(lx(q[0]),ly(q[1])));return s}
function buildCore(){ // static Core object: used by the scene and by GLB export
 const std=c=>new THREE.MeshStandardMaterial({color:c,roughness:.85,metalness:0,transparent:true});
 const m={verd:std(HC.verd),ember:std(HC.ember),bone:std(HC.bone),emberHeld:std(HC.ember),ghost:new THREE.MeshBasicMaterial({color:HC.neu,transparent:true,opacity:.35,wireframe:false})};
 const g=new THREE.Group();g.name='Core';
 const ext=(shape,mat,d,name)=>{const me=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:d||1,bevelEnabled:false}),mat);me.name=name;me.position.z=-(d||1)/2;g.add(me);return me};
 const spine=new THREE.Group();spine.name='OperationalSpine';g.add(spine);
 const rb=ext(logoShape([[64,6],[80,6],[80,90],[64,90]]),m.verd,1,'RightBar'),cb=ext(logoShape([[28,42],[64,42],[64,54],[28,54]]),m.verd,1,'Crossbar');
 g.remove(rb);g.remove(cb);spine.add(rb);spine.add(cb);
 const up=ext(logoShape([[16,18],[24,10],[32,10],[32,36.5],[16,36.5]]),m.ember,1,'HostileUpper'),lo=ext(logoShape([[16,59.5],[32,59.5],[32,86],[16,86]]),m.emberHeld,1,'HostileLower');
 const ring=new THREE.Shape();ring.absarc(lx(24),ly(48),8*LS,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(lx(24),ly(48),3*LS,0,Math.PI*2,true);ring.holes.push(hole);
 const ver=new THREE.Group();ver.name='Verifier';g.add(ver);const vr=new THREE.Mesh(new THREE.ExtrudeGeometry(ring,{depth:1.2,bevelEnabled:false}),m.bone);vr.position.z=-.6;vr.name='VerifierRing';ver.add(vr);
 const vc=new THREE.Mesh(new THREE.CylinderGeometry(3*LS*.8,3*LS*.8,1.25,20),new THREE.MeshBasicMaterial({color:HC.verd,transparent:true}));vc.rotation.x=Math.PI/2;vc.position.set(lx(24),ly(48),0);vc.name='VerifierCentre';ver.add(vc);
 return {group:g,m,spine,up,lo,ver,vr,vc};
}
// ---- 11 reusable assets (non-instanced; same geometry factory as the scene)
function assetKit(){
 const B=c=>new THREE.MeshBasicMaterial({color:c,transparent:true});const out=[];
 const add=(id,label,kind,obj)=>{obj.name=id;out.push({id,label,kind,obj})};
 const nodeMesh=(t,c)=>new THREE.Mesh(geo(t),B(c));
 add('UserNode','User node','node',nodeMesh('user',HC.bone));
 add('DeviceNode','Device node','node',nodeMesh('device',HC.bone));
 add('TokenNode','Token node','node',nodeMesh('token',HC.bone));
 add('ApplicationNode','Application node','node',nodeMesh('app',HC.bone));
 const svc=new THREE.Group();svc.add(nodeMesh('service',HC.bone));const bar=new THREE.Mesh(geo('svcbar'),B(HC.verd));svc.add(bar);add('CriticalServiceNode','Critical-service node','node',svc);
 add('DatabaseNode','Database node','node',nodeMesh('database',HC.bone));
 add('EvidenceMarker','Evidence marker','marker',new THREE.Mesh(geo('evidence'),B(HC.bone)));
 add('ForecastMarker','Forecast marker','marker',new THREE.Mesh(geo('forecast'),B(HC.ember)));
 add('ApprovalMarker','Approval marker','marker',new THREE.Mesh(geo('approval'),B(HC.bone)));
 const bl=new THREE.Group();bl.add(new THREE.Mesh(geo('blockRing'),B(HC.bone)));bl.add(new THREE.Mesh(geo('blockCore'),B(HC.verd)));add('BlockedPathMarker','Blocked-path marker','marker',bl);
 add('PreservedPathMarker','Preserved-path marker','marker',new THREE.Mesh(geo('preserved'),B(HC.verd)));
 return out}
function qcurve(a,b,bl,z){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
 return new THREE.CatmullRomCurve3([new THREE.Vector3(a.x,a.y,z),new THREE.Vector3(mx-dy/L*(bl||0),my+dx/L*(bl||0),z),new THREE.Vector3(b.x,b.y,z)])}
function segsFor(c,max){return Math.max(10,Math.min(max,Math.round(c.getLength()*3.2)))}
function subCurve(c,u0,u1,n){const p=[];for(let i=0;i<=(n||16);i++)p.push(c.getPoint(u0+(u1-u0)*i/(n||16)));return new THREE.CatmullRomCurve3(p)}

class HaltScene{
 static supported(){try{const c=document.createElement('canvas');return !!(window.WebGLRenderingContext&&(c.getContext('webgl')||c.getContext('experimental-webgl')))}catch(e){return false}}
 constructor(canvas,labelRoot,opts){
  opts=opts||{};this.spec=opts.spec||HALT_SPEC;this.canvas=canvas;this.labelRoot=labelRoot;this.reduced=!!opts.reducedMotion;
  this.qname=opts.quality||'balanced';this.layout=opts.layout||'centered';this.state=opts.state||'dormant';this.mode='core';
  this.transparent=!!opts.transparent;this.timeScale=1;this.onStats=opts.onStats||null;this.onState=opts.onState||null;
  this.ch=Object.assign({},this.spec.states[this.state].ch);this.tw=[];this.tm=0;this.last=0;this.frames=0;this.slow=0;this.visible=true;this.dead=false;
  this.cam={pos:new THREE.Vector3(),tgt:new THREE.Vector3(),from:null,t0:0,dur:1,ease:t=>t,to:null};
  this.r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:!!opts.preserve,powerPreference:'high-performance'});
  this.r.setClearColor(0x0E1214,this.transparent?0:1);
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(this.spec.cameras.fov,1,.1,200);
  this.scene.add(new THREE.AmbientLight(0xffffff,this.spec.lighting.ambient.intensity));
  const k=new THREE.DirectionalLight(0xffffff,this.spec.lighting.key.intensity);k.position.fromArray(this.spec.lighting.key.pos);this.scene.add(k);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.dead=true;opts.onLost&&opts.onLost()});
  this._build();this.resize();this._snapCamera();
  if('IntersectionObserver' in window){this.io=new IntersectionObserver(es=>{this.visible=es[0].isIntersecting});this.io.observe(canvas)}
  this._loop=this._loop.bind(this);this.raf=requestAnimationFrame(this._loop);
 }
 get Q(){return this.spec.quality[this.qname]}
 // ---------------- build
 _build(){
  if(this.root){this.scene.remove(this.root);this.root.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
  const Q=this.Q,SEG=Q.tubeSegments,RAD=Q.radial,root=this.root=new THREE.Group();this.scene.add(root);
  const B=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o==null?1:o});
  this.fade=[];const F=(m)=>{this.fade.push([m,m.opacity]);return m};
  // core
  const core=this.core=buildCore();root.add(core.group);
  // lanes
  const hc=this.hc=curveFrom(HM.hostile,.7),N=200;let best=0,bdist=1e9;for(let i=0;i<=N;i++){const p=hc.getPoint(i/N),d=Math.hypot(p.x-HM.cutAt[0],p.y-HM.cutAt[1]);if(d<bdist){bdist=d;best=i/N}}
  this.uc=best;this.gapU=.02;
  this.hUp=mkTube(subCurve(hc,0,best,40),.07,SEG,RAD,this.mHUp=B(HC.ember));this.hDn=mkTube(subCurve(hc,best,1,40),.07,SEG,RAD,this.mHDn=B(HC.ember,.3));
  root.add(this.hUp);root.add(this.hDn);
  const oc=this.oc=curveFrom(HM.ops,0);
  this.oLane=mkTube(oc,.075,SEG,RAD,this.mOps=B(HC.verd));this.oPulse=mkTube(oc,.1,SEG,RAD,this.mPulse=B(HC.verdLight,.9));root.add(this.oLane);root.add(this.oPulse);
  // graph group
  const gg=this.gg=new THREE.Group();root.add(gg);
  const ids=Object.keys(HM.nodes),types=['user','device','token','app','service','database'];
  this.inst={};const nm=B(0xffffff);this.nodeMat=nm;
  types.forEach(t=>{const list=ids.filter(i=>HM.nodes[i].t===t);const im=new THREE.InstancedMesh(geo(t),nm,list.length);im.userData.ids=list;im.frustumCulled=false;this.inst[t]=im;gg.add(im)});
  const svcIds=ids.filter(i=>HM.nodes[i].t==='service');this.svcBar=new THREE.InstancedMesh(geo('svcbar'),this.barMat=B(0xffffff),svcIds.length);this.svcBar.frustumCulled=false;gg.add(this.svcBar);
  this.dbHalo=new THREE.Mesh(geo('dbRing'),B(HC.ember,0));this.dbHalo.position.set(HM.nodes.db.x,HM.nodes.db.y,0);gg.add(this.dbHalo);
  this.cols={bone:new THREE.Color(HC.bone),ember:new THREE.Color(HC.ember),verd:new THREE.Color(HC.verd),neu:new THREE.Color(HC.neu)};
  // edges
  this.E=[];const dm=new THREE.Object3D();this.dm=dm;
  HM.edges.forEach((e,i)=>{const a=HM.nodes[e.a],b=HM.nodes[e.b],cv=qcurve(a,b,e.bl,e.k==='obs'?.15:.05),o={e,cv};
   if(e.k==='obs'){const split=!!e.cut,u0=.08,u1=.92;
    if(split){const hs=Math.max(8,Math.round(segsFor(cv,SEG)/2));o.tA=mkTube(subCurve(cv,u0,.5,12),.045,hs,RAD,B(HC.ember));o.tB=mkTube(subCurve(cv,.5,u1,12),.045,hs,RAD,o.mB=B(HC.ember));gg.add(o.tA);gg.add(o.tB)}
    else{o.tA=mkTube(subCurve(cv,u0,u1,16),.045,segsFor(cv,SEG),RAD,B(HC.ember));gg.add(o.tA)}}
   if(e.k==='fc'||e.k==='inf'){o.len=cv.getLength()}
   this.E.push(o)});
  const dotsN=this.E.filter(o=>o.e.k==='fc').reduce((s,o)=>s+Math.max(6,Math.round(o.len/.28)),0),dashN=this.E.filter(o=>o.e.k==='inf').reduce((s,o)=>s+Math.max(5,Math.round(o.len/.34)),0);
  this.dots=new THREE.InstancedMesh(geo('dot'),B(0xffffff),dotsN);this.dots.frustumCulled=false;gg.add(this.dots);
  this.dashes=new THREE.InstancedMesh(geo('dash'),B(HC.neu),dashN);this.dashes.frustumCulled=false;gg.add(this.dashes);
  let di=0,si=0;this.E.forEach(o=>{if(o.e.k==='fc'){o.n=Math.max(6,Math.round(o.len/.28));o.i0=di;di+=o.n}if(o.e.k==='inf'){o.n=Math.max(5,Math.round(o.len/.34));o.i0=si;si+=o.n}});
  // dependency (business) tubes: spine -> service, service -> db
  this.dep=[];const sp=HM.spine;
  Object.keys(sp).forEach((k,i)=>{const a={x:sp[k][0],y:sp[k][1]},b=HM.nodes[k];const cv=qcurve(a,b,0,0);const ss=segsFor(cv,SEG),th=mkTube(subCurve(cv,.04,.9,12),.03,ss,RAD,B(HC.verd)),pk=mkTube(subCurve(cv,.04,.9,12),.075,ss,RAD,B(HC.verd,0));gg.add(th);gg.add(pk);this.dep.push({k,th,pk,i,cv})});
  ['fapi','payroll','pay','recon'].forEach((k,i)=>{const a=HM.nodes[k],b=HM.nodes.db;const cv=qcurve(a,b,i%2?-.6:.6,0);const th=mkTube(subCurve(cv,.1,.9,12),.03,segsFor(cv,SEG),RAD,B(HC.verd));gg.add(th);this.dep.push({k:k+'_db',th,i:i+4,cv})});
  // markers
  const cutEdges=this.E.filter(o=>o.e.cut);
  this.mk={ev:new THREE.InstancedMesh(geo('evidence'),B(HC.bone),this.E.filter(o=>o.e.k==='obs').length),
   fc:new THREE.InstancedMesh(geo('forecast'),B(HC.ember),5),
   bR:new THREE.InstancedMesh(geo('blockRing'),B(HC.bone),cutEdges.length),bC:new THREE.InstancedMesh(geo('blockCore'),B(HC.verd),cutEdges.length),
   pv:new THREE.InstancedMesh(geo('preserved'),B(HC.verd),4),
   ap:new THREE.InstancedMesh(geo('approval'),B(HC.bone),1),
   pR:new THREE.InstancedMesh(geo('blockRing'),B(HC.bone),6),pC:new THREE.InstancedMesh(geo('blockCore'),B(HC.verd),6)};
  Object.values(this.mk).forEach(m=>{m.frustumCulled=false;gg.add(m)});
  // futures
  this.fut=new THREE.Group();root.add(this.fut);this.panels={};
  ['A','B','C'].forEach(k=>this.fut.add(this.panels[k]=this._panel(k,B,SEG,RAD)));
  // boundary
  const bd=this.bd=new THREE.Group();root.add(bd);const R=this.R=6.4,pts=[];for(let i=0;i<72;i++){const a=i/72*Math.PI*2;pts.push(new THREE.Vector3(Math.cos(a)*R,Math.sin(a)*R,0))}
  const ringC=new THREE.CatmullRomCurve3(pts,true);this.arcs=[0,1,2,3].map(()=>{const t=mkTube(ringC,.05,96,6,this.mBd||(this.mBd=B(HC.bone)));t.geometry=t.geometry.clone();bd.add(t);return t});
  // gallery group (lazy)
  this.gal=null;
  // labels
  this._labels();
  this._instances(0);
 }
 _panel(k,B,SEG,RAD){
  const g=new THREE.Group();g.position.y=HM.futurePanels[k].y;g.userData.k=k;
  const neutral=k==='A';const nodeCol=neutral?HC.neu:HC.bone;
  // dotted frame
  const parts=[];const W=8.2,H=2.3;const perim=[[-W,-H,W,-H],[W,-H,W,H],[W,H,-W,H],[-W,H,-W,-H]];
  perim.forEach(p=>{const L=Math.hypot(p[2]-p[0],p[3]-p[1]),n=Math.round(L/.5);for(let i=0;i<n;i+=1){if(i%2)continue;const t=(i+.5)/n,b=new THREE.BoxGeometry(p[3]===p[1]?.22:.04,p[3]===p[1]?.04:.22,.04);b.translate(p[0]+(p[2]-p[0])*t,p[1]+(p[3]-p[1])*t,0);parts.push(b)}});
  g.add(new THREE.Mesh(mergeGeos(parts),B(HC.neu,.8)));
  const cutX=-3.2,opsY=-.9;
  const ops1=mkTube(new THREE.LineCurve3(new THREE.Vector3(-7.2,opsY,0),new THREE.Vector3(neutral?cutX+.3:7.4,opsY,0)),.06,24,RAD,B(HC.verd));g.add(ops1);
  if(neutral){const dl=[];for(let x=cutX+.8;x<7.2;x+=.45){const b=new THREE.BoxGeometry(.2,.04,.04);b.translate(x,opsY,0);dl.push(b)}g.add(new THREE.Mesh(mergeGeos(dl),B(HC.neu,.8)))}
  [-1.5,2.5,5.2].forEach(x=>{const n=new THREE.Mesh(geo('service'),B(nodeCol));n.position.set(x,opsY,0);g.add(n);const bar=new THREE.Mesh(geo('svcbar'),B(neutral?HC.neu:HC.verd));bar.position.set(x,opsY,0);g.add(bar)});
  const db=new THREE.Mesh(geo('database'),B(nodeCol));db.position.set(7.4,.9,0);g.add(db);
  const hc=new THREE.CatmullRomCurve3([new THREE.Vector3(-7.2,1.4,0),new THREE.Vector3(cutX,1.05,0),new THREE.Vector3(.5,1.2,0),new THREE.Vector3(7.0,.95,0)]);
  if(k==='B'){g.add(mkTube(hc,.045,SEG,RAD,B(HC.ember)));const h=new THREE.Mesh(geo('dbRing'),B(HC.ember));h.position.set(7.4,.9,0);g.add(h);const fm=new THREE.Mesh(geo('forecast'),B(HC.ember));fm.position.set(3.4,1.05,0);g.add(fm)}
  else{const u=.27;g.add(mkTube(subCurve(hc,0,u,20),.045,Math.round(SEG/2),RAD,B(HC.ember)));g.add(mkTube(subCurve(hc,u+.04,1,20),.045,SEG,RAD,B(HC.ember,.3)));
   const p=hc.getPoint(u+.02),rg=new THREE.Group();rg.position.set(p.x,p.y,.05);rg.add(new THREE.Mesh(geo('blockRing'),B(HC.bone)));rg.add(new THREE.Mesh(geo('blockCore'),B(HC.verd)));g.add(rg);
   if(k==='C'){[-3.2,-.3,2.6].forEach(x=>{});for(let i=0;i<3;i++){const pm=new THREE.Mesh(geo('preserved'),B(HC.verd));pm.position.set(-1.5+i*3.35,opsY+.45,0);pm.scale.set(.6,.6,.6);g.add(pm)}}}
  g.traverse(o=>{if(o.material&&o.material.transparent)this.fade.push([o.material,o.material.opacity])});
  return g}
 _labels(){
  const root=this.labelRoot;this.lbl={};if(!root)return;root.innerHTML='';
  const add=(id,text,cls,get)=>{const d=document.createElement('div');d.className='h3d-lbl '+cls;d.textContent=text;d.dataset.id=id;root.appendChild(d);this.lbl[id]={el:d,get,v:0}};
  Object.keys(HM.nodes).forEach(id=>{const n=HM.nodes[id];add(id,n.l,n.h?'hostile':n.b?'biz':'',()=>new THREE.Vector3(n.x,n.y+.95,.2))});
  add('core','HALT Core · containment point','proof',()=>new THREE.Vector3(HM.cutAt[0]-.1,-1.5,1));
  add('seal','ProofSeal · 6 of 6 verified (simulated)','proof',()=>new THREE.Vector3(0,this.R+.7,0));
  [['fA','Future A · Aggressive isolation (simulated)'],['fB','Future B · Passive monitoring (simulated)'],['fC','Future C · HALT minimum-safe response (simulated)']].forEach(f=>add(f[0],f[1],'sim',()=>new THREE.Vector3(-8.2,HM.futurePanels[f[0][1]].y+2.75,0)));
 }
 // ---------------- state + tween
 describe(s){const st=this.spec.states[s||this.state];return st.label+'. '+st.desc}
 setState(name,o){
  if(!this.spec.states[name])return;o=o||{};const from=this.state;this.state=name;const tgt=this.spec.states[name].ch,T=this.spec.transitions,ov={};
  (T[from+'→'+name]||[]).forEach(x=>ov[x[0]]=x);
  const dflt={lane:'approach',laneShow:'switch',graph:'expand',biz:'expand',futures:'futures',cut:'cut',proof:'proof',boundary:'camera'},count={graph:HM.techOrder.length,biz:HM.bizOrder.length};
  this.tw=this.tw.filter(t=>!(t.k in tgt));
  Object.keys(tgt).forEach(k=>{
   const to=tgt[k],cur=this.ch[k];if(to===cur)return;
   if(this.reduced||o.instant){this.ch[k]=to;return}
   let name=(ov[k]&&ov[k][1])||dflt[k]||'switch';if(to<cur&&!ov[k])name='switch';
   const m=this.spec.motion[name];let dur=(m.ms+(m.stagger&&count[k]?m.stagger*count[k]:0))*this.timeScale;
   this.tw.push({k,from:cur,to,t0:performance.now()+((ov[k]&&ov[k][2])||0),dur,ease:bezEase(m.ease)})});
  // camera
  const c=this.spec.cameras[name];this._camTo(c,o.instant||this.reduced);
  this.onState&&this.onState(name,this.describe(name));
 }
 _camTarget(){const c=this.spec.cameras[this.state],mob=this.layout==='mobile'||(this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight)<1);
  const asp=this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight);const mk=asp<1.2?1+(1.2-asp)*1.55:1;
  const t=new THREE.Vector3().fromArray(c.target),p=new THREE.Vector3().fromArray(c.pos).sub(t).multiplyScalar(mk*((this.spec.layouts[this.layout]||{}).distance||1)*(mob?this.spec.cameras.mobile.distanceMultiplier/1.55:1)).add(t);return{p,t}}
 _camTo(c,instant){const g=this._camTarget();if(instant||!this.cam.from&&false){this.cam.pos.copy(g.p);this.cam.tgt.copy(g.t);this.cam.to=null;return}
  const m=this.spec.motion.camera;this.cam.from={p:this.cam.pos.clone(),t:this.cam.tgt.clone()};this.cam.to=g;this.cam.t0=performance.now();this.cam.dur=m.ms*this.timeScale;this.cam.ease=bezEase(m.ease)}
 _snapCamera(){const g=this._camTarget();this.cam.pos.copy(g.p);this.cam.tgt.copy(g.t);this.cam.to=null}
 setQuality(q){if(!this.spec.quality[q]||q===this.qname)return;this.qname=q;this.r.setPixelRatio(Math.min(window.devicePixelRatio||1,this.Q.pixelRatio));this._build();this.resize();if(this.mode==='gallery'){this.gal=null;this._gallery()}}
 setReducedMotion(b){this.reduced=!!b;if(b){this.tw=[];Object.assign(this.ch,this.spec.states[this.state].ch);this._snapCamera()}}
 setLayout(l){this.layout=l;this._snapCamera();this.resize()}
 setTransparent(b){this.transparent=b;this.r.setClearColor(0x0E1214,b?0:1)}
 applySpec(spec){this.spec=spec;this._build();this._snapCamera();this.resize()}
 setMode(m){this.mode=m;if(m==='gallery')this._gallery();this.root.visible=m==='core';if(this.gal)this.gal.visible=m==='gallery';Object.values(this.lbl).forEach(l=>l.el.style.opacity=0);this._galLabels(m==='gallery')}
 _gallery(){if(this.gal){this.gal.visible=true;return}
  const g=this.gal=new THREE.Group();this.scene.add(g);const kit=assetKit();this.kit=kit;
  kit.forEach((a,i)=>{const col=i%4,row=Math.floor(i/4),h=new THREE.Group();h.position.set((col-1.5)*5.2,(1-row)*4.1,0);const s=a.kind==='node'?2.2:2.6;a.obj.scale.setScalar(s);h.add(a.obj);h.userData.a=a;g.add(h)});
  this._galLabels(true)}
 _galLabels(on){if(!this.labelRoot||!this.kit)return;this.galEls=this.galEls||[];this.galEls.forEach(e=>e.remove());this.galEls=[];if(!on)return;
  this.kit.forEach(a=>{const d=document.createElement('div');d.className='h3d-lbl '+(a.kind==='marker'?'proof':'');d.textContent=a.label;d.style.opacity=1;this.labelRoot.appendChild(d);this.galEls.push(d);a.el=d})}
 resize(){const w=this.canvas.clientWidth||this.canvas.parentElement.clientWidth||800,h=this.canvas.clientHeight||this.canvas.parentElement.clientHeight||500;
  this.r.setPixelRatio(Math.min(window.devicePixelRatio||1,this.Q.pixelRatio));this.r.setSize(w,h,false);this.camera.aspect=w/h;this.w=w;this.h=h;this._snapCamera()}
 // ---------------- per frame
 _instances(tm){
  const ch=this.ch,dm=this.dm,reduced=this.reduced,idle=this.Q.idleMotion&&!reduced,ids=Object.keys(HM.nodes);
  const fut=ch.futures,gop=1-fut;
  const reveal=id=>{const n=HM.nodes[id];
   if(id==='staff'||id==='db')return 1;
   if(id==='phish')return Math.max(ch.laneShow,0)*(ch.laneShow>0?1:0);
   if(n.b){const i=HM.bizOrder.indexOf(id);return smooth(ch.biz,i*.12,i*.12+.4)}
   const i=HM.techOrder.indexOf(id);return smooth(ch.graph,i*.09,i*.09+.35)};
  const setCol=(im,k,c)=>{im.setColorAt(k,c)};
  Object.keys(this.inst).forEach(t=>{const im=this.inst[t];im.userData.ids.forEach((id,k)=>{const n=HM.nodes[id],s=reveal(id)*(1+(idle?Math.sin(tm*1.4+k)*.015:0));
   dm.position.set(n.x,n.y,0);dm.rotation.set(0,0,0);if(t==='database'){dm.rotation.x=.0}dm.scale.setScalar(Math.max(s,.0001));dm.updateMatrix();im.setMatrixAt(k,dm.matrix);
   let c=n.h?this.cols.ember:this.cols.bone;im.setColorAt(k,c)});im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true});
  this.svcBar.count=this.svcBar.count;const svcIds=this.inst.service.userData.ids;svcIds.forEach((id,k)=>{const n=HM.nodes[id],s=reveal(id);dm.position.set(n.x,n.y,0);dm.scale.setScalar(Math.max(s,.0001));dm.rotation.set(0,0,0);dm.updateMatrix();this.svcBar.setMatrixAt(k,dm.matrix);this.svcBar.setColorAt(k,this.cols.verd)});this.svcBar.instanceMatrix.needsUpdate=true;if(this.svcBar.instanceColor)this.svcBar.instanceColor.needsUpdate=true;
  this.nodeMat.opacity=gop;this.barMat.opacity=gop;
  // edges
  const cut=ch.cut,march=(idle?tm/(this.spec.motion.march.ms/1000):0)%1,held=1-.7*smooth(cut,.1,.9);
  let evi=0,ci=0;
  this.E.forEach((o,ei)=>{const e=o.e,r=e.k==='fc'?smooth(ch.biz,.15,.75):smooth(ch.graph,e.o*.09,e.o*.09+.35);
   if(e.k==='obs'){const gap=.04*cut;if(o.tB){drawRange(o.tA,0,r*.5>0?Math.min(1,r*2)*(1-gap*2):0);drawRange(o.tB,gap*2,Math.max(0,r*2-1));o.mB.opacity=gop*held;o.tA.material.opacity=gop}else{drawRange(o.tA,0,r);o.tA.material.opacity=gop}
    dm.position.copy(o.cv.getPoint(.5));dm.scale.setScalar(Math.max(.0001,smooth(r,.8,1)));dm.rotation.set(0,0,Math.PI/4);dm.updateMatrix();this.mk.ev.setMatrixAt(evi++,dm.matrix)}
   else if(e.k==='inf'){for(let i=0;i<o.n;i++){const u=(i+.5)/o.n,p=o.cv.getPoint(u),tg=o.cv.getTangent(u);dm.position.copy(p);dm.rotation.set(0,0,Math.atan2(tg.y,tg.x));dm.scale.setScalar(u<=r?1:.0001);dm.updateMatrix();this.dashes.setMatrixAt(o.i0+i,dm.matrix)}}
   else{for(let i=0;i<o.n;i++){const u0=(i+.5)/o.n,u=(u0+march)%1,p=o.cv.getPoint(.08+u*.84);dm.position.copy(p);dm.rotation.set(0,0,0);
     const beyond=e.cut&&u>.5,vis=r>.02&&u<=r*1.0+.0;dm.scale.setScalar(vis?(beyond&&cut>.5?.7:1):.0001);dm.updateMatrix();this.dots.setMatrixAt(o.i0+i,dm.matrix);
     const c=this.tmpC||(this.tmpC=new THREE.Color());c.copy(this.cols.ember);if(beyond)c.lerp(new THREE.Color(HC.ink),.7*smooth(cut,.1,.9));this.dots.setColorAt(o.i0+i,c)}}});
  this.mk.ev.instanceMatrix.needsUpdate=true;this.dashes.instanceMatrix.needsUpdate=true;this.dots.instanceMatrix.needsUpdate=true;if(this.dots.instanceColor)this.dots.instanceColor.needsUpdate=true;
  this.dots.material.opacity=gop;this.dashes.material.opacity=gop*.95;this.mk.ev.material.opacity=gop;
  // dependency tubes
  this.dep.forEach(d=>{const r=smooth(ch.biz,d.i*.08,d.i*.08+.35);drawRange(d.th,0,r);d.th.material.opacity=gop;if(d.pk){drawRange(d.pk,0,r*smooth(cut,.2,.8));d.pk.material.opacity=gop*smooth(cut,.2,.8)}});
  // markers: forecast, blocked, preserved, approval
  const fcPos=[this.E.find(o=>o.e.id==='f2'),this.E.find(o=>o.e.id==='f3'),this.E.find(o=>o.e.id==='f5'),this.E.find(o=>o.e.id==='f7')];
  fcPos.forEach((o,k)=>{dm.position.copy(o.cv.getPoint(.5));dm.position.z=.1;dm.rotation.set(0,0,tm*.2*(idle?1:0));dm.scale.setScalar(Math.max(.0001,smooth(ch.biz,.5,1)*(1-.8*smooth(cut,.1,.8))));dm.updateMatrix();this.mk.fc.setMatrixAt(k,dm.matrix)});
  dm.position.set(HM.nodes.db.x,HM.nodes.db.y,.1);dm.rotation.set(0,0,tm*.25*(idle?1:0));dm.scale.setScalar(Math.max(.0001,smooth(ch.laneShow,.5,1)*(1-.8*smooth(cut,.1,.8))*1.6));dm.updateMatrix();this.mk.fc.setMatrixAt(4,dm.matrix);this.mk.fc.instanceMatrix.needsUpdate=true;this.mk.fc.material.opacity=gop;
  let bi=0;this.E.filter(o=>o.e.cut).forEach(o=>{dm.position.copy(o.cv.getPoint(.5));dm.position.z=.2;dm.rotation.set(0,0,0);const s=Math.max(.0001,smooth(cut,.05+bi*.1,.5+bi*.1));dm.scale.setScalar(s);dm.updateMatrix();this.mk.bR.setMatrixAt(bi,dm.matrix);this.mk.bC.setMatrixAt(bi,dm.matrix);bi++});
  this.mk.bR.instanceMatrix.needsUpdate=true;this.mk.bC.instanceMatrix.needsUpdate=true;this.mk.bR.material.opacity=gop;this.mk.bC.material.opacity=gop;
  this.dep.filter(d=>d.pk).forEach((d,k)=>{dm.position.copy(d.cv.getPoint(.5));dm.position.z=.2;dm.rotation.set(0,0,0);dm.scale.setScalar(Math.max(.0001,smooth(cut,.4+k*.08,.9)));dm.updateMatrix();this.mk.pv.setMatrixAt(k,dm.matrix)});this.mk.pv.instanceMatrix.needsUpdate=true;this.mk.pv.material.opacity=gop;
  dm.position.set(HM.cutAt[0]+1.55,1.75,.6);dm.rotation.set(0,0,0);dm.scale.setScalar(Math.max(.0001,smooth(cut,.6,1)));dm.updateMatrix();this.mk.ap.setMatrixAt(0,dm.matrix);this.mk.ap.instanceMatrix.needsUpdate=true;this.mk.ap.material.opacity=gop;
  // proof markers
  for(let k=0;k<6;k++){const a=Math.PI/2+k*Math.PI/3;dm.position.set(Math.cos(a)*this.R,Math.sin(a)*this.R,.1);dm.rotation.set(0,0,0);dm.scale.setScalar(Math.max(.0001,smooth(ch.proof,k*.1,k*.1+.4)*1.25));dm.updateMatrix();this.mk.pR.setMatrixAt(k,dm.matrix);this.mk.pC.setMatrixAt(k,dm.matrix)}
  this.mk.pR.instanceMatrix.needsUpdate=true;this.mk.pC.instanceMatrix.needsUpdate=true;
  this.dbHalo.material.opacity=0;
 }
 _update(tm){
  const ch=this.ch,idle=this.Q.idleMotion&&!this.reduced;
  const L=smooth(ch.laneShow,0,1),head=ch.lane*this.uc,gap=this.gapU*ch.cut,fut=ch.futures,gop=1-fut;
  // hostile lane
  drawRange(this.hUp,0,L>0?Math.min(head,this.uc-gap)/this.uc:0);
  drawRange(this.hDn,ch.cut>.02?gap/(1-this.uc)*0:0,ch.cut>.02?1:0);
  this.mHUp.opacity=gop*L;this.mHDn.opacity=gop*.3*smooth(ch.cut,.1,.9);
  // ops lane + pulse (continuous: never interrupted)
  const pt=idle?(tm/(this.spec.motion.pulse.ms/1000))%1:.5,wl=.14;
  drawRange(this.oPulse,Math.max(0,pt-wl),Math.min(1,pt));if(!idle)this.oPulse.visible=false;
  this.mOps.opacity=1-fut;this.mPulse.opacity=.9*(1-fut);
  // core
  const cm=this.core.m,heldC=1-.65*smooth(ch.cut,.1,.9),coreOp=1-fut;
  cm.verd.opacity=coreOp;cm.bone.opacity=coreOp;cm.ember.opacity=coreOp*(.45+.55*L);cm.emberHeld.opacity=coreOp*(.45+.55*L)*heldC;
  this.core.lo.position.y=-ch.cut*.12;this.core.up.position.y=ch.cut*.12;
  this.core.vc.material.opacity=coreOp*(.0+smooth(ch.cut,.2,.9));
  const pulse=1+.1*Math.sin(Math.min(1,ch.cut)*Math.PI);this.core.ver.scale.setScalar(pulse);
  this.core.group.visible=coreOp>.01;this.core.group.rotation.y=idle?Math.sin(tm*.22)*.28-.1:-.22;this.core.group.rotation.x=idle?Math.sin(tm*.17)*.04:.03;
  // keep lane tubes attached to the core's visual rotation? lanes are world-space; core only turns slightly.
  // graph group collapse for futures
  this.gg.visible=fut<.98;this.gg.scale.setScalar(1-.78*fut);
  this.hUp.visible=this.hUp.visible&&gop>.02;this.hDn.visible=this.hDn.visible&&gop>.02;this.oLane.visible=gop>.02||true;
  this.fut.visible=fut>.01;this.fut.scale.setScalar(.2+.8*fut);this.fut.children.forEach(p=>{p.position.y=HM.futurePanels[p.userData.k].y*fut});
  this.fut.traverse(o=>{if(o.material&&o.material.transparent&&o.userData.base==null){o.userData.base=o.material.opacity}});this.fut.traverse(o=>{if(o.material&&o.userData.base!=null)o.material.opacity=o.userData.base*fut});
  // boundary
  const b=ch.boundary,w=.034+(.125-.034)*smooth(ch.proof,0,1);
  this.arcs.forEach((a,k)=>{const c=.125+.25*k;drawRange(a,c-w,c+w);a.rotation.z=idle?Math.sin(tm*.15)*.05:0});
  this.mBd.opacity=b*(1-fut)*(.55+.45*smooth(ch.proof,0,1))*(idle&&ch.proof<.5?.85+.15*Math.sin(tm*.9):1);
  this.mk.pR.material.opacity=1-fut;this.mk.pC.material.opacity=1-fut;this.mk.pR.visible=this.mk.pC.visible=ch.proof>.01;
  this._instances(tm);
 }
 _applyCam(now){
  if(this.cam.to){const t=Math.min(1,(now-this.cam.t0)/this.cam.dur),e=this.cam.ease(t);this.cam.pos.lerpVectors(this.cam.from.p,this.cam.to.p,e);this.cam.tgt.lerpVectors(this.cam.from.t,this.cam.to.t,e);if(t>=1)this.cam.to=null}
  const lay=this.spec.layouts[this.layout]||this.spec.layouts.centered,idle=this.Q.idleMotion&&!this.reduced;
  this.camera.position.copy(this.cam.pos);if(idle)this.camera.position.x+=Math.sin(this.tm*.18)*.3;
  this.camera.lookAt(this.cam.tgt);this.camera.aspect=this.w/this.h;this.camera.setViewOffset(this.w,this.h,-lay.x*this.w,-lay.y*this.h,this.w,this.h);this.camera.updateProjectionMatrix();
 }
 _loop(now){
  this.raf=requestAnimationFrame(this._loop);if(this.dead||document.hidden||!this.visible)return;
  const minDt=1000/this.Q.fpsCap;if(now-this.last<minDt-1)return;const dt=Math.min(.05,(now-this.last)/1000||.016);this.last=now;if(!this.reduced)this.tm+=dt;
  // tweens
  this.tw=this.tw.filter(t=>{const k=(now-t.t0)/t.dur;if(k<0)return true;const e=t.ease(Math.min(1,k));this.ch[t.k]=t.from+(t.to-t.from)*e;return k<1});
  this._applyCam(now);
  const t0=performance.now();
  if(this.mode==='core')this._update(this.tm);else this._galFrame();
  this._project();this.r.render(this.scene,this.camera);
  // adaptive quality + stats
  const ft=performance.now()-t0;this.frames++;this.ft=(this.ft||ft)*.9+ft*.1;
  if(this.ft>18&&!this.reduced){this.slow+=dt;if(this.slow>2&&this.qname!=='low'){this.slow=0;this.setQuality(this.qname==='high'?'balanced':'low');this.onStats&&this.onStats({downgraded:this.qname})}}else this.slow=0;
  if(this.onStats&&this.frames%20===0){const i=this.r.info;this.onStats({calls:i.render.calls,tris:i.render.triangles,geos:i.memory.geometries,ms:this.ft.toFixed(1),q:this.qname})}
 }
 _galFrame(){if(!this.gal)return;const idle=!this.reduced;this.gal.children.forEach(h=>{h.rotation.y=idle?Math.sin(this.tm*.6+h.position.x)*.5:.3;h.rotation.x=idle?Math.sin(this.tm*.4)*.1:0});}
 _project(){
  if(!this.labelRoot)return;const v=new THREE.Vector3();
  if(this.mode==='gallery'){if(this.kit)this.kit.forEach(a=>{const h=this.gal.children.find(c=>c.userData.a===a);v.set(h.position.x,h.position.y-1.55,0).project(this.camera);a.el.style.transform=`translate(${((v.x*.5+.5)*this.w).toFixed(1)}px,${((-v.y*.5+.5)*this.h).toFixed(1)}px) translate(-50%,0)`});return}
  const want=this.spec.states[this.state].labels,Q=this.Q.labels;
  Object.keys(this.lbl).forEach(id=>{const l=this.lbl[id];const on=Q&&want.indexOf(id)>-1;l.v+= ((on?1:0)-l.v)*(this.reduced?1:.14);
   const p=l.get().clone();if(id!=='fA'&&id!=='fB'&&id!=='fC'&&this.ch.futures>.5)l.v=0;
   const sc=(id[0]==='f'&&id.length===2)?this.ch.futures:1;if(id[0]==='f'&&id.length===2){p.y*=this.ch.futures}
   p.project(this.camera);const x=(p.x*.5+.5)*this.w,y=(-p.y*.5+.5)*this.h,inb=p.z<1&&x>8&&x<this.w-8&&y>8&&y<this.h-8;
   l.el.style.opacity=inb?(l.v*sc).toFixed(2):0;l.el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`})}
 toPNG(){this._applyCam(performance.now());if(this.mode==='core')this._update(this.tm);else this._galFrame();this.r.render(this.scene,this.camera);return this.canvas.toDataURL('image/png')}
 getStats(){const i=this.r.info;return{calls:i.render.calls,tris:i.render.triangles,geos:i.memory.geometries}}
 dispose(){cancelAnimationFrame(this.raf);this.io&&this.io.disconnect();this.root.traverse(o=>{o.geometry&&o.geometry.dispose()});this.r.dispose();if(this.labelRoot)this.labelRoot.innerHTML=''}
 // ---------------- static fallback (no WebGL): 2D SVG drawn from the same model and channels
 static fallbackSVG(state,spec){spec=spec||HALT_SPEC;const ch=spec.states[state].ch,S=34,W=26*S,H=15*S,X=x=>(x+13)*S,Y=y=>(7.5-y)*S;
  const hex=c=>'#'+c.toString(16).padStart(6,'0');let o='';
  const P=(pts,s,w,extra)=>`<path d="M${pts.map(p=>X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join('L')}" fill="none" stroke="${s}" stroke-width="${w}" ${extra||''} stroke-linecap="round"/>`;
  const curve=(a,b,bl)=>{const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;return`M${X(a.x)} ${Y(a.y)}Q${X(mx-dy/L*(bl||0))} ${Y(my+dx/L*(bl||0))} ${X(b.x)} ${Y(b.y)}`};
  if(ch.futures>.5){[['A',-1],['B',0],['C',1]].forEach(([k,i])=>{const y=-i*5.2;
    o+=`<rect x="${X(-8)}" y="${Y(y+2)}" width="${16*S}" height="${4*S}" fill="none" stroke="#707D84" stroke-dasharray="3 6"/>`;
    const opsc=k==='A'?'#707D84':'#3E9C86';o+=P([[-7,y-.9],[7,y-.9]],opsc,5,k==='A'?'stroke-dasharray="3 6"':'');
    const hs=k==='B'?[[-7,y+1.3],[7,y+.9]]:[[-7,y+1.3],[-3.2,y+1.05]];o+=P(hs,'#D4572F',3);
    if(k!=='B')o+=`<circle cx="${X(-3)}" cy="${Y(y+1.05)}" r="8" fill="#0E1214" stroke="#F1F0EA" stroke-width="2.5"/><circle cx="${X(-3)}" cy="${Y(y+1.05)}" r="3" fill="#3E9C86"/>`;
    o+=`<text x="${X(-7.8)}" y="${Y(y+1.8)}" fill="#9AA3A8" font-size="12" style="font-family:monospace">FUTURE ${k} · SIMULATED</text>`})}
  else{
   const gv=ch.graph,bz=ch.biz,cut=ch.cut,ls=ch.laneShow;
   if(ch.boundary>0){const R=6.4;[45,135,225,315].forEach(a=>{const w=(12+33*ch.proof)*Math.PI/180,c=a*Math.PI/180,x0=Math.cos(c-w)*R,y0=Math.sin(c-w)*R,x1=Math.cos(c+w)*R,y1=Math.sin(c+w)*R;o+=`<path d="M${X(x0)} ${Y(y0)}A${R*S} ${R*S} 0 0 1 ${X(x1)} ${Y(y1)}" fill="none" stroke="#F1F0EA" stroke-opacity="${.3+.7*ch.boundary}" stroke-width="2.5"/>`})}
   // business and edges
   if(gv>0)HM.edges.forEach(e=>{const a=HM.nodes[e.a],b=HM.nodes[e.b];if(e.k==='fc'&&bz<.5)return;const st=e.k==='obs'?'stroke="#D4572F" stroke-width="3"':e.k==='inf'?'stroke="#9AA3A8" stroke-width="2" stroke-dasharray="6 4"':'stroke="#D4572F" stroke-width="2" stroke-dasharray="2 6" stroke-opacity="'+(e.cut&&cut?.35:.9)+'"';o+=`<path d="${curve(a,b,e.bl)}" fill="none" ${st}/>`;if(e.cut&&cut>.5){const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;o+=`<circle cx="${X(mx)}" cy="${Y(my)}" r="7" fill="#0E1214" stroke="#F1F0EA" stroke-width="2.4"/><circle cx="${X(mx)}" cy="${Y(my)}" r="2.6" fill="#3E9C86"/>`}});
   if(bz>0.5)Object.keys(HM.spine).forEach(k=>{const n=HM.nodes[k];o+=`<path d="M${X(HM.spine[k][0])} ${Y(HM.spine[k][1])}L${X(n.x)} ${Y(n.y)}" stroke="#3E9C86" stroke-width="${cut?6:2}" fill="none"/><path d="M${X(n.x)} ${Y(n.y)}L${X(HM.nodes.db.x)} ${Y(HM.nodes.db.y)}" stroke="#3E9C86" stroke-width="2" fill="none"/>`});
   // lanes
   o+=P(HM.ops,'#3E9C86',7);
   if(ls>0){const h=HM.hostile,cutI=HM.cutAt[1];const up=h.slice(0,4).concat([[HM.cutAt[0],cutI+.7*(1-0)]]);o+=P(cut?h.slice(0,4):h.slice(0,ch.lane>.9?4:3),'#D4572F',4);if(cut)o+=P(h.slice(4),'#D4572F',4,'stroke-opacity=".3"')}
   // core
   const lxy=(x,y)=>X(lx(x)).toFixed(1)+','+Y(ly(y)).toFixed(1),poly=(p,c,op)=>`<polygon points="${p.map(q=>lxy(q[0],q[1])).join(' ')}" fill="${c}" fill-opacity="${op}"/>`;
   o+=poly([[64,6],[80,6],[80,90],[64,90]],'#3E9C86',1)+poly([[28,42],[64,42],[64,54],[28,54]],'#3E9C86',1);
   const eo=ls>0?1:.35;o+=poly([[16,18],[24,10],[32,10],[32,36.5],[16,36.5]],'#D4572F',eo)+poly([[16,59.5],[32,59.5],[32,86],[16,86]],'#D4572F',eo*(cut?.4:1));
   o+=`<circle cx="${X(lx(24))}" cy="${Y(ly(48))}" r="${8*LS*S}" fill="#F1F0EA"/><circle cx="${X(lx(24))}" cy="${Y(ly(48))}" r="${3*LS*S}" fill="${cut?'#3E9C86':'#0E1214'}"/>`;
   // nodes
   Object.keys(HM.nodes).forEach(k=>{const n=HM.nodes[k];const vis=(k==='staff'||k==='db')||(k==='phish'?ls>0:n.b?bz>.1:gv>.1);if(!vis)return;const c=n.h?'#D4572F':'#F1F0EA',x=X(n.x),y=Y(n.y);
    o+=n.t==='service'?`<rect x="${x-17}" y="${y-12}" width="34" height="24" fill="#0E1214" stroke="${c}" stroke-width="2.6"/><rect x="${x-17}" y="${y+6}" width="34" height="6" fill="#3E9C86"/>`:n.t==='database'?`<rect x="${x-13}" y="${y-14}" width="26" height="28" rx="10" fill="#0E1214" stroke="${c}" stroke-width="2.6"/>`:n.t==='user'?`<circle cx="${x}" cy="${y}" r="13" fill="#0E1214" stroke="${c}" stroke-width="2.6"/>`:n.t==='token'?`<polygon points="${x},${y-15} ${x+15},${y} ${x},${y+15} ${x-15},${y}" fill="#0E1214" stroke="${c}" stroke-width="2.6"/>`:n.t==='device'?`<rect x="${x-16}" y="${y-10}" width="32" height="20" fill="#0E1214" stroke="${c}" stroke-width="2.6"/>`:`<polygon points="${x-15},${y-9} ${x},${y-17} ${x+15},${y-9} ${x+15},${y+9} ${x},${y+17} ${x-15},${y+9}" fill="#0E1214" stroke="${c}" stroke-width="2.6"/>`});
   if(ch.proof>.5)for(let k=0;k<6;k++){const a=Math.PI/2+k*Math.PI/3;o+=`<circle cx="${X(Math.cos(a)*6.4)}" cy="${Y(Math.sin(a)*6.4)}" r="9" fill="#0E1214" stroke="#F1F0EA" stroke-width="3"/><circle cx="${X(Math.cos(a)*6.4)}" cy="${Y(Math.sin(a)*6.4)}" r="3" fill="#3E9C86"/>`}}
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.states[state].label}: ${spec.states[state].desc}"><rect width="${W}" height="${H}" fill="#0E1214"/>${o}</svg>`}
}
if(typeof module!=='undefined')module.exports={HaltScene,assetKit,buildCore,HM};
