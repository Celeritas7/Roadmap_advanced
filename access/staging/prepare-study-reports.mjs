import {readFile,writeFile,cp} from 'node:fs/promises';import {join} from 'node:path';
export async function prepareStudyReports(stage){
 for(const f of ['study-report-contract.ts','study-report-sync.ts','StudyReportRecovery.tsx'])await cp(new URL('./'+f,import.meta.url),join(stage,'src/store',f));
 const path=join(stage,'src/lib/rmHub.ts');let source=await readFile(path,'utf8');
 const begin=source.indexOf('async function onSession('),end=source.indexOf('// ── task.done',begin);if(begin<0||end<0)throw Error('Study handler source changed');
 source="import {receiveStudyReport} from '../store/study-report-sync.ts'\n"+source.slice(0,begin)+`export async function onSession(p:Record<string,unknown>,seq:number):Promise<{acknowledged:true;seq:number}>{await receiveStudyReport(p,seq);return {acknowledged:true,seq}}\n\n`+source.slice(end);
 source=source.replace("import { dayKey } from './dailyReset.ts'\n",'');
 await writeFile(path,source);
 const adapterPath=join(stage,'public/akatsuki/rm-adapter.js');let adapter=await readFile(adapterPath,'utf8');
 const old='const out = await opts.onSession(r.payload, r.seq); return passDefer(out) || {};';if(!adapter.includes(old))throw Error('Study adapter source changed');
 adapter=adapter.replace(old,`if(r.from_app !== 'jlpt')return {reject:'unexpected study source'};
            try {const out=await opts.onSession(r.payload,r.seq);return passDefer(out)||out||{};}
            catch(e){if(e&&e.code==='22023')return {reject:'malformed study delivery'};throw e;}`);
 await writeFile(adapterPath,adapter);
 const typesPath=join(stage,'src/types.ts');let types=await readFile(typesPath,'utf8');
 for(const signature of ['onAnswer: (payload: Record<string, unknown>, fromApp: string, seq: number)','onSession: (payload: Record<string, unknown>, seq: number)']){
  if(!types.includes(signature+' => Promise<void>'))throw Error('Consumer callback type drift');
  types=types.replace(signature+' => Promise<void>',signature+' => Promise<{acknowledged:true;seq:number}|void>');
 }
 await writeFile(typesPath,types);
 const home=join(stage,'src/features/home/HomeStop.tsx');let h=await readFile(home,'utf8');
 h=h.replaceAll('Confirmed by the study app','Reported by the study app — not independently verified').replaceAll('confirmed by an app','reported by an app').replaceAll('✓ confirmed','✓ app-reported').replaceAll('not confirmed by the app','self-reported');
 await writeFile(home,h);
}
