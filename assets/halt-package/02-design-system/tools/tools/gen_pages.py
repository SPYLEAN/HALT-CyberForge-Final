import os, re, json, textwrap
exec(open('tools/gen_components.py').read().split('# ---------------------------------------------------------------- HaltMark')[0])

def svg_inline(fname, cls='', style=''):
    s = open('project/assets/Logo/' + fname).read()
    s = re.sub(r'<title>.*?</title>', '', s)
    s = s.replace('#F1F0EA', 'currentColor').replace('#0E1214', 'currentColor')
    s = s.replace('<svg ', f'<svg class="{cls}" style="{style}" aria-hidden="true" ', 1)
    s = s.replace(' role="img"', '')
    s = re.sub(r' aria-label="[^"]*"', '', s)
    return s

def page(name, group, height, subtitle, css, body, script='', width=None):
    w = f' width={width}' if width else ''
    html = f'''<!-- @dsCard group="{group}" page height={height}{w} subtitle="{subtitle}" -->
<!doctype html>
<html>
<head><meta charset="utf-8"><title>{name}</title>
<style>
{textwrap.dedent(css).strip()}
</style></head>
<body>
{body}
{('<script>' + script + '</script>') if script else ''}
</body>
</html>
'''
    write(f'components/{name}/preview.html', html)

COMMON = '''
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-display);}
.wrap{padding:32px;display:flex;flex-direction:column;gap:32px}
.k{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--text-secondary);margin:0 0 8px}
h3{margin:0 0 4px;font-size:15px;font-weight:700}
p{margin:0;font-size:12.5px;line-height:19px;color:var(--text-secondary)}
.grid{display:grid;gap:16px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:16px}
.mono{font-family:var(--font-mono)}
table{border-collapse:collapse;width:100%}
td,th{text-align:left;padding:8px 12px 8px 0;border-top:1px solid var(--line);font-size:12px;line-height:18px;font-weight:400;vertical-align:top;color:var(--text)}
th{font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--text-secondary)}
td.m{font-family:var(--font-mono);font-size:11.5px}
'''

# =================================================================== LogoUse
dark_ground = 'background:var(--ink-fixed);color:var(--bone-fixed)'
logo_css = COMMON + '''
.on-dark{background:#0E1214;color:#F1F0EA}
.on-light{background:#F1F0EA;color:#0E1214}
.stage{display:flex;align-items:center;justify-content:center;gap:40px;padding:32px;border-radius:4px;border:1px solid var(--border-strong);min-height:140px}
.cap{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;margin-top:8px;color:var(--text-secondary)}
.mis{display:flex;flex-direction:column;gap:8px}
.mis .box{height:140px;border-radius:4px;border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
.mis .no{position:absolute;top:8px;left:8px;font-family:var(--font-mono);font-size:10px;letter-spacing:.09em;border:1px dashed var(--text);padding:2px 6px;border-radius:2px;color:var(--text);background:var(--bg)}
.ok{font-family:var(--font-mono);font-size:10px;letter-spacing:.09em}
'''
mark = lambda cls='', style='': svg_inline('halt-icon-bone.svg', cls, style)
horiz = lambda style='': svg_inline('halt-horizontal-bone.svg', '', style)
stack = lambda style='': svg_inline('halt-stacked-bone.svg', '', style)
fav = lambda style='': svg_inline('halt-favicon-bone.svg', '', style)

