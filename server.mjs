import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scheduleFields, isReceptionOpen, receptionDays } from './public/schedule.js';
import { generateSummaries, SummaryError } from './shared/gemini-summary.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const store=process.env.DATA_FILE||path.join(root,'data','store.json');
await mkdir(path.dirname(store),{recursive:true});
let db;
try { db=JSON.parse(await readFile(store,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; db={settings:scheduleFields({mode:'open',days:[7,1,2],start:'00:00',end:'24:00'}),requests:[]}; }
let lastRequestNumber=Math.max(db.lastRequestNumber||0,...db.requests.map(r=>r.number||0));
for(const item of [...db.requests].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)))if(!item.number)item.number=++lastRequestNumber;
db.lastRequestNumber=lastRequestNumber;
const password=process.env.ADMIN_PASSWORD||'oracion';
const sessions=new Map();
let saving=Promise.resolve();
function save(){const snapshot=JSON.stringify(db,null,2);saving=saving.then(async()=>{await writeFile(store+'.tmp',snapshot);await rename(store+'.tmp',store)});return saving;}
function isOpen(){return isReceptionOpen(db.settings);}
function authorized(req){const token=req.headers.authorization?.replace(/^Bearer /,'');return sessions.has(token)&&sessions.get(token)>Date.now();}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let result='';for await(const chunk of req){result+=chunk;if(result.length>100000)throw Error('La entrada es demasiado extensa.');}return JSON.parse(result||'{}');}
const attempts=new Map();
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
 if(req.method==='GET'&&url.pathname==='/api/settings')return json(res,200,{...db.settings,days:receptionDays(db.settings),open:isOpen(),demoPassword:!process.env.ADMIN_PASSWORD});
 if(req.method==='POST'&&url.pathname==='/api/login'){
 const ip=req.socket.remoteAddress;const a=attempts.get(ip)||{count:0,until:Date.now()+60000};if(a.until<Date.now()){a.count=0;a.until=Date.now()+60000;}a.count++;attempts.set(ip,a);if(a.count>10)return json(res,429,{error:'Esperá un minuto antes de intentar de nuevo.'});
 const b=await body(req);const input=Buffer.from(String(b.password||''));const target=Buffer.from(password);if(input.length!==target.length||!timingSafeEqual(input,target))return json(res,401,{error:'La contraseña no es correcta.'});const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);return json(res,200,{token});}
 if(req.method==='POST'&&url.pathname==='/api/requests'){
 if(!isOpen())return json(res,403,{error:'El horario para enviar pedidos ha terminado. Tus motivos siguen en pantalla.'});
 const b=await body(req);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!Array.isArray(b.reasons)||b.reasons.length!==1||b.reasons.some(r=>typeof r.text!=='string'||!r.text.trim()||r.text.length>3000||!['Salud','Familia','Trabajo','Vida espiritual','Otro motivo'].includes(r.category)))return json(res,400,{error:'Escribí tu nombre y un solo motivo de oración.'});
 const item={number:++db.lastRequestNumber,id:randomBytes(8).toString('hex'),key:randomBytes(24).toString('hex'),name:b.private?'Anónimo':b.name.trim(),private:!!b.private,reasons:b.reasons.map(r=>({text:r.text.trim(),category:r.category})),createdAt:new Date().toISOString(),status:'Pendiente'};db.requests.push(item);await save();return json(res,201,item);}
 if(req.method==='POST'&&url.pathname==='/api/mine'){const b=await body(req);return json(res,200,db.requests.filter(r=>Array.isArray(b.keys)&&b.keys.includes(r.key)));}
 if(req.method==='GET'&&url.pathname==='/api/shared-requests')return json(res,200,db.requests.map(item=>({id:item.id,number:item.number,name:item.private?'Anónimo':item.name,private:item.private,reasons:item.reasons,createdAt:item.createdAt,status:item.status})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
 if(req.method==='DELETE'&&/^\/api\/requests\/[a-f0-9]{16}$/.test(url.pathname)){const id=url.pathname.split('/').pop(),item=db.requests.find(r=>r.id===id);if(!item)return json(res,200,{deleted:true});const b=await body(req);if(!authorized(req)&&(typeof b.key!=='string'||b.key!==item.key))return json(res,403,{error:'No tenés permiso para borrar este pedido.'});db.requests=db.requests.filter(r=>r.id!==id);await save();return json(res,200,{deleted:true});}
 if(!authorized(req))return json(res,401,{error:'Ingresá a administración para continuar.'});
 if(req.method==='POST'&&url.pathname==='/api/summary'){
 const b=await body(req);try{return json(res,200,{summaries:await generateSummaries(b.entries,process.env.GEMINI_API_KEY)});}
 catch(error){if(error instanceof SummaryError)return json(res,error.status,{error:error.message});throw error;}}
 if(req.method==='DELETE'&&url.pathname==='/api/requests'){
 const b=await body(req);if(!Array.isArray(b.ids)||b.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{16}$/.test(id)))return json(res,400,{error:'La lista de pedidos para eliminar no es válida.'});
 const ids=new Set(b.ids),deletedCount=db.requests.filter(item=>ids.has(item.id)).length;db.requests=db.requests.filter(item=>!ids.has(item.id));await save();return json(res,200,{deletedCount});}
 if(req.method==='GET'&&url.pathname==='/api/requests')return json(res,200,db.requests.map(({key,...rest})=>rest).reverse());
 if(req.method==='PUT'&&url.pathname==='/api/settings'){const s=await body(req);let normalized;try{normalized=scheduleFields(s);}catch(error){return json(res,400,{error:error.message});}db.settings=normalized;await save();return json(res,200,{...db.settings,open:isOpen()});}
 if(req.method==='PATCH'&&url.pathname.startsWith('/api/requests/')){const r=db.requests.find(r=>r.id===url.pathname.split('/').pop());if(!r)return json(res,404,{error:'Pedido no encontrado.'});const b=await body(req);if(!['Pendiente','Orado'].includes(b.status))return json(res,400,{error:'Estado inválido.'});r.status=b.status;await save();return json(res,200,r);}
 return json(res,404,{error:'No encontrado.'});
 }
 if(req.method!=='GET')return json(res,405,{error:'Método no permitido.'});
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
 const staticFiles=['index.html','styles.css','app.js','backend.js','firebase-backend.js','firebase-config.js','schedule.js','group-rules.js','prayer-progress.js','numbered-transaction.js','prayer-summary.js','summary-config.js','admin-actions.js','bulk-delete.js','manifest.webmanifest','favicon.ico',
  ...['clipboard-list','x','sliders-horizontal','download','printer','chevron-down','trash-2','hands-praying','prayer-app'].map(name=>'icons/'+name+'.svg'),
  ...['prayer-32','prayer-180','prayer-192','prayer-512','prayer-maskable-512'].map(name=>'icons/'+name+'.png')];
 if(!staticFiles.includes(file))return json(res,404,{error:'No encontrado.'});
 const content=await readFile(path.join(root,'public',file));
 const contentTypes={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
 res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)]||'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(content);
 }catch(e){json(res,400,{error:'No pudimos completar la operación. Volvé a intentarlo.'});}
}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('App disponible en puerto '+(process.env.PORT||3000)));
