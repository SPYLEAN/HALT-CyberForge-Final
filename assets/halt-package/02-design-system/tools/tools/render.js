const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const root = 'project';
  const css = fs.readFileSync('/tmp/tokens.css','utf8') + fs.readFileSync(root+'/components/bundle.css','utf8').replace(/^@import.*$/m,'');
  const libs = ['react.production.min.js','react-dom.production.min.js'].map(f=>fs.readFileSync(root+'/components/lib/'+f,'utf8')).join('\n;');
  const bundle = fs.readFileSync(root+'/components/bundle.js','utf8');
  const comps = fs.readdirSync(root+'/components').filter(d=>fs.existsSync(`${root}/components/${d}/preview.html`));
  const only = process.argv[2] ? process.argv[2].split(',') : comps;
  const themes = (process.argv[3]||'dark').split(',');
  fs.mkdirSync('/tmp/shots',{recursive:true});
  for (const th of themes) for (const c of only) {
    let html = fs.readFileSync(`${root}/components/${c}/preview.html`,'utf8');
    const m = /height=(\d+)/.exec(html.split('\n')[0]); const h = m ? +m[1] : 200;
    const isPage = /\bpage\b/.test(html.split('\n')[0]);
    html = html.replace(/<head>/, `<head><style>${css}</style>`).replace(/<body>/, `<body><script>${libs.replace(/<\/script/g,'<\\/script')}</script><script>${bundle}</script>`);
    html = html.replace('<!doctype html>', `<!doctype html>`).replace('<html', `<html data-theme="${th}"`);
    const p = await b.newPage({ viewport: { width: 960, height: Math.min(h, 2400) } });
    const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()));
    await p.setContent(html, { waitUntil: 'load' }); await p.waitForTimeout(400);
    await p.screenshot({ path: `/tmp/shots/${c}-${th}.png`, fullPage: false });
    const sh = await p.evaluate(()=>document.documentElement.scrollHeight); console.log(c, th, 'h='+sh+' decl='+h, errs.length ? 'ERR ' + errs.join(' | ') : 'ok');
    await p.close();
  }
  await b.close();
})();
