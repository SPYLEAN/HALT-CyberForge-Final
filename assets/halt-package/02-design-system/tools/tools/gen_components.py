import os, textwrap
ROOT = 'project/components'

def write(path, s):
    p = os.path.join('project', path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(s)

def preview(name, group, height, subtitle, js, width=None):
    w = f' width={width}' if width else ''
    html = f'''<!-- @dsCard group="{group}" height={height}{w} subtitle="{subtitle}" -->
<!doctype html>
<html>
<head><meta charset="utf-8"><title>{name} — preview</title></head>
<body>
<div id="root"></div>
<script>
var H = window.HALT, h = React.createElement;
{textwrap.dedent(js).strip()}
</script>
</body>
</html>
'''
    write(f'components/{name}/preview.html', html)

def readme(name, s):
    write(f'components/{name}/README.md', textwrap.dedent(s).strip() + '\n')

# ---------------------------------------------------------------- HaltMark
preview('HaltMark', 'Brand', 140, 'The H mark drawn in currentColor', '''
function Tile(p){ return h('div', {style:{padding:16,background:p.bg,color:p.fg,display:'flex',gap:16,alignItems:'center',borderRadius:4,border:'1px solid var(--line)'}}, p.children); }
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-row'},
  h(Tile,{bg:'var(--bg)',fg:'var(--text)'}, h(H.HaltMark,{size:24}), h(H.HaltMark,{size:48}), h(H.HaltMark,{size:72})),
  h(Tile,{bg:'var(--text)',fg:'var(--bg)'}, h(H.HaltMark,{size:24}), h(H.HaltMark,{size:48}), h(H.HaltMark,{size:72}))));
''')
readme('HaltMark', '''
# HaltMark

The approved HALT icon, drawn as one path in `currentColor`, for use inside product UI where an `<img>` cannot take a CSS colour.

Provide `size` (height in px, minimum 24) and set `color` or the parent's CSS `color`. Use `text` on `bg` and `bg` on `text`. Never recolour it Ember or Verdigris: the mark is single colour, and Ember and Verdigris are reserved for hostile and business meaning.

Pass `decorative` when a visible "HALT" wordmark sits beside it, so screen readers hear the name once. For lockups, the favicon and the app icon use the files in `assets/Logo/`, never a redraw.
''')

# ---------------------------------------------------------------- Button
preview('Button', 'Actions', 220, 'Primary, secondary, quiet, disabled with reason', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-col'},
  h('div', {className:'halt-row', style:{padding:0}},
    h(H.Button, {variant:'primary', trailing:'→'}, 'EXECUTE 3 ACTIONS'),
    h(H.Button, null, 'OPEN EVIDENCE'),
    h(H.Button, {variant:'quiet', trailing:'↺'}, 'ROLL BACK ALL · ~2 MIN'),
    h(H.Button, {variant:'ghost'}, 'CANCEL')),
  h('div', {className:'halt-row', style:{padding:0, alignItems:'flex-start'}},
    h(H.Button, {variant:'primary', trailing:'→', disabled:true, reason:'Disabled until both approvals are recorded.'}, 'EXECUTE 3 ACTIONS'),
    h(H.Button, {variant:'done'}, 'APPROVED · 10:07 UTC'))));
''')
readme('Button', '''
# Button

Every HALT action is a 44px, 4px-radius, mono-label button, and there is exactly one `primary` per view: the Bone fill that means "this is the decision".

Provide a verb-first uppercase label, an optional `trailing` glyph (`→` to advance, `↺` for rollback) and `variant`: `primary`, `secondary` (default), `quiet` for reversals and secondary paths, `ghost` for cancel, `done` for a recorded approval. Do not build an Ember button: Ember is hostile only, and a destructive-looking button would hide that every HALT action is reversible.

A disabled `primary` must carry `reason`, shown beneath it in `telemetry` type ("Disabled until both approvals are recorded."). Never disable silently. Focus is the `focus-ring` token, never removed.

