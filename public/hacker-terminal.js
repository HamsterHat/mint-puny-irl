 'use strict';
(() => {
  let root=null,signature='';
  function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function sync(){
    const s=typeof state!=='undefined'?state:null;
    if(!s?.terminal){if(root)root.hidden=true;return;}
    if(!root){
      root=el('section','hacker-terminal paper');root.id='hacker-terminal';
      const center=document.querySelector('.game-layout .center');(center??document.body).appendChild(root);
    }
    root.hidden=!['intro','playing'].includes(s.phase);
    const ready=typeof canAct==='function'&&canAct();
    const key=JSON.stringify([s.terminal,ready]);if(key===signature)return;signature=key;
    root.replaceChildren();root.appendChild(el('h2','','TERMINAL'));
    root.appendChild(el('p','terminal-help','Одинаковый цвет — одна фракция. Цвет не обозначает название фракции.'));
    root.appendChild(el('h3','',`datalist · ${s.terminal.data.length}/${s.terminal.capacity}`));
    const list=el('div','terminal-data');
    for(const [index,player]of s.terminal.data.entries())list.appendChild(el('div','terminal-line',`${index+1}. ${player.username}`));
    if(!s.terminal.data.length)list.appendChild(el('p','terminal-help','Список пуст. Добавь игроков кнопкой copy.'));
    root.appendChild(list);
    const command=el('button','terminal-grep','grep ${change}');command.type='button';
    command.disabled=!ready||s.terminal.data.length<2;
    command.addEventListener('click',()=>{if(typeof execute==='function')execute('game:ability',{ability:'grep'});});root.appendChild(command);
    if(s.terminal.lastCommand?.blocked)root.appendChild(el('p','terminal-error','Команда подавлена. Результат не получен.'));
    const report=s.terminal.report;
    if(report){
      root.appendChild(el('h3','',`Последний успешный grep · #${report.sequence}`));
      for(const [index,group]of report.groups.entries()){
        const block=el('div','terminal-group');block.style.backgroundColor=group.color;
        block.appendChild(el('small','',`Группа ${index+1}`));
        for(const player of group.players)block.appendChild(el('div','terminal-result-player',player.username));
        root.appendChild(block);
      }
    }
  }
  setInterval(sync,150);sync();
})();
