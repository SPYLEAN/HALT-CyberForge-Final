const h=React.createElement,{useState,useEffect,useRef,useMemo}=React;
const SP=HALT_SPEC,ORDER=SP.order;
const TABS=['Preview','Hierarchy','States & motion','Camera, light, material','Assets','Spec editor','Export','Budget & fallback'];
function Curve({e}){if(e==='linear')return h('svg',{width:48,height:24,viewBox:'0 0 48 24','aria-hidden':true},h('path',{d:'M2 22L46 2',stroke:'#F1F0EA',fill:'none',strokeWidth:2}));
 const f=bezEase(e);let d='';for(let i=0;i<=24;i++){const t=i/24;d+=(i?'L':'M')+(2+t*44).toFixed(1)+' '+(22-f(t)*20).toFixed(1)}
 return h('svg',{width:48,height:24,viewBox:'0 0 48 24','aria-hidden':true},h('path',{d,stroke:'#F1F0EA',fill:'none',strokeWidth:2}))}
function TransitionMap({state,setState}){
 const W=860,H=130,xs=ORDER.map((_,i)=>60+i*123);
 return h('svg',{viewBox:`0 0 ${W} ${H}`,style:{width:'100%',height:'auto'},role:'img','aria-label':'State transition map'},
  ORDER.map((s,i)=>i<ORDER.length-1&&h('g',{key:'a'+i},h('path',{d:`M${xs[i]+16} 50H${xs[i+1]-16}`,stroke:'#707D84',strokeWidth:2,strokeDasharray:i===3?'3 5':''}),
   h('text',{x:(xs[i]+xs[i+1])/2,y:38,textAnchor:'middle',fill:'#9AA3A8',fontSize:9,fontFamily:'IBM Plex Mono'},({0:'approach 2200',1:'expand 960',2:'expand 720',3:'futures 900',4:'cut 900',5:'proof 600'})[i]))),
  ORDER.map((s,i)=>h('g',{key:s,style:{cursor:'pointer'},onClick:()=>setState(s),tabIndex:0,role:'button','aria-label':SP.states[s].label,onKeyDown:e=>{if(e.key==='Enter'||e.key===' ')setState(s)}},
   h('circle',{cx:xs[i],cy:50,r:14,fill:state===s?'#F1F0EA':'#0E1214',stroke:'#F1F0EA',strokeWidth:2.5}),h('text',{x:xs[i],y:54,textAnchor:'middle',fill:state===s?'#0E1214':'#F1F0EA',fontSize:11,fontFamily:'IBM Plex Mono'},i+1),
   h('text',{x:xs[i],y:84,textAnchor:'middle',fill:'#F1F0EA',fontSize:11,fontFamily:'Archivo'},SP.states[s].label.replace('Safe Containment','Contained')))),
  h('text',{x:W/2,y:118,textAnchor:'middle',fill:'#9AA3A8',fontSize:10,fontFamily:'IBM Plex Mono'},'Any state can jump to any other. Reverse steps use switch 360 ms. Camera: 1400 ms.'))}
