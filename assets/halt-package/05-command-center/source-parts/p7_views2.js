const CLAIMS=[
 ['Six of six dangerous paths blocked','Reachability recomputed on the post-action snapshot.','0 of 6 open','0 of 6 reachable'],
 ['Finance remains operational','Each of five finance processes keeps every dependency.','5 of 5 running','5 of 5 running'],
 ['Three users affected','M. Verma signs in again; two approvers see one prompt.','3 users','3 users'],
 ['Response is reversible','Each rollback plan dry-run against a snapshot copy.','3 of 3 plans','Armed until 10:36Z'],
 ['Evidence is preserved','Six events, graph snapshot and solver certificate sealed.','6 events sealed','Hash match'],
 ['Authorization policy satisfied','IR-OAUTH-02, IR-SESS-01, IR-CA-05 name a human approver.','3 of 3 policies','Approvals recorded']];
function sigSVG(st){const ring=st==='ok'?'#F1F0EA':st==='bad'?'#D4572F':'#59656B';return `<svg class="sig" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9" fill="none" stroke="${ring}" stroke-width="2.5" ${st==='pend'?'stroke-dasharray="3 3"':''}/>${st==='ok'?'<circle cx="11" cy="11" r="3.2" fill="#3E9C86"/>':st==='bad'?'<path d="M7.5 7.5l7 7M14.5 7.5l-7 7" stroke="#D4572F" stroke-width="2"/>':''}</svg>`}
function vProofOld(){
 const s=S(),post=ST.applied>=3;
 if(s.plan===0)return ph('ProofSeal','Verifies a response against the evidence before anyone is asked to approve it.')+empty('Nothing to verify','ProofSeal checks a plan. There is no plan yet.');
 if(s.plan===3)return ph('ProofSeal','No plan, so there is nothing to seal.')+empty('Claims blocked','ProofSeal does not issue a seal for a response that fails a hard constraint. Evidence is sealed (IR-DATA-07); response claims are not applicable.');
 const conflict=s.plan===2;
 return `${ph('ProofSeal','A recommendation is a claim. Each claim below can be opened and checked.',tag('sim','Predicted results are simulated'))}
 <div class="callout" style="margin-bottom:8px;border-style:dotted"><span class="muted">Hashes and the signing key are placeholders. ${post?'The right-hand column is <b style="color:var(--text)">observed after execution</b>.':'Nothing has been executed, so there is no observed result yet.'}</span></div>
 <div style="display:grid;grid-template-columns:28px 1fr 200px 200px;gap:14px" class="k"><span></span><span>Claim</span><span style="text-align:right">Predicted · simulated</span><span style="text-align:right">After execution · observed</span></div>
 ${CLAIMS.map((c,i)=>{const bad=conflict&&i===5;return `<div class="claim" style="grid-template-columns:28px minmax(0,1fr) 200px 200px">${sigSVG(bad?'bad':'ok')}<div><h4>${c[0]}</h4><p class="muted" style="font-size:13px;max-width:56ch">${c[1]}</p><details><summary>Evidence</summary><div class="dd">Check: ${c[1]} Snapshot sha256 9f3a…c41e. Seal PS-2417-01. Evidence IDs EV-01 – EV-06.</div></details></div>
 <div class="res"><span>${bad?'Not satisfied':c[2]}</span>${bad?tag('fc','Failed · IR-CA-05'):tag('sim','Simulated')}</div>
 <div class="res">${post?`<span>${c[3]}</span>${tag('obs','Observed')}`:'<span class="muted">Not run</span>'}</div></div>`}).join('')}
 <div class="mono muted" style="font-size:11px;margin-top:14px">Seal PS-2417-01 · Valid until 10:36Z or new telemetry · Signer: demo key, not production</div>
 <section class="sec" style="margin-top:16px"><header><h3>What this proof does not claim</h3></header><ul class="muted" style="margin:0;padding-left:18px"><li>That the attacker has no foothold outside the six observed events.</li><li>That forecast paths P2, P3 and P6 would have happened. They are blocked as a precaution.</li></ul></section>`}
