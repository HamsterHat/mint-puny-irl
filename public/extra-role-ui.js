 'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  const names={rocket:'Ракетный удар',wifi:'Wi-Fi'};
  let openedChallenge=null,dismissedChallenge=null,fixBusy=false;
  let noticesSignature='',intelSignature='',lastGame=null;
  const shownNotices=new Set();
  function time(){return Date.now()+(typeof clockOffset==='number'?clockOffset:0);}
  function current(){return typeof state!=='undefined'?state:null;}
  if(typeof abilitySprites!=='undefined'){
    abilitySprites.fix='/assets/ui/abilities/fix.png';
    abilitySprites['spy-reveal']='/assets/ui/abilities/spy-reveal.png';
  }
  function list(container,entries,formatter){
    container.replaceChildren();
    for(const entry of entries){const element=document.createElement('p');element.className='notice-entry';element.textContent=formatter(entry);container.appendChild(element);}
    if(!entries.length){const element=document.createElement('p');element.textContent='Пока пусто.';container.appendChild(element);}
  }
  function dismissFix(){const s=current();dismissedChallenge=s?.me.role?.fixChallenge?.id??null;$('fix-dialog').close();}
  $('fix-close').addEventListener('click',dismissFix);
  $('fix-dialog').addEventListener('cancel',()=>{dismissedChallenge=current()?.me.role?.fixChallenge?.id??null;});
  $('fix-input').addEventListener('input',()=>{$('fix-input').value=$('fix-input').value.replace(/\D/g,'').slice(0,6);});
  $('fix-form').addEventListener('submit',async event=>{
    event.preventDefault();if(fixBusy)return;
    const s=current();if(!s?.me.role?.fixChallenge)return;
    const crisis=$('fix-crisis').value;
    fixBusy=true;$('fix-confirm').disabled=true;$('fix-error').textContent='';
    try{
      await request('game:ability',{ability:'fix-confirm',params:{code:$('fix-input').value,crisis}});
      $('fix-dialog').close();
      if(crisis!=='rocket'&&typeof GameAudio!=='undefined')GameAudio.play('repair');
    }catch(error){$('fix-error').textContent=error.message;if(typeof GameAudio!=='undefined')GameAudio.play('error');}
    finally{fixBusy=false;render();}
  });
  $('intel-button').addEventListener('click',()=>{$('intel-dialog').showModal();});
  $('intel-close').addEventListener('click',()=>{$('intel-dialog').close();});
  $('notices-button').addEventListener('click',()=>{
    for(const notice of current()?.me.notices??[])shownNotices.add(notice.id);
    $('role-toast').hidden=true;$('notices-dialog').showModal();
  });
  $('notices-close').addEventListener('click',()=>{$('notices-dialog').close();});
  $('role-toast-close').addEventListener('click',()=>{$('role-toast').hidden=true;});
  function render(){
    const s=current();if(!s?.me)return;
    if(lastGame!==s.gameId){lastGame=s.gameId;openedChallenge=null;dismissedChallenge=null;noticesSignature='';intelSignature='';shownNotices.clear();$('role-toast').hidden=true;}
    const role=s.me.role;const challenge=role?.fixChallenge;
    const canFix=s.phase==='playing'&&s.me.state==='awake'&&!s.meetingLocked&&challenge&&time()<challenge.expiresAt;
    if(!canFix){if($('fix-dialog').open)$('fix-dialog').close();}
    else{
      if(openedChallenge!==challenge.id){
        openedChallenge=challenge.id;$('fix-code').textContent=challenge.code;$('fix-input').value='';$('fix-error').textContent='';
        $('fix-crisis').replaceChildren();
        for(const crisis of challenge.crises){const option=document.createElement('option');option.value=crisis;option.textContent=names[crisis]??crisis;$('fix-crisis').appendChild(option);}
      }
      $('fix-time').textContent=`Код действует: ${Math.max(0,Math.ceil((challenge.expiresAt-time())/1000))} сек.`;
      if(!$('fix-dialog').open&&dismissedChallenge!==challenge.id){$('fix-dialog').showModal();$('fix-input').focus();}
    }
    $('fix-confirm').disabled=fixBusy||!canFix;
    const intel=role?.intel??[];const notices=s.me.notices??[];
    $('intel-button').hidden=intel.length===0;
    $('intel-button').disabled=s.meetingLocked||s.phase==='intro';
    $('notices-button').disabled=s.meetingLocked||s.phase==='intro';
    const unread=notices.filter(notice=>!shownNotices.has(notice.id)).length;
    $('notices-button').textContent=`Сообщения${unread?` (${unread})`:''}`;
    const ns=JSON.stringify(notices);
    if(ns!==noticesSignature){noticesSignature=ns;list($('notices-list'),[...notices].reverse(),item=>item.text);}
    const ins=JSON.stringify(intel);
    if(ins!==intelSignature){intelSignature=ins;list($('intel-list'),intel,item=>`${item.username} — ${item.roleName}`);}
    if(s.phase==='playing'&&!s.meetingLocked&&!document.querySelector('dialog[open]')&&$('role-toast').hidden){
      const notice=notices.find(item=>!shownNotices.has(item.id));
      if(notice){shownNotices.add(notice.id);$('role-toast-text').textContent=notice.text;$('role-toast').hidden=false;if(typeof GameAudio!=='undefined')GameAudio.play('click');}
    }
  }
  if(current()?.me&&typeof renderAbilities==='function')renderAbilities();
  setInterval(render,100);render();
})();