Critical actions (execute, roll back) are not triggered by Button alone: place them behind ApprovalControl so no code path runs without a recorded human approval.
''')

# ---------------------------------------------------------------- Nav
preview('Nav', 'Navigation', 420, 'App rail: six systems, current page marked', '''
var items = [
 {id:'r1', index:'01', label:'HALT-R1'}, {id:'tg', index:'02', label:'ThreadGraph'}, {id:'echo', index:'03', label:'EchoLab'},
 {id:'safecut', index:'04', label:'SafeCut'}, {id:'proof', index:'05', label:'ProofSeal'}, {id:'gate', index:'06', label:'Action Gate'}];
function App(){ var s = React.useState('tg'); return h('div', {style:{height:420,display:'flex'}}, h(H.Nav, {items:items, active:s[0], onSelect:s[1], height:420,
  footer:h(H.StatusChip,{kind:'simulated'},'SIMULATED DATA')})); }
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
''')
readme('Nav', '''
# Nav

The product rail lists the six HALT systems in pipeline order (HALT-R1, ThreadGraph, EchoLab, SafeCut, ProofSeal, Action Gate), so the order of the rail is the order of the argument: see it, simulate it, cut it, prove it, approve it.

Provide `items` (`id`, `label`, optional `index`, `href`), `active` (an `id`) and optionally `onSelect`. The rail is 232px wide (`app-rail-width`), uses `surface`, and marks the current item with `aria-current="page"` and a 2px Bone bar, not a colour. Put the persistent SIMULATED chip in `footer` whenever the data is demonstration data.

Do not add icons per item, unread badges or Ember dots: Ember in navigation would read as a threat. Below `bp-md` the rail collapses to index numbers only; below `bp-sm` it becomes a bottom bar.
''')

# ---------------------------------------------------------------- Tabs
preview('Tabs', 'Navigation', 120, 'Underline tabs, arrow-key navigation', '''
var items = [{id:'obs', label:'OBSERVED', count:'7'}, {id:'fc', label:'FORECAST', count:'6'}, {id:'resp', label:'RESPONSE'}, {id:'cut', label:'AFTER CUT'}];
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-pad', style:{maxWidth:560}}, h(H.Tabs, {items:items, label:'Graph state'})));
''')
readme('Tabs', '''
# Tabs

Tabs switch between states of the same graph or evidence set (observed, forecast, response, after cut), not between unrelated pages.

Provide `items` (`id`, `label`, optional `count`) and either uncontrolled use or `value` plus `onChange`. Labels are uppercase mono (`label` style). The selected tab is marked by a 2px `text` underline and `aria-selected`, never by colour. Arrow keys move and select; the tab list is one tab stop.

When a tab changes graph mode, the business thread must not restart or flicker: the switch uses `duration-switch` and only the hostile layer changes.
''')

# ---------------------------------------------------------------- StatusChip
preview('StatusChip', 'Status', 170, 'Ten states, each with a glyph and a word', '''
var ks = ['observed','forecast','blocked','preserved','verified','success','caution','pending','simulated','neutral'];
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-row'}, ks.map(function(k){ return h(H.StatusChip, {key:k, kind:k}); }),
  h(H.StatusChip, {kind:'forecast'}, 'FORECAST · 4,912 OF 6,000 · SIMULATED')));
''')
readme('StatusChip', '''
# StatusChip

A status chip says what state a thing is in with a glyph and a word together, so no state is told apart by colour alone.

Provide `kind`: `observed` (solid square), `forecast` (dashed ring), `blocked` (broken line), `preserved` (thick line), `verified` (proof ring), `success` (check, APPLIED), `caution` (triangle, dashed border, no new hue), `pending`, `simulated` (hatch, dotted border), `neutral` (inferred, dashed line). The default word can be replaced with `children`; keep it to three words or fewer and uppercase.

