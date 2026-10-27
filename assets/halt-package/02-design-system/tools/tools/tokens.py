import json, sys

# ---- colour tokens: (name, dark, light, usage) -------------------------------------------
C = [
 ("bg", "#0E1214", "#F1F0EA", "Page background. Ink in the dark theme, Bone in the light theme. Every text token below is checked on bg, surface and surface-raised."),
 ("surface", "#151B1E", "#FAF9F5", "Panels, rails, table bands and the app top bar, one step off bg. Body text and labels sit on it."),
 ("surface-raised", "#1C2428", "#FFFFFF", "Elevated surface: drawers, dialogs, tooltips, toasts, menus. Elevation is a surface step plus a 1px ring, never a shadow or blur."),
 ("line", "#232B30", "#D6D8D1", "Hairline dividers between rows and panels. Decorative only: never the sole edge of a control, never carries meaning."),
 ("border-strong", "#707D84", "#6B767B", "Control borders, input outlines and the outline of every chip and button that carries meaning. At least 3:1 on bg, surface and surface-raised in both themes."),
 ("text", "#F1F0EA", "#0E1214", "Primary text and icons on bg, surface and surface-raised. Bone on Ink in the dark theme, Ink on Bone in the light theme."),
 ("text-secondary", "#9AA3A8", "#4A565C", "Secondary text, labels, IDs and derivations on bg, surface and surface-raised. At least 6:1 in both themes."),
 ("text-disabled", "#59656B", "#8A9398", "Disabled labels and controls only. Exempt from contrast because the control is inoperable; always paired with a stated reason."),
 ("disabled-border", "#3A454B", "#BFC3BC", "Outline of a disabled control. Not a meaning-carrying mark."),
 ("threat-observed", "#D4572F", "#C94A22", "Observed threat: solid hostile thread, evidence marker, attacker-controlled node. Ember means hostile and nothing else. Mark colour, 3:1 or more on bg, surface and surface-raised. Light theme value is Ember deepened for contrast on Bone."),
 ("threat-forecast", "{threat-observed}", "{threat-observed}", "Forecast threat: same Ember hue as observed, told apart by form, never by colour. Dotted 2 6 stroke, dashed-ring node, likelihood label."),
 ("threat-text", "#EC7B56", "#A83E1B", "Hostile-coloured TEXT on bg, surface, surface-raised and threat-soft. A lighter Ember in the dark theme and a deeper Ember in the light theme, because the brand Ember misses 4.5:1 as small text on surfaces."),
 ("threat-soft", "#D4572F26", "#C94A221F", "Tint behind hostile text: blocked-path rows, hostile chip fill. Carries threat-text."),
 ("threat-held", "#D4572F4D", "#C94A224D", "Held: the downstream part of a path that can no longer be reached, Ember at 30%. Intentionally quiet and exempt from 3:1 because every held segment is also labelled HELD."),
 ("business", "#3E9C86", "#2A7C69", "Business continuity: the preserved thread, a dependency edge, a healthy process node. Verdigris means business and nothing else. 3:1 or more as a mark on every surface. Light theme value is Verdigris deepened for Bone."),
 ("business-text", "#52B8A1", "#256B5A", "Business-coloured TEXT on bg, surface, surface-raised and business-soft. At least 4.5:1."),
 ("business-soft", "#3E9C8626", "#2A7C6924", "Tint behind business text: preserved-path rows, success chip fill. Carries business-text."),
 ("proof-ring", "#F1F0EA", "#0E1214", "Verified proof: the outer ring of the proof signal and the ProofSeal timeline. Bone in the dark theme, Ink in the light theme. Always paired with proof-core."),
 ("proof-core", "#3E9C86", "#2A7C69", "Centre of the proof signal: Verdigris, because a verified claim is a claim about preserved business operation."),
 ("warning", "{text}", "{text}", "Warning: no new hue. Rendered as text colour with a triangle glyph, the word CAUTION and a dashed border, so it never reads as hostile (Ember) or healthy (Verdigris)."),
 ("success", "{business-text}", "{business-text}", "Success: an applied, verified or restored state. Business colour with a check glyph and a word such as APPLIED or VERIFIED, never colour alone."),
 ("neutral-evidence", "#707D84", "#5E6A70", "Neutral evidence and inferred relationships: dashed 6 4 edge, evidence-row marker, inferred node outline. At least 3:1 on bg, surface and surface-raised."),
 ("on-threat", "#0E1214", "#FFFFFF", "Text and icons on a solid threat-observed fill (a hostile node label or chip). Ink on Ember in the dark theme, white on deepened Ember in the light theme."),
 ("on-business", "#0E1214", "#FFFFFF", "Text and icons on a solid business fill."),
 ("on-bone", "#0E1214", "#F1F0EA", "Text on a solid Bone control fill. In the dark theme this is the primary button label; in the light theme the primary button is Ink, so this is Bone."),
 ("action-fill", "#F1F0EA", "#0E1214", "Fill of the primary button and selected state. Bone on Ink, flipped in the light theme. Hover is action-fill-hover."),
 ("action-fill-hover", "#FFFFFF", "#2A3338", "Hover fill of the primary button."),
 ("scrim", "#0E1214CC", "#0E121499", "Overlay behind dialogs. Dims the graph but never hides the business thread entirely."),
]

