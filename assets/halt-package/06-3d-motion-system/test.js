const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
const three=fs.readFileSync(process.cwd()+'/../site/vend/node_modules/three/build/three.min.js','utf8');
const code=['halt-spec.js','halt-scene-a.js','halt-scene-b.js'].map(f=>fs.readFileSync(f,'utf8').replace(/if\(typeof module[\s\S]*$/m,'')).join('\n');
const html=`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0E1214"><div style="position:relative;width:1280px;height:720px"><canvas id=c style="width:100%;height:100%;display:block"></canvas><div id=l style="position:absolute;inset:0;pointer-events:none"></div></div><style>.h3d-lbl{position:absolute;left:0;top:0;font:11px monospace;color:#F1F0EA;white-space:nowrap}.h3d-lbl.hostile{color:#EC7B56}.h3d-lbl.biz{color:#52B8A1}</style><script>${three}</script><script>${code}
window.S=new HaltScene(document.getElementById('c'),document.getElementById('l'),{quality:'high',preserve:true,transparent:false});</script></body></html>`;
fs.writeFileSync('t.html',html);
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:1280,height:720}});const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file://'+process.cwd()+'/t.html');await p.waitForTimeout(800);
const names=['dormant','intrusion','reconstruction','business','futures','contained','verified'];
for(let i=0;i<names.length;i++){await p.evaluate(n=>{S.setState(n,{instant:true})},names[i]);await p.waitForTimeout(500);await p.screenshot({path:`st${i}.png`})}
console.log(await p.evaluate(()=>JSON.stringify(S.getStats())));console.log(errs.slice(0,6));await b.close()})();