Use `preserved` only for business operations, `observed`, `forecast` and `blocked` only for hostile paths, and `verified` only where ProofSeal checked a claim. Show `simulated` beside every forecast figure and in the top bar while demonstration data is on.
''')

# ---------------------------------------------------------------- MetricBlock
preview('MetricBlock', 'Data', 280, 'Counts with a derivation line, never a bare score', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-row', style:{alignItems:'stretch'}},
  h(H.MetricBlock, {label:'Dangerous paths', value:'6', unit:'found', derivation:'7 events, 1 foothold, horizon 10 min', tone:'threat', simulated:true}),
  h(H.MetricBlock, {label:'Reachable after response', value:'0 of 6', derivation:'Recomputed on snapshot SG-2417-0759'}),
  h(H.MetricBlock, {label:'Finance processes running', value:'5 of 5', derivation:'Dependency map v14, 3 actions applied', tone:'business', simulated:true})));
''')
readme('MetricBlock', '''
# MetricBlock

A metric block shows one counted number with the derivation that produced it, because HALT never shows a bare risk score.

Provide `label`, `value` (a count, a ratio like "0 of 6", or a likelihood with its N), `derivation` (required: what was counted, over what, from which snapshot) and, for demonstration data, `simulated`. `tone` is `threat` only for hostile counts, `business` only for business-continuity counts, and omitted otherwise. The value uses `data-value`, the derivation uses `telemetry`.

Do not pass a unitless severity such as "87" or a gauge. If a number has no derivation, it does not belong on the screen.
''')

# ---------------------------------------------------------------- EvidenceRow
preview('EvidenceRow', 'Evidence', 330, 'Seven evidence items, ID links to the source', '''
var rows = [
 ['EV-01','Mail gateway','Message delivered to M. Verma with a consent link','09:41:12','Claim 1'],
 ['EV-02','Entra audit','Consent granted to DocuSync Pro: Mail.Read, Files.ReadWrite.All, offline_access','09:43:50','Claims 1, 3'],
 ['EV-03','Sign-in logs','Token replay for S-1 from a new ASN, four minutes after the real sign-in','09:47:03','Claims 1, 3'],
 ['EV-05','Graph activity','Finance-Close library enumerated: 214 requests','09:52:18','Claims 1, 2']];
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-pad', role:'table'},
  h('div', {className:'halt-ev halt-ev-head'}, h('div',null,'ID'), h('div',null,'Source'), h('div',null,'Event'), h('div',null,'Time (UTC)'), h('div',null,'Supports')),
  rows.map(function(r){ return h(H.EvidenceRow, {key:r[0], id:r[0], source:r[1], text:r[2], time:r[3], supports:r[4]}); }),
  h(H.EvidenceRow, {id:'INF-02', source:'Dependency map', text:'Finance portal session likely shares the same refresh token (inferred)', time:'—', supports:'Claim 1', inferred:true})));
''')
readme('EvidenceRow', '''
# EvidenceRow

An evidence row is one telemetry fact, with an ID that opens its source, so every recommendation can be traced back to something that happened.

Provide `id` (EV-nn), `source`, `text` (the event, set in `evidence-text`), `time` (UTC, `telemetry`), `supports` (the claims or paths it backs) and `href` to the raw event. Render a column header row with the class `halt-ev halt-ev-head`. Pass `inferred` for relationships HALT inferred rather than observed: the square marker becomes a dashed outline and the ID keeps an INF prefix.

Never summarise two events in one row, and never show a claim without at least one linked row. The ID is a real link with an underline, 44px target through row padding.
''')

# ---------------------------------------------------------------- ConstraintIndicator
preview('ConstraintIndicator', 'Data', 350, 'Hard constraints: met, at limit, violated', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-pad', style:{maxWidth:640}},
  h(H.ConstraintIndicator, {name:'Block every high-risk path', rule:'Reachability from compromised principals to fin-ledger-db', value:'0 of 6 open', state:'met', fill:0, limit:.01}),
  h(H.ConstraintIndicator, {name:'Keep critical business processes running', rule:'5 of 5 processes keep every required edge', value:'5 of 5', state:'met', fill:1, limit:1}),
  h(H.ConstraintIndicator, {name:'Disrupt at most 1 user', rule:'Hard cap set by Finance Ops, policy IR-RESP-01', value:'1 of 1 user', state:'binding', fill:1, limit:1}),
  h(H.ConstraintIndicator, {name:'Aggressive isolation: AP batch approval', rule:'Process loses a required dependency', value:'0 of 5 left', state:'violated', fill:.2, limit:1})));
''')
readme('ConstraintIndicator', '''
# ConstraintIndicator

