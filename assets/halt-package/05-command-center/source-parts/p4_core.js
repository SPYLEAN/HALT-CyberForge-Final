const ST={state:'approval',view:'overview',sel:{t:'n',id:'grant'},cur:TE,mode:'live',layers:{obs:1,inf:1,fc:1,biz:1,plan:1},path:'all',playing:false,speed:1,a1:false,a2:false,ack:false,prog:0,applied:0,base:882,t0:Date.now(),log:[],rolled:false};
const S=()=>STATES.find(s=>s.k===ST.state);
const tag=(k,t)=>`<span class="tag t-${k}">${t}</span>`;
const pct=v=>Math.round(v*100)+'%';
let timers=[];
function toast(m){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toast.h);toast.h=setTimeout(()=>t.style.display='none',3200)}
function addLog(w,m,k){ST.log.unshift({t:fmt(toS('10:07:12')+Math.round((Date.now()-ST.t0)/1000)),w,m,k:k||'obs'})}
// seed audit log
ST.log=[{t:'10:06:40',w:'HALT',m:'ProofSeal PS-2417-01 sealed: 6 events, graph snapshot, solver certificate',k:'sim'},{t:'10:05:02',w:'HALT',m:'SafeCut selected 3 actions from 4,096 combinations',k:'sim'},{t:'10:01:30',w:'HALT',m:'EchoLab finished 3 × 6,000 rollouts',k:'sim'},{t:'09:55:10',w:'HALT',m:'Incident HLT-2047 opened from alert AL-5521',k:'obs'}];
function liveT(){const s=S();return s.max>=6?TE:EV[s.max-1].s}
function maxT(){const s=S();return s.fc?TE+HOR:liveT()}
function curT(){return ST.mode==='live'?liveT():clamp(ST.cur,T0,maxT())}
function stepNow(){const s=S(),t=curT();let n=0;EV.forEach(e=>{if(e.s<=t)n++});return Math.min(n,effMax())}
function effMax(){const s=S();return s.k==='correlating'?Math.min(6,2+Math.floor(ST.prog/25)):s.max}
function fcOn(){return S().fc&&curT()>=TE}
function pathsOpen(){return ST.applied>=3?0:6}
function setState(k,quiet){
 closeDrawer();
 timers.forEach(clearInterval);timers=[];ST.playing=false;ST.state=k;ST.prog=0;ST.mode='live';ST.cur=TE;
 const s=S();ST.base=s.since;ST.t0=Date.now();
 if(['new','correlating','forecast','simulating','plan','conflict','nofeasible','approval'].includes(k)){ST.applied=0}
 if(['plan','approval','conflict','nofeasible','forecast','simulating','new','correlating'].includes(k)){ST.a1=false;ST.a2=false;ST.ack=false}
 if(['contained','rollback'].includes(k)){ST.applied=3;ST.a1=ST.a2=true}
 if(k==='executing'){ST.applied=0;ST.a1=ST.a2=true}
 if(s.auto)timers.push(setInterval(()=>{ST.prog+=k==='executing'?34:(k==='correlating'?5:4);
   if(k==='executing'){ST.applied=Math.min(3,Math.floor(ST.prog/33.4));if(ST.applied>=1&&ST.prog-34<33.4)addLog(OPS.n,'Executed A'+ST.applied,'obs')}
   if(ST.prog>=100){clearInterval(timers[0]);const nx={correlating:'forecast',simulating:'plan',executing:'contained'}[k];if(k==='executing'){ST.applied=3;addLog('HALT','Containment verified: 0 of 6 paths reachable (observed)','obs')}setState(nx);return}
   renderAll(true)},k==='executing'?1100:240));
 if(k==='contained')ST.rolled=false;
 renderAll();
}
const IC={
 overview:'<rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 6h12" stroke="currentColor" stroke-width="1.6"/>',
 graph:'<circle cx="3.5" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12.5" cy="3.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12.5" cy="12.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7l5-2.5M5.5 9l5 2.5" stroke="currentColor" stroke-width="1.5"/>',
 echolab:'<path d="M2 12l4-4 3 2 5-6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 14h12" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/>',
 safecut:'<path d="M2 8h4M10 8h4" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
 proofseal:'<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>',
 timeline:'<path d="M2 8h12" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="5.5" width="3" height="5" fill="currentColor"/><rect x="10" y="5.5" width="3" height="5" fill="currentColor"/>',
 policies:'<path d="M3 3h10M3 8h10M3 13h6" stroke="currentColor" stroke-width="1.6"/>'
};
const VIEWS=[['overview','Incident Overview'],['graph','ThreadGraph'],['echolab','EchoLab'],['safecut','SafeCut'],['proofseal','ProofSeal'],['timeline','Timeline'],['policies','Policies']];
function badge(v){const s=S();
 if(v==='graph')return pathsOpen()+' open';
 if(v==='safecut')return s.plan===1||s.plan===2?'3':s.plan===3?'0':'';
 if(v==='proofseal')return s.plan===1?(ST.applied>=3?'6/6':'sim'):'';
 if(v==='policies')return s.k==='conflict'?'1 conflict':'';
 return''}
