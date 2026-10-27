/* @ds-bundle: {"format":4,"namespace":"HALT","components":[{"name":"HaltMark"},{"name":"Button"},{"name":"Nav"},{"name":"Tabs"},{"name":"StatusChip"},{"name":"MetricBlock"},{"name":"EvidenceRow"},{"name":"ConstraintIndicator"},{"name":"TimelineEvent"},{"name":"ApprovalControl"},{"name":"Tooltip"},{"name":"Drawer"},{"name":"Dialog"},{"name":"Toast"},{"name":"Skeleton"},{"name":"NodeGlyph"},{"name":"EdgeStroke"}]} */
(function () {
  var React = window.React, h = React.createElement, useState = React.useState;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  /* ---- the mark: copied geometry of the approved icon, drawn in currentColor ------------- */
  function HaltMark(p) {
    var size = p.size || 32;
    return h('svg', { width: size * 64 / 84, height: size, viewBox: '16 6 64 84', role: 'img', 'aria-label': p.decorative ? undefined : 'HALT', 'aria-hidden': p.decorative ? true : undefined, style: { display: 'block', flex: 'none', color: p.color || 'currentColor' } },
      h('path', { fill: 'currentColor', d: 'M64 6h16v84h-16zM28.0 42.0h36.0v12h-36.0zM16 18L24 10H32V36.5H16zM16 59.5h16v26.5h-16zM16.0 48a8 8 0 1 1 16 0a8 8 0 1 1 -16 0zM21.0 48a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z', fillRule: 'evenodd' }));
  }

  /* ---- Button -------------------------------------------------------------------------- */
  function Button(p) {
    var variant = p.variant || 'secondary', rest = {};
    for (var k in p) if (k !== 'variant' && k !== 'children' && k !== 'className' && k !== 'block' && k !== 'trailing' && k !== 'reason') rest[k] = p[k];
    var btn = h('button', Object.assign({ type: 'button' }, rest, { className: cx('halt-btn', variant === 'primary' && 'halt-btn-primary', variant === 'quiet' && 'halt-btn-quiet', variant === 'ghost' && 'halt-btn-ghost', variant === 'done' && 'halt-btn-done', p.block && 'halt-btn-block', p.className) }),
      h('span', null, p.children), p.trailing ? h('span', { 'aria-hidden': true }, p.trailing) : null);
    return p.disabled && p.reason ? h('div', null, btn, h('div', { className: 'halt-reason' }, p.reason)) : btn;
  }

  /* ---- Navigation ---------------------------------------------------------------------- */
  function Nav(p) {
    var items = p.items || [];
    return h('nav', { className: 'halt-nav', 'aria-label': p.label || 'HALT systems', style: p.height ? { height: p.height } : null },
      h('div', { className: 'halt-nav-brand' }, h(HaltMark, { size: 28, decorative: true }), h('b', null, 'HALT')),
      items.map(function (it, i) {
        return h('a', { key: it.id, href: it.href || '#', className: 'halt-nav-item', 'aria-current': p.active === it.id ? 'page' : undefined, onClick: p.onSelect ? function (e) { e.preventDefault(); p.onSelect(it.id); } : undefined },
          h('span', { className: 'idx label', style: { color: 'inherit' } }, it.index || String(i + 1).padStart(2, '0')), h('span', null, it.label));
      }),
      p.footer ? h('div', { className: 'halt-nav-foot' }, p.footer) : null);
  }

  /* ---- Tabs ---------------------------------------------------------------------------- */
  function Tabs(p) {
    var items = p.items || [];
    var st = useState(p.value || (items[0] && items[0].id)), cur = p.value != null ? p.value : st[0];
    function pick(id) { if (p.onChange) p.onChange(id); if (p.value == null) st[1](id); }
    function key(e, i) {
      var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
      if (n == null) return; n = (n + items.length) % items.length; pick(items[n].id);
      var el = e.currentTarget.parentNode.children[n]; if (el) el.focus();
    }
    return h('div', { className: 'halt-tabs', role: 'tablist', 'aria-label': p.label },
      items.map(function (it, i) {
        var on = cur === it.id;
        return h('button', { key: it.id, role: 'tab', type: 'button', className: 'halt-tab', 'aria-selected': on, tabIndex: on ? 0 : -1, onClick: function () { pick(it.id); }, onKeyDown: function (e) { key(e, i); } },
          h('span', null, it.label), it.count != null ? h('span', { className: 'count' }, it.count) : null);
      }));
  }

  /* ---- Status chip --------------------------------------------------------------------- */
  var CHIP = {
    observed: ['OBSERVED', function () { return h('rect', { x: 2, y: 2, width: 8, height: 8, fill: 'currentColor' }); }],
    forecast: ['FORECAST', function () { return h('circle', { cx: 6, cy: 6, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeDasharray: '2 2' }); }],
    blocked: ['BLOCKED', function () { return h('path', { d: 'M1 6h3.5M7.5 6H11', stroke: 'currentColor', strokeWidth: 2 }); }],
    preserved: ['PRESERVED', function () { return h('path', { d: 'M0 6h12', stroke: 'currentColor', strokeWidth: 4 }); }],
    verified: ['VERIFIED', function () { return h('g', null, h('circle', { cx: 6, cy: 6, r: 4.5, fill: 'none', stroke: 'var(--proof-ring)', strokeWidth: 2 }), h('circle', { cx: 6, cy: 6, r: 1.6, fill: 'var(--proof-core)' })); }],
    success: ['APPLIED', function () { return h('path', { d: 'M1.5 6.5l3 3 6-7', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }); }],
    caution: ['CAUTION', function () { return h('path', { d: 'M6 1.5L11 10.5H1z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }); }],
    pending: ['PENDING', function () { return h('circle', { cx: 6, cy: 6, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }); }],
    simulated: ['SIMULATED', function () { return h('path', { d: 'M1 11L11 1M1 6L6 1M6 11L11 6', stroke: 'currentColor', strokeWidth: 1.2 }); }],
    neutral: ['INFERRED', function () { return h('path', { d: 'M0 6h12', stroke: 'currentColor', strokeWidth: 1.5, strokeDasharray: '4 3' }); }]
  };
  function StatusChip(p) {
    var k = p.kind || 'neutral', d = CHIP[k] || CHIP.neutral;
    return h('span', { className: cx('halt-chip', 'halt-chip-' + k, p.className) }, h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true }, d[1]()), h('span', null, p.children || d[0]));
  }

  /* ---- Metric block -------------------------------------------------------------------- */
  function MetricBlock(p) {
    return h('div', { className: cx('halt-metric', p.tone && 'halt-metric-' + p.tone), role: 'group', 'aria-label': p.label },
      h('p', { className: 'label' }, p.label),
      h('p', { className: 'data-value' }, p.value, p.unit ? h('small', null, p.unit) : null),
      h('p', { className: 'deriv' }, p.derivation, p.simulated ? ' · SIMULATED' : ''));
  }

  /* ---- Evidence row -------------------------------------------------------------------- */
  function EvidenceRow(p) {
    return h('div', { className: cx('halt-ev', p.inferred && 'halt-ev-inferred'), role: 'row' },
      h('div', { className: 'id' }, h('span', { className: 'halt-ev-marker', 'aria-hidden': true }), h('a', { href: p.href || '#' + p.id }, p.id)),
      h('div', { className: 'src' }, p.source),
      h('div', { className: 'txt' }, p.text),
      h('div', { className: 't' }, p.time),
      h('div', { className: 'sup' }, p.supports));
  }

  /* ---- Constraint indicator ------------------------------------------------------------ */
  var CON = { met: ['MET', function () { return h('g', null, h('circle', { cx: 8, cy: 8, r: 6.5, fill: 'none', stroke: 'var(--business)', strokeWidth: 2 }), h('path', { d: 'M5 8.2l2.2 2.2L11 5.6', fill: 'none', stroke: 'var(--business-text)', strokeWidth: 1.8 })); }],
    binding: ['AT LIMIT', function () { return h('g', null, h('circle', { cx: 8, cy: 8, r: 6.5, fill: 'none', stroke: 'var(--text)', strokeWidth: 2 }), h('rect', { x: 5, y: 7, width: 6, height: 2, fill: 'var(--text)' })); }],
    violated: ['VIOLATED', function () { return h('g', null, h('path', { d: 'M8 1.5L15 14H1z', fill: 'none', stroke: 'var(--threat-observed)', strokeWidth: 2, strokeLinejoin: 'round' }), h('path', { d: 'M8 6v4M8 11.4v.8', stroke: 'var(--threat-text)', strokeWidth: 1.8 })); }] };
  function ConstraintIndicator(p) {
    var s = p.state || 'met', d = CON[s];
    var bar = p.fill != null ? h('div', { className: 'halt-cons-bar', role: 'presentation' }, h('i', { style: { width: Math.min(100, p.fill * 100) + '%' } }), p.limit != null ? h('b', { style: { left: p.limit * 100 + '%' } }) : null) : null;
    return h('div', { className: cx('halt-cons', 'halt-cons-' + s), role: 'row' },
      h('svg', { width: 18, height: 18, viewBox: '0 0 16 16', 'aria-hidden': true, style: { marginTop: 1 } }, d[1]()),
      h('div', null, h('div', { className: 'name' }, p.name), h('div', { className: 'rule' }, p.rule), bar),
      h('div', null, h('div', { className: 'val' }, p.value), h('div', { className: 'state' }, d[0])));
  }

  /* ---- Timeline event ------------------------------------------------------------------ */
  function TimelineEvent(p) {
    var kind = p.kind || 'observed';
    var node = kind === 'forecast'
      ? h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, style: { marginTop: 3, position: 'relative' } }, h('circle', { cx: 8, cy: 8, r: 6, fill: 'var(--bg)', stroke: 'var(--threat-observed)', strokeWidth: 2, strokeDasharray: '3 3' }))
      : kind === 'action'
        ? h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, style: { marginTop: 3, position: 'relative' } }, h('circle', { cx: 8, cy: 8, r: 6.5, fill: 'var(--bg)', stroke: 'var(--proof-ring)', strokeWidth: 2.4 }), h('circle', { cx: 8, cy: 8, r: 2.4, fill: 'var(--proof-core)' }))
        : h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, style: { marginTop: 3, position: 'relative' } }, h('rect', { x: 3, y: 3, width: 10, height: 10, fill: 'var(--text)' }));
    return h('div', { className: cx('halt-tl', 'halt-tl-' + kind, p.last && 'halt-tl-last') },
      h('div', { className: 'time' }, p.time),
      h('div', { className: 'rail' }, node),
      h('div', null, h('div', { className: 'title' }, p.title), p.description ? h('div', { className: 'desc' }, p.description) : null,
        h('div', { className: 'meta' }, kind === 'forecast' ? 'FORECAST · ' + (p.meta || '') + ' · SIMULATED' : (p.meta || ''))));
  }

  /* ---- Approval control ---------------------------------------------------------------- */
  function ApprovalControl(p) {
    var s = p.state || 'pending', on = s === 'approved';
    return h('div', { className: cx('halt-approval', on && 'halt-approval-approved', s === 'held' && 'halt-approval-held') },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' } },
        h('div', null, h('div', { className: 'who' }, p.name), h('div', { className: 'role' }, p.role + (p.policy ? ' · policy ' + p.policy : ''))),
        h(StatusChip, { kind: on ? 'success' : s === 'held' ? 'blocked' : 'pending' }, on ? 'APPROVED' : s === 'held' ? 'DECLINED' : 'AWAITING')),
      p.authorises ? h('div', { className: 'role', style: { color: 'var(--text)' } }, 'Authorises ' + p.authorises) : null,
      p.impact || p.reversibility ? h('div', { className: 'halt-three' },
        h('div', null, h('span', null, 'Impact'), p.impact), h('div', null, h('span', null, 'Reversibility'), p.reversibility), h('div', null, h('span', null, 'Authorisation'), p.authorisation || p.role)) : null,
      h('button', { type: 'button', className: 'halt-approve', 'aria-pressed': on, disabled: p.disabled || s === 'held', onClick: on ? undefined : p.onApprove },
        h('span', null, on ? 'APPROVED · ' + (p.at || '') : 'APPROVE · ' + (p.short || p.role).toUpperCase()), h('span', { 'aria-hidden': true }, on ? '✓' : '→')));
  }

  /* ---- Tooltip ------------------------------------------------------------------------- */
  function Tooltip(p) {
    var id = React.useId ? React.useId() : 'tip';
    return h('span', { className: cx('halt-tip-wrap', p.open && 'halt-tip-open') },
      React.cloneElement(React.Children.only(p.children), { 'aria-describedby': id }),
      h('span', { role: 'tooltip', id: id, className: 'halt-tip' }, p.title ? h('span', { className: 'k' }, p.title) : null, p.content));
  }

  /* ---- Drawer -------------------------------------------------------------------------- */
  function Drawer(p) {
    if (p.open === false) return null;
    return h('aside', { className: cx('halt-drawer', !p.inline && 'halt-drawer-fixed'), role: 'dialog', 'aria-label': p.title, 'aria-modal': 'false', style: p.height ? { height: p.height } : null },
      h('header', null, h('div', null, p.kicker ? h('div', { className: 'label' }, p.kicker) : null, h('h2', { className: 'section-headline', style: { margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: '26px' } }, p.title)),
        h('button', { type: 'button', className: 'halt-x', 'aria-label': 'Close', onClick: p.onClose }, '×')),
      h('div', { className: 'body' }, p.children), p.footer ? h('footer', null, p.footer) : null);
  }

  /* ---- Dialog -------------------------------------------------------------------------- */
  function Dialog(p) {
    if (p.open === false) return null;
    var box = h('div', { className: 'halt-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': p.title },
      h('header', null, h('div', null, p.kicker ? h('div', { className: 'label' }, p.kicker) : null, h('h2', { className: 'section-headline', style: { margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: '26px' } }, p.title)),
        h('button', { type: 'button', className: 'halt-x', 'aria-label': 'Close', onClick: p.onClose }, '×')),
      h('div', { className: 'body' }, p.children), p.footer ? h('footer', null, p.footer) : null);
    return h('div', { className: cx('halt-scrim', !p.inline && 'halt-scrim-fixed'), style: p.height ? { height: p.height } : null }, box);
  }

  /* ---- Toast --------------------------------------------------------------------------- */
  function Toast(p) {
    var k = p.kind || 'neutral';
    var g = k === 'success' ? h('path', { d: 'M3 10l4 4 8-9', fill: 'none', stroke: 'var(--business-text)', strokeWidth: 2 })
      : k === 'threat' ? h('rect', { x: 4, y: 4, width: 10, height: 10, fill: 'var(--threat-observed)' })
        : k === 'caution' ? h('path', { d: 'M9 2L17 16H1z', fill: 'none', stroke: 'var(--text)', strokeWidth: 1.8, strokeLinejoin: 'round' })
          : h('circle', { cx: 9, cy: 9, r: 6, fill: 'none', stroke: 'var(--text)', strokeWidth: 2 });
    return h('div', { className: cx('halt-toast', 'halt-toast-' + k), role: k === 'threat' ? 'alert' : 'status' },
      h('svg', { width: 18, height: 18, viewBox: '0 0 18 18', 'aria-hidden': true, style: { marginTop: 1 } }, g),
      h('div', null, h('div', { className: 'title' }, p.title), p.children ? h('div', { className: 'desc' }, p.children) : null),
      p.onDismiss ? h('button', { type: 'button', className: 'halt-x', 'aria-label': 'Dismiss', onClick: p.onDismiss, style: { margin: '-10px -14px 0 0' } }, '×') : null);
  }

  /* ---- Skeleton ------------------------------------------------------------------------ */
  function Skeleton(p) {
    var v = p.variant || 'line';
    if (v === 'graph') {
      return h('svg', { width: p.width || 360, height: p.height || 160, viewBox: '0 0 360 160', role: 'img', 'aria-label': p.label || 'Computing paths' },
        h('path', { className: 'halt-skel-graph', d: 'M30 80H120L170 36H260M120 80L170 124H330' }),
        h('path', { d: 'M20 80H340', stroke: 'var(--line)', strokeWidth: 8, fill: 'none', opacity: .0 }),
        [[30, 80], [120, 80], [170, 36], [260, 36], [170, 124], [330, 124]].map(function (c, i) { return h('circle', { key: i, className: 'halt-skel-graph', cx: c[0], cy: c[1], r: 9, style: { strokeDasharray: '3 3' } }); }));
    }
    if (v === 'block') return h('div', { className: 'halt-skel halt-skel-pulse', style: { width: p.width || '100%', height: p.height || 72 }, role: 'status', 'aria-label': p.label || 'Loading' });
    var n = p.lines || 3, ws = ['100%', '86%', '62%', '74%'];
    return h('div', { role: 'status', 'aria-label': p.label || 'Loading', style: { display: 'flex', flexDirection: 'column', gap: 8, width: p.width || '100%' } },
      Array.apply(null, Array(n)).map(function (_, i) { return h('div', { key: i, className: 'halt-skel halt-skel-pulse', style: { height: 12, width: ws[i % 4], animationDelay: i * 120 + 'ms' } }); }));
  }

  /* ---- Graph language: node glyphs ------------------------------------------------------ */
  var NODE = {
    user: ['User', function (a) { return h('circle', Object.assign({ cx: 16, cy: 16, r: 10 }, a)); }],
    device: ['Device', function (a) { return h('rect', Object.assign({ x: 6, y: 6, width: 20, height: 20, rx: 2 }, a)); }],
    session: ['Session', function (a) { return h('rect', Object.assign({ x: 2.5, y: 10, width: 27, height: 12, rx: 6 }, a)); }],
    token: ['Token', function (a) { return h('polygon', Object.assign({ points: '16,3 29,16 16,29 3,16' }, a)); }],
    application: ['Application', function (a) { return h('polygon', Object.assign({ points: '9,6 23,6 30,16 23,26 9,26 2,16' }, a)); }],
    api: ['API', function (a) { return h('polygon', Object.assign({ points: '3,7 20,7 30,16 20,25 3,25' }, a)); }],
    service: ['Service', function (a) { return h('path', Object.assign({ d: 'M12 3h8v9h9v8h-9v9h-8v-9H3v-8h9z' }, a)); }],
    database: ['Database', function (a) { return h('g', null, h('path', Object.assign({ d: 'M5 8a11 4 0 0 1 22 0v16a11 4 0 0 1 -22 0z' }, a)), h('path', { d: 'M5 8a11 4 0 0 0 22 0', fill: 'none', stroke: a.stroke, strokeWidth: a.strokeWidth })); }],
    process: ['Business process', function (a) { return h('g', null, h('rect', Object.assign({ x: 2.5, y: 6, width: 27, height: 20, rx: 2 }, a)), h('rect', { x: 2.5, y: 21, width: 27, height: 5, fill: 'var(--business)' })); }],
    attacker: ['Attacker-controlled', function (a) { var solid = !a.strokeDasharray && a.stroke === 'var(--text)'; return h('polygon', Object.assign({ points: '3,5 29,5 16,28', strokeLinejoin: 'miter' }, a, { fill: solid ? 'var(--threat-observed)' : 'var(--bg)', stroke: a.stroke === 'var(--threat-held)' ? 'var(--threat-held)' : 'var(--threat-observed)' })); }]
  };
  function NodeGlyph(p) {
    var k = p.kind || 'user', st = p.state || 'observed', d = NODE[k] || NODE.user, size = p.size || 32;
    var a = { fill: 'var(--bg)', stroke: 'var(--text)', strokeWidth: 2.5, strokeLinejoin: 'round' };
    if (st === 'forecast') a.strokeDasharray = '3.5 3.5';
    if (st === 'held') { a.stroke = 'var(--threat-held)'; a.strokeWidth = 2.5; }
    if (st === 'inferred') { a.stroke = 'var(--neutral-evidence)'; a.strokeDasharray = '6 4'; a.strokeWidth = 2; }
    var svg = h('svg', { width: size, height: size, viewBox: '0 0 32 32', role: 'img', 'aria-label': (p.label || d[0]) + ' node, ' + st, style: { display: 'block', flex: 'none' } }, d[1](a), st === 'verified' ? h('g', null, h('circle', { cx: 26, cy: 26, r: 5.5, fill: 'var(--bg)', stroke: 'var(--proof-ring)', strokeWidth: 2 }), h('circle', { cx: 26, cy: 26, r: 1.8, fill: 'var(--proof-core)' })) : null);
    if (!p.caption) return svg;
    return h('figure', { style: { margin: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6 } }, svg, h('figcaption', { className: 'label', style: { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.09em', textAlign: 'center' } }, p.caption === true ? d[0] : p.caption));
  }

  /* ---- Graph language: edge strokes ------------------------------------------------------ */
  function EdgeStroke(p) {
    var k = p.kind || 'observed', w = p.width || 220, anim = p.animate !== false, mid = w / 2, y = 14;
    var body;
    if (k === 'observed') body = h('g', null, h('path', { d: 'M6 ' + y + 'H' + (w - 6), stroke: 'var(--threat-observed)', strokeWidth: 3, fill: 'none' }), h('rect', { x: mid - 4, y: y - 4, width: 8, height: 8, fill: 'var(--text)' }));
    else if (k === 'inferred') body = h('path', { d: 'M6 ' + y + 'H' + (w - 6), stroke: 'var(--neutral-evidence)', strokeWidth: 1.5, strokeDasharray: '6 4', fill: 'none' });
    else if (k === 'forecast') body = h('g', null, h('path', { className: anim ? 'halt-edge-march' : '', d: 'M6 ' + y + 'H' + (w - 26), stroke: 'var(--threat-observed)', strokeWidth: 2, strokeDasharray: '2 6', strokeLinecap: 'butt', fill: 'none' }), h('circle', { cx: w - 14, cy: y, r: 8, fill: 'var(--bg)', stroke: 'var(--threat-observed)', strokeWidth: 2.5, strokeDasharray: '3 3' }));
    else if (k === 'dependency') body = h('g', null, h('path', { d: 'M12 ' + y + 'H' + (w - 12), stroke: 'var(--business)', strokeWidth: 2, fill: 'none' }), h('circle', { cx: 8, cy: y, r: 4, fill: 'var(--bg)', stroke: 'var(--business)', strokeWidth: 2 }), h('circle', { cx: w - 8, cy: y, r: 4, fill: 'var(--bg)', stroke: 'var(--business)', strokeWidth: 2 }));
    else if (k === 'blocked') body = h('g', null, h('path', { d: 'M6 ' + y + 'H' + (mid - 22), stroke: 'var(--threat-observed)', strokeWidth: 3, fill: 'none' }), h('path', { d: 'M' + (mid + 22) + ' ' + y + 'H' + (w - 6), stroke: 'var(--threat-held)', strokeWidth: 3, fill: 'none' }), h('circle', { cx: mid, cy: y, r: 10, fill: 'var(--bg)', stroke: 'var(--proof-ring)', strokeWidth: 3 }), h('circle', { cx: mid, cy: y, r: 3.5, fill: 'var(--proof-core)' }));
    else body = h('g', null, h('path', { d: 'M6 ' + y + 'H' + (w - 6), stroke: 'var(--business)', strokeWidth: 8, strokeOpacity: .6, fill: 'none' }), h('path', { className: anim ? 'halt-edge-pulse' : '', d: 'M6 ' + y + 'H' + (w - 6), stroke: 'var(--business)', strokeWidth: 8, strokeDasharray: '24 96', fill: 'none' }));
    var names = { observed: 'Observed relationship', inferred: 'Inferred relationship', forecast: 'Forecast path', dependency: 'Business dependency', blocked: 'Blocked path', preserved: 'Preserved path' };
    return h('svg', { width: w, height: 28, viewBox: '0 0 ' + w + ' 28', role: 'img', 'aria-label': names[k], style: { display: 'block', maxWidth: '100%' } }, body);
  }

  var C = window.HALT = window.HALT || {};
  Object.assign(C, { HaltMark: HaltMark, Button: Button, Nav: Nav, Tabs: Tabs, StatusChip: StatusChip, MetricBlock: MetricBlock, EvidenceRow: EvidenceRow, ConstraintIndicator: ConstraintIndicator, TimelineEvent: TimelineEvent, ApprovalControl: ApprovalControl, Tooltip: Tooltip, Drawer: Drawer, Dialog: Dialog, Toast: Toast, Skeleton: Skeleton, NodeGlyph: NodeGlyph, EdgeStroke: EdgeStroke });
})();