# clear-space diagram: mark in 16..80 x 6..90, margin 1.5x = 24
clear = '''<svg viewBox="-12 -22 120 140" width="240" height="280" style="color:currentColor" aria-hidden="true">
<rect x="-8" y="-18" width="112" height="132" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" opacity=".7" transform="translate(0 0)"/>
<g transform="translate(8 8)" opacity="1"><path fill="currentColor" fill-rule="evenodd" d="M64 6h16v84h-16zM28.0 42.0h36.0v12h-36.0zM16 18L24 10H32V36.5H16zM16 59.5h16v26.5h-16zM16.0 48a8 8 0 1 1 16 0a8 8 0 1 1 -16 0zM21.0 48a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z" transform="translate(-8 -8)"/></g>
</svg>'''
# build clear-space diagram precisely: mark occupies x 16..80, y 6..90 (x unit = 16). margin 24.
clear = '''<svg viewBox="-12 -26 120 148" width="228" height="280" aria-hidden="true" style="color:inherit">
<rect x="-8" y="-18" width="112" height="132" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"/>
<rect x="16" y="6" width="64" height="84" fill="none" stroke="currentColor" stroke-width=".6" opacity=".5"/>
<path fill="currentColor" fill-rule="evenodd" d="M64 6h16v84h-16zM28.0 42.0h36.0v12h-36.0zM16 18L24 10H32V36.5H16zM16 59.5h16v26.5h-16zM16.0 48a8 8 0 1 1 16 0a8 8 0 1 1 -16 0zM21.0 48a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z"/>
<g fill="currentColor" opacity=".35"><rect x="-8" y="6" width="24" height="16"/><rect x="80" y="6" width="24" height="16"/><rect x="16" y="-18" width="16" height="24"/><rect x="16" y="90" width="16" height="24"/></g>
<g font-family="IBM Plex Mono, monospace" font-size="7" fill="currentColor"><text x="-6" y="17">1.5x</text><text x="82" y="17">1.5x</text><text x="17" y="-6">1.5x</text><text x="17" y="106">1.5x</text></g>
</svg>'''