function Stage({state,quality,reduced,layout,mode,noGL,scale,transparent,onStats,onDesc,spec}){
 const cv=useRef(),lb=useRef(),sc=useRef(),[lost,setLost]=useState(false),supported=useMemo(()=>HaltScene.supported(),[]);
 const useFallback=noGL||!supported||lost;
 useEffect(()=>{if(useFallback)return;let s;try{s=new HaltScene(cv.current,lb.current,{spec,quality:quality==='auto'?'balanced':quality,reducedMotion:reduced,layout,state,transparent,onStats,onState:(n,d)=>onDesc(d),onLost:()=>setLost(true)})}catch(e){setLost(true);return}
  sc.current=s;onDesc(s.describe());return()=>{s.dispose();sc.current=null}},[useFallback,spec]);
 useEffect(()=>{const s=sc.current;if(s)s.setState(state)},[state]);
 useEffect(()=>{const s=sc.current;if(s&&quality!=='auto')s.setQuality(quality)},[quality]);
 useEffect(()=>{const s=sc.current;if(s)s.setReducedMotion(reduced)},[reduced]);
 useEffect(()=>{const s=sc.current;if(s)s.setLayout(layout)},[layout]);
 useEffect(()=>{const s=sc.current;if(s){s.setMode(mode);s.setState(state,{instant:true})}},[mode]);
 useEffect(()=>{const s=sc.current;if(s)s.timeScale=scale},[scale]);
 useEffect(()=>{const s=sc.current;if(s)s.setTransparent(transparent)},[transparent]);
 useEffect(()=>{const f=()=>sc.current&&sc.current.resize();addEventListener('resize',f);return()=>removeEventListener('resize',f)},[]);
 return h('div',{className:'stage'+(transparent?' chk':'')},
  useFallback?h('div',{className:'fb',dangerouslySetInnerHTML:{__html:HaltScene.fallbackSVG(state,spec)}}):h('canvas',{ref:cv,role:'img','aria-label':SP.states[state].label+'. '+SP.states[state].desc}),
  h('div',{className:'lbls',ref:lb}),useFallback&&h('div',{className:'cap'},h('b',null,SP.states[state].label),SP.states[state].desc),
  h('div',{className:'badge'},useFallback?'Static fallback · no WebGL':'WebGL · '+(mode==='gallery'?'asset kit':SP.states[state].label)))}
function ChannelTable(){return h('table',{className:'t'},h('thead',null,h('tr',null,['State','lane','laneShow','graph','biz','futures','cut','proof','boundary'].map(x=>h('th',{key:x},x)))),
 h('tbody',null,ORDER.map(s=>h('tr',{key:s},h('td',null,SP.states[s].label),['lane','laneShow','graph','biz','futures','cut','proof','boundary'].map(c=>h('td',{key:c,className:'n'},SP.states[s].ch[c]))))))}
function Kv({o}){return h('table',{className:'t'},h('tbody',null,Object.keys(o).map(k=>h('tr',{key:k},h('td',{className:'k'},k),h('td',null,typeof o[k]==='object'?JSON.stringify(o[k]):String(o[k]))))))}
const ASSETS=[['User node','Instanced · outlined circle','Bone','Identity of a person. Colour stays Bone; the hostile account is never recoloured, the event is marked instead.'],
 ['Device node','Instanced · outlined rectangle','Bone / Ember if attacker-owned','Managed or unknown device.'],['Token node','Instanced · outlined diamond','Bone','Refresh tokens and sessions.'],
 ['Application node','Instanced · outlined hexagon','Bone / Ember if malicious','OAuth applications and attacker infrastructure.'],
 ['Critical-service node','Instanced · outlined rectangle + Verdigris bar','Bone + Verdigris','Business-critical service. The bar is the only Verdigris on a node.'],
 ['Database node','Instanced · outlined can','Bone','The asset at risk. Gets an Ember dotted halo when forecast to be reached.'],
 ['Evidence marker','Instanced · 0.2 cube, 45°','Bone','Sits on every observed link. One marker = one log.'],
 ['Forecast marker','Instanced · 12-dash ring, slowly turning','Ember','Marks a forecast. Never solid.'],
 ['Approval marker','Instanced · double ring','Bone','Appears when a human has approved. Different from the proof ring.'],
 ['Blocked-path marker','Instanced · ring + centre','Bone ring, Verdigris centre','Where a hostile path was cut. Downstream stays at 30%.'],
 ['Preserved-path marker','Instanced · capsule','Verdigris','Business path kept open. Always paired with a thicker tube.']];
