import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';
export async function prepareStudyCaller(stage){
 const source=await readFile(new URL('../callers/jlpt/rmSession.original.js',import.meta.url),'utf8');
 const baseline=JSON.parse(await readFile(new URL('../callers/jlpt/source.json',import.meta.url),'utf8'));
 if(createHash('sha256').update(source).digest('hex')!==baseline.sha256)throw Error('Reviewed study caller changed');
 const begin=source.indexOf('const RM_RESET_HOUR ='),end=source.indexOf('// ─── handshake',begin);
 if(begin<0||end<0||!source.includes('export async function rmComplete('))throw Error('Study caller API changed');
 const out=join(stage,'caller-fixture');await mkdir(out,{recursive:true});
 await cp(new URL('./study-caller.mjs',import.meta.url),join(out,'study-caller.mjs'));
 await writeFile(join(out,'rmSession.js'),`// Ignored loopback replacement of the pinned JLPT caller. Never deployed.\nimport {createStudyCaller} from './study-caller.mjs';\n${source.slice(begin,end)}
let caller=null,notify=()=>{};
export function configureStudyFixture(options){
 if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname))throw Error('Study fixture is loopback only.');
 notify=options.notify||(()=>{});caller=createStudyCaller(options);return caller;
}
export function rmInit(url=location.href){try{return caller?.init(url)??null}catch(e){notify(e.message);return null}}
export function rmIsLaunched(){return caller?.isLaunched()??false}
export async function rmComplete(options={}){try{return await caller?.complete(options)??false}catch(e){notify(e.message);return false}}
export function rmReturn(){const target=caller?.returnUrl();if(target)location.assign(target)}
export const rmPending=()=>caller?.list()??[];
export const rmRetry=p=>caller?.retry(p);
`);
 for(const f of ['study-caller.mjs','study-caller.d.mts'])await cp(new URL('./'+f,import.meta.url),join(stage,'src/store',f));
 const file=join(stage,'src/features/plan/launch.ts');let launch=await readFile(file,'utf8');
 const start=launch.indexOf('const HANDSHAKE_HOSTS ='),stop=launch.indexOf('export function launchResource',start);
 if(start<0||stop<0)throw Error('Study launch source changed');
 launch="import {studyLaunchUrl} from '../../store/study-caller.mjs'\nimport {sessionActions} from '../../store/studySessions.ts'\n"+launch.slice(0,start)+`function withHandshake(rawUrl:string,taskId:string,logicalDay:string):string {
 const owner=sessionActions.currentOwner();if(!owner)return rawUrl
 return studyLaunchUrl(rawUrl,taskId,logicalDay,owner,crypto.randomUUID(),new URL('./',window.location.href).href)
}
\n`+launch.slice(stop);
 await writeFile(file,launch);
}