body = f'''
<div class="wrap">
<div>
<p class="k">Primary and compact placement</p>
<div class="grid" style="grid-template-columns:1fr 1fr">
<div><div class="stage on-dark">{horiz('height:56px;width:auto')}</div><div class="cap">PRIMARY · HORIZONTAL · DARK · top-left of the app top bar or marketing header, 1.5x clear space</div></div>
<div><div class="stage on-light">{svg_inline('halt-horizontal-ink.svg','','height:56px;width:auto')}</div><div class="cap">PRIMARY · HORIZONTAL · LIGHT · the same file, Ink version</div></div>
<div><div class="stage on-dark" style="gap:56px">{mark('', 'height:56px;width:auto')}{stack('height:112px;width:auto')}{fav('height:56px;width:auto')}</div><div class="cap">COMPACT · ICON IN THE RAIL AND BELOW 100px · STACKED FOR SQUARE SPACES · FAVICON CUT AT 16 TO 32px</div></div>
<div><div class="stage on-light" style="gap:56px">{svg_inline('halt-icon-ink.svg','','height:56px;width:auto')}{svg_inline('halt-stacked-ink.svg','','height:112px;width:auto')}{svg_inline('halt-favicon-ink.svg','','height:56px;width:auto')}</div><div class="cap">THE SAME THREE ON BONE</div></div>
</div>
</div>

<div style="display:grid;grid-template-columns:260px 1fr;gap:40px">
<div><p class="k">Clear space</p><div style="padding:16px;border:1px solid var(--border-strong);border-radius:4px;display:inline-block;color:var(--text)">{clear}</div>
<div class="cap" style="max-width:260px">x = stem width of the H (16 units of the 96 grid, 19% of mark height). Keep 1.5x clear on every side.</div></div>
<div>
<p class="k">Minimum size and file choice</p>
<table><thead><tr><th>Variant</th><th>Minimum</th><th>File (assets/Logo)</th><th>Where</th></tr></thead><tbody>
<tr><td>Icon</td><td class="m">24px · 8mm print</td><td class="m">halt-icon-bone.svg / ink</td><td>Rail, avatars, social, in-product marks</td></tr>
<tr><td>Favicon cut</td><td class="m">16px</td><td class="m">halt-favicon-bone.svg / ink</td><td>Tabs, bookmarks, 16 to 48px. Stem 18, solid node, gap 4</td></tr>
<tr><td>Horizontal</td><td class="m">100px wide</td><td class="m">halt-horizontal-*.svg</td><td>Top bar, marketing header, documents</td></tr>
<tr><td>Stacked</td><td class="m">80px wide</td><td class="m">halt-stacked-*.svg</td><td>Cover pages, square slots, loading screen</td></tr>
<tr><td>Wordmark alone</td><td class="m">56px wide</td><td class="m">outlined in horizontal</td><td>Never alone beside the icon</td></tr>
</tbody></table>
<p class="k" style="margin-top:24px">Colour</p>
<table><tbody>
<tr><td style="width:120px">Dark ground</td><td>Bone mark (<span class="mono">#F1F0EA</span> token <span class="mono">text</span>) on Ink (<span class="mono">bg</span>). 16.5:1.</td></tr>
<tr><td>Light ground</td><td>Ink mark on Bone. 16.5:1.</td></tr>
<tr><td>Other grounds</td><td>Choose Bone or Ink, whichever has 4.5:1 or more. Never place the mark on Ember or Verdigris fields.</td></tr>
<tr><td>Single ink</td><td>The SVG files are single colour. They are used through <span class="mono">&lt;img&gt;</span>, which cannot take CSS colour, so the file is chosen (bone or ink), not recoloured. HaltMark uses currentColor.</td></tr>
</tbody></table>
</div></div>

<div>
<p class="k">Favicon and application icon</p>
<div style="display:flex;gap:32px;align-items:flex-end;flex-wrap:wrap">
<div><div class="stage on-dark" style="padding:16px;min-height:0;gap:16px;align-items:flex-end">{fav('height:16px;width:16px')}{fav('height:32px;width:32px')}{fav('height:48px;width:48px')}</div><div class="cap">FAVICON 16 · 32 · 48 · SOLID NODE, NO HOLE</div></div>
<div><div style="width:160px;height:160px;border-radius:36px;background:#0E1214;color:#F1F0EA;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-strong)">{mark('','height:90px;width:auto')}</div><div class="cap">APP ICON · INK TILE · MARK 56% OF TILE</div></div>
<div><div style="width:160px;height:160px;border-radius:36px;background:#F1F0EA;color:#0E1214;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-strong)">{svg_inline('halt-icon-ink.svg','','height:90px;width:auto')}</div><div class="cap">LIGHT TILE · INK MARK</div></div>
<div style="max-width:300px"><p>The tile is square and full-bleed; the platform applies its own corner mask (the 36px radius here is illustrative). The mark is centred, never scaled past 60% of the tile, and never recoloured. Touch icon: 180px, Ink tile.</p></div>
</div></div>

<div>
<p class="k">Incorrect usage</p>
<div class="grid" style="grid-template-columns:repeat(4,1fr)">
<div class="mis"><div class="box on-dark"><span class="no">NO</span>{mark('','height:70px;width:auto;transform:scaleX(1.5)')}</div><p>Do not stretch or squash.</p></div>
<div class="mis"><div class="box on-dark"><span class="no">NO</span>{mark('','height:70px;width:auto;transform:rotate(14deg)')}</div><p>Do not rotate or tilt.</p></div>
<div class="mis"><div class="box on-dark"><span class="no">NO</span>{mark('','height:70px;width:auto;color:#D4572F')}</div><p>Do not colour it Ember or Verdigris. Both carry product meaning.</p></div>
<div class="mis"><div class="box on-dark"><span class="no">NO</span>{mark('','height:70px;width:auto;color:#F1F0EA;filter:drop-shadow(0 0 10px #3E9C86) drop-shadow(0 0 4px #3E9C86)')}</div><p>No glow, shadow or neon.</p></div>
<div class="mis"><div class="box on-dark"><span class="no">NO</span><svg viewBox="16 6 64 84" height="70" style="color:#F1F0EA"><path fill="none" stroke="currentColor" stroke-width="2" fill-rule="evenodd" d="M64 6h16v84h-16zM28.0 42.0h36.0v12h-36.0zM16 18L24 10H32V36.5H16zM16 59.5h16v26.5h-16zM16.0 48a8 8 0 1 1 16 0a8 8 0 1 1 -16 0z"/></svg></div><p>No outline-only or hollow version.</p></div>
<div class="mis"><div class="box on-dark"><span class="no">NO</span><div style="width:92px;height:92px;border:2px solid #F1F0EA;border-radius:50%;display:flex;align-items:center;justify-content:center">{mark('','height:52px;width:auto')}</div></div><p>No badge, shield, lock or circle container.</p></div>
<div class="mis"><div class="box" style="background:#59656B;color:#707D84"><span class="no">NO</span>{mark('','height:70px;width:auto')}</div><p>No low-contrast ground. Under 4.5:1 is refused.</p></div>
<div class="mis"><div class="box on-dark"><span class="no">NO</span><div style="display:flex;align-items:center;gap:0">{mark('','height:44px;width:auto')}<span style="font-family:var(--font-display);font-weight:400;font-size:34px;font-stretch:100%;margin-left:2px;letter-spacing:.02em">Halt</span></div></div><p>No retyped wordmark or crowding. Use the supplied lockup.</p></div>
</div></div>
</div>
'''
page('LogoUse', 'Brand', 1900, 'Placement, clear space, minimum size, favicon, misuse', logo_css, body, width=960)
readme('LogoUse', '''
# LogoUse

Place the logo only as the supplied SVG files in `assets/Logo/`, or as HaltMark, on `bg` or `text` grounds, with 1.5x clear space, never recoloured.

This card is a showcase of the brand application rules; the full text is in the brand book. It shows the primary horizontal and compact icon on dark and light, clear space, minimum sizes, favicon and application icon, and eight forbidden treatments.
''')

