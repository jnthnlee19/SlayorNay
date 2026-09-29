import { BRANDS, filterCatalog } from './stash-catalog.mjs';
import {effectiveHex,normalizeHex,normalizeOverride,colorInfo,COLOR_FAMILIES} from './stash-color.mjs';
import {readAccountStash,setOwned,saveColor} from './stash-store.mjs';
const native=new URLSearchParams(location.search).get('native')==='ios';
document.documentElement.classList.toggle('native-stash',native);
for(const link of document.querySelectorAll('[data-app-route]'))link.href='/'+(native?'?native=ios':'')+'#'+link.dataset.appRoute;
document.querySelector('.wordmark').href='/stash.html'+(native?'?native=ios':'');

const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let layout='list';
try{if(localStorage.getItem('my-stash:layout')==='grid')layout='grid';}catch{}
const state = { query:'', brand:'', view:'all', sort:'brand', family:'', batchSize:24, visible:24 };
let colorOverrides={};
let catalog=[], metadata={}, owned=new Set(), user=null, busy=new Set(), ready=false, stashError=false, toastTimer, accountVersion=0;

function notify(message, undo) {
  clearTimeout(toastTimer);
  const toast=$('#toast'); toast.replaceChildren(document.createTextNode(message));
  if(undo){ const button=document.createElement('button');button.textContent='Undo';button.onclick=()=>{toast.hidden=true;undo();};toast.append(button); }
  toast.hidden=false; toastTimer=setTimeout(()=>toast.hidden=true,undo?9000:5500);
}
function renderBanner() {
  const banner=$('#mode-banner');
  if(stashError){banner.replaceChildren(document.createTextNode('We couldn’t load your stash. Ownership is unavailable until you retry. '));const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=()=>loadUser(user);banner.append(retry);}
  else if(!navigator.onLine) banner.textContent='You’re offline. Reconnect to load or update your synced stash.';
  else if(!ready) banner.textContent='Loading your personal stash…';
  else if(!user){banner.replaceChildren(document.createTextNode('Sign in to save your stash and color edits. '));const button=document.createElement('button');button.textContent='Sign in / Sign up';button.onclick=showAccount;banner.append(button);}
  else banner.textContent=ready?'Your personal stash · Saved to your account':'Loading your personal stash…';

}
function render() {
  renderBanner();
  $('#results').classList.toggle('square-grid',layout==='grid');
  document.querySelectorAll('[data-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===layout)));
  const knownIds=new Set(catalog.map(p=>p.id));
  const count=[...owned].filter(id=>knownIds.has(id)).length;
  $('#owned-total').textContent=`${count.toLocaleString()} owned`;
  $('#collection-view').value=state.view;$('#brands').value=state.brand;
  $('#reset').hidden=!state.query&&!state.brand&&!state.family;
  const filtered=filterCatalog(catalog,state,owned,colorOverrides);
  $('#result-count').textContent=`${filtered.length.toLocaleString()} ${filtered.length===1?'polish':'polishes'}${state.brand?' · '+state.brand:''}`;
  const results=$('#results');results.setAttribute('aria-busy','false');
  if((!ready||stashError)&&state.view!=='all'){
    results.innerHTML=`<div class="empty"><h2>${stashError?'Your stash couldn’t load':'Loading your stash'}</h2><p>${stashError?'Please use Retry above before checking what you own.':'Your saved collection will appear here shortly.'}</p></div>`;
  }else if(!user&&state.view!=='all'){
    results.innerHTML='<div class="empty"><h2>Your collection starts here.</h2><p>Sign in with your Gloss or Toss account to save your stash.</p></div>';
  }else if(!filtered.length){
    const emptyStash=state.view==='owned'&&!owned.size;
    results.innerHTML=`<div class="empty"><h2>${emptyStash?'Let’s find your first polish.':'No shades found.'}</h2><p>${emptyStash?'Tap + on a polish you own.':state.view==='unowned'&&!state.query?'You own every polish in this selection.':'Try a different name, number, or brand. The catalog may not include every shade yet.'}</p><button class="primary" id="empty-reset">${emptyStash?'Browse polishes':'Show all polishes'}</button></div>`;
    $('#empty-reset').onclick=()=>reset(true);
  }else{
    results.innerHTML=filtered.slice(0,state.visible).map(p=>{
      const isOwned=owned.has(p.id); const uncertain=!ready||stashError;
      return `<article class="polish-card ${isOwned?'is-owned':''}"><div class="card-face ${effectiveHex(p,colorOverrides)?'has-swatch':''}" data-polish="${escapeHTML(p.id)}" data-brand="${BRANDS.indexOf(p.brand)}"><div class="shade-copy"><div class="shade-meta"><span class="card-brand">${escapeHTML(p.brand)}</span><span class="card-number">${escapeHTML(p.number?`#${p.number}`:'—')}</span></div><h2 class="card-name" title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h2></div><div class="shade-actions"><button class="edit-color" data-edit-color="${escapeHTML(p.id)}" aria-label="${escapeHTML(`Edit color for ${p.brand} ${p.name} ${p.number}`)}" title="Edit color and group"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z"/></svg></button><button class="ownership" data-id="${escapeHTML(p.id)}" aria-pressed="${isOwned}" aria-label="${escapeHTML(`${isOwned?'Remove':'Add'} ${p.brand} ${p.name} ${p.number} ${isOwned?'from':'to'} stash`)}" ${busy.has(p.id)||uncertain?'disabled':''}><span class="symbol" aria-hidden="true">${busy.has(p.id)?'…':isOwned?'✓':'+'}</span></button></div></div></article>`;

    }).join('');
  }
  for(const face of results.querySelectorAll('[data-polish]')){
    const p=catalog.find(p=>p.id===face.dataset.polish),info=colorInfo(effectiveHex(p,colorOverrides));
    if(info){face.style.backgroundColor=info.hex;face.style.color=info.foreground;face.title=`${normalizeOverride(colorOverrides[p.id])?.hex?'Your color':'Approximate color'}: ${info.hex.toUpperCase()}`;}
  }
  const pagination=$('#pagination');pagination.replaceChildren();
  if(filtered.length&&!(state.view!=='all'&&(!ready||!user||stashError))){
    const label=document.createElement('span');label.setAttribute('role','status');label.textContent=`Showing ${Math.min(state.visible,filtered.length).toLocaleString()} of ${filtered.length.toLocaleString()} polishes`;pagination.append(label);
    if(state.visible<filtered.length){
      const more=document.createElement('button');more.textContent=`View ${Math.min(state.batchSize,filtered.length-state.visible)} more`;more.id='view-more';
      more.onclick=()=>{const firstNew=state.visible;state.visible+=state.batchSize;render();const card=$('#results').children[firstNew];if(card){card.setAttribute('tabindex','-1');card.focus({preventScroll:true});}};
      pagination.append(more);
    }
  }
}
async function changeOwnership(id, desired, allowUndo=true) {
  if(busy.has(id)||!catalog.some(p=>p.id===id)) return;
  if(!user){showAccount();return;}
  if((!ready||stashError)){notify('Load your stash before making changes.');return;}
  if(!navigator.onLine){notify('Reconnect to save changes to your account.');return;}
  const previous=owned.has(id); if(desired===previous)return;
  const version=accountVersion;
  busy.add(id);render();
  try{
    await setOwned(user.id,id,desired);
    if(version!==accountVersion)return;
    const next=new Set(owned);desired?next.add(id):next.delete(id);

    owned=next;
    const p=catalog.find(p=>p.id===id);
    notify(`${p.name} ${desired?'added to':'removed from'} your stash.`,allowUndo?()=>{if(version===accountVersion)changeOwnership(id,previous,false);}:null);
  }catch {notify('Couldn’t save that change. Your stash is unchanged; please try again.');}
  finally{busy.delete(id);render(); const button=[...document.querySelectorAll('[data-id]')].find(b=>b.dataset.id===id);if(button)button.focus({preventScroll:true});}
}
function reset(all=false){state.query='';state.brand='';state.family='';$('#color-family').value='';state.visible=state.batchSize;if(all)state.view='all';$('#search').value='';render();}
function editColor(id){
 const polish=catalog.find(p=>p.id===id);if(!polish)return;
 if(!user){showAccount();return;}
 if((!ready||stashError)){notify('Load your stash before editing colors.');return;}
 const dialog=$('#color-dialog'),version=accountVersion;
 $('#color-title').textContent=polish.name;
 $('#color-subtitle').textContent=`${polish.brand} · ${polish.number}`;
 const initial=effectiveHex(polish,colorOverrides);
 $('#hex-input').value=initial||'';$('#color-picker').value=initial||'#c8798c';$('#color-error').textContent='';
 $('#edit-family').innerHTML='<option value="">Automatic (from hex code)</option>'+COLOR_FAMILIES.filter(([key])=>key!=='unknown').map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
 $('#edit-family').value=normalizeOverride(colorOverrides[id])?.family||'';
 $('#original-color').disabled=!Object.hasOwn(colorOverrides,id);
 const update=()=>{
  const info=colorInfo($('#hex-input').value),family=$('#edit-family').value||info?.family;
  const invalid=Boolean($('#hex-input').value.trim())&&!info;
  $('#save-color').disabled=invalid||(!info&&!family);
  $('#color-preview').style.backgroundColor=info?.hex||'#f1eae3';$('#color-preview').style.color=info?.foreground||'#362c2b';
  $('#color-preview').textContent=family?`${info?info.hex.toUpperCase():'No header color'} · ${COLOR_FAMILIES.find(([key])=>key===family)[1]}`:'Choose a color';
  $('#hex-input').setAttribute('aria-invalid',String(Boolean($('#hex-input').value)&&!info));
  $('#color-error').textContent=$('#hex-input').value&&!info?'Use a 3- or 6-digit hex code, such as #C8798C.':'';
  if(info)$('#color-picker').value=info.hex;
 };
 $('#hex-input').oninput=update;$('#edit-family').onchange=update;$('#color-picker').oninput=()=>{$('#hex-input').value=$('#color-picker').value;update();};update();
 const commit=async value=>{
  if(version!==accountVersion){dialog.close();return;}
  if(!navigator.onLine){$('#color-error').textContent='Reconnect to save your color.';return;}
  const controls=[...dialog.querySelectorAll('button,input,select')];controls.forEach(c=>c.disabled=true);
  try{
   await saveColor(user.id,id,value);
   if(version!==accountVersion){dialog.close();return;}
   const next={...colorOverrides};if(value===null)delete next[id];else next[id]=value;
   colorOverrides=next;dialog.close();render();notify(value===null?'Original color and automatic group restored.':'Your color and group are saved.');
  }catch{$('#color-error').textContent='Couldn’t save the color. Please try again.';}
  finally{controls.forEach(c=>c.disabled=false);if(dialog.open){update();$('#original-color').disabled=!Object.hasOwn(colorOverrides,id);}}
 };
 $('#color-form').onsubmit=e=>{e.preventDefault();const hex=normalizeHex($('#hex-input').value),family=$('#edit-family').value||null;if($('#hex-input').value.trim()&&!hex)return;const customHex=hex===normalizeHex(polish.swatch?.hex)?null:hex;if(hex||family)commit(customHex||family?{hex:customHex,family}:null);};
 $('#original-color').onclick=()=>commit(null);
 dialog.showModal();
}
function showAccount(){location.href='/?return=stash'+(native?'&native=ios':'')+'#profile';}
async function loadUser(){
  const version=++accountVersion;user=null;owned=new Set();colorOverrides={};busy.clear();ready=false;stashError=false;if($('#color-dialog').open)$('#color-dialog').close();render();
  try{const data=await readAccountStash();if(version!==accountVersion)return;user=data.user;owned=new Set(data.owned);colorOverrides=data.colors;ready=true;}
  catch(error){if(version!==accountVersion)return;ready=true;if(error.status===401||error.status===403){user=null;if(error.status===403)notify(error.message);}else{stashError=true;ready=false;}}
  render();
}
window.addEventListener('stash-session-changed',()=>loadUser());
$('#brands').innerHTML=['',...BRANDS].map(b=>`<option value="${escapeHTML(b)}">${escapeHTML(b||'All brands')}</option>`).join('');
$('#brands').onchange=e=>{state.brand=e.target.value;state.visible=state.batchSize;render();};
$('#collection-view').onchange=e=>{state.view=e.target.value;state.visible=state.batchSize;render();};
$('#search').oninput=e=>{state.query=e.target.value;state.visible=state.batchSize;render();};
$('#sort').onchange=e=>{state.sort=e.target.value;state.visible=state.batchSize;render();};
$('#color-family').innerHTML='<option value="">All colors</option>'+COLOR_FAMILIES.map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
$('#color-family').onchange=e=>{state.family=e.target.value;state.visible=state.batchSize;render();};
$('#display-count').onchange=e=>{state.batchSize=Number(e.target.value);state.visible=state.batchSize;render();};
$('#reset').onclick=()=>reset();
document.querySelectorAll('[data-layout]').forEach(button=>button.onclick=()=>{layout=button.dataset.layout;try{localStorage.setItem('my-stash:layout',layout);}catch{}render();});
$('#results').onclick=e=>{const edit=e.target.closest('[data-edit-color]');if(edit){editColor(edit.dataset.editColor);return;}const button=e.target.closest('[data-id]');if(button)changeOwnership(button.dataset.id,!owned.has(button.dataset.id));};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('#catalog-info').onclick=()=>{
  $('#info-content').innerHTML=`<p>${catalog.filter(p=>!p.retired).length.toLocaleString()} shades across eight brands. Imported ${escapeHTML(metadata.importedAt||'recently')} from official catalogs.</p><p>This is a snapshot of the listed collections, not a guarantee of every current or discontinued shade. Colored headers are approximate samples from official brand swatch and product images. Personal edits apply only to your view. Shimmer, sheer and cat-eye finishes can look different in person. A neutral header means no usable swatch was available. Where no separate color number is available, the brand’s product code is shown.</p><ul class="source-list">${(metadata.sources||[]).map(s=>`<li><a href="${escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.brand)}</a> · ${s.count} shades</li>`).join('')}</ul>`;$('#info-dialog').showModal();
};
document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('#search').focus();}});
window.addEventListener('online',()=>{loadUser();});
window.addEventListener('offline',renderBanner);
let refreshTime=0;
window.addEventListener('focus',()=>{if(!busy.size&&!document.querySelector('dialog[open]')&&Date.now()-refreshTime>15000){refreshTime=Date.now();loadUser(user);}});
async function boot(){
 try{
   const response=await fetch('/stash-catalog.json');if(!response.ok)throw Error('Catalog unavailable');const data=await response.json();
   catalog=data.polishes;metadata=data;render();
   await loadUser();
 }catch{
   if(catalog.length){ready=false;stashError=true;render();return;}
   $('#results').setAttribute('aria-busy','false');$('#result-count').textContent='Catalog unavailable';
   $('#results').innerHTML='<div class="empty"><h2>We couldn’t load the catalog.</h2><p>Check your connection and try again.</p><button class="primary" id="retry">Try again</button></div>';$('#retry').onclick=boot;
 }
}
window.addEventListener('pageshow',e=>{if(e.persisted)loadUser();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy.size&&!document.querySelector('dialog[open]'))loadUser();});
boot();



