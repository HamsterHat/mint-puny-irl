 'use strict';
// Classic script loaded AFTER ingame.js. Its state/socket variables are shared.
(()=>{
  const $=id=>document.getElementById(id);
  if(typeof introShown!=='undefined')introShown=true;
  if(typeof abilitySprites!=='undefined')abilitySprites.poke='/assets/ui/abilities/poke.png';
  const cache=new Map();
  let roundId=null,renderedStage=null,resultSignature='';
  function time(){return Date.now()+(typeof clockOffset==='number'?clockOffset:0);}
  function load(src){
    if(cache.has(src))return cache.get(src);
    const promise=new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{cache.delete(src);resolve(null);};image.src=src;});
    cache.set(src,promise);return promise;
  }
  async function draw(canvas,equipped={}){
    const layers=[['player',equipped.color],['face',equipped.face],['glasses',equipped.glasses],['hats',equipped.hat]];
    const images=await Promise.all(layers.map(([folder,id])=>typeof id==='string'&&id?load(`/assets/${folder}/${encodeURIComponent(id)}.png`):Promise.resolve(null)));
    if(!canvas.isConnected)return;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;
    for(const image of images)if(image)ctx.drawImage(image,Math.round((canvas.width-image.naturalWidth)/2),Math.round((canvas.height-image.naturalHeight)/2));
  }
  function closeDialogs(){for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();}
  function render(){
    if(typeof state==='undefined'||!state?.me)return;
    const current=state;
    if(roundId!==current.gameId){roundId=current.gameId;renderedStage=null;resultSignature='';}
    const intro=current.phase==='intro'?current.intro:null;
    $('round-intro').hidden=!intro;
    if(intro){
      closeDialogs();
      const stage=time()<intro.shushEndsAt?'shush':time()<intro.factionEndsAt?'faction':'role';
      for(const name of ['shush','faction','role'])$(`intro-${name}`).hidden=stage!==name;
      $('round-intro').dataset.faction=stage==='shush'?'':intro.faction;
      const signature=`${roundId}:${stage}`;
      if(renderedStage!==signature){
        renderedStage=signature;
        const modifiers=current.me.modifiers??[];
        $('intro-faction-name').textContent=intro.faction;
        $('intro-modifier-names').textContent=modifiers.map(item=>item.name).join(' · ');
        $('intro-role-name').textContent=current.me.role?.name??'';
        $('intro-role-description').textContent=current.me.role?.description??'';
        $('intro-modifier-descriptions').textContent=modifiers.map(item=>`${item.name}\n${item.description}`).join('\n\n');
        if(stage==='faction'){
          const container=$('intro-teammates');container.replaceChildren();
          for(const player of intro.teammates){
            const element=$('intro-player-template').content.firstElementChild.cloneNode(true);element.querySelector('span').textContent=player.username;container.appendChild(element);draw(element.querySelector('canvas'),player.equipped);
          }
        }
        if(stage==='role')draw($('intro-self'),intro.self.equipped);
      }
    }
    const sixthUntil=current.me.feedback?.sixthSenseUntil??0;
    const sixth=current.phase==='playing'&&time()<sixthUntil;
    $('sixth-sense-overlay').hidden=!sixth;document.body.classList.toggle('sixth-sense',sixth);
    const ejectionUntil=current.meetingResult?.animateUntil??0;
    const showResult=current.phase==='finished'&&time()>=ejectionUntil;
    $('round-result').hidden=!showResult;
    if(showResult){
      closeDialogs();
      const signature=JSON.stringify([current.gameId,current.result,current.won,current.reward]);
      if(signature!==resultSignature){
        resultSignature=signature;const cancelled=Boolean(current.result?.cancelled);
        $('round-result').className=cancelled?'cancelled':current.won?'victory':'defeat';
        $('result-heading').textContent=cancelled?'ROUND CANCELLED':current.won?'VICTORY':'DEFEAT';
        $('result-reason').textContent=current.result?.reason??'';
        const reward=current.reward;
        $('result-reward').textContent=cancelled?'Награды за отменённый раунд не выдаются.':reward?.status==='paid'?`+${reward.coins} коинов`:reward?.status==='error'?'Не удалось сохранить награду. Сервер повторит попытку.':`Начисление ${reward?.coins??0} коинов…`;
        $('result-return').disabled=!cancelled&&reward?.status!=='paid';
      }
    }
  }
  $('result-return').addEventListener('click',()=>{if(typeof state!=='undefined'&&state.phase==='finished'&&(state.result?.cancelled||state.reward?.status==='paid'))location.assign('/?resume=1');});
  if(typeof state!=='undefined'&&state?.me&&typeof renderAbilities==='function')renderAbilities();
  setInterval(render,60);render();
})();