function vTime(){
 const rows=[];EV.forEach((e,i)=>{rows.push(`<tr class="row" data-ev="${e.n}"><td class="n">${e.t}Z</td><td>${tag('obs','Observed')}</td><td><b>EV-0${e.n} · ${e.title}</b><div class="muted">${e.d}</div></td><td>${e.src}</td><td class="mono" style="font-size:11.5px">${e.att.split(' · ')[0]}</td><td class="n">${pct(e.conf)}</td></tr>`);
  if(i===0)rows.push(`<tr><td></td><td>${tag('inf','Inferred')}</td><td><b>I-01</b><div class="muted">Sender and sign-in ASN share hosting.</div></td><td>HALT correlation</td><td></td><td class="n">74%</td></tr>`);
  if(i===3)rows.push(`<tr><td></td><td>${tag('inf','Inferred')}</td><td><b>I-02</b><div class="muted">Replayed tokens were probably minted by the grant.</div></td><td>HALT correlation</td><td></td><td class="n">78%</td></tr>`)});
 return `${ph('Timeline','The observed sequence, the links HALT infers between events, and everything done in response.')}
 <table class="tbl"><thead><tr><th>Time</th><th>Basis</th><th>Event</th><th>Source</th><th>ATT&amp;CK</th><th>Confidence</th></tr></thead><tbody>${rows.join('')}</tbody></table>
 <section class="sec" style="margin-top:20px"><header><h3>Response audit</h3></header><table class="tbl"><tbody>${ST.log.map(l=>`<tr><td class="n">${l.t}Z</td><td>${l.k==='sim'?tag('sim','Simulated'):tag('n','Record')}</td><td><b>${l.w}</b></td><td>${l.m}</td></tr>`).join('')}</tbody></table></section>`}
function polStatus(p){const s=S();const cf=s.k==='conflict';
 if(p[0]==='IR-BRK-01')return['Not used','n'];
 if(p[0]==='IR-DATA-07')return s.plan?['Satisfied · sealed','ok']:['Pending','n'];
 if(!s.plan||s.plan===3)return['Not applicable','n'];
 if(cf&&(p[0]==='IR-CA-05'||p[0]==='IR-CHG-03'))return['Conflict','fc'];
 const need=p[0]==='IR-CA-05'||p[0]==='IR-CHG-03'?ST.a2:ST.a1;
 return ST.applied>=3||need?['Satisfied','ok']:['Awaiting approval','n']}
function vPol(){
 const cf=S().k==='conflict';
 return `${ph('Policies','The rules that decide who may do what. A plan that fails any of them cannot run.')}
 <table class="tbl"><thead><tr><th>Policy</th><th>Rule</th><th>Approver</th><th>Governs</th><th>Status</th></tr></thead><tbody>${POLS.map(p=>{const st=polStatus(p);return `<tr><td class="n">${p[0]}</td><td><b>${p[1]}</b><details><summary>Rule text</summary><div class="dd">${p[4]}</div></details></td><td>${p[2]}</td><td class="n">${p[3]}</td><td>${tag(st[1],st[0])}</td></tr>`}).join('')}</tbody></table>
 ${cf?`<section class="sec" style="margin-top:18px"><div class="callout cf"><h4>Conflict: A3 cannot be authorised</h4><p>IR-CA-05 needs a co-approval from the Finance Ops owner. S. Iyer is out of office until 28 Oct and no delegate is named. IR-CHG-03 also forbids access-policy changes for finance users during close without that owner’s exception.</p><ul><li>Name a delegate (needs the CISO). About ten minutes.</li><li>Run A1 and A2 only: blocks 4 of 6 paths and leaves P3 and P6 open as forecast (simulated 38% of rollouts reach the database through them).</li></ul><div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn sm" data-log="Asked the CISO to name a Finance Ops delegate">Ask CISO to name a delegate</button><button class="btn sm q" data-log="Opened a reduced-plan review (A1 + A2) for the analyst">Review reduced plan</button></div></div></section>`:''}`}
function renderWS(){
 const ws=$('#ws'),top=ws.scrollTop;
 const v={overview:vOverview,graph:vGraph,echolab:vEcho,safecut:vSafe,proofseal:vProof,timeline:vTime,policies:vPol}[ST.view]();
 ws.innerHTML=renderBanner()+`<div class="pg">${v}</div>`;ws.scrollTop=top;
}