A constraint indicator states one hard rule of a response (block every path, keep the business running, stay under the disruption cap) and whether the proposed response meets it.

Provide `name`, `rule` (the exact measured condition), `value` as a count ("0 of 6 open"), `state` (`met`, `binding` when exactly at the limit, `violated`) and optionally `fill` and `limit` (both 0 to 1) for the bar. State is carried by a glyph and a word, then colour: `met` is Verdigris ring and check, `binding` is a Bone ring and bar, `violated` is an Ember triangle.

Violated is reserved for a response that would harm the business or leave a path open. Never use it for a low score or a warning about data quality; use a `caution` StatusChip for that.
''')

# ---------------------------------------------------------------- TimelineEvent
preview('TimelineEvent', 'Evidence', 330, 'Observed events, a forecast hop, a human action', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-pad', style:{maxWidth:560}},
  h(H.TimelineEvent, {time:'09:43:50', kind:'observed', title:'OAuth consent granted to DocuSync Pro', description:'Mail.Read, Files.ReadWrite.All, offline_access', meta:'EV-02 · Entra audit'}),
  h(H.TimelineEvent, {time:'09:47:03', kind:'observed', title:'Token replay for session S-1', description:'New ASN, four minutes after the real sign-in', meta:'EV-03 · Sign-in logs'}),
  h(H.TimelineEvent, {time:'+4 min', kind:'forecast', title:'Likely: new session on finance portal', description:'Reaches fin-ledger-db through ERP connector', meta:'P3 · 4,912 OF 6,000 ROLLOUTS'}),
  h(H.TimelineEvent, {time:'10:09:20', kind:'action', last:true, title:'A1 Revoke OAuth grant applied', description:'Sealed by PS-2417-01, rollback RB-1 available', meta:'Approved by A. Rahman, S. Iyer'})));
''')
readme('TimelineEvent', '''
# TimelineEvent

A timeline event places one thing on the incident's time axis using the same thread language as the graph: solid Ember for observed, dotted Ember for forecast, a thick Verdigris thread with a proof node for a HALT action.

Provide `time`, `kind` (`observed`, `forecast`, `action`), `title`, optional `description`, `meta` (the evidence ID or path and rollout count) and `last` on the final event to end the rail. Forecast events append "SIMULATED" automatically and must show N rollouts in `meta`.

Order is chronological and forecast events always sit after the last observed event. An `action` event is shown only after a recorded human approval.
''')

# ---------------------------------------------------------------- ApprovalControl
preview('ApprovalControl', 'Actions', 520, 'Two approvers, impact, reversibility, authorisation', '''
function App(){
  var s = React.useState({soc:false, fin:false}), v = s[0];
  return h('div', {className:'halt-row', style:{alignItems:'stretch'}},
   h('div', {style:{width:380}}, h(H.ApprovalControl, {name:'A. Rahman', role:'SOC lead', short:'SOC lead', policy:'IR-RESP-01', authorises:'A1 revoke grant, A2 kill sessions, A3 step-up', impact:'1 user', reversibility:'RB-1..3 · ~2 min', authorisation:'IR-RESP-01', state:v.soc?'approved':'pending', at:'10:07 UTC', onApprove:function(){ s[1](Object.assign({}, v, {soc:true})); }})),
   h('div', {style:{width:380}}, h(H.ApprovalControl, {name:'S. Iyer', role:'Finance Ops owner', short:'Finance Ops', authorises:'A3, which changes a finance user’s sign-in', impact:'One prompt', reversibility:'RB-3 · ~20 s', authorisation:'IR-CA-05', state:v.fin?'approved':'pending', at:'10:08 UTC', onApprove:function(){ s[1](Object.assign({}, v, {fin:true})); }})));
}
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
''')
readme('ApprovalControl', '''
# ApprovalControl

An approval control is where a named human accepts responsibility for a critical action, and it always shows the three things HALT owes the approver: impact, reversibility and authorisation.

Provide `name`, `role`, `policy`, `authorises` (the action IDs this person signs off), `impact` (counts), `reversibility` (rollback plan ID and time), `authorisation` (the policy), `state` (`pending`, `approved`, `held`), `at` (UTC time of approval) and `onApprove`. The control is a real toggle button (`aria-pressed`), 44px high; an approved control turns its border Verdigris and cannot be undone from here.

Execute (a Button) stays disabled until every required ApprovalControl is `approved`. Never auto-approve, never pre-check, never move approval into a toast or an inline link.
''')

