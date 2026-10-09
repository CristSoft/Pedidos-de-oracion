import { execFileSync } from 'node:child_process';
const projectId = 'pedidos-de-oracion-sur';
const root = `projects/${projectId}/databases/(default)/documents`;
const token = execFileSync('gcloud.cmd', ['auth','print-access-token','--account=adventistasjosecpazsur@gmail.com'], {encoding:'utf8',shell:true,stdio:['ignore','pipe','inherit']}).trim();
const headers = {Authorization:`Bearer ${token}`,'x-goog-user-project':projectId,'Content-Type':'application/json'};
const base = 'https://firestore.googleapis.com/v1/';
async function read(name) {
  const response=await fetch(base+name,{headers});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`Firestore read: HTTP ${response.status}`);
  return response.json();
}
async function list(collection) {
  const documents=[];let pageToken='';
  do {
    const url=new URL(base+root+'/'+collection);url.searchParams.set('pageSize','300');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const response=await fetch(url,{headers});if(!response.ok)throw Error(`Firestore list: HTTP ${response.status}`);
    const page=await response.json();documents.push(...page.documents||[]);pageToken=page.nextPageToken||'';
  }while(pageToken);
  return documents;
}
const [originals,feed,counter]=await Promise.all([list('prayerRequests'),list('prayerFeed'),read(root+'/prayerCounters/requests')]);
const numberOf=d=>Number(d?.fields?.number?.integerValue)||0;
let lastNumber=Math.max(Number(counter?.fields?.lastNumber?.integerValue)||0,...originals.map(numberOf),...feed.map(numberOf));
const publicRecords=new Map(feed.map(d=>[d.name,d]));
const used=new Set();
const writes=[];
function numberedWrite(document,number){return {update:{name:document.name,fields:{number:{integerValue:String(number)}}},updateMask:{fieldPaths:['number']},currentDocument:{updateTime:document.updateTime}};}
originals.sort((a,b)=>(a.fields.createdAt.timestampValue.localeCompare(b.fields.createdAt.timestampValue))||a.name.localeCompare(b.name));
for(const original of originals) {
  const number=numberOf(original)||++lastNumber;
  if(!Number.isSafeInteger(number)||number<1||used.has(number))throw Error('Existing numbering is invalid or duplicated.');
  used.add(number);
  if(!numberOf(original))writes.push(numberedWrite(original,number));
  const publicId=original.fields.publicId?.stringValue;
  if(publicId){
    const shared=publicRecords.get(root+'/prayerFeed/'+publicId);
    if(!shared)throw Error('A linked shared record is missing.');
    if(numberOf(shared)&&numberOf(shared)!==number)throw Error('Shared numbering does not match its receipt.');
    if(!numberOf(shared))writes.push(numberedWrite(shared,number));
  }
}
if(feed.some(d=>!numberOf(d)&&!writes.some(w=>w.update.name===d.name)))throw Error('An unnumbered shared record has no matching receipt.');
const counterName=root+'/prayerCounters/requests';
if(!counter||Number(counter.fields.lastNumber.integerValue)!==lastNumber)writes.push({update:{name:counterName,fields:{lastNumber:{integerValue:String(lastNumber)},publicId:counter?.fields.publicId||{stringValue:''}}},currentDocument:counter?{updateTime:counter.updateTime}:{exists:false}});
console.log(JSON.stringify({projectId,requests:originals.length,plannedUpdates:writes.length,lastNumber,apply:process.argv.includes('--apply')}));
if(process.argv.includes('--apply')&&writes.length){
  if(writes.length>450)throw Error('Migration exceeds one atomic batch; split it before applying.');
  const response=await fetch(base+root+':commit',{method:'POST',headers,body:JSON.stringify({writes})});
  if(!response.ok)throw Error(`Numbering commit: HTTP ${response.status}`);
  console.log('Stable request numbers saved.');
}
