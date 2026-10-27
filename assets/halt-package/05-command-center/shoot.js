const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const src=fs.readFileSync('halt-cc.html','utf8');fs.writeFileSync('wrap.html','<!doctype html><html><head><meta charset="utf-8"></head><body>'+src+'</body></html>');
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});const errs=[];
p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load/.test(m.text()))errs.push(m.text())});
await p.goto('file://'+process.cwd()+'/wrap.html');await p.waitForTimeout(800);
const shots=[['overview','approval'],['graph','approval'],['echolab','approval'],['safecut','approval'],['proofseal','contained'],['policies','conflict'],['safecut','nofeasible'],['timeline','approval']];
let i=0;for(const [v,s] of shots){await p.evaluate(([v,s])=>{ST.view=v;setState(s)},[v,s]);await p.waitForTimeout(300);await p.screenshot({path:`s${i++}.png`})}
// states sweep for errors
for(const s of ['new','correlating','forecast','simulating','plan','executing','contained','rollback']){await p.evaluate(s=>{ST.view='overview';setState(s)},s);await p.waitForTimeout(500)}
await p.evaluate(()=>{setState('approval');ST.view='graph';renderAll();ST.mode='replay';ST.cur=toS('09:44:00');renderAll()});await p.waitForTimeout(200);await p.screenshot({path:'s8.png'});
await p.evaluate(()=>{setState('approval');openDrawer(approvalHTML());bindDrawer()});await p.waitForTimeout(200);await p.screenshot({path:'s9.png'});
console.log(errs.slice(0,8));await b.close()})();