# ---------------------------------------------------------------- Tooltip
preview('Tooltip', 'Overlays', 150, 'Appears on hover and focus, never carries essential text', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-row', style:{paddingTop:72}},
  h(H.Tooltip, {open:true, title:'Likelihood', content:'4,912 of 6,000 simulated rollouts reached fin-ledger-db within 10 minutes.'}, h(H.StatusChip, {kind:'forecast'}, 'FORECAST · 82%')),
  h(H.Tooltip, {title:'Evidence', content:'EV-03 · Token replay for S-1 · 09:47:03Z'}, h(H.Button, {variant:'ghost'}, 'EV-03'))));
''')
readme('Tooltip', '''
# Tooltip

A tooltip explains one number or term on hover and keyboard focus, using a derivation or an ID, never information the user needs to proceed.

Wrap exactly one focusable child and provide `content` and an optional `title` (mono label above it). The tooltip is a `role="tooltip"` linked with `aria-describedby`, appears above the target on `surface-raised` with the `elevation-2` ring, and fades in over `duration-fast`. `open` forces it visible for documentation only.

Put every likelihood derivation ("4,912 of 6,000 rollouts") in a tooltip or beside the figure, never only in a tooltip on touch devices: below `bp-md` show the derivation inline.
''')

# ---------------------------------------------------------------- Drawer
preview('Drawer', 'Overlays', 420, 'Right-hand inspector for a node, path or claim', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {style:{display:'flex', justifyContent:'flex-end', height:420, background:'var(--bg)'}},
  h(H.Drawer, {inline:true, height:420, kicker:'PATH P3 · FORECAST', title:'New session on finance portal', onClose:function(){}, footer:[h(H.Button,{key:1,variant:'ghost'},'CLOSE'), h(H.Button,{key:2},'OPEN IN THREADGRAPH')]},
    h('div', {style:{display:'flex', flexDirection:'column', gap:12}},
      h(H.StatusChip, {kind:'forecast'}, 'FORECAST · SIMULATED'),
      h('p', {className:'body', style:{margin:0, fontSize:14, lineHeight:'21px'}}, 'Reaches fin-ledger-db through the ERP connector if a new session is opened after A2. Blocked by A3.'),
      h(H.MetricBlock, {label:'Rollouts reaching target', value:'4,912', unit:'of 6,000', derivation:'Horizon 10 min, seed 2417', simulated:true})))));
''')
readme('Drawer', '''
# Drawer

The drawer is the inspector: it holds the detail for whatever node, path, claim or action is selected, while the graph stays visible beside it.

Provide `title`, `kicker` (mono label: the object type and ID), children, optional `footer` actions and `onClose`. It is 480px (`max-drawer`) on `surface-raised` with the `elevation-2` ring, non-modal (`aria-modal="false"`), and keeps focus order intact. Use `inline` in a layout; without it the drawer is fixed to the right edge at `z-drawer`.

Do not use the drawer for approval or any action that needs a decision; that is a Dialog or the ApprovalControl on the Action Gate screen. Below `bp-md` it covers the screen as a sheet.
''')

