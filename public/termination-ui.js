 'use strict';
(()=>{
 const $=id=>document.getElementById(id);let seen=null,stamp=null,offset=0;
 function render(){
  if(typeof state==='undefined'||!state)return;
  if(stamp!==state.serverTime){stamp=state.serverTime;offset=state.serverTime-Date.now();}
  const term=state.meetingTerminated;const active=term&&Date.now()+offset<term.until;
  $('termination-overlay').hidden=!active;
  if(active){
   const meeting=$('meeting-dialog');if(meeting?.open)meeting.close();
   const targets=$('advanced-targets-dialog');if(targets?.open)targets.close();
   const ejection=$('ejection-overlay');if(ejection)ejection.hidden=true;
   const token=`${state.gameId}:${term.id}`;
   if(seen!==token){seen=token;if(typeof GameAudio!=='undefined')GameAudio.play('terminate');}
  }
 }
 setInterval(render,50);render();
})();
