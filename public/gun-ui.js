'use strict';
(() => {
 if(window.GunUI)return;
 const records=new Map();let picker=null,chosenTarget=null,chosenMeeting=null,pending=false,lastMeeting=null;
 const $=id=>document.getElementById(id);
 function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
 function state(){return window.MeetingUI?.getState()??null;}
 function modifier(s){return s?.me?.modifiers?.find(m=>m.id==='gun-guesser');}
 function error(text){const n=$('meeting-error');if(n)n.textContent=text;}
 function close(){if(picker)picker.hidden=true;chosenTarget=null;chosenMeeting=null;}
 function build(){if(picker)return;const root=$('meeting-dialog');if(!root)return;picker=el('section','gun-picker');picker.hidden=true;picker.setAttribute('aria-label','Выбор роли для Пушки');const panel=el('div','gun-picker-panel');const head=el('header','gun-picker-header');head.appendChild(el('h2','','ПУШКА'));const x=el('button','gun-picker-close','×');x.type='button';x.title='Закрыть';x.addEventListener('click',close);head.appendChild(x);panel.appendChild(head);panel.appendChild(el('p','gun-picker-target'));panel.appendChild(el('p','gun-picker-help','Укажи роль цели. Попадание применяется сразу, до анимации.'));const search=el('input','gun-role-search');search.type='search';search.placeholder='Найти роль…';search.setAttribute('aria-label','Поиск роли');search.addEventListener('input',()=>{for(const b of panel.querySelectorAll('.gun-role-option'))b.hidden=!b.textContent.toLocaleLowerCase().includes(search.value.toLocaleLowerCase());});panel.appendChild(search);panel.appendChild(el('div','gun-role-list'));picker.appendChild(panel);picker.addEventListener('click',e=>{if(e.target===picker)close();});picker.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});root.appendChild(picker);}
 function open(player){const s=state(),m=modifier(s);if(!s?.meeting||!m?.canGuess||pending)return;build();if(!picker)return;chosenTarget=player.id;chosenMeeting=s.meeting.id;picker.querySelector('.gun-picker-target').textContent='Цель: '+player.username;const search=picker.querySelector('.gun-role-search');search.value='';const list=picker.querySelector('.gun-role-list');list.replaceChildren();for(const role of m.roles??[]){const b=el('button','gun-role-option',role.name);b.type='button';b.addEventListener('click',()=>shoot(role.id));list.appendChild(b);}picker.hidden=false;search.focus();}
 async function shoot(roleId){const s=state();if(pending||!s?.meeting||s.meeting.id!==chosenMeeting)return;const targetId=chosenTarget;pending=true;close();error('');refresh();try{const result=await window.MeetingUI.send('game:guess',{targetId,roleId});for(const shot of result.shots??[])receiveShot(shot);if(!result.correct)error('Роль не угадана. Применено последствие из настроек.');}catch(e){error(e.message);}finally{pending=false;refresh();}}
 function cardFor(id){return Array.from($('meeting-players')?.children??[]).find(card=>card.dataset.playerId===id);}
 function receiveShot(shot){if(!shot?.id)return;records.set(shot.id,shot);while(records.size>120)records.delete(records.keys().next().value);const s=state();if(s&&shot.gameId!==s.gameId)return;const player=s?.players?.find(p=>p.id===shot.targetId);window.GunVFX?.play(shot,{card:cardFor(shot.targetId),player});refresh();}
 function refresh(){const s=state();if(!s)return;const m=modifier(s),meeting=s.meeting;
  if(picker&&!picker.hidden&&(!meeting||meeting.id!==chosenMeeting||!m?.canGuess))close();
  for(const shot of [...(s.gunShots?.shots??[]),...(window.MeetingUI?.getGunShots()??[])]){if(!records.has(shot.id)){records.set(shot.id,shot);if(shot.gameId===s.gameId)window.GunVFX?.play(shot,{card:cardFor(shot.targetId),player:s.players?.find(p=>p.id===shot.targetId)});}}
  let bar=$('gun-owner-status');if(m&&meeting){if(!bar){bar=el('div','gun-owner-status');bar.id='gun-owner-status';$('meeting-dialog').querySelector('.meeting-header')?.appendChild(bar);}bar.hidden=false;bar.textContent=`💢 Пушка · Попыток: ${m.remaining===null?'∞':m.remaining}${m.reason?' · '+m.reason:''}`;}else if(bar)bar.hidden=true;
  if(!meeting)return;
  if(lastMeeting!==meeting.id){lastMeeting=meeting.id;for(const[id,shot]of records)if(shot.meetingId!==meeting.id||shot.gameId!==s.gameId)records.delete(id);}
  const latest=new Map();for(const shot of records.values())if(shot.gameId===s.gameId&&shot.meetingId===meeting.id)latest.set(shot.targetId,shot);
  const clock=Date.now()+(typeof clockOffset==='number'?clockOffset:0);
  for(const card of $('meeting-players')?.children??[]){const p=s.players.find(p=>p.id===card.dataset.playerId);if(!p)continue;let b=card.querySelector('.gun-guess-button');if(m&&p.state==='awake'){if(!b){b=el('button','gun-guess-button');b.type='button';const img=el('img');img.src='/assets/ui/gun-vfx/guess.png';img.alt='💢';b.appendChild(img);b.addEventListener('click',e=>{e.stopPropagation();open(p);});card.appendChild(b);}b.hidden=false;b.disabled=pending||!m.canGuess;b.title=m.reason||'Угадать роль '+p.username;b.setAttribute('aria-label',b.title);}else if(b)b.hidden=true;
   const shot=latest.get(p.id);if(!shot)continue;const elapsed=clock-shot.time;const active=elapsed>=0&&elapsed<1800;
   card.classList.toggle('gun-fx-hidden',active);card.classList.toggle('gun-shattered',shot.killed&&elapsed>=1800);card.classList.toggle('gun-deflected',shot.shielded&&elapsed>=400&&elapsed<1200);
  }
 }
 window.GunUI={refresh,receiveShot};setInterval(refresh,40);refresh();
})();