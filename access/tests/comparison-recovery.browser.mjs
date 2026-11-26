import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../.staging/session-fixture/',import.meta.url));
test('comparison sheet keeps failed changes recoverable and ignores an older refresh after a confirmed pick',async()=>{
 const path=root+'comparison-test.html';
 await writeFile(path,`<div id="root"></div><script type="module">
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import {CompareSheet} from '/src/features/compare/CompareSheet.tsx';
 import {ComparisonRecovery} from '/src/store/ComparisonRecovery.tsx';
 import {useStore} from '/src/store/useStore.ts';
 import {comparisonEdits} from '/src/store/compareSync.ts';
 import {supabase} from '/src/lib/supabase.ts';
 await supabase.auth.getSession();
 const id=n=>'a0000000-0000-4000-8000-'+String(n).padStart(12,'0'),owner=id(1);
 comparisonEdits.bind(owner);
 const comparison={id:id(3),task_id:null,title:'Synthetic products',need:null,weights:{price:2},source:null,notes:'Keep notes',
  chosen_item:null,created_at:'2026-11-25T00:00:00Z',updated_at:'2026-11-25T00:00:00Z'};
 const product={id:id(4),comparison_id:id(3),name:'Synthetic product',currency:'JPY',price:50,quality:null,
  life_years:null,warranty_months:null,rating:null,review_count:null,pros:[],cons:[],extra:{},position:0,notes:'Keep product'};
 const other={...comparison,id:id(5),title:'Other comparison'};
 useStore.setState({comparisons:[comparison,other],comparisonItems:[product],compareOpen:id(3),loading:false,initialized:true});
 window.calls=[];window.mode='wait';window.row={...comparison};let revision=0;
 const success=args=>{window.row={...window.row,...args.p_patch,updated_at:'2026-11-26T00:00:0'+(++revision)+'Z'};
  return {error:null,data:{request_id:args.p_request_id,replayed:false,comparison:window.row,items:[product]}}};
 supabase.rpc=async(name,args)=>{
  window.calls.push({name,args});
  if(window.mode==='wait')return await new Promise(resolve=>window.finish=()=>resolve({error:{code:'42501'}}));
  return success(args);
 };
 supabase.from=()=>({select(){return this},eq(){return this},order(){return new Promise(resolve=>window.finishRead=()=>resolve({
  data:[{...comparison,items:[product]},{...other,items:[]}],error:null}))}});
 window.changeOther=()=>useStore.setState(s=>({comparisons:s.comparisons.map(c=>c.id===id(5)?{...c,title:'Newer unrelated edit'}:c)}));
 window.readOld=()=>{window.oldRead=useStore.getState().loadComparisons()};
 window.state=()=>useStore.getState();
 function Scene(){const error=useStore(s=>s.error);return React.createElement('div',{},
  error&&React.createElement('p',{role:'alert'},error),React.createElement(ComparisonRecovery),React.createElement(CompareSheet));}
 createRoot(document.getElementById('root')).render(React.createElement(Scene));window.ready=true;
 </script>`);
 let server,browser;
 try{
  server=await createServer({root,configFile:root+'vite.config.ts',server:{host:'127.0.0.1',port:0}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.ROADMAP_TEST_CHROMIUM?{executablePath:process.env.ROADMAP_TEST_CHROMIUM}:{})});
  const page=await browser.newPage();
  await page.route('http://127.0.0.1:54321/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/comparison-test.html');
  await page.waitForFunction(()=>window.ready===true);
  const weight=page.getByRole('button',{name:'Price: Medium. Tap to change.'});await weight.click();
  await page.waitForFunction(()=>window.calls.length===1);
  await page.evaluate(()=>{window.changeOther();window.finish()});
  const retry=page.getByRole('button',{name:'Retry comparison change'});await retry.waitFor();
  await page.waitForFunction(()=>window.state().error?.includes('Access denied'));
  assert.equal(await weight.isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.state().comparisons[0].weights.price),2);
  assert.equal(await page.evaluate(()=>window.state().comparisons[1].title),'Newer unrelated edit');
  const first=await page.evaluate(()=>window.calls[0]);assert.equal(first.name,'ga_roadmap_edit_comparison');
  await page.evaluate(()=>window.mode='success');await retry.click();
  await page.getByRole('button',{name:'Price: High. Tap to change.'}).waitFor();
  assert.deepEqual((await page.evaluate(()=>window.calls[1])).args,first.args);
  assert.equal(await retry.count(),0);
  await page.evaluate(()=>window.readOld());await page.waitForFunction(()=>typeof window.finishRead==='function');
  await page.getByRole('button',{name:'Pick this',exact:true}).click();
  await page.getByText('Your pick',{exact:true}).waitFor();
  await page.evaluate(async()=>{window.finishRead();await window.oldRead});
  await page.waitForFunction(()=>window.state().comparisons[0].chosen_item!==null);
  assert.equal(await page.getByText('Your pick',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>window.state().comparisons[1].title),'Newer unrelated edit');
  assert.equal(await page.evaluate(()=>window.state().comparisons[0].notes),'Keep notes');
 }finally{await browser?.close();await server?.close();await rm(path,{force:true})}
});