# =================================================================== SemanticMap
roles = [
 ('Page background', 'bg', 'Ink / Bone', 'Ground. Everything else is a step off it.', 'Quiet ground lets the two threads be the loudest things on the page.'),
 ('Elevated surface', 'surface-raised', 'Ink +1 step / white', 'Drawers, dialogs, tooltips, toasts. With a 1px ring.', 'Separation without shadow: nothing floats over the business thread.'),
 ('Primary text', 'text', 'Bone / Ink', 'Headlines, body, data values.', 'Evidence first: readable at 13.8:1 or more.'),
 ('Secondary text', 'text-secondary', 'Grey step', 'Labels, IDs, derivations.', 'Derivations always visible, never faint: 6:1 or more.'),
 ('Observed threat', 'threat-observed', 'Ember', 'Solid hostile thread, evidence marker, attacker node.', 'The attack, shown only where evidence exists.'),
 ('Forecast threat', 'threat-forecast', 'Ember (alias)', 'Same hue as observed; told apart by dotted stroke and dashed ring.', 'Uncertain futures never look like facts.'),
 ('Business continuity', 'business', 'Verdigris', 'Preserved thread, dependency edge, healthy process.', 'The thing HALT promises not to stop.'),
 ('Verified proof', 'proof-ring', 'Bone + Verdigris core', 'Proof ring with business-coloured centre.', 'A verified claim is a claim about preserved business operation.'),
 ('Warning', 'warning', 'Text colour, no hue', 'Triangle glyph, CAUTION, dashed border.', 'Never confusable with hostile or healthy.'),
 ('Success', 'success', 'Verdigris text', 'Check glyph and word: APPLIED, VERIFIED.', 'Success means the business kept running.'),
 ('Neutral evidence', 'neutral-evidence', 'Neutral grey', 'Inferred edges, evidence marker outlines.', 'What HALT infers is not what it observed.'),
 ('Disabled state', 'text-disabled', 'Grey, lowest step', 'Disabled labels with a stated reason.', 'Execute is disabled until both humans approve.'),
]
rows = ''.join(f'''<div class="tile" style="display:grid;grid-template-columns:72px 1fr;gap:16px;align-items:start">
<div style="width:72px;height:72px;border-radius:4px;background:var(--{tok});border:1px solid var(--border-strong)"></div>
<div><div class="k" style="margin-bottom:2px">{role}</div><h3 class="mono" style="font-size:13px;font-weight:500">--{tok}</h3><p style="color:var(--text)">{use}</p><p style="margin-top:4px">{why}</p></div></div>''' for role, tok, src, use, why in roles)
page('SemanticMap', 'Colour', 960, 'Twelve roles mapped to four brand colours and neutrals', COMMON, f'''
<div class="wrap"><div><p class="k">Semantic mapping · themes switch with the page</p><div class="grid" style="grid-template-columns:repeat(2,1fr)">{rows}</div></div>
<p>Four brand colours (Ink, Bone, Ember, Verdigris) plus a neutral ramp carry all twelve roles. No other hue exists. Warning and Success add no colour: Warning is the text colour with a triangle and a dashed border, Success is Verdigris with a check and a word.</p></div>''', width=960)
readme('SemanticMap', '''
# SemanticMap

Twelve UI roles resolve to four brand colours and a neutral ramp: pick the role token, never the brand hex.

Use `bg`, `surface`, `surface-raised` for ground; `text`, `text-secondary`, `text-disabled` for text; `threat-observed`, `threat-forecast` for hostile paths; `business`, `proof-ring` with `proof-core`, `success` for business and proof; `warning` and `neutral-evidence` for the rest. The card re-renders in both themes: switch the theme and check that every swatch keeps its role.
''')