# ---------------------------------------------------------------- Dialog
preview('Dialog', 'Overlays', 420, 'Confirm a rollback, with what changes and what does not', '''
ReactDOM.createRoot(document.getElementById('root')).render(h(H.Dialog, {inline:true, height:420, kicker:'ROLL BACK ALL', title:'Reopen six paths and revoke the seal?',
  footer:[h(H.Button,{key:1,variant:'ghost'},'KEEP RESPONSE'), h(H.Button,{key:2,variant:'primary',trailing:'↺'},'ROLL BACK ALL')]},
  h('div', {style:{display:'flex', flexDirection:'column', gap:12}},
    h('p', {style:{margin:0}}, 'A1, A2 and A3 are reversed in order. M. Verma can consent and sign in again, and the step-up policy is removed. About 2 minutes.'),
    h('div', {style:{display:'flex', gap:8, flexWrap:'wrap'}}, h(H.StatusChip,{kind:'blocked'},'6 paths reopen'), h(H.StatusChip,{kind:'preserved'},'Finance keeps running'), h(H.StatusChip,{kind:'verified'},'Seal revoked')))));
''')
readme('Dialog', '''
# Dialog

A dialog interrupts the user for one decision that cannot be undone silently, and it states what changes and what does not before asking.

Provide `title` (a plain question), `kicker`, `children` that list the consequences as StatusChips or short sentences, and `footer` with the cancel action first (`ghost`) and the single confirming action (`primary`) last. It is `role="alertdialog"`, 560px (`max-dialog`), over `scrim`, and must trap focus and close on Escape in the consuming app. Use `inline` for layout previews.

Do not use a dialog to ask for a critical action's first approval: approvals live in ApprovalControl so approver, impact, reversibility and policy stay on the page.
''')

# ---------------------------------------------------------------- Toast
preview('Toast', 'Overlays', 400, 'Four kinds: neutral, success, caution, threat', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-col'},
  h(H.Toast, {kind:'success', title:'A1 applied', onDismiss:function(){}}, 'Grant DocuSync Pro revoked. Rollback RB-1 available for 30 minutes.'),
  h(H.Toast, {kind:'caution', title:'Seal is stale', onDismiss:function(){}}, 'New telemetry arrived after sealing. Re-run ProofSeal before executing.'),
  h(H.Toast, {kind:'threat', title:'New hostile event EV-08', onDismiss:function(){}}, 'Token replay for S-3, 10:08:41Z. Path P3 is reachable again.'),
  h(H.Toast, {kind:'neutral', title:'Simulation finished'}, '6,000 rollouts per future, seed 2417.')));
''')
readme('Toast', '''
# Toast

A toast reports that something finished or changed, in one title and one sentence, and never asks for a decision.

Provide `kind` (`neutral`, `success`, `caution`, `threat`), `title` and children, plus `onDismiss`. Success uses the check glyph and Verdigris border, caution uses a triangle and dashed border, threat uses a solid Ember square and is announced as an alert. It is 400px (`max-toast`), enters over `duration-evidence`, and stays until dismissed when it reports a failure or a stale seal.

Do not auto-dismiss anything that changes what the approver should do. Do not use toasts for approvals or confirmations of irreversible actions.
''')

# ---------------------------------------------------------------- Skeleton
preview('Skeleton', 'Status', 300, 'Loading text, block and a forecast-style graph placeholder', '''
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-row', style:{alignItems:'flex-start'}},
  h('div', {style:{width:260}}, h('div', {className:'label', style:{marginBottom:8}}, 'Evidence loading'), h(H.Skeleton, {lines:4})),
  h('div', {style:{width:200}}, h('div', {className:'label', style:{marginBottom:8}}, 'Metric'), h(H.Skeleton, {variant:'block', height:96})),
  h('div', null, h('div', {className:'label', style:{marginBottom:8}}, 'Graph computing'), h(H.Skeleton, {variant:'graph', width:360, height:160}))));
''')
readme('Skeleton', '''
# Skeleton

A skeleton holds the shape of content that is still being computed, so the layout does not jump when evidence or a simulation arrives.

Provide `variant`: `line` (text, with `lines`), `block` (a metric or panel, with `height`) or `graph` (nodes and edges in the forecast language: dashed rings and a dotted marching path, never a solid hostile thread or a Verdigris one). Text and block skeletons breathe at `duration-pulse` between 55% and 100%; there is no shimmer gradient. Reduced motion shows them still.

