Object.assign(ST,{xmode:'both',pf:'all',q:'',et:0,eplay:false,pmode:'tech',sim:'SIM-2417-0A'});
function wf(cur){const s=S();
 const it=[['graph','ThreadGraph','Understand',pathsOpen()+' paths '+(ST.applied>=3?'blocked':'open')],['echolab','EchoLab','Compare',s.sim===2?'3 futures':s.sim===1?'running':'not run'],['safecut','SafeCut','Select',s.plan===1||s.plan===2?'3 actions':s.plan===3?'no plan':'not run'],['proofseal','ProofSeal','Prove',s.plan===1?'6 claims':'—'],['approval','Approval','Decide',approvalText()]];
 return `<nav class="wf" aria-label="Decision workflow">${it.map((x,i)=>`<button data-wf="${x[0]}" ${cur===x[0]?'aria-current="step"':''}><span class="k">${i+1} · ${x[2]}</span><b>${x[1]}</b><small>${x[3]}</small></button>`).join('')}</nav>`}
function xOpts(extra){const s=S();
 const o={step:gOpts().step,mode:ST.xmode,pf:ST.pf,path:ST.path,sel:ST.sel.t==='n'?'n:'+ST.sel.id:ST.sel.t==='e'?'e:'+ST.sel.id:null,q:ST.q,applied:ST.applied,proposed:s.plan>=1&&s.plan<=2,conflict:s.k==='conflict',fcOn:fcOn()&&!!ST.layers.fc};
 return Object.assign(o,extra||{})}
const xlegend=`<div class="chips" style="gap:16px;font-size:11.5px;color:var(--text2);font-family:var(--fm);letter-spacing:.05em;text-transform:uppercase">
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#D4572F" stroke-width="3"/><rect x="11" y="2" width="8" height="8" fill="#F1F0EA"/></svg> Observed</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#9AA3A8" stroke-width="2" stroke-dasharray="6 4"/></svg> Inferred</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#D4572F" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/></svg> Forecast</span>
<span><svg width="30" height="14"><path d="M1 7H12" stroke="#D4572F"stroke-width="3"/><circle cx="15" cy="7" r="5.5" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2.2"/><circle cx="15" cy="7" r="2" fill="#3E9C86"/><path d="M20 7H29" stroke="#D4572F" stroke-opacity=".3" stroke-width="3"/></svg> Blocked</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#3E9C86" stroke-width="6"/></svg> Preserved</span>
<span><svg width="30" height="12"><path d="M1 6H29" stroke="#3E9C86" stroke-width="2"/></svg> Dependency</span></div>`;
function pathStatus(p){const cut=ST.applied>=+p.a[1];return cut?tag('ok','Blocked · '+p.a):tag(p.e.some(id=>XE.find(e=>e.id===id).k==='fc')&&!p.e.every(id=>XE.find(e=>e.id===id).k==='obs')&&p.e[0].indexOf('x_u_s3')===0?'fc':'obs','Open')}
function pathExplain(){
 const pid=ST.path==='all'?null:ST.path,p=pid&&XP.find(x=>x.id===pid);
 if(!p)return `<div class="callout"><h4>Path explanation</h4><p class="muted">Select a path (P1–P6) above or click a row in the table to see why it matters, which parts are observed and which are forecast, and what stops it.</p></div>`;
 const act=ACTS.find(a=>a.id===p.a),cut=ST.applied>=+p.a[1];
 return `<div class="callout"><h4>${p.id} · ${p.crit?'Critical path':'Path'}</h4><p class="muted" style="margin-bottom:6px">${p.why}</p>
 ${p.steps.map((s,i)=>`<div class="step"><span class="nn">${i+1}</span><div>${tag(s[0],XPK[s[0]])} ${s[1]}</div></div>`).join('')}
 <div class="step"><span class="nn">→</span><div><b>Stopped by ${p.a}</b>: ${act.t}. ${cut?tag('ok','Blocked'):tag('n','Not yet executed')}<div class="muted" style="font-size:12.5px;margin-top:2px">${act.imp} · ${act.rb}</div></div></div>
 <p class="muted" style="font-size:12px;margin-top:6px">${p.crit?'Critical: already observed, or reaches the database in at least 40% of simulated rollouts.':'Not critical: below the 40% likelihood line and not yet observed beyond the grant.'}</p></div>`}
