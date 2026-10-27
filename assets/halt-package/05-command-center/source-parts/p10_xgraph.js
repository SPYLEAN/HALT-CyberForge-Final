// ---- extended dual-layer model (same incident, richer entities)
const XN={
 phish:{x:70,y:70,k:'att',l:'Phishing sender',t:'Attacker sender',st:1},
 adev:{x:70,y:175,k:'adev',l:'Unknown device',t:'Device',st:2},
 asn:{x:70,y:275,k:'att',l:'ASN AS64500',t:'Network',st:2},
 dev1:{x:240,y:40,k:'dev',l:'M. Verma laptop',t:'Device'},
 user:{x:240,y:130,k:'user',l:'M. Verma',t:'User',st:1},
 appr:{x:240,y:265,k:'user',l:'Finance approvers ×2',t:'Users'},
 grant:{x:410,y:60,k:'att',l:'DocuSync Pro',t:'OAuth application',st:4},
 tokR:{x:410,y:165,k:'tok',l:'Refresh token',t:'Token',st:5},
 s1:{x:570,y:110,k:'ses',l:'Session S-1',t:'Session',st:5},
 s2:{x:570,y:200,k:'ses',l:'Session S-2',t:'Session',st:5},
 s3:{x:570,y:290,k:'ses',l:'S-3 (forecast)',t:'Session',fc:1},
 fapi:{x:730,y:70,k:'api',l:'Finance API',t:'API'},
 supp:{x:730,y:235,k:'svc',l:'Customer support',t:'Service'},
 payroll:{x:870,y:50,k:'svc',l:'Payroll',t:'Service'},
 pay:{x:870,y:150,k:'svc',l:'Payment processing',t:'Service'},
 recon:{x:870,y:250,k:'svc',l:'Reconciliation',t:'Service'},
 db:{x:1030,y:150,k:'db',l:'Finance database',t:'Database'},
 refunds:{x:600,y:455,k:'proc',l:'Refund handling',t:'Business process',biz:1},
 close:{x:760,y:455,k:'proc',l:'Month-end close',t:'Business process',biz:1},
 supplier:{x:910,y:455,k:'proc',l:'Supplier payments',t:'Business process',biz:1},
 payrun:{x:1040,y:455,k:'proc',l:'Payroll run',t:'Business process',biz:1}
};
const XE=[
 {id:'x_ph_u',a:'phish',b:'user',k:'obs',st:1,ev:'EV-01',bl:0},
 {id:'x_asn_adev',a:'asn',b:'adev',k:'obs',st:2,ev:'EV-02',bl:-18},
 {id:'x_adev_u',a:'adev',b:'user',k:'obs',st:2,ev:'EV-02',bl:0},
 {id:'x_ph_asn',a:'phish',b:'asn',k:'inf',st:2,bl:-36,lk:.74,why:'Sender infrastructure and sign-in ASN share a hosting provider.'},
 {id:'x_u_dev',a:'user',b:'dev1',k:'rel',st:1,bl:0},
 {id:'x_u_g',a:'user',b:'grant',k:'obs',st:4,ev:'EV-04',bl:0},
 {id:'x_g_tok',a:'grant',b:'tokR',k:'inf',st:5,bl:14,lk:.78,why:'Token claims match the grant scope. The minting itself is not logged.'},
 {id:'x_tok_s1',a:'tokR',b:'s1',k:'inf',st:5,bl:0,lk:.78,why:'Session tokens carry the refresh token ID.'},
 {id:'x_tok_s2',a:'tokR',b:'s2',k:'inf',st:5,bl:0,lk:.78,why:'Session tokens carry the refresh token ID.'},
 {id:'x_adev_s1',a:'adev',b:'s1',k:'obs',st:5,ev:'EV-05',bl:-30},
 {id:'x_adev_s2',a:'adev',b:'s2',k:'obs',st:5,ev:'EV-05',bl:-18},
 {id:'x_s1_fapi',a:'s1',b:'fapi',k:'obs',st:6,ev:'EV-06',bl:0,cut:'A2'},
 {id:'x_s2_pay',a:'s2',b:'pay',k:'obs',st:6,ev:'EV-06',bl:0,cut:'A2'},
 {id:'x_g_fapi',a:'grant',b:'fapi',k:'fc',bl:-14,lk:.74,cut:'A1',arr:1.0,up:[]},
 {id:'x_fapi_db',a:'fapi',b:'db',k:'fc',bl:20,lk:.82,arr:4.8,up:['x_g_fapi','x_s1_fapi']},
 {id:'x_pay_db',a:'pay',b:'db',k:'fc',bl:14,lk:.41,arr:6.1,up:['x_s2_pay','x_s3_pay']},
 {id:'x_g_recon',a:'grant',b:'recon',k:'fc',bl:-60,lk:.33,cut:'A1',arr:2.5,up:[]},
 {id:'x_recon_db',a:'recon',b:'db',k:'fc',bl:14,lk:.33,arr:6.4,up:['x_g_recon']},
 {id:'x_g_payroll',a:'grant',b:'payroll',k:'fc',bl:-24,lk:.21,cut:'A3',arr:3.0,up:[]},
 {id:'x_payroll_db',a:'payroll',b:'db',k:'fc',bl:14,lk:.21,arr:7.9,up:['x_g_payroll']},
 {id:'x_u_s3',a:'user',b:'s3',k:'fc',bl:-40,lk:.38,arr:1.8,up:[]},
 {id:'x_s3_pay',a:'s3',b:'pay',k:'fc',bl:-10,lk:.38,cut:'A3',arr:3.4,up:['x_u_s3']}
];
// business dependencies (service -> process), "keep" = operating path preserved by the plan
const XD=[['recon','close',0],['db','close',-8],['pay','supplier',0],['pay','refunds',0],['supp','refunds',0],['payroll','payrun',0],['db','payrun',-8]];
const XP=[
 {id:'P1',crit:1,e:['x_ph_u','x_u_g','x_g_fapi','x_fapi_db'],a:'A1',steps:[['obs','A phishing message reaches M. Verma (EV-01)'],['obs','M. Verma consents to DocuSync Pro (EV-04)'],['fc','The app’s token calls the Finance API'],['fc','The Finance API reads the finance database']],why:'The grant is the attacker’s durable key. It survives password and MFA changes.'},
 {id:'P2',crit:0,e:['x_u_g','x_g_recon','x_recon_db'],a:'A1',steps:[['obs','DocuSync Pro holds Files.ReadWrite.All (EV-04)'],['fc','The grant reaches Reconciliation'],['fc','Reconciliation reads the finance database']],why:'Lower likelihood (33%), but it uses the same grant as P1.'},
 {id:'P3',crit:1,e:['x_u_s3','x_s3_pay','x_pay_db'],a:'A3',steps:[['fc','The attacker mints a new session S-3 for M. Verma'],['fc','S-3 calls Payment processing'],['fc','Payment processing writes to the finance database']],why:'A session that does not exist yet. Step-up authentication stops it being created silently.'},
 {id:'P4',crit:1,e:['x_adev_s1','x_s1_fapi','x_fapi_db'],a:'A2',steps:[['obs','Session S-1 is replayed from an unknown device (EV-05)'],['obs','S-1 enumerates the Finance API (EV-06)'],['fc','The Finance API reads the finance database']],why:'Already in progress. Killing the session ends it in seconds.'},
 {id:'P5',crit:1,e:['x_adev_s2','x_s2_pay','x_pay_db'],a:'A2',steps:[['obs','Session S-2 is replayed from an unknown device (EV-05)'],['obs','S-2 opens Payment processing (EV-06)'],['fc','Payment processing writes to the finance database']],why:'Already in progress, on the finance portal.'},
 {id:'P6',crit:0,e:['x_u_g','x_g_payroll','x_payroll_db'],a:'A3',steps:[['obs','DocuSync Pro is granted (EV-04)'],['fc','Its tokens call Payroll'],['fc','Payroll reads the finance database']],why:'Lowest likelihood (21%). Step-up authentication blocks the token exchange for Payroll.'}
];
const XPK={obs:'Observed',inf:'Inferred',fc:'Forecast'};
// entity evidence for new nodes
Object.assign(ENT,{
 adev:{t:'Unknown device',ty:'Device (attacker)',c:'obs',ev:[2,5],src:'Entra sign-in logs · SL-4471, SL-4502',ts:'09:42:36Z',cf:.9,why:[['Device ID never registered in the tenant','Strong'],['Replays both sessions','Strong']],lo:'A device-registration record would lower it.',att:'T1078.004 · Valid Accounts: Cloud Accounts',biz:'None directly. Blocking it is not in the minimum plan.',act:'A2'},
 dev1:{t:'M. Verma laptop',ty:'Device (managed)',c:'biz',ev:[],src:'MDM inventory',ts:'Static',cf:null,att:'None observed',biz:'Not compromised. No action touches it.',act:null},
 tokR:{t:'Refresh token (grant)',ty:'Token',c:'inf',ev:[4,5],src:'HALT correlation · I-02',ts:'09:47:03Z',cf:.78,why:[['Claims match the grant scope','Moderate'],['The minting is not logged','Limits']],lo:'A log of the token being minted would turn this into an observed fact.',att:'T1528 · Steal Application Access Token',biz:'Revoking the grant invalidates it.',act:'A1'},
 appr:{t:'Finance approvers ×2',ty:'Users',c:'biz',ev:[],src:'Directory · Finance Approvers group',ts:'Static',cf:null,att:'None observed',biz:'They see one step-up prompt when A3 applies. Counted in the 3 affected users.',act:'A3'},
 refunds:{t:'Refund handling',ty:'Business process',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'Customer refunds. Needs Payment processing and Customer support.',act:null},
 close:{t:'Month-end close',ty:'Business process',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'Needs Reconciliation and the finance database. Due 17:00.',act:'A1'},
 supplier:{t:'Supplier payments',ty:'Business process',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'The 16:00 run. Needs Payment processing.',act:'A2'},
 payrun:{t:'Payroll run',ty:'Business process',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'640 employees paid at 18:00. Needs Payroll and the finance database.',act:'A3'}
});
const nodeLabel=id=>(XN[id]||NODES[id]||{l:id}).l;
const allEdges=()=>EDGES.concat(XE);
function xglyph(n,x,y,o){
 const s=o.off?'#707D84':(n.k==='att'||n.k==='adev')?'#D4572F':'#F1F0EA',f='#0B0F11',w=2.8;let g='';
 if(n.k==='user')g=`<circle r="11" fill="${f}" stroke="${s}" stroke-width="${w}"/>${n.l.includes('×')?'<circle cx="9" cy="-6" r="6" fill="'+f+'" stroke="'+s+'" stroke-width="2"/>':''}`;
 else if(n.k==='ses')g=`<rect x="-15" y="-7" width="30" height="14" rx="7" fill="${f}" stroke="${s}" stroke-width="${w}"${n.fc?' stroke-dasharray="2 4"':''}/>`;
 else if(n.k==='api')g=`<polygon points="-14,-9 5,-9 15,0 5,9 -14,9" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round"/>`;
 else if(n.k==='svc')g=`<rect x="-15" y="-10" width="30" height="20" rx="2" fill="${f}" stroke="${s}" stroke-width="${w}"/><rect x="-15" y="5" width="30" height="5" fill="${o.off?'#707D84':'#3E9C86'}"/>`;
 else if(n.k==='db')g=`<path d="M-12 -8a12 4.5 0 0 1 24 0v16a12 4.5 0 0 1 -24 0z" fill="${f}" stroke="${s}" stroke-width="${w}"/><path d="M-12 -8a12 4.5 0 0 0 24 0" fill="none" stroke="${s}" stroke-width="${w}"/>`;
 else if(n.k==='dev'||n.k==='adev')g=`<rect x="-14" y="-10" width="28" height="17" rx="2" fill="${f}" stroke="${s}" stroke-width="${w}"/><path d="M-19 11H19" stroke="${s}" stroke-width="3"/>`;
 else if(n.k==='tok')g=`<polygon points="0,-12 12,0 0,12 -12,0" fill="${f}" stroke="${s}" stroke-width="${w}" ${n.id==='x'?'':''}/><circle r="2.5" fill="${s}"/>`;
 else if(n.k==='proc')g=`<polygon points="-18,0 -9,-12 9,-12 18,0 9,12 -9,12" fill="${f}" stroke="${o.off?'#707D84':'#3E9C86'}" stroke-width="3"/><rect x="-9" y="3" width="18" height="4" fill="${o.off?'#707D84':'#3E9C86'}"/>`;
 else g=`<polygon points="-13,-10 13,-10 0,13" fill="#D4572F" stroke="#D4572F" stroke-width="2" stroke-linejoin="round"/>`;
 const ev=o.ev?`<rect x="9" y="-19" width="8" height="8" fill="#F1F0EA" stroke="#0B0F11" stroke-width="2"/>`:'';
 const hit=o.hit?`<circle r="${o.hit}" fill="none" stroke="#EC7B56" stroke-width="2"/>`:'';
 return `<g transform="translate(${x} ${y})">${hit}${g}${ev}</g>`;
}
// opts: step, mode(tech|biz|both), pf(all|obs|fc|crit), path, sel, q, applied, proposed, conflict, mini, spread{F,tau}, off
function xSVG(o){
 const step=o.step==null?6:o.step,mode=o.mode||'both',pf=o.pf||'all',ap=o.applied||0,plan=o.proposed||ap>0,mini=o.mini;
 const pset=o.path&&o.path!=='all'?XP.find(p=>p.id===o.path).e:null;
 const critSet=new Set(XP.filter(p=>p.crit).flatMap(p=>p.e)),obsSet=new Set(XE.filter(e=>e.k==='obs').map(e=>e.id));
 const showTech=mode!=='biz',showBiz=mode!=='tech';
 const q=(o.q||'').trim().toLowerCase();
 const fcShown=o.spread||o.fcAll||(step>=6&&o.fcOn!==false);
 let out='',rings='',lab='';
 const cutDone=e=>e.cut&&ap>=+e.cut[1];
 const sp=o.spread;
 function live(id,F,tau){const e=XE.find(x=>x.id===id);if(!e)return false;const ct=SPCUT[F][e.cut]; if(e.cut&&ct!==undefined&&(e.k==='obs'||ct<=e.arr))return false;
  if(e.up&&e.up.length&&!e.up.some(u=>live(u,F,tau)))return false;return true}
 if(!mini){
  out+=`<text class="gl d" x="14" y="22">TECHNICAL LAYER</text><text class="gl d" x="14" y="392">BUSINESS LAYER</text><path d="M0 365H1100" stroke="#232B30" stroke-dasharray="4 6"/>`;
 }
 // business dependencies
 if(showBiz||showTech){XD.forEach(d=>{
  const a=XN[d[0]],b=XN[d[1]];
  if(!showBiz)return; if(mode==='biz'&&false)return;
  const qq=qsub(mkq(a,b,d[2]),.12,.88),keep=['payroll','pay','recon'].includes(d[0])&&(plan);
  const off=o.off;
  out+=`<path d="${qd(qq)}" fill="none" stroke="${off?'#707D84':'#3E9C86'}" stroke-width="${keep&&!mini?6:2}" ${off?'stroke-dasharray="3 5" opacity=".6"':keep?'stroke-opacity=".85"':''}/>`;
 })}
 XE.forEach(e=>{
  const A=XN[e.a],B=XN[e.b];
  if(!showTech)return;
  if(e.st&&e.st>step)return;
  if(e.k==='fc'&&!fcShown)return;
  const full=mkq(A,B,e.bl),qq=qsub(full,.08,.92);
  let op=1;
  if(pset&&pset.indexOf(e.id)<0)op=.1;
  if(pf==='obs'&&e.k!=='obs')op=Math.min(op,.12);
  if(pf==='fc'&&e.k!=='fc')op=Math.min(op,.12);
  if(pf==='crit'&&!critSet.has(e.id))op=Math.min(op,.1);
  let sty=e.k==='obs'?'stroke="#D4572F" stroke-width="3"':e.k==='fc'?'stroke="#D4572F" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"':e.k==='inf'?'stroke="#9AA3A8" stroke-width="2" stroke-dasharray="6 4"':'stroke="#707D84" stroke-width="1.5"';
  let body='';
  if(sp){ // threat-spread animation
   if(e.k==='fc'){const L=live(e.id,sp.F,sp.tau)&&e.arr<=sp.tau;
    const blocked=!live(e.id,sp.F,0);
    sty=L?'stroke="#D4572F" stroke-width="3.5"':'stroke="#D4572F" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round" stroke-opacity="'+(blocked?.25:.7)+'"';
    if(e.cut&&SPCUT[sp.F][e.cut]!==undefined&&SPCUT[sp.F][e.cut]<=sp.tau){const m=qpt(qq,.5);rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="${mini?9:8}" fill="#0B0F11" stroke="#F1F0EA" stroke-width="3"/><circle r="3" fill="#3E9C86"/></g>`}
   }else if(e.k==='obs'&&e.cut&&SPCUT[sp.F][e.cut]!==undefined&&SPCUT[sp.F][e.cut]<=sp.tau){
    const [p1,p2]=qsplit(qq,.5);body=`<path d="${qd(p1)}" fill="none" ${sty}/><path d="${qd(p2)}" fill="none" ${sty} stroke-opacity=".3"/>`;const m=qpt(qq,.5);rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="9" fill="#0B0F11" stroke="#F1F0EA" stroke-width="3"/><circle r="3" fill="#3E9C86"/></g>`}
  }else if(e.cut&&(plan||ap>0)){
   if(cutDone(e)&&!(o.conflict&&e.cut==='A3')){const [p1,p2]=qsplit(qq,.5);body=`<path d="${qd(p1)}" fill="none" ${sty}/><path d="${qd(p2)}" fill="none" ${sty} stroke-opacity=".3"/>`;const m=qpt(qq,.5);rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="8" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2.6"/><circle r="2.8" fill="#3E9C86"/></g>`}
   else if(!mini){const m=qpt(qq,.5);rings+=`<g transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)})"><circle r="8" fill="#0B0F11" stroke="#F1F0EA" stroke-width="2" stroke-dasharray="3 3"/>${o.conflict&&e.cut==='A3'?'<path d="M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5" stroke="#F1F0EA" stroke-width="2"/>':''}</g>`}
  }
  if(!body)body=`<path d="${qd(qq)}" fill="none" ${sty}/>`;
  if(e.k==='obs'&&!sp){const m=qpt(qq,.5);body+=`<rect x="${(m.x-4).toFixed(1)}" y="${(m.y-4).toFixed(1)}" width="8" height="8" fill="#F1F0EA" stroke="#0B0F11" stroke-width="2"/>`}
  const selE=o.sel==='e:'+e.id;
  out+=`<g data-ent="e:${e.id}" class="gn" opacity="${op}"><path d="${qd(qq)}" fill="none" stroke="transparent" stroke-width="16"/>${selE?`<path d="${qd(qq)}" fill="none" stroke="#F1F0EA" stroke-width="8" stroke-opacity=".18"/>`:''}${body}</g>`;
 });
 out+=rings;
 const matchSet=new Set();
 Object.keys(XN).forEach(k=>{const n=XN[k];if(q&&(n.l+' '+n.t).toLowerCase().indexOf(q)>-1)matchSet.add(k)});
 Object.keys(XN).forEach(k=>{
  const n=XN[k];
  if(n.biz&&!showBiz)return;
  if(!n.biz&&!showTech&&!['payroll','pay','recon','supp','db','fapi'].includes(k))return;
  if(n.st&&n.st>step)return; if(n.fc&&!fcShown)return;
  const off=o.off&&(n.k==='svc'||n.k==='db'||n.k==='api'||n.k==='proc')&&k!=='supp'?1:0;
  const ev=!mini&&['user','s1','s2','grant'].includes(k)&&step>=(n.st||1);
  let hit=0;if(sp&&sp.F!=='C'&&k==='db'&&live('x_fapi_db',sp.F,sp.tau)&&sp.tau>=4.8)hit=22;
  if(sp&&sp.F==='B'&&k==='db'&&sp.tau>=4.8)hit=22;
  let g=xglyph(Object.assign({},n,{id:k}),n.x,n.y,{off,ev,hit});
  if(o.sel==='n:'+k)g=`<circle cx="${n.x}" cy="${n.y}" r="26" fill="none" stroke="#F1F0EA" stroke-width="1.5" stroke-dasharray="3 3"/>`+g;
  if(q&&matchSet.has(k))g=`<circle cx="${n.x}" cy="${n.y}" r="30" fill="none" stroke="#F1F0EA" stroke-width="2.5"/>`+g;
  let op=1;if(q&&!matchSet.has(k))op=.3;
  if(pset&&!XE.some(e=>pset.indexOf(e.id)>-1&&(e.a===k||e.b===k))&&!n.biz)op=Math.min(op,.2);
  if(mode==='biz'&&!n.biz&&['phish','adev','asn','user','dev1','appr','grant','tokR','s1','s2','s3'].includes(k))return;
  const showL=!mini||['db'].includes(k);
  const cls=(n.k==='att'||n.k==='adev'||n.fc)?'gl e':n.biz?'gl v':off?'gl d':'gl';
  const label=showL?`<text class="${cls}" x="${n.x}" y="${n.y+(n.k==='db'?32:30)}" text-anchor="middle">${n.l}</text>`:'';
  out+=`<g data-ent="n:${k}" class="gn" opacity="${op}" tabindex="${mini?-1:0}" role="button" aria-label="${n.l}"><circle cx="${n.x}" cy="${n.y}" r="26" fill="transparent"/>${g}${label}</g>`;
 });
 if(!mini&&fcShown&&showTech)out+=`<text class="gl e" x="1090" y="22" text-anchor="end">FORECAST LAYER · NOT OBSERVED</text>`;
 return `<svg class="${mini?'xm':'xg'}" viewBox="0 0 1100 520" role="img" aria-label="Dual-layer ThreadGraph" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}
const SPCUT={A:{A1:.3,A2:.3,A3:.3},B:{},C:{A1:.5,A2:.8,A3:1.1}};