SP = [("space-1","4px","Base unit. Icon-to-label gaps, chip padding."),("space-2","8px","Rhythm unit. Inline gaps, small padding."),("space-3","12px","Row padding, label-to-value gap."),("space-4","16px","Card and panel padding, form gaps."),("space-5","24px","Gutter of the product grid, section gaps in a panel."),("space-6","32px","Page margin in the product grid, gap between panels."),("space-7","48px","Gap between sections on a screen."),("space-8","64px","Marketing page margin, hero padding."),("space-9","96px","Marketing section gap."),("hit-target","44px","Minimum height and width of every interactive control.")]
RAD = [("radius-none","0","Hairline tables, graph canvas edges."),("radius-sm","2px","Chips, tags and evidence markers."),("radius-md","4px","The HALT radius: buttons, inputs, panels, drawers, dialogs, tooltips, toasts."),("radius-node","50%","Circular graph nodes only (User, Session ring). Never a UI container.")]
BW = [("border-hairline","1px","Every divider and control outline."),("border-focus","2px","Focus ring ring-width, offset by 2px of page colour."),("edge-neutral","1.5px","Inferred and neutral edges."),("edge-threat-forecast","2px","Forecast hostile edge."),("edge-threat-observed","3px","Observed hostile edge."),("edge-business-dependency","2px","Business dependency edge."),("edge-business-preserved","8px","Preserved business thread. The thickest line in the product on purpose.")]
Z = [("z-rail","10","App rail."),("z-topbar","20","App top bar."),("z-drawer","30","Right-hand inspector drawer."),("z-dialog","40","Modal dialog and its scrim."),("z-tooltip","50","Tooltip."),("z-toast","60","Toast region.")]
BP = [("bp-sm","640px","Phone. Single column, rail becomes bottom bar."),("bp-md","960px","Tablet. Rail collapses to icons, inspector becomes a drawer."),("bp-lg","1280px","Laptop. Full rail, graph plus inspector."),("bp-xl","1600px","Wide. Graph canvas grows, panels stay fixed width.")]
MW = [("max-marketing","1200px","Marketing content column."),("max-prose","640px","Long reading text, 70 characters."),("max-app","1440px","Product screen design width; the canvas grows beyond this, panels do not."),("max-drawer","480px","Inspector drawer."),("max-dialog","560px","Dialog."),("max-toast","400px","Toast.")]
LAY = [("marketing-columns","12","Marketing grid: 12 columns."),("marketing-gutter","24px","Marketing column gutter (space-5)."),("marketing-margin","64px","Marketing page margin (space-8), 32px below bp-md."),("app-rail-width","232px","Product application grid: fixed rail."),("app-topbar-height","64px","Product application grid: fixed top bar."),("app-inspector-width","360px","Product application grid: right inspector column."),("app-columns","12","Product application grid: 12 fluid columns inside the main region."),("app-gutter","24px","Product grid gutter (space-5)."),("app-margin","32px","Product grid page margin (space-6).")]
DUR = [("duration-fast","120ms","Hover and focus changes on controls."),("duration-evidence","240ms","Evidence appearance. Quick and calm: evidence arrives, it does not perform."),("duration-approval","240ms","Human approval state change."),("duration-switch","360ms","Simulation switching between futures A, B, C."),("duration-expand","480ms","Graph expansion, 60ms stagger per hop."),("duration-proof","600ms","Proof verification: ring draws, then centre fills."),("duration-cut","900ms","Path interruption and rollback reopen."),("duration-approach","2200ms","Threat propagation toward the target, one pass."),("duration-march","1800ms","Forecast thread march, looped, ambient."),("duration-pulse","3000ms","Business thread pulse, looped, ambient."),("duration-loop","8000ms","Whole containment loop on the brand surfaces.")]
EAS = [("ease-approach","cubic-bezier(.55,0,1,.45)","Threat propagation: accelerates toward the target, so the cut feels late and decisive."),("ease-out","cubic-bezier(.2,.8,.2,1)","Evidence, expansion, proof: arrives fast, settles softly."),("ease-cut","cubic-bezier(.16,.84,.3,1)","Path interruption: snaps shut, then holds."),("ease-standard","cubic-bezier(.4,0,.2,1)","Simulation switching and rollback: symmetrical, deliberate."),("ease-linear","linear","Pulse and march: constant, so the business thread reads as steady flow.")]

