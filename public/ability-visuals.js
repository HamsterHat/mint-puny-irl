 'use strict';
(() => {
  if (window.AbilityVisuals) return;
  const controls = new WeakMap(), observed = new Map();
  const titles = { lull:'УСЫПИТЬ',gun:'ВЫСТРЕЛ',sabotage:'ПОЛОМКИ',tea:'ЧАЙ',poke:'POKE',fix:'FIX','spy-reveal':'ВСКРЫТИЕ',reveal:'ВСКРЫТИЕ',wake:'РАЗБУДИТЬ',copy:'COPY',grep:'GREP',hack:'HACK',shield:'ЩИТ',report:'REPORT' };
  let readState = () => typeof state !== 'undefined' ? state : null;
  function el(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
  function splitName(name){
    const match=String(name??'').match(/^(.*?)\s*[·•]\s*(\d+(?:\s*\/\s*\d+)?)\s*$/u);
    return match?{name:match[1].trim(),quantity:match[2]}:{name:String(name??''),quantity:''};
  }
  function ensure(button){
    if(controls.has(button))return controls.get(button);
    const base=button.querySelector('img'),label=button.querySelector('.ability-label');
    if(!base||!label)return null;
    const icon=el('span','av-icon');base.before(icon);icon.appendChild(base);base.classList.add('av-base');
    const color=base.cloneNode(false);color.removeAttribute('id');color.classList.remove('av-base');color.classList.add('av-color');color.alt='';color.setAttribute('aria-hidden','true');icon.appendChild(color);
    icon.appendChild(label);const cooldown=el('span','av-cooldown');icon.appendChild(cooldown);
    const quantity=el('span','av-quantity');button.appendChild(quantity);
    const oldTimer=button.querySelector('small');if(oldTimer)oldTimer.classList.add('av-old-timer');
    button.classList.add('av-button');
    const item={button,base,color,label,cooldown,quantity};controls.set(button,item);return item;
  }
  function duration(s,id){
    const settings=s.settings??{};
    if(id==='lull')return (s.me.role?.id==='mint-punik'?settings.mintPunikLullCooldown??30:settings.lullCooldown??30)*1000;
    const keys={gun:'policeCooldown',sabotage:'sabotageCooldown',tea:'teaCooldown',poke:'pokeCooldown',fix:'technicCooldown','fix-confirm':'technicCooldown','spy-reveal':'spyCooldown',reveal:'spyCooldown',wake:'alarmCooldown',copy:'hackerCopyCooldown',hack:'hackCooldown',shield:'mintPunikShieldCooldown'};
    const value=settings[keys[id]];return Number.isFinite(value)&&value>=0?value*1000:null;
  }
  function render(button,ability,s,now){
    const view=ensure(button);if(!view)return;
    const key=ability.id==='fix-confirm'?'fix':ability.id;
    const end=Number(s.me.cooldowns?.[key]??0),remaining=Math.max(0,end-now);
    let full=duration(s,ability.id);
    if(full===null){
      const recordKey=`${s.gameId}:${s.me.id}:${ability.id}`;
      let record=observed.get(recordKey);
      if(!record||record.end!==end){record={end,duration:Math.max(1,remaining)};observed.set(recordKey,record);}
      full=record.duration;
    }
    const progress=remaining<=0?1:full>0?Math.max(0,Math.min(1,1-remaining/full)):0;
    const cut=`inset(0 0 ${((1-progress)*100).toFixed(3)}% 0)`;
    if(view.color.style.clipPath!==cut)view.color.style.clipPath=cut;
    if(view.color.src!==view.base.src)view.color.src=view.base.src;
    const parts=splitName(ability.name),title=titles[ability.id]??parts.name;
    if(view.label.textContent!==title)view.label.textContent=title;
    if(view.quantity.textContent!==parts.quantity)view.quantity.textContent=parts.quantity;
    const text=remaining>0?String(Math.ceil(remaining/1000)):'';
    if(view.cooldown.textContent!==text)view.cooldown.textContent=text;
    button.title=ability.name;button.setAttribute('aria-label',`${ability.name}${text?`, КД ${text} сек.`:''}`);
    button.classList.toggle('av-cooling',remaining>0);
  }
  function refresh(){
    let s;try{s=readState();}catch{return;}if(!s?.me)return;
    const now=Date.now()+(typeof clockOffset==='number'?clockOffset:0);
    if(typeof abilityButtons!=='undefined'&&abilityButtons&&typeof abilityButtons.forEach==='function'){
      abilityButtons.forEach(entry=>{
        if(!entry?.button||entry.button.isConnected===false)return;
        const ability=s.me.abilities.find(a=>a.id===entry.ability?.id);
        if(ability)render(entry.button,ability,s,now);
      });
    }else{
      const buttons=document.querySelectorAll('#role-abilities > button');
      const abilities=s.me.abilities.filter(a=>!a.meetingOnly);
      buttons.forEach((button,index)=>{if(abilities[index])render(button,abilities[index],s,now);});
    }
    const report=document.getElementById('report-button');if(report)render(report,{id:'report',name:'REPORT'},s,now);
  }
  window.AbilityVisuals={refresh,setStateReader(fn){if(typeof fn!=='function')throw new Error('Нужна функция состояния.');readState=fn;refresh();}};
  setInterval(refresh,40);refresh();
})();
