const paths={sprout:'M12 21v-9 M12 16C4 16 3 11 3 6c6 0 9 3 9 7 M12 12c0-6 4-9 9-9 0 6-3 10-9 10',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',book:'M12 6v15 M3 3c4 0 7 0 9 3 2-3 5-3 9-3v15c-4 0-7 0-9 3-2-3-5-3-9-3Z',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.8',plus:'M12 5v14 M5 12h14',lock:'M5 11h14v10H5Z M8 11V7a4 4 0 0 1 8 0v4',clock:'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m5 12 4 4L19 6',send:'m22 2-7 20-4-9-9-4Z M22 2 11 13',leaf:'M20 3C6 1 1 8 6 15s16 4 14-12Z M4 21 15 10',arrow:'M5 12h14 m-5-5 5 5-5 5'};
const icon=n=>`<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[n]||paths.heart}"/></svg>`;
function icons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
const $=s=>document.querySelector(s),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let savedName='';try{savedName=(localStorage.getItem('prayer-name')||'').trim().slice(0,100);}catch{}
const newDraft=()=>({name:savedName,private:false,reasons:[{category:'Otro motivo',text:''}]});
let settings=null,token=sessionStorage.getItem('prayer-admin')||'',page='mis',adminTab='pedidos',requests=[],draft=newDraft(),requestEditing=false;
let keys=[];try{keys=JSON.parse(localStorage.getItem('prayer-keys')||'[]')}catch{}
import { backendApi, restoreAdminSession, logoutAdmin } from './backend.js';
import { receptionDays } from './schedule.js';
import { groupRulesHTML } from './group-rules.js';
import { readPrayerProgress, setPrayerProgress, prayerVoterKey } from './prayer-progress.js';
import { prayerCountText } from './prayer-participation.js';
import { setupAdminActions, clearSummarySession } from './admin-actions.js';
let personalProgress=new Set();try{personalProgress=readPrayerProgress(localStorage);}catch{}
const weekdays=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const libraryIcon=name=>`<img class="icon" src="/icons/${name}.svg" alt="" aria-hidden="true">`;
async function api(url,method='GET',data,options){return backendApi(url,method,data,token,options);}
function toast(message){const el=$('#toast');el.textContent=message;el.className='toast-show';setTimeout(()=>el.className='',4000);}
function header(eyebrow,title,intro){return `<div class="heading-row"><div><h1>${title}</h1>${intro?`<p class="intro">${intro}</p>`:''}</div></div>`;}
function updateTabs(list,selected){
 const tabs=[...list.querySelectorAll('[role="tab"]')];
 tabs.forEach(tab=>{const active=tab===selected;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active||(!selected&&tab===tabs[0])?0:-1;});
 const indicator=list.querySelector('.tab-indicator');indicator.hidden=!selected;
 if(selected){list.style.setProperty('--tab-left',selected.offsetLeft+'px');list.style.setProperty('--tab-width',selected.offsetWidth+'px');}
}
function animateScreen(element){
 element.getAnimations().forEach(animation=>animation.cancel());
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)element.animate([{opacity:.35},{opacity:1}],{duration:180,easing:'ease-out'});
}
function setupTabs(){
 document.addEventListener('keydown',event=>{
  const tab=event.target.closest('[role="tab"]');if(!tab||event.altKey||event.ctrlKey||event.metaKey)return;
  const tabs=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab);
  const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
  if(next<0)return;event.preventDefault();tabs[next].focus();tabs[next].click();
 });
 const list=$('.screen-tabs');
 const resize=new ResizeObserver(()=>updateTabs(list,list.querySelector('[aria-selected="true"]')));
 resize.observe(list);list.querySelectorAll('[role="tab"]').forEach(tab=>resize.observe(tab));
 window.addEventListener('resize',()=>document.querySelectorAll('.screen-tabs').forEach(tabs=>updateTabs(tabs,tabs.querySelector('[aria-selected="true"]'))));
}
function scheduleText(){if(settings.mode==='open')return 'La recepción está abierta';if(settings.mode==='closed')return 'La recepción está cerrada';const days=receptionDays(settings).map(day=>weekdays[day-1]).join(', ');return `${days} · ${settings.start==='00:00'&&settings.end==='24:00'?'Todo el día':settings.start+' a '+settings.end}`;}
function aside(){if(settings.mode==='open')return '';return `<aside class="right-column"><section class="availability"><h2>${icon('clock')}Recepción</h2><p class="availability-state">${settings.open?'Abierta':'Cerrada'}</p><div class="availability-time">${esc(scheduleText())}</div>${settings.mode!=='closed'?'<p class="field-help">Hora de Argentina</p>':''}</section></aside>`;}
function setupRules(){
 const dialog=$('#rules-dialog');
 $('#close-rules').innerHTML=libraryIcon('x');
 $('#rules-content').innerHTML=groupRulesHTML;
 document.addEventListener('click',event=>{if(event.target.closest('#rules-button')){dialog.showModal();document.body.classList.add('dialog-open');$('#rules-content').scrollTop=0;}});
 $('#close-rules').onclick=()=>dialog.close();
 dialog.onclose=()=>document.body.classList.remove('dialog-open');
 dialog.onclick=e=>{if(e.target!==dialog)return;const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)dialog.close();};
}
function reasonHTML(r){return `<section class="reason" aria-label="Motivo de oración"><div class="reason-head"><label for="reason">Motivo de oración</label></div><textarea id="reason" required maxlength="3000" placeholder="Tocá acá para empezar a escribir tu pedido">${esc(r.text)}</textarea></section>`;}
function renderName(){
 document.body.classList.add('name-entry');
 $('#main').innerHTML=`<form id="name-form" class="name-form"><label for="name">Nombre y apellido</label><input id="name" name="name" autocomplete="name" required maxlength="100" placeholder="Escribí tu nombre y apellido" value="${esc(savedName)}"><div id="name-error" role="alert"></div><button class="primary" type="submit">${savedName?'Guardar nombre':'Continuar'}</button>${savedName?'<button class="name-cancel" type="button" id="cancel-name">Cancelar</button>':''}</form>`;
 $('#name-form').onsubmit=e=>{e.preventDefault();const name=$('#name').value.trim();if(!name){$('#name-error').innerHTML='<p class="error">Escribí tu nombre y apellido.</p>';return;}savedName=name;draft.name=name;try{localStorage.setItem('prayer-name',name);}catch{toast('El navegador no pudo guardar tu nombre para la próxima visita.');}navigate(page);};
 if($('#cancel-name'))$('#cancel-name').onclick=()=>navigate(page);
}
function renderForm(){
 $('#main').innerHTML=`<div class="layout prayer-layout"><div>${!settings.open?`<div class="closed-notice" role="status">Recepción cerrada. Podés escribir tu motivo y enviarlo cuando abra.</div>`:''}<form id="prayer-form" class="form-card"><div class="card-heading"><span>${icon('heart')}</span><div><h2>Nuevo pedido de oración</h2></div></div><div class="form-content"><div id="form-error" role="alert"></div><div class="saved-name"><span>${esc(savedName)}</span><button type="button" id="change-name">Cambiar nombre</button></div><div id="reasons">${reasonHTML(draft.reasons[0])}</div><label class="privacy-check"><input id="private" type="checkbox" ${draft.private?'checked':''}><span><strong>Ocultar mi nombre</strong><small>Nadie verá tu nombre</small></span></label></div><div class="form-bottom prayer-actions"><div class="prayer-actions-inner"><button class="secondary cancel-request" id="cancel-request" type="button">Cancelar</button><button class="primary submit" type="submit" ${settings.open?'':'disabled'}><span>${icon('send')}</span>Enviar pedido de oración</button></div></div></form></div>${aside()}</div>`;
 $('#change-name').onclick=renderName;$('#private').onchange=e=>draft.private=e.target.checked;
 $('#reason').oninput=e=>draft.reasons[0].text=e.target.value;
 $('#cancel-request').onclick=()=>{draft=newDraft();requestEditing=false;navigate('mis');};
 $('#prayer-form').onsubmit=async e=>{e.preventDefault();const button=$('.submit'),cancelButton=$('#cancel-request');button.disabled=true;cancelButton.disabled=true;button.textContent='Enviando tu pedido…';$('#form-error').innerHTML='';try{const item=await api('/requests','POST',{...draft,name:draft.private?'Anónimo':savedName});keys.push(item.key);try{localStorage.setItem('prayer-keys',JSON.stringify(keys));}catch{}draft=newDraft();requestEditing=false;renderSuccess({...item,name:savedName});}catch(err){$('#form-error').innerHTML=`<p class="error">${esc(err.message)}</p>`;$('#form-error').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});button.disabled=false;cancelButton.disabled=false;button.textContent='Enviar pedido de oración';}};
}
function renderSuccess(item){$('#main').innerHTML=header('GRACIAS POR COMPARTIR','Pedido enviado','')+`<div class="layout"><div class="success-card" role="status"><div class="success-icon">${icon('check')}</div><h2>Gracias, ${esc(item.name.split(' ')[0])}.</h2><p>Enviaste ${item.reasons.length} motivo${item.reasons.length===1?'':'s'} de oración.<br>No tenés que hacer nada más.</p><button class="primary" id="another">${icon('plus')}Hacer otro pedido</button><button class="secondary" style="margin-top:12px" data-page="mis">Ver mis pedidos</button></div>${aside()}</div>`;$('#another').onclick=()=>navigate('nuevo');window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
const prayerCheck=()=>`<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>`;
function prayerStatus(done,admin=false){return `${done?prayerCheck():icon('clock')}<span>${done?(admin?'Ya oramos':'Orado'):'Pendiente'}</span>`;}
const personalPrayerLabel=done=>done?`${libraryIcon('hands-praying')}Estoy orando`:'Orar por esto';
function personalPrayerButton(number,available=true){const done=personalProgress.has(number);return `<button type="button" class="personal-prayer ${done?'prayed':''}" data-personal-number="${number}" aria-pressed="${done}" ${available?'':'disabled'} aria-label="${done?'Estoy orando. Dejar de marcar oración':'Orar por esto'} — pedido ${number}">${personalPrayerLabel(done)}</button>`;}
function requestContent(reasons){
 return reasons.map(({text})=>{
  const newline=text.indexOf('\n');
  // A short first line can act as the heading; keep the original wording intact.
  if(newline>0&&newline<=100)return `<h3 class="request-title">${esc(text.slice(0,newline))}</h3><p class="request-text">${esc(text.slice(newline+1))}</p>`;
  return text.length<=110?`<h3 class="request-title">${esc(text)}</h3>`:`<p class="request-text">${esc(text)}</p>`;
 }).join('');
}
function requestHTML(r,admin,own=false){
 const done=admin?r.status==='Orado':personalProgress.has(r.number),date=new Date(r.createdAt),bodyId=`request-body-${r.number}`;
 return `<article class="request-item" aria-label="Pedido ${r.number}">
  <span class="print-request-details">Pedido #${r.number} · ${date.toLocaleString('es-AR',{dateStyle:'long',timeStyle:'short'})}</span>
  <div class="request-top"><time class="request-date" datetime="${esc(r.createdAt)}">${date.toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</time><span class="badge ${done?'done':''}" ${admin?'':'data-personal-status'}>${prayerStatus(done,admin)}</span></div>
  ${own?'':`<p class="request-author">${esc(r.private?'Anónimo':r.name)}</p>`}
  <div class="request-body" id="${bodyId}">${requestContent(r.reasons)}</div>
  <button type="button" class="read-request" aria-expanded="false" aria-controls="${bodyId}" hidden>Leer pedido completo ${icon('arrow')}</button>
  <p class="prayer-count" data-prayer-count role="status" aria-live="polite">${prayerCountText(r.prayerCount||0)}</p>
  <div class="request-actions">${admin?`<button class="personal-prayer" data-status="${esc(r.id)}">${prayerCheck()}${done?'Volver a pendiente':'Marcar como orado'}</button>`:personalPrayerButton(r.number,!!r.prayerId)}
   ${r.private?`<span class="confidential">${icon('lock')} Sin nombre</span>`:''}
   <details class="request-menu"><summary aria-label="Más opciones del pedido ${r.number}" title="Más opciones"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></summary><div class="request-menu-content"><span class="request-number">Pedido #${r.number}</span><time datetime="${esc(r.createdAt)}">${date.toLocaleString('es-AR',{dateStyle:'long',timeStyle:'short'})}</time>${admin||own?`<button type="button" class="delete-request" data-delete="${esc(r.id)}">${libraryIcon('trash-2')}Eliminar pedido</button>`:''}</div></details>
  </div></article>`;
}
const requestPreviewObserver=new ResizeObserver(entries=>{
 for(const {target} of entries){const button=target.nextElementSibling;if(!target.classList.contains('expanded'))button.hidden=![...target.children].some(part=>part.scrollHeight>part.clientHeight+1);}
});
function observeRequestPreviews(){requestPreviewObserver.disconnect();document.querySelectorAll('.request-body').forEach(body=>requestPreviewObserver.observe(body));}
document.addEventListener('click',event=>{
 const button=event.target.closest('.read-request');
 if(button){const body=document.getElementById(button.getAttribute('aria-controls')),expanded=button.getAttribute('aria-expanded')!=='true';body.classList.toggle('expanded',expanded);button.setAttribute('aria-expanded',String(expanded));button.innerHTML=expanded?'Ver menos '+icon('arrow'):'Leer pedido completo '+icon('arrow');}
 if(!event.target.closest('dialog'))document.querySelectorAll('.request-menu[open]').forEach(menu=>{if(!menu.contains(event.target))menu.open=false;});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')){document.querySelectorAll('.request-menu[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();});}});