# =================================================================== GridSystem
grid_css = COMMON + '''
.cols{display:grid;grid-template-columns:repeat(12,1fr);gap:24px;height:72px}
.cols i{background:var(--surface-raised);border:1px solid var(--line);display:block}
.app{display:grid;grid-template-columns:232px 1fr 360px;grid-template-rows:64px 1fr;height:260px;border:1px solid var(--border-strong);border-radius:4px;overflow:hidden}
.app > div{display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;color:var(--text-secondary)}
.bar{height:16px;background:var(--text);border-radius:0}
.elev{height:88px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-family:var(--font-mono);font-size:11px;background:var(--surface-raised)}
'''
sp = [4, 8, 12, 16, 24, 32, 48, 64, 96]
spbars = ''.join(f'<div style="display:flex;align-items:center;gap:12px"><span class="mono" style="width:70px;font-size:11px">space-{i+1}</span><span class="bar" style="width:{v}px"></span><span class="mono" style="font-size:11px;color:var(--text-secondary)">{v}px</span></div>' for i, v in enumerate(sp))
body = f'''<div class="wrap">
<div><p class="k">12-column marketing grid · 1200px max, 24px gutter, 64px margin</p><div class="cols">{'<i></i>'*12}</div></div>
<div><p class="k">Product application grid · rail 232 · top bar 64 · main 12 fluid columns · inspector 360</p>
<div class="app"><div style="grid-row:1/3;background:var(--surface);border-right:1px solid var(--line)">RAIL 232</div><div style="background:var(--surface);border-bottom:1px solid var(--line)">TOP BAR 64 · SIMULATED chip lives here</div><div style="grid-row:1/3;background:var(--surface);border-left:1px solid var(--line)">INSPECTOR 360</div><div style="padding:24px"><div class="cols" style="width:100%;height:100%;gap:24px;grid-template-columns:repeat(12,1fr)">{'<i></i>'*12}</div></div></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px">
<div><p class="k">Spacing · 4px base, 8px rhythm</p><div style="display:flex;flex-direction:column;gap:8px">{spbars}</div></div>
<div><p class="k">Borders and radius</p>
<div style="display:flex;flex-direction:column;gap:12px">
<div style="border:1px solid var(--line);padding:12px;border-radius:4px;font-size:12px">hairline 1px <span class="mono">line</span>: dividers</div>
<div style="border:1px solid var(--border-strong);padding:12px;border-radius:4px;font-size:12px">control 1px <span class="mono">border-strong</span></div>
<div style="border:1px dashed var(--threat-observed);padding:12px;border-radius:4px;font-size:12px">forecast hostile: dashed Ember</div>
<div style="border:1px solid var(--business);padding:12px;border-radius:4px;font-size:12px">preserved: Verdigris</div>
<div style="display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border:1px solid var(--border-strong);border-radius:0"></div><div style="width:44px;height:44px;border:1px solid var(--border-strong);border-radius:2px"></div><div style="width:44px;height:44px;border:1px solid var(--border-strong);border-radius:4px"></div><div style="width:44px;height:44px;border:1px solid var(--border-strong);border-radius:50%"></div><span class="mono" style="font-size:10.5px;color:var(--text-secondary)">0 · 2 · 4 · node</span></div>
</div></div>
<div><p class="k">Elevation · surface step plus 1px ring</p>
<div style="display:flex;flex-direction:column;gap:12px">
<div class="elev" style="background:var(--bg);box-shadow:var(--elevation-0)">0 · page · none</div>
<div class="elev" style="box-shadow:var(--elevation-1)">1 · card, toast, tooltip</div>
<div class="elev" style="box-shadow:var(--elevation-2)">2 · drawer, dialog</div>
</div></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">
<div><p class="k">Breakpoints</p><table><tbody>
<tr><td class="m" style="width:100px">bp-sm 640</td><td>Phone. One column, rail becomes a bottom bar, derivations inline.</td></tr>
<tr><td class="m">bp-md 960</td><td>Tablet. Rail shows index numbers, inspector becomes a sheet.</td></tr>
<tr><td class="m">bp-lg 1280</td><td>Laptop. Full rail, graph plus inspector.</td></tr>
<tr><td class="m">bp-xl 1600</td><td>Wide. The graph canvas grows, panels keep their width.</td></tr></tbody></table></div>
<div><p class="k">Maximum content widths</p><table><tbody>
<tr><td class="m" style="width:130px">max-marketing</td><td>1200px</td></tr><tr><td class="m">max-app</td><td>1440px design width; canvas grows beyond</td></tr><tr><td class="m">max-prose</td><td>640px</td></tr>
<tr><td class="m">max-drawer</td><td>480px</td></tr><tr><td class="m">max-dialog</td><td>560px</td></tr><tr><td class="m">max-toast</td><td>400px</td></tr></tbody></table></div>
</div></div>'''
page('GridSystem', 'Layout', 1120, 'Grids, spacing, borders, radius, elevation, breakpoints', grid_css, body, width=960)
readme('GridSystem', '''
# GridSystem

Lay out marketing pages on a 12-column grid and product screens on rail, top bar, 12-column main and inspector, with every gap a spacing token.

This card shows the grid tokens drawn at 960px. The graph canvas is the main region and dominates: panels and tables are the supporting cast. No shadows, no blur: elevation is a surface step plus a 1px ring.
''')

