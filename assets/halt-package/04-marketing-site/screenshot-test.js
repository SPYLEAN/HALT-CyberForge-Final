const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
const src=fs.readFileSync('halt-site.html','utf8');
fs.writeFileSync('wrap.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+src+'</body></html>');
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const sizes=[[1440,900,'d'],[1280,800,'m'],[768,1024,'t'],[390,844,'p']];
for(const [w,h,n] of sizes){
 const p=await b.newPage({viewport:{width:w,height:h}});
 const errs=[];p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text())});p.on('pageerror',e=>errs.push('PE '+e.message));
 await p.route('**/three.min.js',r=>r.fulfill({path:process.cwd()+'/vend/node_modules/three/build/three.min.js',contentType:'text/javascript'}));await p.goto('file://'+process.cwd()+'/wrap.html');await p.waitForTimeout(2500);
 const H=await p.evaluate(()=>document.documentElement.scrollHeight);
 const ids=['hero','paradox','incident','context','echolab','safecut','proofseal','command'];
 for(let i=0;i<ids.length;i++){
  await p.evaluate(([id,i])=>{const e=document.getElementById(id);const r=e.getBoundingClientRect();let y=r.top+scrollY+ (i==7? e.offsetHeight*0.55: i==0?0:r.height*0.45 - innerHeight*0.5 + innerHeight*0.3);window.scrollTo({top:y,behavior:'instant'})},[ids[i],i]);
  await p.waitForTimeout(1800);
  await p.screenshot({path:`${n}${i}.png`});
 }
 console.log(w,'H',H,'sw',await p.evaluate(()=>document.documentElement.scrollWidth),errs.slice(0,6));
}
await b.close()})();
