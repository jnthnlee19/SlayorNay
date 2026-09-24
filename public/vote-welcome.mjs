// Presentation only: the real voting card loads underneath this welcome dialog.
export function firstPhotoState(main) {
 if(main.querySelector('[data-action="retry"]'))return 'error';
 const card=main.querySelector('#vote-card, .vote-finish');
 if(!card)return 'loading';
 const img=card.querySelector('img[data-product-photo]');
 if(!img)return 'ready'; // Empty deck or a product with the normal no-photo card.
 return img.complete&&img.naturalWidth>0?'ready':'loading';
}

export function showVoteWelcome() {
 if(location.hash&&location.hash!=='#vote')return;
 const key='got-welcome-seen-v1';
 let returning=false;try{returning=localStorage.getItem(key)==='yes';}catch{}
 const main=document.querySelector('#main');
 if(!main||!HTMLDialogElement.prototype.showModal)return;
 const dialog=document.createElement('dialog');
 dialog.className='vote-welcome';dialog.setAttribute('aria-labelledby','welcome-title');
 dialog.innerHTML=`<div class="welcome-content"><img src="/wordmark.png" alt="Gloss or Toss" width="1600" height="350"><span class="welcome-eyebrow">YOUR NAIL DESK. YOUR VERDICT.</span><h1 id="welcome-title">${returning?'Welcome back.':'Welcome to<br>Gloss or Toss.'}</h1><p>Real products. Your honest verdict.</p><button type="button" class="pink welcome-start">Let’s Vote →</button><p class="welcome-status" role="status" aria-live="polite">Getting your first product ready…</p><div class="welcome-recovery" hidden><button type="button" class="welcome-retry">Try again</button><a href="#discover">Explore products instead →</a></div></div>`;
 document.body.append(dialog);
 const button=dialog.querySelector('.welcome-start'),status=dialog.querySelector('.welcome-status');
 let requested=returning,closed=false;
 const remember=()=>{try{localStorage.setItem(key,'yes');}catch{}};
 function close(){if(closed)return;closed=true;clearTimeout(showTimer);clearTimeout(slowTimer);observer.disconnect();main.removeEventListener('load',check,true);main.removeEventListener('error',check,true);window.removeEventListener('hashchange',leave);dialog.close();dialog.remove();}
 function check(){
  if(closed)return;
  const state=firstPhotoState(main);
  if(state==='error'){close();return;}
  if(state==='ready'){
   if(requested){close();return;}
   status.textContent='Your first product is ready.';
   button.disabled=false;button.textContent='Let’s Vote →';
   dialog.querySelector('.welcome-recovery').hidden=true;
  }else if(requested){button.disabled=true;button.textContent='Getting ready…';}
 }
 function leave(){if(location.hash!=='#vote')close();}
 button.addEventListener('click',()=>{remember();requested=true;check();});
 dialog.querySelector('.welcome-retry').addEventListener('click',()=>location.reload());
 dialog.addEventListener('cancel',()=>{remember();close();});
 const observer=new MutationObserver(check);
 observer.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 main.addEventListener('load',check,true);main.addEventListener('error',check,true);
 window.addEventListener('hashchange',leave);
 const showTimer=setTimeout(()=>{if(!closed){dialog.showModal();if(returning)button.hidden=true;}},returning?180:0);
 const slowTimer=setTimeout(()=>{
  if(closed||firstPhotoState(main)==='ready')return;
  status.textContent='This is taking a little longer. You can retry or explore while it loads.';
  dialog.querySelector('.welcome-recovery').hidden=false;
 },10000);
 check();
 return close;
}
