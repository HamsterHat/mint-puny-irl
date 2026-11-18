 'use strict';
(()=>{
  const $=id=>document.getElementById(id);
  function render(){
    if(typeof state==='undefined'||!state?.emergency)return;
    const emergency=state.emergency;
    const cooldown=Math.max(0,Math.ceil((emergency.nextAt-state.serverTime)/1000));
    const left=Math.max(0,emergency.limit-emergency.used);
    $('emergency-meta').textContent=`Осталось вызовов: ${left} / ${emergency.limit}${cooldown?` · КД: ${cooldown} сек.`:''}`;
    $('emergency-button').title=state.crisisActive?'EMERGENCY MEETING CANNOT BE CALLED DURING CRISIS':left===0?'Лимит вызовов исчерпан':cooldown>0?`Подожди ${cooldown} сек.`:'Вызвать собрание';
  }
  setInterval(render,100);render();
})();