# =================================================================== MotionSpec
motion_css = COMMON + '''
.demo{height:72px;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.demo svg{display:block}
button.rp{box-sizing:border-box;min-height:44px;padding:0 14px;border:1px solid var(--border-strong);border-radius:4px;background:transparent;color:var(--text);font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;cursor:pointer}
button.rp:hover{background:var(--text);color:var(--bg)}
button.rp:focus-visible{outline:none;box-shadow:var(--focus-ring)}
.row{display:grid;grid-template-columns:150px 1.2fr 190px 190px 220px 90px;gap:16px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.row .t{font-size:14px;font-weight:600}
.row .why{font-size:12px;line-height:18px;color:var(--text-secondary)}
.row .tok{font-family:var(--font-mono);font-size:11px;line-height:17px}
/* every animation is a FROM state; the base state is the end state, so reduced motion shows the end */
.m1.go .line{animation:m1 var(--duration-approach) var(--ease-approach) both}
@keyframes m1{from{stroke-dashoffset:180}}
.m2.go .sq{animation:m2 var(--duration-evidence) var(--ease-out) both;transform-origin:center;transform-box:fill-box}
@keyframes m2{from{opacity:0;transform:scale(.5)}}
.m3.go .n{animation:m3 var(--duration-expand) var(--ease-out) both}
.m3.go .n:nth-of-type(2){animation-delay:60ms}.m3.go .n:nth-of-type(3){animation-delay:120ms}.m3.go .n:nth-of-type(4){animation-delay:180ms}
@keyframes m3{from{opacity:0;transform:translateX(-14px)}}
.m4.go .gap{animation:m4 var(--duration-cut) var(--ease-cut) both}
@keyframes m4{from{width:0;x:120px}}
.m4.go .proof{animation:m4p var(--duration-proof) var(--ease-out) 700ms both}
@keyframes m4p{from{opacity:0}}
.m5.go .lbl{animation:m5 var(--duration-switch) var(--ease-standard) both}
@keyframes m5{from{opacity:0}}
.m6.go .ring{animation:m6 var(--duration-proof) var(--ease-out) both}
@keyframes m6{from{stroke-dashoffset:60}}
.m6.go .core{animation:m6c 240ms var(--ease-out) 420ms both;transform-origin:center;transform-box:fill-box}
@keyframes m6c{from{transform:scale(0)}}
.m7 .fill{transform-origin:left;transform:scaleX(1)}
.m7.go .fill{animation:m7 var(--duration-approval) var(--ease-out) both}
@keyframes m7{from{transform:scaleX(0)}}
.m8.go .gap{animation:m8 var(--duration-cut) var(--ease-standard) both}
@keyframes m8{from{width:52px;x:94px}}
@media (prefers-reduced-motion: reduce){ *{animation:none !important} }
'''
def demo(n, inner):
    return f'<div class="demo m{n}" id="m{n}">{inner}</div>'
