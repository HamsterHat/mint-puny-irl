 'use strict';
window.AdvancedRolesUI=(()=>{
 const $=id=>document.getElementById(id);
 let localBusy=false,selectedAbility=null,signature='',hackTarget=null;
 const sprites={judge:'/assets/ui/abilities/judge.png',protect:'/assets/ui/abilities/protect.png',hack:'/assets/ui/abilities/hack.png',terminate:'/assets/ui/abilities/terminate.png'};
 if(typeof abilitySprites!=='undefined')Object.assign(abilitySprites,sprites);
 function current(){return typeof state!=='undefined'?state:null;}
 function canUse(ability){const s=current();return Boolean(s&&connected&&!localBusy&&s.phase==='playing'&&s.me.state==='awake'&&ability.duringMeeting&&!ability.disabled&&((s.meeting&&['judge','protect','terminate'].includes(ability.id))||(s.meetingResolution&&ability.id==='terminate')));}
 async function use(ability,targetId){
  if(!canUse(ability))return;localBusy=true;render(true);
  try{await request('game:ability',{ability:ability.id,targetId});$('advanced-targets-dialog').close();}
  catch(error){$('advanced-targets-error').textContent=error.message;const status=$('connection-status');if(status)status.textContent=error.message;}
  finally{localBusy=false;render(true);}
 }
 function openTargets(ability){selectedAbility=ability;$('advanced-targets-title').textContent=ability.name;$('advanced-targets-error').textContent='';renderTargets();$('advanced-targets-dialog').showModal();}
 function renderTargets(){
  const s=current();if(!s||!selectedAbility)return;
  const container=$('advanced-targets-list');container.replaceChildren();
  for(const target of s.players){
   const allowed=selectedAbility.id==='judge'?target.state!=='exiled':target.state==='awake';
   const button=document.createElement('button');button.type='button';button.textContent=target.username+(target.state==='sleeping'?' · спит':target.state==='exiled'?' · изгнан':'');
   button.disabled=!allowed||!canUse(selectedAbility);button.addEventListener('click',()=>use(selectedAbility,target.id));container.appendChild(button);
  }
 }
 function makeAbility(ability){
  const button=$('meeting-ability-template').content.firstElementChild.cloneNode(true);button.querySelector('img').src=sprites[ability.id];button.querySelector('span').textContent=ability.name;button.disabled=!canUse(ability);
  button.addEventListener('click',()=>ability.targets?openTargets(ability):use(ability));return button;
 }
 function render(force=false){
  const s=current();if(!s)return;
  const abilities=s.me.abilities.filter(a=>a.duringMeeting);
  const sig=JSON.stringify([s.phase,s.me.state,s.meeting?.id,s.meetingResolution,s.meetingTerminated,abilities,localBusy]);
  if(!force&&sig===signature)return;signature=sig;
  const normal=$('meeting-role-abilities');const resolution=$('resolution-role-abilities');normal.replaceChildren();resolution.replaceChildren();
  if(s.meeting)for(const ability of abilities)normal.appendChild(makeAbility(ability));
  if(s.meetingResolution)for(const ability of abilities)if(ability.id==='terminate')resolution.appendChild(makeAbility(ability));
  $('resolution-role-controls').hidden=!s.meetingResolution||resolution.children.length===0||s.me.state!=='awake';
  if($('advanced-targets-dialog').open){
   const latest=abilities.find(a=>a.id===selectedAbility?.id);
   if(!s.meeting||!latest||latest.disabled)$('advanced-targets-dialog').close();else{selectedAbility=latest;renderTargets();}
  }
 }
 async function openHack(){
  const s=current();if(!s||s.phase!=='playing'||s.meetingLocked)return;
  hackTarget=null;$('hack-title').textContent='HACK: выбери игрока';$('hack-error').textContent='';const container=$('hack-list');container.replaceChildren();
  for(const target of s.players){
   if(target.id===s.me.id)continue;const button=document.createElement('button');button.type='button';button.textContent=target.username;button.disabled=target.state!=='awake';button.addEventListener('click',()=>hackOptions(target));container.appendChild(button);
  }
  $('hack-dialog').showModal();
 }
 async function hackOptions(target){
  if(localBusy)return;localBusy=true;
  try{
   const reply=await request('game:hack-options',{targetId:target.id});hackTarget=target;
   $('hack-title').textContent=`HACK: ${target.username}`;const container=$('hack-list');container.replaceChildren();
   for(const option of reply.options){const button=document.createElement('button');button.type='button';button.textContent=option.name;button.addEventListener('click',()=>applyHack(option.id));container.appendChild(button);}
   if(!reply.options.length){const note=document.createElement('p');note.textContent='У цели нет способностей для взлома.';container.appendChild(note);}
  }catch(error){$('hack-error').textContent=error.message;}finally{localBusy=false;}
 }
 async function applyHack(abilityId){
  if(localBusy||!hackTarget)return;localBusy=true;
  $('hack-list').querySelectorAll('button').forEach(button=>button.disabled=true);
  try{const reply=await request('game:ability',{ability:'hack',targetId:hackTarget.id,params:{abilityId}});$('hack-dialog').close();if(!reply.blocked&&typeof GameAudio!=='undefined')GameAudio.play('click');}
  catch(error){$('hack-error').textContent=error.message;}
  finally{localBusy=false;$('hack-list').querySelectorAll('button').forEach(button=>button.disabled=false);}
 }
 $('advanced-targets-close').addEventListener('click',()=>$('advanced-targets-dialog').close());$('hack-close').addEventListener('click',()=>$('hack-dialog').close());
 if(current()?.me&&typeof renderAbilities==='function')renderAbilities();
 setInterval(render,100);render();return{openHack};
})();