def fam(rows, extra=False):
    return {"note": "", "tokens": [{"name": n, "value": v, "usage": u} for n, v, u in rows]}

tokens = {
 "name": "HALT", "version": 1,
 "meta": {"note": "Palette and typefaces were not attached. Brand values (Ink 0E1214, Bone F1F0EA, Ember D4572F, Verdigris 3E9C86) and the type (Archivo, IBM Plex Mono) are provisional; swap token values and nothing else changes."},
 "color": {
  "themes": [{"id": "dark", "name": "Ink (dark)"}, {"id": "light", "name": "Bone (light)"}],
  "tokens": [{"name": n, "value": ({"dark": d, "light": l}), "usage": u} for n, d, l, u in C],
 },
 "type": {
  "fonts": [],
  "families": {
   "display": "\"Archivo\", ui-sans-serif, system-ui, \"Segoe UI\", sans-serif",
   "mono": "\"IBM Plex Mono\", ui-monospace, \"SF Mono\", Menlo, monospace",
  },
  "groups": [
   {"name": "Product", "family": "display", "note": "Eight roles. Archivo carries headlines, body and evidence prose; IBM Plex Mono carries labels, data and telemetry. Display and product titles set font-stretch 108% to 112% in bundle.css.", "styles": [
    {"name": "display-headline", "fontSize": "40px", "lineHeight": "44px", "fontWeight": 700, "letterSpacing": "0", "sample": "Stop the attack. Not the business.", "usage": "Marketing hero and canvas titles. One per page. font-stretch 112%."},
    {"name": "section-headline", "fontSize": "20px", "lineHeight": "26px", "fontWeight": 700, "letterSpacing": "0", "sample": "Four claims, each tied to evidence", "usage": "Panel and section headings inside a screen. font-stretch 108%."},
    {"name": "product-title", "fontSize": "30px", "lineHeight": "33px", "fontWeight": 700, "letterSpacing": "0", "sample": "Approve, execute, and keep the way back open", "usage": "The H1 of each product screen (ThreadGraph, EchoLab, SafeCut, ProofSeal, Action Gate). font-stretch 108%."},
    {"name": "body", "fontSize": "14px", "lineHeight": "21px", "fontWeight": 400, "letterSpacing": "0", "sample": "Revokes the malicious OAuth grant and nothing else.", "usage": "Running text and descriptions on bg, surface and surface-raised. Archivo 400, 600 for emphasis."},
    {"name": "evidence-text", "fontSize": "12.5px", "lineHeight": "19px", "fontWeight": 400, "letterSpacing": "0", "sample": "Token replay for S-1 from a new ASN, four minutes after the real sign-in.", "usage": "Quoted evidence summaries and derivations in evidence rows and claims. text-secondary on surfaces, text in a focused row."},
    {"name": "label", "fontSize": "10.5px", "lineHeight": "16px", "fontWeight": 400, "letterSpacing": "0.09em", "family": "mono", "sample": "OBSERVED · EV-03", "usage": "Uppercase section labels, chip words and column heads. IBM Plex Mono, tracked .09em, text-secondary."},
    {"name": "data-value", "fontSize": "28px", "lineHeight": "32px", "fontWeight": 500, "letterSpacing": "0", "family": "mono", "sample": "0 of 6", "usage": "Metric values: counts, never bare scores. IBM Plex Mono 500, tabular figures, always followed by its derivation line."},
    {"name": "telemetry", "fontSize": "11.5px", "lineHeight": "18px", "fontWeight": 400, "letterSpacing": "0", "family": "mono", "sample": "sha256 9f3a…c41e · SC-2417-14 · 10:06:12Z", "usage": "IDs, hashes, timestamps, solver certificates, code. IBM Plex Mono 400, text on surfaces."},
   ]}
  ],
 },
 "shadow": {"note": "HALT has no shadows and no blur. Elevation is a surface step plus a 1px ring; these tokens are the rings.", "tokens": [
  {"name": "elevation-0", "value": "none", "usage": "Page level: no ring. bg and surface panels separate by line hairlines."},
  {"name": "elevation-1", "value": {"dark": "0 0 0 1px #232B30", "light": "0 0 0 1px #D6D8D1"}, "usage": "Cards, tooltips and toasts on surface-raised: a 1px ring in line colour."},
  {"name": "elevation-2", "value": {"dark": "0 0 0 1px #707D84", "light": "0 0 0 1px #6B767B"}, "usage": "Drawers and dialogs: a 1px ring in border-strong, over scrim."},
  {"name": "focus-ring", "value": {"dark": "0 0 0 2px #0E1214, 0 0 0 4px #F1F0EA", "light": "0 0 0 2px #F1F0EA, 0 0 0 4px #0E1214"}, "usage": "Keyboard focus on every interactive element: 2px of page colour, then a solid 2px ring in text colour. At least 3:1 on every surface."},
 ]},
 "spacing": fam(SP), "radius": fam(RAD), "borderWidth": fam(BW), "zIndex": fam(Z),
 "breakpoint": fam(BP), "maxWidth": fam(MW), "layout": fam(LAY), "duration": fam(DUR), "easing": fam(EAS),
}
for k in ("spacing","radius","borderWidth","zIndex","breakpoint","maxWidth","layout","duration","easing"):
    tokens[k].pop("note", None)