d1 = demo(1, '<svg width="240" height="40" viewBox="0 0 240 40"><path d="M8 20H160" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="3 5" fill="none"/><path class="line" d="M8 20H160" stroke="var(--threat-observed)" stroke-width="3" fill="none" stroke-dasharray="180" stroke-dashoffset="0"/><rect x="164" y="12" width="16" height="16" fill="var(--bg)" stroke="var(--text)" stroke-width="2.5"/><path d="M190 20H232" stroke="var(--business)" stroke-width="8" fill="none"/></svg>')
d2 = demo(2, '<svg width="240" height="40" viewBox="0 0 240 40"><path d="M16 20H224" stroke="var(--threat-observed)" stroke-width="3"/><rect class="sq" x="112" y="14" width="12" height="12" fill="var(--text)"/><text x="130" y="31" class="svgm" font-size="9" fill="var(--text-secondary)">EV-03</text></svg>')
d3 = demo(3, '<svg width="240" height="40" viewBox="0 0 240 40"><g class="n"><circle cx="30" cy="20" r="9" fill="var(--bg)" stroke="var(--text)" stroke-width="2.5"/></g><g class="n"><rect x="76" y="11" width="18" height="18" rx="2" fill="var(--bg)" stroke="var(--text)" stroke-width="2.5"/></g><g class="n"><polygon points="130,10 140,20 130,30 120,20" fill="var(--bg)" stroke="var(--text)" stroke-width="2.5"/></g><g class="n"><circle cx="190" cy="20" r="9" fill="var(--bg)" stroke="var(--threat-observed)" stroke-width="2.5" stroke-dasharray="3.5 3.5"/></g></svg>')
d4 = demo(4, '<svg width="240" height="48" viewBox="0 0 240 48"><path d="M10 14H230" stroke="var(--threat-observed)" stroke-width="3"/><rect class="gap" x="94" y="6" width="52" height="16" fill="var(--surface)"/><circle class="proof" cx="120" cy="14" r="8" fill="var(--bg)" stroke="var(--proof-ring)" stroke-width="3"/><circle class="proof" cx="120" cy="14" r="2.8" fill="var(--proof-core)"/><path d="M10 38H230" stroke="var(--business)" stroke-width="8" stroke-opacity=".6"/></svg>')
d5 = demo(5, '<svg width="240" height="40" viewBox="0 0 240 40"><path d="M10 34H230" stroke="var(--business)" stroke-width="6" stroke-opacity=".6"/><text class="lbl svgm" x="12" y="18" font-size="11" fill="var(--text)" id="m5t">FUTURE C · MINIMUM-SAFE</text></svg>')
d6 = demo(6, '<svg width="240" height="40" viewBox="0 0 240 40"><circle class="ring" cx="120" cy="20" r="10" fill="var(--bg)" stroke="var(--proof-ring)" stroke-width="3" stroke-dasharray="63" stroke-dashoffset="0"/><circle class="core" cx="120" cy="20" r="3.8" fill="var(--proof-core)"/></svg>')
d7 = demo(7, '<svg width="240" height="48" viewBox="0 0 240 48"><rect x="30" y="6" width="180" height="36" rx="4" fill="none" stroke="var(--text)" stroke-width="1.5"/><rect class="fill" x="30.75" y="6.75" width="178.5" height="34.5" rx="3" fill="var(--business)" fill-opacity=".35"/><text x="46" y="29" class="svgm" font-size="11" fill="var(--text)">APPROVED · 10:07 UTC</text></svg>')
d8 = demo(8, '<svg width="240" height="48" viewBox="0 0 240 48"><path d="M10 14H230" stroke="var(--threat-observed)" stroke-width="3"/><rect class="gap" x="120" y="6" width="0" height="16" fill="var(--surface)"/><path d="M10 38H230" stroke="var(--business)" stroke-width="8" stroke-opacity=".6"/></svg>')
M = [
 ('Threat propagation', 'Show the attack accelerating toward the target, so the cut feels late and necessary.', 'duration-approach 2200ms', 'ease-approach (.55,0,1,.45)', 'Hostile line draws from the compromised node toward the target, one pass.', d1),
 ('Evidence appearance', 'Evidence arrives; it does not perform. Quick and calm.', 'duration-evidence 240ms', 'ease-out (.2,.8,.2,1)', 'Square marker scales from 50% and fades in on the hostile segment.', d2),
 ('Graph expansion', 'Reveal the next hop of the graph in reading order.', 'duration-expand 480ms +60ms stagger', 'ease-out (.2,.8,.2,1)', 'Nodes slide 14px from the left and fade in, staggered by hop.', d3),
 ('Path interruption', 'Show the cut: danger breaks, the business keeps moving.', 'duration-cut 900ms, proof 600ms', 'ease-cut (.16,.84,.3,1)', 'A gap opens in the hostile line, a proof ring lands in it; the Verdigris thread never pauses.', d4),
 ('Simulation switching', 'Move between futures A, B, C without the business thread flickering.', 'duration-switch 360ms', 'ease-standard (.4,0,.2,1)', 'Only the hostile layer and labels cross-fade; the Verdigris thread is untouched.', d5),
 ('Proof verification', 'A claim is checked, then confirmed: a precise signal, not a celebration.', 'duration-proof 600ms', 'ease-out (.2,.8,.2,1)', 'Bone ring draws clockwise, then the Verdigris centre scales in.', d6),
 ('Human approval', 'Make the human decision feel deliberate and immediate.', 'duration-approval 240ms', 'ease-out (.2,.8,.2,1)', 'The button border turns Verdigris and a tint fills left to right; no confetti, no sound.', d7),
 ('Rollback', 'Reverse the response truthfully: the paths reopen at the speed they closed.', 'duration-cut 900ms', 'ease-standard (.4,0,.2,1)', 'The gap closes, the hostile line is whole again and the seal ring is revoked.', d8),
]
mrows = ''.join(f'<div class="row"><div class="t">{i+1}. {t}</div><div><div class="why">{why}</div><div class="beh">{beh}</div></div><div class="tok">{dur}<br><span style="color:var(--text-secondary)">{eas}</span></div>{d}<div><button class="rp" data-t="m{i+1}" aria-label="Replay {t}">REPLAY</button></div></div>' for i, (t, why, dur, eas, beh, d) in enumerate(M))
mbody = f'''<div class="wrap"><div><p class="k">Eight motions · purpose, duration, easing · every demo replays · reduced motion shows the end state</p>
<div class="row" style="border-top:1px solid var(--border-strong);padding:8px 0"><p class="k" style="margin:0">Motion</p><p class="k" style="margin:0">Purpose</p><p class="k" style="margin:0">Duration · easing</p><p class="k" style="margin:0">Demo</p><p class="k" style="margin:0">Replay</p></div>
{mrows}</div>
<p>Ambient loops: the forecast thread marches (<span class="mono">duration-march</span> 1800ms, linear) and the preserved thread pulses (<span class="mono">duration-pulse</span> 3000ms, linear). Linear is deliberate: constant flow reads as steady business operation.</p></div>'''
mscript = '''
var labels = ['FUTURE A · AGGRESSIVE ISOLATION','FUTURE B · PASSIVE MONITORING','FUTURE C · MINIMUM-SAFE'], li = 2;
function play(id){ var el = document.getElementById(id); if(!el) return; el.classList.remove('go'); void el.getBoundingClientRect(); el.classList.add('go'); }
document.querySelectorAll('button.rp').forEach(function(b){ b.addEventListener('click', function(){ var id = b.getAttribute('data-t'); if(id==='m5'){ li=(li+1)%3; document.getElementById('m5t').textContent = labels[li]; } play(id); }); });
'''
# demo rows are 6 grid columns: widen
motion_css = motion_css.replace('.row{display:grid;grid-template-columns:150px 1.2fr 190px 190px 220px 90px;gap:16px', '.row{display:grid;grid-template-columns:120px minmax(0,1fr) 178px 240px 76px;gap:16px') + '.svgm{font-family:var(--font-mono)}.row .beh{font-size:11.5px;line-height:17px;color:var(--text);margin-top:6px}'
page('MotionSpec', 'Motion', 1100, 'Eight motions with duration, easing and live replay', motion_css, mbody, mscript, width=960)
readme('MotionSpec', '''
# MotionSpec

Motion in HALT has one job: show the attack being stopped while the business keeps moving, so animate hostile layers and proofs, and never the business thread except its steady pulse.

Use the `duration-*` and `ease-*` tokens listed on the card, never literal milliseconds. Every animation is authored as a from-state onto the end state, so `prefers-reduced-motion` and `motion={false}` show the finished state with no animation. Do not add bounce, shake, glow, screen flash or sound to alerts, approvals or proofs.
''')
