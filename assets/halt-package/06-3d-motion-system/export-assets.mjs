// HALT export: transparent PNGs, static SVG fallbacks, GLB (Core, node kit).
// Usage: npm i three@0.128.0 playwright && npx playwright install chromium && node export-assets.mjs
import {chromium} from 'playwright';
import fs from 'fs';
import path from 'path';
const dir=path.dirname(new URL(import.meta.url).pathname);
const rd=f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/if\(typeof module[\s\S]*$/m,'');
const nm=p=>fs.readFileSync(path.join(dir,'node_modules',p),'utf8');
const W=+process.env.W||1600,H=+process.env.H||1000;
const out=path.join(dir,'out');['png','svg','glb'].forEach(d=>fs.mkdirSync(path.join(out,d),{recursive:true}));
const code=['halt-spec.js','halt-scene-a.js','halt-scene-b.js'].map(rd).join('\n');
const html=`<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent"><canvas id=c style="width:${W}px;height:${H}px;display:block"></canvas><div id=l></div>
<script>${nm('three/build/three.min.js')}</script><script>${nm('three/examples/js/exporters/GLTFExporter.js')}</script><script>${code}</script>`;
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
p.on('pageerror',e=>{console.error(e.message);process.exitCode=1});
await p.setContent(html);
const order=await p.evaluate(()=>HALT_SPEC.order);
// PNG + SVG
await p.evaluate(({W,H})=>{const c=document.getElementById('c');c.width=W;c.height=H;
  window.S=new HaltScene(c,null,{quality:'high',reducedMotion:true,layout:'export',state:'dormant',transparent:true,preserve:true})},{W,H});
for(const s of order){
  const png=await p.evaluate(st=>{S.setState(st,{instant:true});S.resize();return S.toPNG()},s);
  fs.writeFileSync(path.join(out,'png',`halt-core-${s}.png`),Buffer.from(png.split(',')[1],'base64'));
  const svg=await p.evaluate(st=>HaltScene.fallbackSVG(st),s);
  fs.writeFileSync(path.join(out,'svg',`halt-fallback-${s}.svg`),svg.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"'));
}
// GLB
const glb=await p.evaluate(()=>new Promise(res=>{
  const ex=new THREE.GLTFExporter(),o={binary:true,onlyVisible:true};
  const enc=buf=>{let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
  const core=buildCore();const root=new THREE.Group();root.name='HALT_Core_Verified';root.add(core.group);
  const R=S.R||6.4,ring=new THREE.Mesh(new THREE.TorusGeometry(R,.06,8,96),new THREE.MeshBasicMaterial({color:HC.bone}));ring.name='ContainmentBoundary';ring.position.set(0,0,0);root.add(ring);
  const kit=new THREE.Group();kit.name='HALT_Node_Kit';assetKit().forEach((a,i)=>{a.obj.position.set((i%4-1.5)*3,(1-Math.floor(i/4))*3,0);kit.add(a.obj)});
  ex.parse(root,a=>{const A=enc(a);ex.parse(kit,k=>res({core:A,kit:enc(k)}),o)},o)}));
fs.writeFileSync(path.join(out,'glb','halt-core.glb'),Buffer.from(glb.core,'base64'));
fs.writeFileSync(path.join(out,'glb','halt-node-kit.glb'),Buffer.from(glb.kit,'base64'));
await b.close();console.log('exported to',out);