function App(){
 const mq=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const [tab,setTab]=useState(0),[state,setState]=useState('dormant'),[quality,setQuality]=useState(innerWidth<900?'low':'balanced'),[reduced,setReduced]=useState(mq),[layout,setLayout]=useState('centered'),[mode,setMode]=useState('core'),
  [noGL,setNoGL]=useState(false),[scale,setScale]=useState(1),[tour,setTour]=useState(false),[transparent,setTransparent]=useState(false),[stats,setStats]=useState({}),[desc,setDesc]=useState(''),[spec,setSpec]=useState(HALT_SPEC),[err,setErr]=useState('');
 const [json,setJson]=useState(()=>JSON.stringify({motion:HALT_SPEC.motion,cameras:HALT_SPEC.cameras,quality:HALT_SPEC.quality},null,1));
 useEffect(()=>{if(!tour)return;const id=setInterval(()=>setState(s=>ORDER[(ORDER.indexOf(s)+1)%ORDER.length]),reduced?3500:4800);return()=>clearInterval(id)},[tour,reduced]);
 const apply=()=>{try{const o=JSON.parse(json);const ns=Object.assign({},HALT_SPEC,o);Object.assign(HALT_SPEC,o);setSpec(ns);setErr('')}catch(e){setErr(e.message)}};
 const btn=(on,fn,txt,key)=>h('button',{key:key||txt,className:'b'+(on?' on':''),onClick:fn,'aria-pressed':on},txt);
 const idx=ORDER.indexOf(state);
 return h('div',{className:'app'},
  h('header',{className:'hd'},h('div',null,h('span',{className:'kk'},'HALT · 3D and motion system v'+SP.version),h('h1',null,'One object, seven states, every surface')),h('div',{className:'tabs',role:'tablist'},TABS.map((t,i)=>h('button',{key:t,role:'tab','aria-selected':tab===i,className:'tb'+(tab===i?' on':''),onClick:()=>setTab(i)},t)))),
  h('div',{className:'pv'+(tab===0||tab===4?'':' small')},
   h(Stage,{state,quality,reduced,layout,mode:tab===4?'gallery':'core',noGL,scale,transparent,onStats:s=>setStats(p=>Object.assign({},p,s)),onDesc:setDesc,spec}),
   h('div',{className:'ctl'},
    h('p',{className:'sr','aria-live':'polite'},desc),
    h('div',{className:'g'},h('span',{className:'kk'},'State'),h('div',{className:'col'},ORDER.map((s,i)=>btn(state===s,()=>setState(s),(i+1)+' · '+SP.states[s].label,s)))),
    h('div',{className:'row'},h('button',{className:'b',onClick:()=>setState(ORDER[Math.max(0,idx-1)])},'◀ Back'),h('button',{className:'b',onClick:()=>setState(ORDER[Math.min(6,idx+1)])},'Next ▶'),btn(tour,()=>setTour(!tour),tour?'Stop tour':'Play tour')),
    h('p',{className:'desc'},SP.states[state].desc),
    h('div',{className:'g'},h('span',{className:'kk'},'Quality'),h('div',{className:'row'},['high','balanced','low'].map(q=>btn(quality===q,()=>setQuality(q),q)))),
    h('div',{className:'g'},h('span',{className:'kk'},'Composition'),h('div',{className:'row'},[['centered','Centred'],['website','Website'],['commandCenter','Command Center'],['mobile','Mobile']].map(l=>btn(layout===l[0],()=>setLayout(l[0]),l[1],l[0])))),
    h('div',{className:'g'},h('span',{className:'kk'},'Motion time ×'+scale.toFixed(1)),h('input',{type:'range',min:.3,max:2.5,step:.1,value:scale,onChange:e=>setScale(+e.target.value),'aria-label':'Motion time scale'})),
    h('div',{className:'col'},h('label',{className:'ck'},h('input',{type:'checkbox',checked:reduced,onChange:e=>setReduced(e.target.checked)}),' Reduced motion (stops idle motion, snaps transitions)'),
     h('label',{className:'ck'},h('input',{type:'checkbox',checked:noGL,onChange:e=>setNoGL(e.target.checked)}),' Simulate no WebGL (static fallback)'),
     h('label',{className:'ck'},h('input',{type:'checkbox',checked:transparent,onChange:e=>setTransparent(e.target.checked)}),' Transparent background (checker)')),
    h('p',{className:'st mono'},stats.calls!=null?`${stats.q||quality} · ${stats.calls} calls · ${(stats.tris||0).toLocaleString()} tris · ${stats.ms} ms CPU`:'')))
  ,tab>0&&tab!==4&&h('section',{className:'pg'},
   tab===1&&h('div',null,h('h2',null,'Object hierarchy'),h('pre',null,SP.hierarchy.join('\n')),h('p',{className:'m'},'Node types and markers are instanced: one InstancedMesh per type, per-instance colour and scale. Tubes are the only per-edge meshes.')),
   tab===2&&h('div',null,h('h2',null,'State-transition map'),h(TransitionMap,{state,setState}),h('h2',null,'Channel targets per state'),h('p',{className:'m'},'Each channel runs 0–1 (lane is a fraction of the way to the cut point). A state is just a set of channel targets; the tween per channel is chosen from the motion table below.'),h(ChannelTable),
    h('h2',null,'Durations and easing'),h('table',{className:'t'},h('thead',null,h('tr',null,['Name','ms','Stagger','Easing','Curve','Used for'].map(x=>h('th',{key:x},x)))),h('tbody',null,Object.keys(SP.motion).map(k=>{const m=SP.motion[k];return h('tr',{key:k},h('td',{className:'k'},k),h('td',{className:'n'},m.ms+(m.loop?' loop':'')),h('td',{className:'n'},m.stagger||'—'),h('td',{className:'mono'},m.ease==='linear'?'linear':'cubic-bezier('+m.ease.join(', ')+')'),h('td',null,h(Curve,{e:m.ease})),h('td',null,m.use))}))),
    h('h2',null,'Transition overrides'),h(Kv,{o:SP.transitions}),h('h2',null,'Reduced motion'),h('p',null,'Idle rotation, pulse, marching dots and camera drift stop. Every transition snaps (duration 0) and the camera jumps. State is still communicated by shape, position and HTML labels.')),
   tab===3&&h('div',null,h('h2',null,'Camera positions'),h('table',{className:'t'},h('thead',null,h('tr',null,['State','Position','Look at'].map(x=>h('th',{key:x},x)))),h('tbody',null,ORDER.map(s=>h('tr',{key:s},h('td',null,SP.states[s].label),h('td',{className:'mono'},JSON.stringify(SP.cameras[s].pos)),h('td',{className:'mono'},JSON.stringify(SP.cameras[s].target)))))),
    h('p',{className:'m'},'FOV '+SP.cameras.fov+'°. Portrait: distance ×'+SP.cameras.mobile.distanceMultiplier+', world shifted up. Composition presets shift the view offset so website copy and Command Center panels never cover the Core: '),h(Kv,{o:SP.layouts}),
    h('h2',null,'Lighting'),h('ul',null,SP.lighting.rules.map(r=>h('li',{key:r},r))),h(Kv,{o:{ambient:SP.lighting.ambient,key:SP.lighting.key}}),
    h('h2',null,'Materials'),h(Kv,{o:{coreSolid:SP.materials.coreSolid,path:SP.materials.path,node:SP.materials.node,marker:SP.materials.marker}}),h('ul',null,SP.materials.rules.map(r=>h('li',{key:r},r))),
    h('h2',null,'Colour rules'),h('p',null,SP.palette.rules),h('div',{className:'sw'},['ink','bone','ember','verdigris','neutral'].map(c=>h('span',{key:c,style:{background:SP.palette[c],color:c==='ink'||c==='ember'||c==='verdigris'||c==='neutral'?'#F1F0EA':'#0E1214'}},c+' '+SP.palette[c])))),
   tab===5&&h('div',null,h('h2',null,'Editable specification'),h('p',{className:'m'},'The scene reads this object. Edit a duration, an easing curve, a camera position or a quality preset, then apply. The preview rebuilds with your values. (Edits live in this session only; copy the JSON into halt-spec.js to keep them.)'),
    h('textarea',{className:'ta',value:json,onChange:e=>setJson(e.target.value),spellCheck:false,'aria-label':'Scene specification JSON'}),h('div',{className:'row'},h('button',{className:'b on',onClick:apply},'Apply to preview'),h('button',{className:'b',onClick:()=>{setJson(JSON.stringify({motion:HALT_SPEC.motion,cameras:HALT_SPEC.cameras,quality:HALT_SPEC.quality},null,1))}},'Reload current'),err&&h('span',{className:'er'},err))),
   tab===6&&h('div',null,h('h2',null,'Export'),h('p',{className:'m'},'Transparent PNG and GLB are generated from the same procedural code as the preview, so they never drift from the live scene. Browser pages cannot download files here, so run the script locally.'),
    h('pre',null,['# 1. install once','npm i three@0.128.0 playwright','npx playwright install chromium','','# 2. put halt-spec.js, halt-scene-a.js, halt-scene-b.js, export-assets.mjs in one folder','node export-assets.mjs','','# output','out/png/halt-core-<state>.png      transparent, 1600x1000, 7 files','out/svg/halt-fallback-<state>.svg   static fallback, 7 files','out/glb/halt-core.glb               Core + lanes + boundary, verified pose','out/glb/halt-node-kit.glb          11 reusable assets, one node each'].join('\n')),
    h('h2',null,'Rules for exported assets'),h('ul',null,['PNG: renderer alpha, clear alpha 0, preserveDrawingBuffer, DPR 1, no labels (labels are HTML).','GLB: no instancing (the exporter cannot write it), MeshStandard for the Core and unlit MeshBasic for everything else, names match the hierarchy, 1 unit = 1 world unit, Y up.','Do not add a texture, an environment map or a post-processing pass to an export.','Reuse the SVG fallbacks as the website poster image and the Open Graph image.'].map(x=>h('li',{key:x},x)))),
   tab===7&&h('div',null,h('h2',null,'Performance budget'),h(Kv,{o:SP.budget}),h('h2',null,'Live measurement'),h('p',{className:'mono big'},stats.calls!=null?`${stats.calls} draw calls (budget ≤ 60) · ${(stats.tris||0).toLocaleString()} triangles (≤ 45,000) · ${stats.geos} geometries (≤ 70) · ${stats.ms} ms CPU per frame`:'Measuring…'),
    h('h2',null,'Quality levels'),h('table',{className:'t'},h('thead',null,h('tr',null,['Level','DPR','Tube segs','Radial','FPS cap','Idle motion'].map(x=>h('th',{key:x},x)))),h('tbody',null,Object.keys(SP.quality).map(k=>{const q=SP.quality[k];return h('tr',{key:k},h('td',{className:'k'},k),h('td',{className:'n'},q.pixelRatio),h('td',{className:'n'},q.tubeSegments),h('td',{className:'n'},q.radial),h('td',{className:'n'},q.fpsCap),h('td',null,q.idleMotion?'yes':'no'))}))),h('p',{className:'m'},SP.quality.low.note),
    h('h2',null,'Fallback behaviour'),h('p',null,SP.fallback.behaviour),h('ol',null,SP.fallback.order.map(x=>h('li',{key:x},x))),h('p',{className:'m'},'Toggle “Simulate no WebGL” in the preview to see it. The seven SVG posters come from the same model data, so they stay in step with the scene.'))),
  tab===4&&h('section',{className:'pg'},h('h2',null,'Asset kit'),h('p',{className:'m'},'The canvas above shows all eleven reusable assets built from the shared geometry factory. The same factory builds the instanced scene, so a change to one definition updates both.'),
   h('table',{className:'t'},h('thead',null,h('tr',null,['Asset','Build','Colour','Use'].map(x=>h('th',{key:x},x)))),h('tbody',null,ASSETS.map(a=>h('tr',{key:a[0]},h('td',{className:'k'},a[0]),h('td',null,a[1]),h('td',null,a[2]),h('td',null,a[3]))))))
 )}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
