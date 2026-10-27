function specHTML(){
 const C=[
 ['IncidentRibbon','Always-visible incident identity and state. Sticky, 68 px.','{incidentId, status:{label,tone}, confidence:Score, stage, detectedAt, approval:ApprovalState, mode:"live"|"replay"}','status pill (neutral · ember · verdigris), confidence opens EvidenceRail, approval chip disabled until a plan exists','bg, line; Plex Mono 10.5 labels','Landmark header; every field has a visible label; score is a button'],
 ['NavItem','Left navigation for the 7 systems.','{id, label, badge?, current}','default, hover, current (2 px Bone left bar), badge','surface, raised, text2','nav > button, aria-current="page", 44 px target'],
 ['EvidenceTag','Marks the epistemic status of any value. Mandatory beside every number.','{kind:"observed"|"inferred"|"forecast"|"simulated"|"business"}','Observed = Ember fill square · Inferred = dashed · Forecast = dotted Ember · Simulated = dotted + hatch','threat-observed, threat-text, neutral','Never colour alone: shape and word both change'],
 ['ScoreChip','Any confidence, likelihood or risk figure.','{value, kind:"confidence"|"likelihood", evidenceId}','default, focus. Click opens the rail score view','text, text2','Button with accessible name “Show evidence for 87 percent confidence”'],
 ['GraphCanvas','SVG 960×440 ThreadGraph, used large, mini and in EchoLab.','{step, layers, applied, proposed, conflict, path, sel, mini, off, fcAll}','Observed 3 px Ember + evidence square · Forecast dotted 2 px · Inferred dashed · Business 2 px Verdigris · Cut = Bone ring with Verdigris centre · Proposed = dashed ring','threat-*, business, proof-ring','Nodes are focusable buttons with labels; text equivalent in the paths table'],
 ['LayerToggle','Shows or hides a graph layer.','{layer, pressed}','pressed, unpressed (disabled colour)','raised, border','aria-pressed'],
 ['TimelineScrubber','Time cursor over observed and forecast ranges.','{events[], cursor, liveAt, forecastUntil, playing, speed}','live (locked to NOW), replay, playing; forecast zone hatched','ember hatch, text','Native range input; aria-valuetext with UTC time; Prev/Next event buttons'],
 ['EvidenceRail','Details of the selected entity, edge or score.','{selection}','entity, score, empty','surface, kv rows','Rows are definition lists; “Why this score” is a details element'],
 ['StateBanner','One sentence on the current incident state and the next safe step.','{state, message, cta?, progress?}','11 states, replay variant','bg, raised','role=status on progress updates'],
 ['ActionRow','One proposed response action.','{id, title, impact, reversibility, authorisation, status}','proposed, queued, executed, blocked by policy','line','Impact, reversibility and authorisation always visible'],
 ['ApprovalGate','Drawer that approves and executes.','{operator, permissions, actions[], rollback, approvals[]}','pending, analyst approved, co-approved, ready, executing','border-strong','Modal dialog, Esc closes, focus returns'],
 ['HoldButton','The only way to execute or roll back.','{label, duration=1200, disabled, onComplete}','idle, holding (fill), complete, disabled','text, line','Space/Enter held for 1.2 s; release cancels; helper text explains'],
 ['PathRow','One dangerous path and its status.','{id, route, basis, blockedBy}','open (observed or forecast), blocked','line','Row is clickable and keyboard-activatable'],
 ['ProofClaim','One verifiable claim with predicted and observed results.','{title, check, predicted, observed?, status}','pending, verified (simulated), verified (observed), failed','proof-ring','Ring shape plus word, not colour alone'],
 ['PolicyRow','A rule, its approver and its status for the current plan.','{id, rule, approver, governs, status}','satisfied, awaiting, conflict, not applicable','line','Rule text in disclosure']];
 const states=STATES.map(s=>`<tr><td><code>${s.k}</code></td><td>${s.n}</td><td>${s.status}</td><td>${s.b.go?s.b.go[0]:'—'}</td><td>${s.fc?'forecast':'—'} ${s.sim===2?'· simulated results':s.sim===1?'· simulating':''} ${s.plan===1?'· plan':s.plan===2?'· plan, A3 blocked':s.plan===3?'· no plan':''}</td></tr>`).join('');
 const rules=[['No irreversible action as a casual button','HoldButton is the only executor; irreversible actions are not offered (IR-BRK-01).'],['Every score exposes its evidence','ScoreChip → EvidenceRail score view; “Why this score” on every entity.'],['Forecasts are labelled forecasts','EvidenceTag forecast + dotted style + FORECAST LAYER caption + hatched timeline zone.'],['Simulated ≠ observed','Hatch + dotted border + word “Simulated”; observed uses solid Ember or plain text.'],['Approval shows operator, permissions, rollback','ApprovalGate sections in that order.'],['Progressive disclosure','Overview summarises; details elements hold alternatives, rule text and score derivations.']];
 return `<div class="sp"><button class="btn sm" data-act="closespec" style="float:right">Close specs</button><span class="k">HALT Command Center</span><h1>Component specifications</h1><p class="muted" style="max-width:70ch;margin-top:8px">Developer handoff for the prototype. Tokens come from the HALT design system: Ink #0E1214, Bone #F1F0EA, Ember #D4572F (hostile only), Verdigris #3E9C86 (business only). Archivo and IBM Plex Mono are provisional.</p>
 <h2>Layout</h2><p class="muted">Desktop 1440×900. Grid: nav 216 · workspace fluid · rail 344. Rows: ribbon 68 · workspace fluid · timeline 132. Minimum supported 1180 px.</p>
 <h2>Components</h2>${C.map(c=>`<div class="spc"><div><h3>${c[0]}</h3><p class="muted" style="font-size:12.5px;margin-top:4px">${c[1]}</p></div><dl><dt>Props</dt><dd><code>${c[2]}</code></dd><dt>States</dt><dd>${c[3]}</dd><dt>Tokens</dt><dd>${c[4]}</dd><dt>A11y</dt><dd>${c[5]}</dd></dl></div>`).join('')}
 <h2>State machine</h2><table class="tbl"><thead><tr><th>Key</th><th>State</th><th>Ribbon status</th><th>Primary action</th><th>Enables</th></tr></thead><tbody>${states}</tbody></table><p class="muted" style="margin-top:8px">Happy path: new → correlating → forecast → simulating → plan → approval → executing → contained → rollback. Branches from plan: conflict, nofeasible. Rolling back returns to plan.</p>
 <h2>Rules and where they are enforced</h2><table class="tbl"><tbody>${rules.map(r=>`<tr><td><b>${r[0]}</b></td><td class="muted">${r[1]}</td></tr>`).join('')}</tbody></table>
 <h2>Data contract</h2><pre>type Basis = 'observed'|'inferred'|'forecast'|'simulated'
interface Evidence { id:string; source:string; ts:string; basis:Basis }
interface Score { value:number; kind:'confidence'|'likelihood'; parts:{claim:string; ref:string; strength:'strong'|'moderate'|'limits'|'simulated'}[]; wouldChange:string }
interface Edge { id:string; a:string; b:string; basis:Basis; step?:number; cutBy?:'A1'|'A2'|'A3' }
interface Action { id:string; title:string; impact:string; rollbackPlan:{id:string; eta:number; dryRun:'passed'|'failed'}; policy:string; approvers:string[]; permission:string }
interface Incident { id:'HLT-2047'; state:StateKey; confidence:Score; events:Evidence[]; edges:Edge[]; paths:{id:string; edges:string[]}[]; actions:Action[] }</pre></div>`}
document.addEventListener('click',e=>{
 const t=e.target.closest('[data-view],[data-score],[data-sel],[data-ev],[data-act],[data-go],[data-mode],[data-layer],[data-path],[data-tl],[data-log],[data-ent],#scrim');
 if(!t){const m=$('#smenu');if(m)m.remove();return}
 const d=t.dataset;
 if(t.id==='scrim'){closeDrawer();return}
 if(d.ent){const [a,b]=d.ent.split(':');ST.sel={t:a,id:b};renderRail();refreshGraphs();return}
 if(d.path&&!d.view){ST.path=ST.path===d.path&&d.path!=='all'?'all':d.path;if(ST.view==='graph'){$$('[data-path]').forEach(b=>{if(b.classList.contains('chip'))b.setAttribute('aria-pressed',b.dataset.path===ST.path)});refreshGraphs()}else renderWS();return}
 if(d.view){ST.view=d.view;if(d.path)ST.path=d.path;renderAll();$('#ws').scrollTop=0;return}
 if(d.score){ST.sel={t:'sc',id:d.score};renderRail();return}
 if(d.sel){const [a,b]=d.sel.split(':');ST.sel={t:a,id:b};renderRail();refreshGraphs();return}
 if(d.ev){const n=+d.ev;ST.mode='replay';ST.cur=EV[n-1].s;ST.sel={t:'n',id:['phish','asn','','grant','s1','s2'][n-1]||'grant'};if(n===3)ST.sel={t:'n',id:'user'};renderAll(true);return}
 if(d.layer){ST.layers[d.layer]=ST.layers[d.layer]?0:1;t.setAttribute('aria-pressed',!!ST.layers[d.layer]);refreshGraphs();return}
 if(d.mode){ST.mode=d.mode;if(d.mode==='replay'){ST.cur=Math.min(curT(),liveT())}else{ST.playing=false}renderAll();return}
 if(d.go){if(d.go==='drawer'){openDrawer(approvalHTML());bindDrawer();return}
  if(['approval','simulating','correlating','plan','rollback','forecast'].includes(d.go)){if(d.go==='rollback'){ST.view='overview';setState('rollback');openDrawer(approvalHTML());bindDrawer();return}if(d.go==='approval'){setState('approval');ST.view='safecut';renderAll();return}setState(d.go);return}
  ST.view=d.go;renderAll();return}
 if(d.log){addLog(OPS.n,d.log,'obs');toast('Logged to the response audit: '+d.log);return}
 if(d.tl){const w=d.tl;if(w==='play'){if(ST.mode==='live'||curT()>=maxT()){ST.mode='replay';ST.cur=T0}ST.playing=!ST.playing;renderAll(true);return}
  if(w.startsWith('sp')){ST.speed=+w.slice(2);renderTL();return}
  const t0=curT(),ev=EV.filter(x=>x.s<=liveT());let nx;if(w==='next'){nx=ev.find(x=>x.s>t0+1);if(!nx){ST.mode='live';renderAll();return}}else{nx=[...ev].reverse().find(x=>x.s<t0-1)||ev[0]}
  ST.mode='replay';ST.cur=nx.s;renderAll(true);return}
 if(d.act){const a=d.act;
  if(a==='drawer'){openDrawer(approvalHTML());bindDrawer()}
  else if(a==='close')closeDrawer();
  else if(a==='spec'){$('#spec').innerHTML=specHTML();$('#spec').classList.add('on')}
  else if(a==='closespec')$('#spec').classList.remove('on');
  else if(a==='a1'){ST.a1=true;addLog(OPS.n,'Approved A1, A2, A3 as responder');openDrawer(approvalHTML());bindDrawer();renderRib()}
  else if(a==='a2'){ST.a2=true;addLog('S. Iyer','Co-approved A3 (demo)');openDrawer(approvalHTML());bindDrawer();renderRib()}
  else if(a==='statemenu'){if($('#smenu')){$('#smenu').remove();return}const m=document.createElement('div');m.id='smenu';m.setAttribute('role','menu');m.style.cssText='position:fixed;top:60px;right:20px;z-index:50;background:var(--surface);border:1px solid var(--border);border-radius:4px;width:260px;padding:6px 0';m.innerHTML=STATES.map(s=>`<button role="menuitem" class="navi" data-st="${s.k}" ${ST.state===s.k?'aria-current="page"':''} style="min-height:34px;font-size:13px">${s.n}</button>`).join('');document.body.appendChild(m);m.addEventListener('click',ev=>{const b=ev.target.closest('[data-st]');if(b){ev.stopPropagation();m.remove();setState(b.dataset.st)}})}
  return}
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if($('#spec').classList.contains('on'))$('#spec').classList.remove('on');else closeDrawer();const m=$('#smenu');if(m)m.remove()}
 const g=e.target.closest&&e.target.closest('.gn');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();g.dispatchEvent(new MouseEvent('click',{bubbles:true}))}
});
document.addEventListener('input',e=>{
 if(e.target.id==='scrub'){const tot=TE+HOR-T0;let t=T0+e.target.value/1000*tot;t=clamp(t,T0,maxT());ST.cur=t;ST.mode=t>=liveT()&&Math.abs(t-liveT())<3?'live':'replay';
  const rd=$('#tl .rd');renderRib();refreshGraphs();const bar=$('.wsbar');if(bar)bar.outerHTML=renderBanner();rd&&(rd.firstChild.textContent=fmt(curT())+'Z ');renderRail()}
 if(e.target.id==='ack'){ST.ack=e.target.checked;openDrawer(approvalHTML());bindDrawer();const c=$('#ack');c&&c.focus()}
});
function bindDrawer(){
 $$('[data-hold]').forEach(b=>{let raf,st,run=false;const f=b.querySelector('i');
  const stop=()=>{run=false;cancelAnimationFrame(raf);f.style.width='0'};
  const tick=()=>{if(!run)return;const p=Math.min(1,(performance.now()-st)/1200);f.style.width=p*100+'%';if(p>=1){stop();done(b.dataset.hold)}else raf=requestAnimationFrame(tick)};
  const start=()=>{if(b.disabled||run)return;run=true;st=performance.now();raf=requestAnimationFrame(tick)};
  b.addEventListener('pointerdown',start);['pointerup','pointerleave','pointercancel'].forEach(x=>b.addEventListener(x,stop));
  b.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start()}});b.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')stop()});b.addEventListener('blur',stop)});
}
function done(id){closeDrawer();
 if(id==='ex'){addLog(OPS.n,'Executed 3 actions (hold confirmed)');setState('executing')}
 if(id==='rb'){addLog(OPS.n,'Rolled back A1, A2, A3');ST.applied=0;setState('plan');toast('Rolled back. The incident is back to Plan available.')}}
setInterval(()=>{const el=$('#since');if(el&&ST.mode==='live')el.textContent=dur(ST.base+Math.round((Date.now()-ST.t0)/1000));
 if(ST.playing){const tot=TE+HOR-T0;ST.cur+=ST.speed*60*0.1;if(ST.cur>=maxT()){ST.cur=maxT();ST.playing=false;renderAll(true);return}
  const sc=$('#scrub');if(sc)sc.value=Math.round((ST.cur-T0)/tot*1000);const rd=$('#tl .rd');if(rd)rd.firstChild.textContent=fmt(curT())+'Z ';refreshGraphs();renderRib();const k=$('.k',$('#tl'));if(k&&k.parentNode.classList.contains('tlh'))k.textContent='Scrub to watch ThreadGraph change · '+stepNow()+' of 6 events shown'}},100);
setState('approval');
