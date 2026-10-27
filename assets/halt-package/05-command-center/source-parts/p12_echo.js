const SERV=[['fapi','Finance API'],['payroll','Payroll'],['pay','Payment proc.'],['recon','Reconciliation'],['supp','Support']];
const REACH={fapi:1.0,pay:3.4,payroll:3.0,recon:2.5,db:4.8};
const FUT=[
 {k:'A',n:'Aggressive isolation',tag:'High containment · high downtime · high user impact',off:1},
 {k:'B',n:'Passive monitoring',tag:'Low disruption · dangerous residual paths'},
 {k:'C',n:'HALT minimum-safe response',tag:'6 of 6 blocked · 3 users · finance preserved · reversible',win:1}];
function availStrip(F,tau){
 // 0..10 min, rows per service, up = Verdigris, down = hatched, threat reach = Ember square (forecast)
 const W=300,H=124,x=t=>50+t/10*(W-58);let o='';
 SERV.forEach((s,i)=>{const y=14+i*20;
  o+=`<text x="0" y="${y+8}" class="gl d" style="font-size:9.5px;stroke-width:2px">${s[1].replace('Payment proc.','Payments').replace('Reconciliation','Recon.').slice(0,9)}</text>`;
  const downAt=F==='A'?(s[0]==='supp'?0.9:0.5):null;
  if(downAt==null)o+=`<rect x="${x(0)}" y="${y}" width="${x(10)-x(0)}" height="10" fill="#3E9C86"/>`;
  else o+=`<rect x="${x(0)}" y="${y}" width="${x(downAt)-x(0)}" height="10" fill="#3E9C86"/><rect x="${x(downAt)}" y="${y}" width="${x(10)-x(downAt)}" height="10" fill="none" stroke="#707D84" stroke-dasharray="3 3"/><path d="M${x(downAt)+2} ${y+5}H${x(10)-4}" stroke="#707D84" stroke-dasharray="1 4"/>`;
  if(F==='B'&&REACH[s[0]]!=null){o+=`<rect x="${x(REACH[s[0]])-4}" y="${y-2}" width="8" height="14" fill="${tau>=REACH[s[0]]?'#D4572F':'none'}" stroke="#D4572F" stroke-dasharray="${tau>=REACH[s[0]]?'':'2 2'}"/>`}
 });
 if(F==='B')o+=`<text x="${x(4.8)}" y="${H-4}" class="gl e" style="font-size:9.5px;stroke-width:2px" text-anchor="middle">DB reached</text>`;
 if(F==='A')o+=`<text x="${x(10)}" y="${H-4}" class="gl d" style="font-size:9.5px;stroke-width:2px" text-anchor="end">offline ≈ 4 h 20 →</text>`;
 o+=`<path d="M${x(tau)} 6V${H-14}" stroke="#F1F0EA" stroke-width="1.5"/>`;
 for(let m=0;m<=10;m+=2)o+=`<text x="${x(m)}" y="${H-14+8}" class="gl d" style="font-size:8.5px;stroke-width:0" text-anchor="middle" fill="#9AA3A8">${m}m</text>`;
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Business availability, Future ${F}">${o}</svg>`}
function echoMetrics(F){return {A:['6 of 6 blocked','412 users','≈ 4 h 20 min','Partial · manual, ≈ 3 h','No known access left; 3 processes lost'],B:['0 of 6 blocked','0 today','0 min today','Not applicable','4 paths open; 82% reach the database'],C:['6 of 6 blocked','3 users','0 min','Full · 3 plans, ≈ 2 min','0 of 6 reachable; outside foothold not ruled out']}[F]}
function echoPanels(){const tau=ST.et;
 return FUT.map(f=>`<div class="fut ${f.win?'win':''}"><span class="k">Future ${f.k}</span><h4>${f.n}</h4><p class="muted" style="font-size:12px;min-height:34px">${f.tag}</p>
 <div class="canvas" data-echo="${f.k}">${xSVG({mini:true,mode:'tech',step:6,fcAll:1,spread:{F:f.k,tau},off:f.off&&tau>=.5})}</div>
 <div class="strip" data-estrip="${f.k}">${availStrip(f.k,tau)}</div></div>`).join('')}
function refreshEcho(){if(ST.view!=='echolab')return;$$('[data-echo]').forEach(el=>{const F=el.dataset.echo;el.innerHTML=xSVG({mini:true,mode:'tech',step:6,fcAll:1,spread:{F,tau:ST.et},off:F==='A'&&ST.et>=.5})});
 $$('[data-estrip]').forEach(el=>{el.innerHTML=availStrip(el.dataset.estrip,ST.et)});
 const r=$('#escrub');if(r&&document.activeElement!==r)r.value=ST.et;const t=$('#etxt');if(t)t.textContent=etxt();const pb=$('[data-eplay]');if(pb){pb.textContent=ST.eplay?'Pause':'Play'}}
const etxt=()=>'T+'+String(Math.floor(ST.et)).padStart(2,'0')+':'+String(Math.round((ST.et%1)*60)).padStart(2,'0')+' into the horizon';
function vEcho(){
 const s=S();if(s.sim<2)return vEchoOld();
 const M=['Threat containment','Affected users','Service downtime','Reversibility','Residual risk'];
 return `${ph('EchoLab','Three futures from the same incident, run side by side before anything is touched. Everything here is simulated and hatched.',tag('sim','Simulated · 6,000 rollouts per future · seed 2417'))}${wf('echolab')}
 <div class="ech"><button class="btn sm" data-eplay>${ST.eplay?'Pause':'Play'}</button><input id="escrub" type="range" min="0" max="10" step="0.05" value="${ST.et}" aria-label="Simulation time in minutes"><span class="mono" id="etxt" style="font-size:12px;min-width:200px">${etxt()}</span><button class="btn sm q" data-udr>Assumptions &amp; uncertainty</button></div>
 <div class="futs simbox">${echoPanels()}</div>
 <p class="muted" style="font-size:12.5px;margin-top:8px">Ember lines are threat spread in the simulation. Rings are cuts. Green bars are services available; hatched outline means offline. One scrubber drives all three futures.</p>
 <section class="sec" style="margin-top:14px"><header><h3>Metric comparison</h3>${tag('sim','Simulated')}</header><table class="mtab simbox"><thead><tr><th></th>${FUT.map(f=>`<th>${f.n}</th>`).join('')}</tr></thead><tbody>${M.map((m,i)=>`<tr><td class="l">${m}</td>${FUT.map(f=>`<td class="${f.win?'win':''}"><span class="v">${echoMetrics(f.k)[i].split(' · ')[0].split(';')[0]}</span><span class="muted" style="font-size:12.5px">${(echoMetrics(f.k)[i].split(' · ')[1]||echoMetrics(f.k)[i].split(';')[1]||'')}</span></td>`).join('')}</tr>`).join('')}</tbody></table></section>
 <p style="margin-top:14px"><button class="btn" data-wf="safecut">Continue to SafeCut</button></p>`}
function uncertaintyHTML(){return `<div class="dh"><div><span class="k">EchoLab · simulated</span><h2>Assumptions and uncertainty</h2></div><button class="btn sm q" data-act="close">Close</button></div><div class="db">
 <div class="sec"><header><h3>What the model assumes</h3></header><ul class="muted" style="margin:0;padding-left:18px"><li>Attacker replays tokens and mints at most two further sessions. No new malware.</li><li>Horizon 10 min, 6,000 rollouts per future, seed 2417.</li><li>Action delay: Future A 0.3 min. Future C 0.5 to 1.1 min after approval.</li><li>Downtime and user counts come from dependency map v14 and the directory, not from live tests.</li></ul></div>
 <div class="sec"><header><h3>How sure are the numbers</h3></header><table class="tbl"><tbody>
 <tr><td>Future B reaches the database</td><td class="n">82% (95% interval 81–83%)</td></tr>
 <tr><td>Future A users locked out</td><td class="n">412 (range 380–446)</td></tr>
 <tr><td>Future C users affected</td><td class="n">3 (range 3–4)</td></tr>
 <tr><td>Future A downtime</td><td class="n">≈ 4 h 20 min (± 40 min)</td></tr></tbody></table></div>
 <div class="sec"><header><h3>What it cannot see</h3></header><ul class="muted" style="margin:0;padding-left:18px"><li>A foothold outside the six observed events.</li><li>Human delays, such as an approver who is away.</li><li>Offline or out-of-band data theft.</li><li>Changes to the business after dependency map v14.</li></ul></div>
 <p class="muted">Likelihoods are shares of simulated rollouts. They are not measured probabilities.</p></div>`}