Never show a skeleton with placeholder numbers, and never show a skeleton where the business thread belongs: until the dependency map loads, show an explicit "Business dependencies loading" label instead of implying continuity.
''')

# ---------------------------------------------------------------- NodeGlyph
preview('NodeGlyph', 'Graph language', 360, 'Ten node shapes and four states', '''
var kinds = ['user','device','session','token','application','api','service','database','process','attacker'];
var rows = [['observed','Observed'],['forecast','Forecast'],['inferred','Inferred'],['verified','Verified']];
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-pad'},
  h('div', {style:{display:'grid', gridTemplateColumns:'90px repeat(10, 1fr)', gap:'14px 8px', alignItems:'center', maxWidth:900}},
    h('div'), kinds.map(function(k){ return h('div', {key:k, className:'label', style:{fontSize:9, textAlign:'center', fontFamily:'var(--font-mono)'}}, {user:'User',device:'Device',session:'Session',token:'Token',application:'App',api:'API',service:'Service',database:'Database',process:'Process',attacker:'Attacker'}[k]); }),
    rows.map(function(r){ return [h('div', {key:r[0], className:'label', style:{fontFamily:'var(--font-mono)', fontSize:10}}, r[1])].concat(kinds.map(function(k){ return h('div', {key:r[0]+k, style:{display:'flex', justifyContent:'center'}}, h(H.NodeGlyph, {kind:k, state:r[0], size:40})); })); }))));
''')
readme('NodeGlyph', '''
# NodeGlyph

Each kind of thing in the graph has its own silhouette, so a node can be identified without colour or a label, even at 16px.

Provide `kind`: `user` (circle), `device` (square), `session` (capsule), `token` (diamond), `application` (hexagon), `api` (right-pointing pentagon), `service` (cross), `database` (cylinder), `process` (rectangle with a Verdigris base bar, the only node that carries business colour), `attacker` (a sharp-cornered Ember triangle, the only filled node and the only one without rounding). Provide `state`: `observed` (solid Bone outline), `forecast` (dashed outline), `inferred` (long-dashed neutral outline), `held` (Ember at 30%), `verified` (a proof ring at the lower right). `size` defaults to 32; `caption` prints the name.

An attacker-controlled entity is always an `attacker` node, whatever it impersonates. Never fill a node with Ember or Verdigris except those two, and never use a shape for two kinds.
''')

# ---------------------------------------------------------------- EdgeStroke
preview('EdgeStroke', 'Graph language', 420, 'Six edge treatments, differing by form first', '''
var rows = [['observed','Observed relationship','Solid Ember 3px, evidence square'],['inferred','Inferred relationship','Neutral dashed 6 4, 1.5px'],['forecast','Forecast path','Dotted Ember 2 6, marching, dashed ring end'],
 ['dependency','Business dependency','Verdigris 2px, open ends'],['blocked','Blocked path','Ember to the cut, proof ring, held 30% beyond'],['preserved','Preserved path','Verdigris 8px, 3s pulse']];
ReactDOM.createRoot(document.getElementById('root')).render(h('div', {className:'halt-pad', style:{display:'grid', gridTemplateColumns:'240px 220px 1fr', gap:'14px 24px', alignItems:'center', maxWidth:900}},
  rows.map(function(r){ return [h(H.EdgeStroke,{key:r[0], kind:r[0]}), h('div',{key:r[0]+'n', style:{fontSize:14, fontWeight:600}}, r[1]), h('div',{key:r[0]+'d', className:'telemetry', style:{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--text-secondary)'}}, r[2])]; })));
''')
readme('EdgeStroke', '''
# EdgeStroke

An edge is a thread, and its stroke says what kind of relationship it is: stroke form (solid, dotted, dashed, thick) carries the meaning, colour only reinforces it.

Provide `kind`: `observed` (solid Ember 3px, Bone evidence square: every solid hostile segment links to an event), `inferred` (neutral dashed 6 4, 1.5px), `forecast` (dotted Ember 2 6, 2px, slow march, ends in a dashed ring), `dependency` (Verdigris 2px with open ends: a structural business link), `blocked` (Ember to the cut, a proof ring in the gap of 0.22x, then held Ember at 30%), `preserved` (Verdigris 8px with a 3s pulse: the confirmed live business thread). `width` and `animate` are optional; `animate={false}` and reduced motion show the end state.

The preserved path is the thickest line in the product on purpose. A hostile edge is never thicker than 3px, and a business edge is never dashed or dotted, because a broken business line means harm.
''')
