function actStatus(id){const s=S();if(!id)return'';if(s.plan===0)return'Not yet proposed';if(s.plan===3)return'No feasible plan';
 const i=+id[1];if(s.k==='conflict'&&id==='A3')return'Blocked by policy IR-CA-05';
 if(ST.applied>=i)return s.k==='rollback'?'Executed · rollback armed':'Executed · reversible';
 if(s.k==='executing')return'Queued';return'Proposed · awaiting approval'}
function entInfo(){
 const sel=ST.sel;
 if(sel.t==='sc'){const c=SC[sel.id];return{score:c}}
 if(sel.t==='e'){const e=allEdges().find(x=>x.id===sel.id),a=nodeLabel(e.a),b=nodeLabel(e.b);
  const base={t:a+' → '+b,ty:e.k==='obs'?'Observed link':e.k==='inf'?'Inferred link':e.k==='rel'?'Relationship':'Forecast link',c:e.k==='rel'?'biz':e.k,src:e.k==='obs'?'Event '+e.ev:e.k==='inf'?'HALT correlation':'EchoLab forecast · seed 2417',ts:e.k==='fc'?'Within 10 min':e.st?fmt(EV[Math.min(e.st,6)-1].s)+'Z':'',att:e.k==='fc'?'Predicted from '+(e.a==='grant'?'T1528':'T1550.004'):'',biz:'',act:e.cut||null,ev:e.ev?[+e.ev.slice(3)]:[]};
  if(e.k==='inf'){base.cf=e.lk;base.why=[[e.why,'Moderate'],['Not directly logged','Limits']];base.lo='A log line showing the minting would turn this into an observed link.';base.biz='Not an observed fact: HALT does not act on this link alone.'}
  if(e.k==='fc'){base.lk=e.lk;base.lkn=Math.round(e.lk*6000).toLocaleString()+' of 6,000 simulated rollouts use this link within 10 min';base.biz='If used, it brings the attacker closer to '+nodeLabel(e.b)+'.'}
  if(e.k==='obs'){base.cf=EV[(e.st||1)-1].conf;base.why=[['Recorded in '+EV[(e.st||1)-1].src,'Strong']];base.lo='Observed facts do not have a model score; this is source reliability.';base.biz='Evidence for the path; see affected services.'}
  return{ent:base,edge:e}}
 return{ent:ENT[sel.id]}}