tokens["spacing"]["note"] = "4px base, 8px rhythm. Every gap in a layout is one of these."
tokens["duration"]["note"] = "Motion is documented in MOTION.md; these are its durations. prefers-reduced-motion shows the end state."

# ---- contrast check ----------------------------------------------------------------------
def rgb(h):
    h = h.lstrip('#')
    if len(h) == 8: a = int(h[6:8], 16) / 255; h = h[:6]
    else: a = 1
    return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)], a
def lum(c):
    f = lambda v: v/12.92 if v <= .03928 else ((v+.055)/1.055)**2.4
    return .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2])
def blend(fg, bg):
    c, a = rgb(fg); b, _ = rgb(bg); return [c[i]*a + b[i]*(1-a) for i in range(3)]
def ratio(a, b):
    x, y = sorted([lum(a), lum(b)], reverse=True); return (x+.05)/(y+.05)
def val(name, th):
    for n, d, l, u in C:
        if n == name:
            v = d if th == 'dark' else l
            return val(v[1:-1], th) if v.startswith('{') else v
    raise KeyError(name)
def px(name, th, over):
    return blend(val(name, th), over) if len(val(name, th)) == 9 else rgb(val(name, th))[0]

fails = 0
def chk(fg, bg, mn, th, note=''):
    global fails
    bgv = px(bg, th, '#000000') if len(val(bg, th)) != 9 else None
    bgc = px(bg, th, val('bg', th)) if len(val(bg, th)) == 9 else rgb(val(bg, th))[0]
    # fg may be translucent -> blend on bg
    fgc = blend(val(fg, th), '#%02x%02x%02x' % tuple(round(x*255) for x in bgc)) if len(val(fg, th)) == 9 else rgb(val(fg, th))[0]
    r = ratio(fgc, bgc)
    ok = r >= mn
    if not ok: fails += 1
    return r, ok

rows = []
for th in ('dark', 'light'):
    for bg in ('bg', 'surface', 'surface-raised'):
        for fg, mn in (('text', 4.5), ('text-secondary', 4.5), ('threat-text', 4.5), ('business-text', 4.5),
                       ('border-strong', 3), ('threat-observed', 3), ('business', 3), ('neutral-evidence', 3), ('proof-core', 3), ('proof-ring', 3)):
            r, ok = chk(fg, bg, mn, th); rows.append((th, fg, bg, round(r, 2), mn, ok))
    # on-fill pairs
    for fg, bg, mn in (('on-threat', 'threat-observed', 4.5), ('on-business', 'business', 4.5), ('on-bone', 'action-fill', 4.5),
                       ('threat-text', 'threat-soft', 4.5), ('business-text', 'business-soft', 4.5), ('text', 'threat-soft', 4.5), ('text', 'business-soft', 4.5)):
        base = 'surface'
        # soft fills sit over surface: compute with overlay
        bgv = val(bg, th)
        if len(bgv) == 9:
            sc = blend(bgv, val(base, th)); bgc = sc
        else: bgc = rgb(bgv)[0]
        fgv = val(fg, th); fgc = rgb(fgv)[0]
        r = ratio(fgc, bgc); ok = r >= mn
        if not ok: fails += 1
        rows.append((th, fg, bg, round(r, 2), mn, ok))
bad = [r for r in rows if not r[5]]
if __name__ == '__main__':
    for r in bad: print('FAIL', r)
    print(len(rows), 'pairs,', len(bad), 'fail')
    json.dump(tokens, open('project/tokens.json', 'w'), indent=1, ensure_ascii=False)
    json.dump(rows, open('/tmp/contrast.json', 'w'))
