const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errs=[];
async function run(name,w,h,fn){const p=await b.newPage({viewport:{width:w,height:h}});p.on('pageerror',e=>errs.push(name+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(name+' c: '+m.text())});
await p.goto('file://'+process.cwd()+'/halt-3d.local.html');await p.waitForTimeout(1500);await fn(p);await p.screenshot({path:name+'.png'});await p.close()}
const clickTxt=(p,t)=>p.locator('button',{hasText:t}).first().click();
await run('p_default',1280,900,async p=>{await clickTxt(p,'Next');await clickTxt(p,'Next');await p.waitForTimeout(3500)});
await run('p_contained',1280,900,async p=>{await clickTxt(p,'6 ·');await p.waitForTimeout(3500)});
await run('p_anim',1280,900,async p=>{await clickTxt(p,'2 ·');await p.waitForTimeout(900)});
await run('p_gallery',1280,900,async p=>{await clickTxt(p,'Assets');await p.waitForTimeout(1500)});
await run('p_nogl',1280,900,async p=>{await clickTxt(p,'6 ·');await p.locator('text=Simulate no WebGL').click();await p.waitForTimeout(600)});
await run('p_mobile',390,844,async p=>{await clickTxt(p,'7 ·');await p.waitForTimeout(3000);await p.evaluate(()=>scrollTo(0,0))});
await run('p_website',1280,900,async p=>{await clickTxt(p,'Website');await clickTxt(p,'7 ·');await p.waitForTimeout(3000)});
await run('p_reduced',1280,900,async p=>{await p.locator('text=Reduced motion').click();await clickTxt(p,'6 ·');await p.waitForTimeout(300)});
for(const q of ['high','balanced','low']) await run('p_q_'+q,1280,900,async p=>{await clickTxt(p,q);await clickTxt(p,'6 ·');await p.waitForTimeout(3500);console.log(q,await p.locator('.st').innerText())});
await run('p_tab2',1280,1400,async p=>{await clickTxt(p,'States');await p.waitForTimeout(500)});
await run('p_tab7',1280,1200,async p=>{await clickTxt(p,'Budget');await p.waitForTimeout(2500)});
console.log(errs.join('\n')||'no errors');await b.close()})();