function renderNav(){
 $('#nav').innerHTML=`<div class="brand"><svg viewBox="16 6 64 84" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M64 6h16v84h-16zM28.0 42.0h36.0v12h-36.0zM16 18L24 10H32V36.5H16zM16 59.5h16v26.5h-16zM16.0 48a8 8 0 1 1 16 0a8 8 0 1 1 -16 0zM21.0 48a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z"/></svg>HALT</div>
 <div class="incchip"><span class="k">Incident</span><b>HLT-2047</b><span class="muted" style="font-size:12px">OAuth Consent Compromise</span></div>
 <nav aria-label="Systems">${VIEWS.map(v=>`<button class="navi" data-view="${v[0]}" ${ST.view===v[0]?'aria-current="page"':''}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${IC[v[0]]}</svg>${v[1]}<span class="bd">${badge(v[0])}</span></button>`).join('')}</nav>
 <div class="navfoot"><div><div class="k">Signed in</div><div style="font-weight:600">${OPS.n}</div><div class="muted" style="font-size:12px">${OPS.r}</div></div><span class="tag t-sim">Simulated demo data</span></div>`;
}
function approvalText(){const s=S();if(s.k==='approval')return ST.a1?(ST.a2?'Ready to execute':'Awaiting Finance Ops co-approval'):'Awaiting analyst approval';return s.appr}
function sinceText(){const live=ST.base+Math.round((Date.now()-ST.t0)/1000);
 if(ST.mode==='replay'){return `<span class="tag t-n" style="padding:0">Replay ${fmt(curT())}Z</span>`}
 return dur(live)}
function renderRib(){const s=S(),c=s.conf;
 const stg=ST.mode==='replay'&&stepNow()<4?STAGES[Math.max(0,[0,0,1,2,2,3,3][stepNow()]|0)]:STAGES[s.stage];
 $('#rib').innerHTML=`<div class="rf"><span class="k">Incident</span><span class="v">HLT-2047</span></div>
 <div class="rf"><span class="k">Status</span><span class="v"><span class="pill ${s.tone}"><i></i>${s.status}</span></span></div>
 <div class="rf"><span class="k">Confidence</span><span class="v"><button class="score" data-score="inc" title="Show the evidence behind this score">${pct(c)}<small>evidence</small></button></span></div>
 <div class="rf"><span class="k">Attack stage</span><span class="v" style="font-size:13px">${stg}</span></div>
 <div class="rf"><span class="k">Since detect</span><span class="v mono" id="since" style="font-size:13px">${sinceText()}</span></div>
 <div class="rf"><span class="k">Approval</span><span class="v"><button class="btn sm ${s.k==='approval'?'pri':'q'}" data-act="drawer" ${s.plan!==1?'disabled':''}>${approvalText()}</button></span></div>
 <span class="rsp"></span>
 <div style="display:flex;gap:10px;align-items:center"><div class="seg" role="group" aria-label="Mode"><button data-mode="live" aria-pressed="${ST.mode==='live'}">Live</button><button data-mode="replay" aria-pressed="${ST.mode==='replay'}">Replay</button></div>
 <button class="btn sm q" data-act="statemenu" aria-haspopup="true">${s.n} ▾</button><button class="btn sm q" data-act="spec">Specs</button></div>`;
}
function renderBanner(){const s=S(),b=s.b;let extra='';
 if(ST.mode==='replay')return `<div class="wsbar rep"><div class="m"><b>Replay · ${fmt(curT())}Z</b><p>You are viewing the past. Live state is unchanged: ${S().status}.</p></div><button class="btn sm" data-mode="live">Return to live</button></div>`;
 if(s.k==='correlating')extra=`<div class="prog"><i style="width:${ST.prog}%"></i></div>`;
 if(s.k==='simulating')extra=`<div class="prog"><i style="width:${ST.prog}%"></i></div><p class="mono" style="font-size:11px;color:var(--text2)">${(ST.prog*60).toLocaleString()} / 6,000 rollouts · simulated</p>`;
 if(s.k==='executing')extra=`<div class="prog"><i style="width:${Math.min(100,ST.prog)}%"></i></div><p class="mono" style="font-size:11px;color:var(--text2)">${ST.applied} of 3 actions applied</p>`;
 const go=b.go?`<button class="btn sm pri" data-go="${b.go[1]}">${b.go[0]}</button>`:'';
 return `<div class="wsbar"><div class="m"><b>${b.h}</b><p>${b.p}</p>${extra}</div>${go}</div>`;
}
function renderAll(light){renderNav();renderRib();if(!light)renderWS();else{const bar=$('.wsbar');if(bar)bar.outerHTML=renderBanner();refreshGraphs()}renderRail();renderTL()}
function gOpts(extra){const s=S(),o={step:stepNow(),layers:ST.layers,applied:ST.applied,proposed:s.plan>=1&&s.plan<=2,conflict:s.k==='conflict',path:ST.path,sel:ST.sel.t==='n'?ST.sel.id:null,fcAll:false};
 if(!fcOn())o.layers=Object.assign({},ST.layers,{fc:0});
 if(s.k==='correlating')o.step=effMax();
 return Object.assign(o,extra||{})}
function refreshGraphs(){$$('[data-graph]').forEach(el=>{const m=el.dataset.graph;el.innerHTML=gSVG(gOpts(m==='mini'?{mini:true,noLabels:0}:{}))})}