function searchResults(){const q=ST.q.trim().toLowerCase();if(!q)return '<p class="muted" style="font-size:12.5px">Type to find users, devices, sessions, tokens, apps, APIs, services, databases or processes.</p>';
 const r=Object.keys(XN).filter(k=>(XN[k].l+' '+XN[k].t).toLowerCase().indexOf(q)>-1);
 return r.length?r.map(k=>`<div style="padding:5px 0;border-top:1px solid var(--line)"><button class="lk" data-ent="n:${k}">${XN[k].l}</button> <span class="muted" style="font-size:12px">${XN[k].t}</span></div>`).join(''):'<p class="muted">No entity matches “'+ST.q+'”.</p>'}
function vGraph(){
 const m=ST.xmode,pf=ST.pf;
 const seg=(arr,key,val)=>`<div class="seg" role="group">${arr.map(a=>`<button data-${key}="${a[0]}" aria-pressed="${val===a[0]}">${a[1]}</button>`).join('')}</div>`;
 return `${ph('ThreadGraph','The technical compromise and the business it runs through, in one graph. Scrub the timeline to replay it.')}${wf('graph')}
 <div class="cvtool" style="justify-content:space-between"><div class="xmode"><span class="k">Layer</span>${seg([['tech','Technical'],['biz','Business'],['both','Combined']],'xmode',m)}<span class="k">Paths</span>${seg([['all','All'],['obs','Observed'],['fc','Forecast'],['crit','Critical']],'pf',pf)}</div>
 <div class="srch"><label class="k" for="xq">Find entity</label><input id="xq" type="search" value="${ST.q}" placeholder="e.g. token, payroll" autocomplete="off"></div></div>
 <div class="canvas" data-xgraph style="min-height:300px">${xSVG(xOpts())}</div>
 <div style="margin-top:10px">${xlegend}</div>
 <div class="xsplit"><div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><span class="k">Explain path</span><div class="chips">${['all',...XP.map(p=>p.id)].map(p=>`<button class="chip" data-xpath="${p}" aria-pressed="${ST.path===p}">${p==='all'?'None':p}</button>`).join('')}</div></div>
 <table class="tbl"><thead><tr><th>Path</th><th>Route</th><th>Basis</th><th>Status</th></tr></thead><tbody>${XP.map(p=>`<tr class="row" data-xpath="${p.id}"><td class="n">${p.id}${p.crit?' ★':''}</td><td>${p.steps.map(s=>s[1].replace(/ \(EV-0\d\)/,'')).slice(0,2).join(' → ')} … database</td><td>${p.e.every(id=>XE.find(e=>e.id===id).k==='obs')?tag('obs','Observed'):p.e.some(id=>XE.find(e=>e.id===id).k==='obs')?tag('obs','Observed')+' '+tag('fc','Forecast'):tag('fc','Forecast')}</td><td>${ST.applied>=+p.a[1]?tag('ok','Blocked · '+p.a):tag('obs','Open')}</td></tr>`).join('')}</tbody></table>
 <p class="muted" style="font-size:12px;margin-top:6px">★ critical path. Click a node or link, then read the rail for its evidence.</p></div>
 <div><div id="pexp">${pathExplain()}</div><div style="margin-top:14px" id="sres">${searchResults()}</div></div></div>`}
function refreshX(){$$('[data-xgraph]').forEach(el=>{el.innerHTML=xSVG(xOpts())});const p=$('#pexp');if(p)p.innerHTML=pathExplain()}
// override the shared graph refresh so the new view and the old minis both stay live
const _rg=refreshGraphs;refreshGraphs=function(){_rg();refreshX();refreshEcho&&refreshEcho()};
