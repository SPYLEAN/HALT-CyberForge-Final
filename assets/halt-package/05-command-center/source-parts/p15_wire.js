document.addEventListener('click',e=>{
 const t=e.target.closest('[data-xmode],[data-pf],[data-xpath],[data-eplay],[data-udr],[data-pmode],[data-wf],[data-verify]');if(!t)return;const d=t.dataset;
 if(d.xmode){ST.xmode=d.xmode;renderWS();return}
 if(d.pf){ST.pf=d.pf;renderWS();return}
 if(d.xpath){const p=d.xpath;ST.path=(ST.path===p&&p!=='all')?'all':p;if(t.dataset.view){return}if(ST.view==='graph'){$$('[data-xpath]').forEach(b=>{if(b.classList.contains('chip'))b.setAttribute('aria-pressed',b.dataset.xpath===ST.path)});refreshX()}return}
 if(d.eplay!==undefined){if(!ST.eplay&&ST.et>=10)ST.et=0;ST.eplay=!ST.eplay;refreshEcho();return}
 if(d.udr!==undefined){openDrawer(uncertaintyHTML());return}
 if(d.pmode){ST.pmode=d.pmode;renderWS();return}
 if(d.verify!==undefined){verifyHash();return}
 if(d.wf){const w=d.wf;if(w==='approval'){const s=S();if(s.plan===1&&ST.applied<3){openDrawer(approvalHTML());bindDrawer()}else if(ST.applied>=3){setState('rollback');openDrawer(approvalHTML());bindDrawer()}else{ST.view='policies';renderAll()}return}
  ST.view=w;renderAll();$('#ws').scrollTop=0}
});
document.addEventListener('input',e=>{
 if(e.target.id==='xq'){ST.q=e.target.value;refreshX();const r=$('#sres');if(r)r.innerHTML=searchResults()}
 if(e.target.id==='escrub'){ST.et=+e.target.value;ST.eplay=false;refreshEcho()}
});
document.addEventListener('keydown',e=>{if(e.target.id==='xq'&&e.key==='Enter'){const q=ST.q.trim().toLowerCase();const k=Object.keys(XN).find(k=>(XN[k].l+' '+XN[k].t).toLowerCase().indexOf(q)>-1);if(k){ST.sel={t:'n',id:k};renderRail();refreshX()}}});
setInterval(()=>{if(ST.eplay&&ST.view==='echolab'){ST.et=Math.min(10,ST.et+0.05*ST.speed);if(ST.et>=10)ST.eplay=false;refreshEcho()}},100);
