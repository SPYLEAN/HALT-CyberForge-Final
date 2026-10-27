'use strict';
const $=(s,r)=>(r||document).querySelector(s), $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const toS=t=>{const p=t.split(':').map(Number);return p[0]*3600+p[1]*60+(p[2]||0)};
const fmt=s=>{s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return [h,m,x].map(n=>String(n).padStart(2,'0')).join(':')};
const dur=s=>{s=Math.max(0,Math.round(s));return 'T+'+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const T0=toS('09:41:12'),TE=toS('09:52:18'),HOR=600,DET=toS('09:52:30');
const EV=[
 {n:1,t:'09:41:12',title:'OAuth consent phishing',src:'Mail gateway · message trace MT-88241',conf:.97,att:'T1566.002 · Phishing: Spearphishing Link',d:'A message with a consent link reaches M. Verma, Finance Ops.'},
 {n:2,t:'09:42:36',title:'Suspicious authentication',src:'Entra sign-in logs · SL-4471',conf:.93,att:'T1078.004 · Valid Accounts: Cloud Accounts',d:'Sign-in from a new ASN (AS64500) with a user agent never seen for this account.'},
 {n:3,t:'09:43:21',title:'MFA modification',src:'Entra audit log · AU-9120',conf:.96,att:'T1556.006 · Modify Authentication Process: MFA',d:'A second authenticator is added within a minute of the sign-in.'},
 {n:4,t:'09:43:50',title:'Malicious OAuth grant',src:'Entra audit log · AU-9124',conf:.94,att:'T1528 · Steal Application Access Token',d:'DocuSync Pro is granted Mail.Read, Files.ReadWrite.All and offline_access.'},
 {n:5,t:'09:47:03',title:'Session-token replay',src:'Entra sign-in logs · SL-4502',conf:.91,att:'T1550.004 · Use Alternate Authentication Material: Web Session Cookie',d:'Sessions S-1 and S-2 are replayed from AS64500; S-2 on the finance portal.'},
 {n:6,t:'09:52:18',title:'Finance-resource discovery',src:'Graph activity log · GA-30918',conf:.89,att:'T1213.002 · Data from Information Repositories: SharePoint',d:'The Finance-Close library is enumerated: 214 requests in four minutes.'}
];
EV.forEach(e=>e.s=toS(e.t));
const NODES={
 phish:{x:60,y:90,k:'att',l:'Phishing sender',st:1},asn:{x:60,y:200,k:'att',l:'ASN AS64500',st:2},
 user:{x:200,y:150,k:'user',l:'M. Verma',st:1},grant:{x:360,y:70,k:'att',l:'DocuSync Pro',st:4},
 s1:{x:360,y:160,k:'ses',l:'Session S-1',st:5},s2:{x:360,y:250,k:'ses',l:'Session S-2',st:5},s3:{x:360,y:340,k:'ses',l:'S-3 (forecast)',fc:1},
 fapi:{x:570,y:90,k:'api',l:'Finance API',biz:1},payroll:{x:690,y:185,k:'proc',l:'Payroll',biz:1},pay:{x:690,y:275,k:'proc',l:'Payment processing',biz:1},
 recon:{x:690,y:365,k:'proc',l:'Reconciliation',biz:1},supp:{x:520,y:215,k:'proc',l:'Customer support',biz:1},
 db:{x:890,y:225,k:'db',l:'Finance database',biz:1},staff:{x:60,y:380,k:'user',l:'Finance staff',biz:1}
};
// kinds: obs, inf, fc ; cut = action id
const EDGES=[
 {id:'e_ph_u',a:'phish',b:'user',k:'obs',st:1,ev:'EV-01',bl:0},
 {id:'e_asn_u',a:'asn',b:'user',k:'obs',st:2,ev:'EV-02',bl:0},
 {id:'i_ph_asn',a:'phish',b:'asn',k:'inf',st:2,bl:-24,lk:.74,why:'Sender infrastructure and sign-in ASN share a hosting provider.'},
 {id:'e_u_g',a:'user',b:'grant',k:'obs',st:4,ev:'EV-04',bl:0},
 {id:'e_u_s1',a:'user',b:'s1',k:'obs',st:5,ev:'EV-05',bl:10},
 {id:'e_u_s2',a:'user',b:'s2',k:'obs',st:5,ev:'EV-05',bl:-10},
 {id:'i_g_s1',a:'grant',b:'s1',k:'inf',st:5,bl:-22,lk:.78,why:'Token claims match the grant scope. The minting itself is not logged.'},
 {id:'i_g_s2',a:'grant',b:'s2',k:'inf',st:5,bl:-34,lk:.78,why:'Token claims match the grant scope. The minting itself is not logged.'},
 {id:'e_s1_fapi',a:'s1',b:'fapi',k:'obs',st:6,ev:'EV-06',bl:0,cut:'A2'},
 {id:'e_s2_pay',a:'s2',b:'pay',k:'obs',st:6,ev:'EV-06',bl:0,cut:'A2'},
 {id:'f_g_fapi',a:'grant',b:'fapi',k:'fc',lk:.74,bl:14,cut:'A1'},
 {id:'f_fapi_db',a:'fapi',b:'db',k:'fc',lk:.82,bl:18},
 {id:'f_pay_db',a:'pay',b:'db',k:'fc',lk:.41,bl:14},
 {id:'f_g_recon',a:'grant',b:'recon',k:'fc',lk:.33,bl:-40,cut:'A1'},
 {id:'f_recon_db',a:'recon',b:'db',k:'fc',lk:.33,bl:14},
 {id:'f_g_payroll',a:'grant',b:'payroll',k:'fc',lk:.21,bl:-10,cut:'A3'},
 {id:'f_payroll_db',a:'payroll',b:'db',k:'fc',lk:.21,bl:12},
 {id:'f_u_s3',a:'user',b:'s3',k:'fc',lk:.38,bl:-26},
 {id:'f_s3_pay',a:'s3',b:'pay',k:'fc',lk:.38,bl:-12,cut:'A3'}
];
const DEPS=[['fapi','pay'],['fapi','payroll'],['fapi','recon'],['supp','fapi'],['pay','db',-14],['payroll','db',-12],['recon','db',-14]];
const SPINE=[['staff','recon',-30],['recon','db',-30]];
const PATHS=[
 {id:'P1',n:'Phishing sender → M. Verma → DocuSync Pro → Finance API → database',e:['e_ph_u','e_u_g','f_g_fapi','f_fapi_db'],a:'A1',fc:1},
 {id:'P2',n:'DocuSync Pro → Reconciliation → database',e:['e_u_g','f_g_recon','f_recon_db'],a:'A1',fc:1},
 {id:'P3',n:'New session S-3 → Payment processing → database',e:['f_u_s3','f_s3_pay','f_pay_db'],a:'A3',fc:1},
 {id:'P4',n:'Session S-1 → Finance API → database',e:['e_u_s1','e_s1_fapi','f_fapi_db'],a:'A2'},
 {id:'P5',n:'Session S-2 → Payment processing → database',e:['e_u_s2','e_s2_pay','f_pay_db'],a:'A2'},
 {id:'P6',n:'DocuSync Pro → Payroll → database',e:['e_u_g','f_g_payroll','f_payroll_db'],a:'A3',fc:1}
];
const ACTS=[
 {id:'A1',t:'Revoke malicious OAuth grant',imp:'1 user: M. Verma',rb:'RB-1 · about 30 s',pol:'IR-OAUTH-02',who:'Tier-2 analyst or SOC lead',scope:'Entra: DelegatedPermissionGrant.ReadWrite.All',ent:'grant',blocks:'P1, P2'},
 {id:'A2',t:'Kill two compromised sessions',imp:'1 user signs in again',rb:'RB-2 · about 1 min',pol:'IR-SESS-01',who:'Tier-2 analyst',scope:'Entra: User.RevokeSessions.All',ent:'s1',blocks:'P4, P5'},
 {id:'A3',t:'Apply step-up authentication',imp:'2 finance approvers, one prompt',rb:'RB-3 · about 20 s',pol:'IR-CA-05',who:'Tier-2 analyst + Finance Ops owner (S. Iyer)',scope:'Entra: Policy.ReadWrite.ConditionalAccess',ent:'s3',blocks:'P3, P6'}
];
const STAGES=['Initial access','Credential & persistence','Token abuse','Discovery','Collection','Exfiltration'];
const BIZ=[
 ['Payroll','640 employees','18:00 run','Pay run missed; paid by hand after hours'],
 ['Payment processing','≈ 85 users','16:00 supplier run','Supplier payments and refunds queue'],
 ['Reconciliation','22 users','17:00 daily','Close slips by the length of the outage'],
 ['Customer support','38 agents','Continuous','Invoice and refund lookups wait'],
 ['Finance API','≈ 310 users','Continuous','All four processes lose their data source']
];
const ENT={
 phish:{t:'Attacker-controlled sender',ty:'Attacker infrastructure',c:'obs',ev:[1],src:'Mail gateway · MT-88241',ts:'09:41:12Z',cf:.97,why:[['Message trace shows a consent link sent to M. Verma','Strong'],['Sender domain registered 6 days earlier','Strong'],['Shares hosting with the ASN in EV-02','Moderate · inferred']],lo:'An allow-list entry for this sender would lower it.',att:'T1566.002 · Phishing: Spearphishing Link',biz:'None directly. This is where the chain starts.',act:null},
 asn:{t:'Unfamiliar ASN · AS64500',ty:'Attacker infrastructure',c:'obs',ev:[2,5],src:'Entra sign-in logs · SL-4471, SL-4502',ts:'09:42:36Z',cf:.92,why:[['First sign-in from this ASN for any finance user','Strong'],['User agent never seen for this account','Strong'],['Not on a corporate VPN or travel list','Moderate']],lo:'A confirmed travel or VPN record would lower it.',att:'T1078.004 · Valid Accounts: Cloud Accounts',biz:'None directly. Blocking it at the edge is not in the minimum plan.',act:null},
 user:{t:'M. Verma · Finance Ops',ty:'User account',c:'obs',ev:[1,2,3,4,5],src:'Entra sign-in and audit logs',ts:'09:41:12Z – 09:47:03Z',cf:.99,why:[['Identity confirmed by directory','Strong'],['Five of six events touch this account','Strong']],lo:'Not applicable. This is a fact, not an estimate.',att:'T1556.006 · Modify Authentication Process: MFA',biz:'Re-sign-in only. One user, no service interrupted.',act:'A2'},
 grant:{t:'DocuSync Pro · OAuth grant',ty:'Third-party application',c:'obs',ev:[4],src:'Entra audit log · AU-9124',ts:'09:43:50Z',cf:.94,why:[['Consent event recorded with the scopes granted','Strong'],['Publisher unverified; registered 6 days earlier','Strong'],['Granted 29 s after the MFA change','Moderate']],lo:'A change ticket approving this app would lower it.',att:'T1528 · Steal Application Access Token',biz:'Holds Mail.Read and Files.ReadWrite.All. Revoking it affects 1 user.',act:'A1'},
 s1:{t:'Session S-1 · replayed',ty:'Session',c:'obs',ev:[5,6],src:'Entra sign-in logs · SL-4502',ts:'09:47:03Z',cf:.91,why:[['Token reused from AS64500 after issue to another device','Strong'],['Calls the Finance API at 09:52','Strong']],lo:'A matching device record would lower it.',att:'T1550.004 · Web Session Cookie',biz:'Killing it signs M. Verma in again. No service interrupted.',act:'A2'},
 s2:{t:'Session S-2 · replayed',ty:'Session',c:'obs',ev:[5,6],src:'Entra sign-in logs · SL-4502',ts:'09:47:03Z',cf:.91,why:[['Token reused from AS64500','Strong'],['Opens the finance portal','Strong']],lo:'A matching device record would lower it.',att:'T1550.004 · Web Session Cookie',biz:'Killing it signs M. Verma in again. No service interrupted.',act:'A2'},
 s3:{t:'Session S-3 · forecast',ty:'Session (does not exist yet)',c:'fc',ev:[],src:'EchoLab forecast · seed 2417',ts:'Within 10 min',lk:.38,lkn:'2,280 of 6,000 simulated rollouts mint a new session',att:'T1550.004 · Web Session Cookie',biz:'Would reach Payment processing, a 16:00 dependency.',act:'A3'},
 fapi:{t:'Finance API',ty:'Business service',c:'biz',ev:[6],src:'Graph activity log · GA-30918; dependency map v14',ts:'09:52:18Z',cf:.89,why:[['Library enumeration came through this API','Strong']],lo:'',att:'T1213.002 · Data from Information Repositories',biz:'Four processes depend on it, about 310 users. Isolating it stops Payroll, Payment processing and Reconciliation.',act:'A2'},
 payroll:{t:'Payroll',ty:'Business service',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'640 employees. The 18:00 pay run needs Payment processing and the finance database.',act:'A3'},
 pay:{t:'Payment processing',ty:'Business service',c:'biz',ev:[6],src:'Dependency map v14; GA-30918',ts:'09:52:18Z',cf:null,att:'T1550.004 · session S-2 reaches it',biz:'About 85 users. The 16:00 supplier run and refunds.',act:'A2'},
 recon:{t:'Reconciliation',ty:'Business service',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'22 users. The 17:00 daily reconciliation.',act:'A1'},
 supp:{t:'Customer support',ty:'Business service',c:'biz',ev:[],src:'Dependency map v14',ts:'Static',cf:null,att:'None observed',biz:'38 agents. Reads the Finance API. No attack path touches it.',act:null},
 staff:{t:'Finance staff',ty:'User group',c:'biz',ev:[],src:'Directory',ts:'Static',cf:null,att:'None observed',biz:'The people running close and payroll. The business-critical path HALT keeps open.',act:null},
 db:{t:'Finance database',ty:'Primary asset at risk',c:'fc',ev:[6],src:'EchoLab forecast · seed 2417',ts:'Within 10 min',lk:.82,lkn:'4,912 of 6,000 simulated rollouts reach it',att:'T1213 · Data from Information Repositories',biz:'All five finance processes need it. Isolating it ends the attack and every process below it.',act:'A1'}
};
const SC={
 inc:{t:'Incident confidence',parts:[['Six observed events in a coherent order','EV-01 – EV-06','Strong'],['The OAuth grant and the session replay share one ASN','EV-02, EV-05','Strong'],['No benign explanation found (travel, new device policy)','Sign-in logs','Moderate'],['Two links are inferred, not logged','I-01, I-02','Limits']],lo:'Confirmation that M. Verma approved DocuSync Pro would lower this. Evidence of a second foothold would raise it.'},
 rc:{t:'Root-cause confidence',parts:[['Consent link, MFA change and grant occur within 2.5 min','EV-01, EV-03, EV-04','Strong'],['Credential stuffing rejected: no failed-login burst','SL-4471','Moderate'],['Token minting by the grant is inferred','I-02','Limits']],lo:'A log of the grant minting tokens would raise it.'},
 fc:{t:'Forecast likelihood',sim:1,parts:[['4,912 of 6,000 simulated rollouts reach the finance database within 10 min','EchoLab · seed 2417','Simulated'],['Model uses observed paths P4 and P5 plus four forecast paths','ThreadGraph v14','Simulated'],['Not a measured probability','','Limits']],lo:'Changing the horizon or the attacker model changes this number.'}
};
const STATES=[
 {k:'new',n:'New incident',status:'New',tone:'n',stage:0,conf:.52,since:8,max:2,fc:0,sim:0,plan:0,appr:'No plan yet',
  b:{h:'New incident',p:'Two events are ingested. Nothing has been correlated, so there are no links, forecasts or recommendations yet.',go:['Start correlation','correlating']}},
 {k:'correlating',n:'Correlating evidence',status:'Correlating',tone:'n',stage:2,conf:.71,since:41,max:2,fc:0,sim:0,plan:0,appr:'No plan yet',auto:1,
  b:{h:'Correlating evidence',p:'Linking events to accounts, grants and sessions. Inferred links appear dashed until confirmed.'}},
 {k:'forecast',n:'Forecast ready',status:'Forecast ready',tone:'n',stage:3,conf:.87,since:190,max:6,fc:1,sim:0,plan:0,appr:'No plan yet',
  b:{h:'Forecast ready',p:'Six paths are forecast to reach the finance database. These are forecasts, not observed events.',go:['Run EchoLab simulation','simulating']}},
 {k:'simulating',n:'Simulation running',status:'Simulating',tone:'n',stage:3,conf:.87,since:300,max:6,fc:1,sim:1,plan:0,appr:'No plan yet',auto:1,
  b:{h:'Simulation running',p:'Replaying the incident under three responses. Results are simulated and will be labelled that way.'}},
 {k:'plan',n:'Plan available',status:'Plan available',tone:'n',stage:3,conf:.87,since:450,max:6,fc:1,sim:2,plan:1,appr:'Ready for review',
  b:{h:'Plan available',p:'SafeCut found a minimum-safe response of three reversible actions. Nothing has been executed.',go:['Review and approve','approval']}},
 {k:'approval',n:'Approval pending',status:'Active containment',tone:'e',stage:3,conf:.87,since:882,max:6,fc:1,sim:2,plan:1,appr:'Awaiting analyst approval',
  b:{h:'Approval pending',p:'Two approvals are required before anything runs. Execution needs a deliberate hold.',go:['Open approval','drawer']}},
 {k:'executing',n:'Action executing',status:'Executing',tone:'e',stage:3,conf:.87,since:930,max:6,fc:1,sim:2,plan:1,appr:'Approved · executing',auto:1,
  b:{h:'Action executing',p:'Applying actions one at a time. Rollback stays armed throughout.'}},
 {k:'contained',n:'Contained',status:'Contained',tone:'ok',stage:3,conf:.87,since:960,max:6,fc:1,sim:2,plan:1,appr:'Approved · executed',
  b:{h:'Contained',p:'Observed after execution: 0 of 6 paths reachable, 0 critical services interrupted, 3 users affected.',go:['Review rollback','rollback']}},
 {k:'rollback',n:'Rollback available',status:'Contained',tone:'ok',stage:3,conf:.87,since:1210,max:6,fc:1,sim:2,plan:1,appr:'Executed · rollback armed',
  b:{h:'Rollback available',p:'All three actions can be reversed in about two minutes. The window is open until 10:36Z or until new telemetry arrives.'}},
 {k:'conflict',n:'Policy conflict',status:'Blocked by policy',tone:'e',stage:3,conf:.87,since:900,max:6,fc:1,sim:2,plan:2,appr:'Blocked by policy',
  b:{h:'Policy conflict',p:'A3 needs a Finance Ops co-approval that cannot be given. HALT will not run a partial plan without an analyst decision.',go:['See policy conflict','policies']}},
 {k:'nofeasible',n:'No feasible safe plan',status:'No safe plan',tone:'e',stage:3,conf:.87,since:900,max:6,fc:1,sim:2,plan:3,appr:'No plan to approve',
  b:{h:'No feasible safe plan',p:'No combination of actions blocks all six paths while keeping every critical service running. HALT shows the closest options and what each breaks.',go:['See closest options','safecut']}}
];
const POLS=[
 ['IR-OAUTH-02','Revoke third-party OAuth grants','Tier-2 analyst or SOC lead','A1','Grants can be revoked without breaking a business service when the app has a single user.'],
 ['IR-SESS-01','Terminate user sessions','Tier-2 analyst','A2','Sessions of a user flagged by HALT may be terminated; the user signs in again.'],
 ['IR-CA-05','Conditional-access change for finance users','Analyst + Finance Ops owner co-approval','A3','Any change that prompts finance users needs the Finance Ops owner or a named delegate.'],
 ['IR-CHG-03','Finance close change freeze, 09:00–11:00','Exception from Finance Ops owner','A3','No access-policy change for finance users during close without an exception.'],
 ['IR-DATA-07','Preserve evidence before containment','Automatic · ProofSeal required','All','Events, graph snapshot and solver certificate are sealed before any action runs.'],
 ['IR-BRK-01','Irreversible actions (account deletion, mailbox purge)','CISO break-glass, two people','None','Never proposed by HALT unless nothing reversible works. Not part of this plan.']
];
const OPS={n:'A. Rahman',r:'Tier-2 analyst',perm:['Revoke OAuth grants (IR-OAUTH-02)','Terminate sessions (IR-SESS-01)','Propose conditional-access changes (IR-CA-05)'],no:'Cannot approve IR-CA-05 alone: needs the Finance Ops owner.'};