function scoreBlock(en){
 if(en.lk!=null)return `<div class="cb"><span class="t"><span class="f" style="width:${en.lk*100}%;display:block;background:repeating-linear-gradient(135deg,#F1F0EA 0 3px,#59656B 3px 6px)"></span></span><b class="mono">${pct(en.lk)}</b></div><p class="muted" style="font-size:12px;margin-top:4px">${en.lkn}. A simulated likelihood, not a measured probability.</p>`;
 if(en.cf==null)return '<span class="muted">No score. This is a static dependency.</span>';
 return `<div class="cb"><span class="t"><span class="f" style="width:${en.cf*100}%;display:block"></span></span><b class="mono">${pct(en.cf)}</b></div>
 <details style="border-top:0"><summary>Why this score</summary><div class="dd">${(en.why||[]).map(w=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:1px solid var(--line)"><span style="color:var(--text)">${w[0]}</span><span class="mono" style="font-size:11px;white-space:nowrap">${w[1]}</span></div>`).join('')}<p style="margin-top:8px">${en.lo||''}</p></div></details>`}
function renderRail(){
 const r=$('#rail'),i=entInfo();
 if(i.score){const c=i.score;r.innerHTML=`<div class="rl"><div style="display:flex;gap:8px">${c.sim?tag('sim','Simulated'):tag('n','Score')}</div><h3>${c.t}</h3>
 <p class="muted" style="margin-bottom:10px">Every score shows what it is built from. Strength is a judgement of the evidence, not a number added up.</p>
 ${c.parts.map(p=>`<div style="padding:10px 0;border-top:1px solid var(--line)"><div style="font-size:13px">${p[0]}</div><div style="display:flex;justify-content:space-between;margin-top:3px"><span class="mono muted" style="font-size:11px">${p[1]}</span><span class="mono" style="font-size:11px">${p[2]}</span></div></div>`).join('')}
 <p class="muted" style="margin-top:12px;font-size:13px"><b style="color:var(--text)">What would change it.</b> ${c.lo}</p><button class="btn sm q" style="margin-top:14px" data-sel="n:grant">Back to entity</button></div>`;return}
 const en=i.ent,k=en.c==='obs'?tag('obs','Observed'):en.c==='inf'?tag('inf','Inferred'):en.c==='fc'?tag('fc','Forecast'):tag('ok','Business');
 const evs=(en.ev||[]).map(n=>EV[n-1]);
 r.innerHTML=`<div class="rl"><span class="k">Selected entity</span><div style="display:flex;gap:6px;margin-top:6px">${k}${en.c==='fc'?tag('sim','Simulated'):''}</div>
 <h3>${en.t}</h3><p class="muted" style="font-size:12.5px">${en.ty}</p>
 <dl class="kv" style="margin-top:12px">
 <dt>Supporting events</dt><dd>${evs.length?evs.map(e=>`<div><button class="lk" data-ev="${e.n}">EV-0${e.n}</button> <span class="muted">${e.title}</span></div>`).join(''):'<span class="muted">None. '+(en.c==='fc'?'It has not happened.':'Static record.')+'</span>'}</dd>
 <dt>Evidence source</dt><dd>${en.src}</dd>
 <dt>Timestamp</dt><dd class="mono" style="font-size:12px">${en.ts}</dd>
 <dt>${en.lk!=null?'Likelihood':'Confidence'}</dt><dd>${scoreBlock(en)}</dd>
 <dt>ATT&amp;CK</dt><dd class="mono" style="font-size:12px">${en.att||'—'}</dd>
 <dt>Business consequence</dt><dd>${en.biz||'—'}</dd>
 <dt>Related action</dt><dd>${en.act?`<button class="lk" data-view="safecut">${en.act} · ${ACTS.find(a=>a.id===en.act).t}</button><div class="muted" style="font-size:12px">${actStatus(en.act)}</div>`:'<span class="muted">None in the minimum-safe plan</span>'}</dd></dl>
 <button class="btn sm q" style="margin-top:14px" data-score="${en.c==='fc'?'fc':'inc'}">Incident confidence evidence</button></div>`;
}
function renderTL(){
 const s=S(),end=T0+(TE-T0)+HOR,tot=end-T0,P=t=>((t-T0)/tot*100);
 const mx=effMax(),lt=liveT(),ct=curT();
 const live=ST.mode==='live';
 $('#tl').innerHTML=`<div class="tlh"><button class="btn sm q" data-tl="prev" aria-label="Previous event">◀ Event</button><button class="btn sm" data-tl="play" aria-pressed="${ST.playing}">${ST.playing?'Pause':'Play'}</button><button class="btn sm q" data-tl="next" aria-label="Next event">Event ▶</button>
 <div class="seg" role="group" aria-label="Replay speed">${[1,2,4].map(x=>`<button data-tl="sp${x}" aria-pressed="${ST.speed===x}">${x}×</button>`).join('')}</div>
 <span class="rd">${fmt(ct)}Z ${ct>=TE&&s.fc?tag('fc','Forecast'):''} ${live?tag('n','Live'):tag('inf','Replay')}</span><span class="k">Scrub to watch ThreadGraph change · ${stepNow()} of 6 events shown</span></div>
 <div class="trk"><div class="ln" style="width:${P(TE)}%"></div>
 ${s.fc?`<div class="fz" style="left:${P(TE)}%;right:0"><span>Forecast · +10 min · not observed</span></div>`:''}
 ${EV.map((e,i)=>`<div class="ev ${i<mx?'':'off'}" style="left:${P(e.s)}%"></div><div class="el" style="left:${P(e.s)}%;top:${[34,46,58][i%3]}px">EV-0${e.n} ${e.t.slice(3)}</div>`).join('')}
 <div class="now" style="left:${P(lt)}%"></div><div class="nl" style="left:${P(lt)}%">NOW</div>
 <input type="range" id="scrub" min="0" max="1000" step="1" value="${Math.round((ct-T0)/tot*1000)}" aria-label="Incident time" aria-valuetext="${fmt(ct)} UTC" ${''}></div>`;
}
function openDrawer(html){$('#drawer').innerHTML=html;$('#drawer').classList.add('on');$('#scrim').classList.add('on');const f=$('#drawer button');if(f)f.focus()}
function closeDrawer(){$('#drawer').classList.remove('on');$('#scrim').classList.remove('on')}
function holdHTML(id,label,dis){return `<button class="hold" data-hold="${id}" ${dis?'disabled':''} aria-describedby="${id}h"><i></i><span>${label}</span></button><p class="muted" id="${id}h" style="font-size:12px;margin-top:6px">Press and hold for 1.2 seconds. Keyboard: hold Space or Enter.</p>`}
function approvalHTML(){
 const s=S(),ready=ST.a1&&ST.a2&&ST.ack;
 return `<div class="dh"><div><span class="k">Action Gate · HLT-2047</span><h2>${s.k==='contained'||s.k==='rollback'?'Rollback plan':'Review and approve'}</h2></div><button class="btn sm q" data-act="close" aria-label="Close">Close</button></div>
 <div class="db">
 <div class="sec"><header><h3>Operator</h3></header><div class="ap" style="margin:0"><b>${OPS.n}</b> · ${OPS.r}<div class="muted" style="font-size:12.5px;margin-top:4px">Permissions: ${OPS.perm.join('; ')}.</div><div class="muted" style="font-size:12.5px;margin-top:4px">${OPS.no}</div></div></div>
 <div class="sec"><header><h3>Actions</h3>${tag('sim','Impact simulated')}</header>
 ${ACTS.map(a=>`<div class="act" style="grid-template-columns:34px 1fr"><span class="id">${a.id}</span><div><h4>${a.t}</h4><div class="tri"><div><span>Impact</span>${a.imp}</div><div><span>Reversibility</span>${a.rb}</div><div><span>Authorisation</span>${a.pol} · ${a.who}</div></div>
 <details><summary>Scope and blocked paths</summary><div class="dd">Permission used: ${a.scope}. Blocks ${a.blocks}. Status: ${actStatus(a.id)}.</div></details></div></div>`).join('')}</div>
 <div class="sec"><header><h3>Rollback plan</h3>${tag('sim','Dry run · simulated')}</header><p class="muted">Restore all three in about two minutes: re-grant the app consent, let sessions re-issue, remove the step-up rule. Each step was dry-run against a copy of the graph snapshot. Window open until 10:36Z or until new telemetry arrives.</p></div>
 ${s.k==='contained'||s.k==='rollback'?`<div class="sec"><header><h3>Roll back</h3></header><p class="muted" style="margin-bottom:10px">Rolling back re-opens all six paths. The incident returns to “Plan available”.</p>${holdHTML('rb','Hold to roll back all 3 actions',false)}</div>`:`
 <div class="sec"><header><h3>Approvals</h3></header>
 <div class="ap ${ST.a1?'ok':''}"><div class="r"><div><b>${OPS.n} · ${OPS.r}</b><div class="muted" style="font-size:12.5px">Approves A1, A2 and A3 as responder</div></div><button class="btn sm" data-act="a1" ${ST.a1?'disabled':''}>${ST.a1?'Approved '+'10:07Z':'Approve'}</button></div></div>
 <div class="ap ${ST.a2?'ok':''}"><div class="r"><div><b>S. Iyer · Finance Ops owner</b><div class="muted" style="font-size:12.5px">Co-approves A3 (IR-CA-05, close freeze exception)</div></div>${ST.a2?tag('ok','Approved 10:08Z'):tag('n','Requested 10:07Z')}</div>
 ${ST.a2?'':`<button class="btn sm q" style="margin-top:8px" data-act="a2">Demo: simulate S. Iyer approving</button>`}</div></div>
 <div class="sec"><label style="display:flex;gap:10px;align-items:flex-start;font-size:13px"><input type="checkbox" id="ack" ${ST.ack?'checked':''} ${ST.a1&&ST.a2?'':'disabled'} style="margin-top:3px"> I have reviewed the impact on 3 users and the rollback plan above.</label>
 <div style="margin-top:12px">${holdHTML('ex','Hold to execute 3 actions',!ready)}</div></div>`}
 </div>`}