function updatePrayerProgress(items){
 const summary=$('#prayer-progress'),done=items.filter(item=>personalProgress.has(item.number)).length,pending=items.length-done;
 if(summary)summary.textContent=page==='mis'?(items.length?(pending?`Tenés ${pending} pedido${pending===1?' pendiente':'s pendientes'}`:'Ya oraste por todos tus pedidos'):'Un espacio para compartir lo que llevás en el corazón.'):`Tu registro: ${done} de ${items.length} pedidos orados`;
}
async function loadParticipation(items,migrate=true){
 const eligible=items.filter(item=>item.prayerId);if(!eligible.length)return;
 let voterKey,canSave=true;
 try{voterKey=prayerVoterKey(localStorage);}catch{canSave=false;voterKey=prayerVoterKey({getItem:()=>null,setItem:()=>{}});}
 const states=await api('/prayers','POST',{ids:eligible.map(item=>item.prayerId),voterKey});
 for(const item of eligible){
  let state=states.find(state=>state.id===item.prayerId);
  if(migrate&&canSave&&!state.registered&&personalProgress.has(item.number))state=await api('/prayers/'+item.prayerId,'PUT',{voterKey,praying:true,onlyIfMissing:true});
  item.prayerCount=state.prayerCount;item.praying=state.praying;
  if(migrate){if(state.praying)personalProgress.add(item.number);else personalProgress.delete(item.number);try{setPrayerProgress(localStorage,item.number,state.praying);}catch{}}
 }
}
async function togglePersonalPrayer(event,items){
 const button=event.target.closest('[data-personal-number]');if(!button)return false;
 if(button.disabled)return true;
 const number=Number(button.dataset.personalNumber),item=items.find(item=>item.number===number);if(!item?.prayerId)return true;
 button.disabled=true;button.setAttribute('aria-busy','true');
 try{
  let voterKey;try{voterKey=prayerVoterKey(localStorage);}catch{throw new Error('El navegador no permite guardar tu registro de oración. Habilitá el almacenamiento y volvé a intentar.');}
  const state=await api('/prayers/'+item.prayerId,'PUT',{voterKey,praying:!item.praying}),done=state.praying;
  item.praying=done;item.prayerCount=state.prayerCount;if(done)personalProgress.add(number);else personalProgress.delete(number);
  try{setPrayerProgress(localStorage,number,done);}catch{}
  if(!button.isConnected)return true;
  button.setAttribute('aria-pressed',String(done));button.setAttribute('aria-label',`${done?'Estoy orando. Dejar de marcar oración':'Orar por esto'} — pedido ${number}`);button.classList.toggle('prayed',done);button.innerHTML=personalPrayerLabel(done);
  button.closest('.request-item').querySelector('[data-prayer-count]').textContent=prayerCountText(state.prayerCount);
  const badge=button.closest('.request-item').querySelector('[data-personal-status]');badge.classList.toggle('done',done);badge.innerHTML=prayerStatus(done);updatePrayerProgress(items);
 }catch(error){toast(error.message||'No pudimos guardar tu oración. Volvé a intentar.');}
 finally{button.disabled=false;button.removeAttribute('aria-busy');}
 return true;
}
async function deleteRequest(item,button){
 const confirmed=await new Promise(resolve=>{const dialog=$('#delete-dialog');dialog.returnValue='cancel';dialog.onclose=()=>{document.body.classList.remove('dialog-open');resolve(dialog.returnValue==='confirm');};dialog.showModal();document.body.classList.add('dialog-open');});
 if(!confirmed)return false;
 button.disabled=true;
 try{await api('/requests/'+item.id,'DELETE',{key:item.key});keys=keys.filter(key=>key!==(item.key||item.id));try{localStorage.setItem('prayer-keys',JSON.stringify(keys));}catch{}toast('Pedido borrado.');return true;}
 catch(error){button.disabled=false;toast(error.message);return false;}
}
async function renderMine(){
 $('#main').innerHTML=header('','Mis pedidos de oración','')+'<p id="prayer-progress" class="prayer-progress" role="status" aria-live="polite"></p>'+`<button class="primary new-request-button" data-page="nuevo">${icon('plus')}Nuevo pedido</button><div id="mine" class="loading" role="region" aria-label="Mis pedidos" aria-busy="true">Cargando tus pedidos…</div>`;
 const container=$('#mine');
 try{const items=await api('/mine','POST',{keys});await loadParticipation(items);if(!container.isConnected)return;keys=items.map(item=>item.key);try{localStorage.setItem('prayer-keys',JSON.stringify(keys));}catch{}container.className='request-list';container.innerHTML=items.length?items.reverse().map(r=>requestHTML(r,false,true)).join(''):`<div class="panel empty">${icon('heart')}<h2>Estamos para acompañarte</h2><p>Tocá «Nuevo pedido» para compartir tu primer motivo de oración.</p></div>`;observeRequestPreviews();updatePrayerProgress(items);container.onclick=async e=>{if(await togglePersonalPrayer(e,items))return;const button=e.target.closest('[data-delete]');if(!button)return;const item=items.find(item=>item.id===button.dataset.delete);if(item&&await deleteRequest(item,button)&&container.isConnected)renderMine();};}
 catch(e){if(container.isConnected){container.innerHTML=`<p class="error" role="alert">${esc(e.message)}</p><button class="secondary" id="retry-mine">Volver a intentar</button>`;$('#retry-mine').onclick=renderMine;}}
 finally{container.setAttribute('aria-busy','false');}
}
async function renderAll(){
 $('#main').innerHTML=header('','Oramos unos por otros','Acompañá a la comunidad con tu oración.')+'<p id="prayer-progress" class="prayer-progress" role="status" aria-live="polite"></p><div id="all-requests" class="loading" role="region" aria-label="Todos los pedidos" aria-busy="true">Cargando pedidos…</div>';
 const container=$('#all-requests');
 try{const items=await api('/shared-requests');await loadParticipation(items);if(!container.isConnected)return;container.className='request-list';container.innerHTML=items.length?items.map(r=>requestHTML(r,false)).join(''):'<div class="panel empty"><h2>Todavía no hay pedidos</h2><p>Cuando alguien comparta un motivo, lo vas a encontrar acá.</p><button class="primary" data-page="nuevo">Compartir un pedido</button></div>';observeRequestPreviews();updatePrayerProgress(items);container.onclick=e=>togglePersonalPrayer(e,items);}
 catch(e){if(container.isConnected)container.innerHTML=`<p class="error" role="alert">${esc(e.message)}</p><button class="secondary" id="retry-all">Volver a intentar</button>`;if($('#retry-all'))$('#retry-all').onclick=renderAll;}
 finally{container.setAttribute('aria-busy','false');}
}
function renderHelp(){$('#main').innerHTML=header('','Cómo funciona','Unidos, nos acompañamos en oración.')+`<section class="panel">${[['Tu nombre','Tu nombre queda guardado en este navegador. Podés cambiarlo al crear un pedido.'],['Tu motivo','Escribí un motivo por pedido. Para enviar otro, hacé un nuevo pedido.'],['Enviar','Al terminar, tocá “Enviar pedido de oración”.']].map((v,i)=>`<div class="help-step"><span>${i+1}</span><div><h3>${v[0]}</h3><p>${v[1]}</p></div></div>`).join('')}<button class="primary welcome-button" data-page="nuevo">Hacer un pedido ${icon('arrow')}</button></section><section class="panel"><h2>Tu registro de oración</h2><p>Al tocar «Orar por esto», el botón muestra las manos de oración y cambia a «Estoy orando». El pedido suma una persona al contador compartido. Si lo volvés a tocar, se desmarca y el contador baja. Cada navegador cuenta una sola vez por pedido.</p><p>Tu nombre, el acceso a tus pedidos y tus marcas de oración se guardan en este dispositivo y navegador. Si borrás sus datos o cambiás de dispositivo, ese registro no estará disponible.</p><p>Los pedidos se comparten con el grupo. Tu marca personal no cambia el estado que registra el equipo de oración.</p><button type="button" class="secondary rules-link" id="rules-button" aria-haspopup="dialog" aria-controls="rules-dialog">${libraryIcon('clipboard-list')}Reglas del grupo de oración</button></section>`;}
function renderLogin(error=''){clearSummarySession();$('#main').innerHTML=header('EQUIPO DE ORACIÓN','Administración','')+`<form id="login" class="panel admin-login"><h2>Ingreso del equipo de oración</h2>${error?`<p class="error" role="alert">${esc(error)}</p>`:''}<label for="password" class="field-label">Contraseña de administración</label><input id="password" type="password" autocomplete="current-password" required><button class="primary">Ingresar a administración ${icon('arrow')}</button>${settings.demoPassword?'<p class="field-help">Versión de demostración. Contraseña: <strong>oracion</strong>.</p>':''}</form>`;$('#login').onsubmit=async e=>{e.preventDefault();const password=$('#password').value;try{const result=await api('/login','POST',{password});token=result.token;sessionStorage.setItem('prayer-admin',token);renderAdmin();}catch(err){renderLogin(err.message);}};}
async function renderAdmin(){
 if(!token)return renderLogin();
 $('#main').innerHTML=header('EQUIPO DE ORACIÓN','Administración','')+`<div class="admin-navigation"><div class="screen-tabs admin-tabs" role="tablist" aria-label="Administración"><button type="button" class="nav-item" role="tab" aria-controls="admin-content" id="tab-requests">Pedidos</button><button type="button" class="nav-item" role="tab" aria-controls="admin-content" id="tab-settings">Horarios</button><span class="tab-indicator" aria-hidden="true"></span></div><button class="secondary" id="logout">Salir</button></div><div id="admin-content" role="tabpanel"><div class="loading">Cargando…</div></div>`;
 const content=$('#admin-content'),list=$('.admin-tabs');let loaded=false;
 function selectTab(next,animate=false){
  const changed=adminTab!==next;adminTab=next;
  const tab=$(next==='pedidos'?'#tab-requests':'#tab-settings');updateTabs(list,tab);content.setAttribute('aria-labelledby',tab.id);
  if(loaded){if(next==='horario')renderSettings();else renderRequests();}
  if(animate&&changed)animateScreen(content);
 }
 selectTab(adminTab);$('#tab-requests').onclick=()=>selectTab('pedidos',true);$('#tab-settings').onclick=()=>selectTab('horario',true);
 $('#logout').onclick=async()=>{clearSummarySession();await logoutAdmin();token='';sessionStorage.removeItem('prayer-admin');renderLogin();};
 try{const items=await api('/requests');await loadParticipation(items,false);if(!content.isConnected)return;requests=items;loaded=true;selectTab(adminTab);}
 catch(e){if(!content.isConnected)return;if(e.status===401){token='';sessionStorage.removeItem('prayer-admin');renderLogin();}else content.innerHTML=`<p class="error">${esc(e.message)}</p>`;}
}
function renderRequests(){$('#admin-content').innerHTML=`<div class="admin-bulk-actions"><button type="button" class="primary" id="share-all" ${requests.length?'': 'disabled'}>${icon('send')}Compartir todos los pedidos</button><button type="button" class="secondary danger-secondary" id="delete-all" ${requests.length?'': 'disabled'}>Eliminar todos los pedidos</button></div><details class="tools-disclosure"><summary>${libraryIcon('sliders-horizontal')}<span>Buscar, filtrar y exportar<small id="tools-active" hidden>Filtros activos</small></span>${libraryIcon('chevron-down')}</summary><div class="request-tools"><input id="search" aria-label="Buscar por nombre o motivo" placeholder="Buscar por nombre o motivo…"><label>Estado<select id="filter" aria-label="Filtrar por estado"><option value="all">Todos</option><option>Pendiente</option><option>Orado</option></select></label><label>Orden<select id="sort" aria-label="Ordenar pedidos"><option value="new">Recientes</option><option value="old">Antiguos</option><option value="name">Por nombre</option></select></label><div class="tool-actions"><button class="icon-button" id="export" title="Descargar CSV" aria-label="Descargar CSV">${libraryIcon('download')}</button><button class="icon-button" id="print" title="Imprimir pedidos" aria-label="Imprimir pedidos">${libraryIcon('printer')}</button></div></div></details><p class="field-help" id="results-count"></p><div id="requests-list"></div>`;let visible=[];function filter(){queueMicrotask(observeRequestPreviews);const query=$('#search').value.trim().toLocaleLowerCase();visible=requests.filter(r=>($('#filter').value==='all'||r.status===$('#filter').value)&&(r.name+' '+r.reasons.map(v=>v.text+' '+v.category).join(' ')).toLocaleLowerCase().includes(query));if($('#sort').value==='old')visible.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));else if($('#sort').value==='name')visible.sort((a,b)=>a.name.localeCompare(b.name));else visible.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));$('#tools-active').hidden=!query&&$('#filter').value==='all';$('#results-count').textContent=`${visible.length} pedidos`;$('#requests-list').innerHTML=visible.length?visible.map(r=>requestHTML(r,true)).join(''):'<div class="panel empty"><h2>No hay pedidos para mostrar.</h2></div>';}
 $('#search').oninput=filter;$('#filter').onchange=filter;$('#sort').onchange=filter;
 $('#requests-list').onclick=async e=>{const btn=e.target.closest('[data-status],[data-delete]');if(!btn)return;const item=requests.find(r=>r.id===(btn.dataset.status||btn.dataset.delete));if(!item)return;if(btn.dataset.delete){const container=$('#requests-list');if(await deleteRequest(item,btn)){requests=requests.filter(r=>r.id!==item.id);if(container.isConnected)filter();}return;}btn.disabled=true;try{const updated=await api('/requests/'+item.id,'PATCH',{status:item.status==='Orado'?'Pendiente':'Orado'});Object.assign(item,updated);filter();toast('Estado del pedido actualizado.');}catch(err){btn.disabled=false;toast(err.message);}};
 setupAdminActions({api,toast,refresh:async()=>{requests=await api('/requests');if($('#admin-content')?.isConnected&&adminTab==='pedidos'&&page==='admin')renderRequests();}});
 $('#print').onclick=()=>window.print();$('#export').onclick=()=>{const cell=v=>'"'+String(v).replace(/^[=+\-@]/,"'").replaceAll('"','""')+'"';const rows=[['Pedido','Nombre','Fecha','Estado','Confidencial','Número de motivo','Tema','Motivo'],...visible.flatMap(r=>r.reasons.map((v,i)=>[r.number,r.name,r.createdAt,r.status,r.private?'Sí':'No',i+1,v.category,v.text]))];const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='pedidos-de-oracion.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};filter();}
function renderSettings(){const s=settings,days=receptionDays(s),allDay=s.start==='00:00'&&s.end==='24:00';$('#admin-content').innerHTML=`<form id="settings-form" class="panel"><h2>Horario de recepción</h2><div id="settings-error" role="alert"></div><div class="settings-grid"><div class="full"><label for="mode">Estado de recepción</label><select id="mode"><option value="open" ${s.mode==='open'?'selected':''}>Abierta sin horario</option><option value="weekly" ${['weekly','scheduled'].includes(s.mode)?'selected':''}>Según días y horarios</option><option value="closed" ${s.mode==='closed'?'selected':''}>Cerrada</option></select></div><fieldset id="weekly-settings" class="full weekly-settings"><legend>Días de recepción</legend><div class="weekday-list">${weekdays.map((name,i)=>`<label><input type="checkbox" name="day" value="${i+1}" ${days.includes(i+1)?'checked':''}><span>${name}</span></label>`).join('')}</div><label class="all-day"><input id="all-day" type="checkbox" ${allDay?'checked':''}>Todo el día</label><div class="time-grid"><div><label for="start">Desde</label><input id="start" type="time" value="${esc(s.start)}" required></div><div><label for="end">Hasta</label><input id="end" type="time" value="${esc(allDay?'23:59':s.end)}" required></div></div><p class="field-help">Se repite cada semana · Hora de Argentina</p></fieldset></div><button class="primary" type="submit">${icon('check')}Guardar horario</button></form>`;
 function updateFields(){$('#weekly-settings').hidden=$('#mode').value!=='weekly';$('.time-grid').hidden=$('#all-day').checked;$('#start').disabled=$('#end').disabled=$('#all-day').checked||$('#mode').value!=='weekly';}
 $('#mode').onchange=updateFields;$('#all-day').onchange=updateFields;updateFields();
 $('#settings-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;$('#settings-error').innerHTML='';const mode=$('#mode').value,weekly=mode==='weekly',selected=[...document.querySelectorAll('input[name="day"]:checked')].map(input=>Number(input.value));try{settings=await api('/settings','PUT',{mode,days:selected.length?selected:(weekly?[]:receptionDays(settings)),start:weekly?($('#all-day').checked?'00:00':$('#start').value):settings.start,end:weekly?($('#all-day').checked?'24:00':$('#end').value):settings.end});toast('Horario guardado.');}catch(err){$('#settings-error').innerHTML=`<p class="error">${esc(err.message)}</p>`;$('#settings-error').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});}finally{btn.disabled=false;}};
}
let navigationReady=false;
function navigate(next){
 requestPreviewObserver.disconnect();
 const previous=page;
 page=['nuevo','mis','todos','ayuda','admin'].includes(next)?next:'mis';
 if(page==='mis'&&requestEditing)page='nuevo';
 if(page==='nuevo')requestEditing=true;
 history.replaceState(null,'','#'+page);
 if(!savedName&&page!=='admin'){renderName();return;}
 const nameEntry=document.body.classList.contains('name-entry');document.body.classList.remove('name-entry');
 const list=$('nav.screen-tabs'),selected=list.querySelector(`[data-page="${page==='nuevo'?'mis':page}"]`),main=$('#main');updateTabs(list,selected);
 document.querySelectorAll('.sidebar-bottom [data-page]').forEach(button=>{if(button.dataset.page===page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
 if(selected){main.setAttribute('role','tabpanel');main.setAttribute('aria-labelledby',selected.id);}else{main.removeAttribute('role');main.removeAttribute('aria-labelledby');}
 if(page==='nuevo')renderForm();if(page==='mis')renderMine();if(page==='todos')renderAll();if(page==='ayuda')renderHelp();if(page==='admin')renderAdmin();
 if(navigationReady&&(previous!==page||nameEntry))animateScreen(main);navigationReady=true;window.scrollTo({top:0});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)navigate(b.dataset.page);});window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));icons();setupRules();setupTabs();
async function boot(){try{const admin=await restoreAdminSession();if(admin!==null){token=admin?'firebase':'';if(token)sessionStorage.setItem('prayer-admin',token);else sessionStorage.removeItem('prayer-admin');}settings=await api('/settings');navigate(location.hash.slice(1)||'mis');}catch(e){$('#main').innerHTML=`<div class="panel"><h1>No pudimos conectar.</h1><p>Revisá tu conexión y volvé a intentarlo.</p><button class="primary" id="retry">Tocá acá para volver a intentar</button></div>`;$('#retry').onclick=boot;}}
boot();setInterval(async()=>{try{const s=await api('/settings');const signature=value=>JSON.stringify([value.open,value.mode,value.days,value.start,value.end]);const changed=settings&&signature(settings)!==signature(s);settings=s;if(changed&&page==='nuevo'&&$('#prayer-form'))renderForm();}catch{}},30000);
