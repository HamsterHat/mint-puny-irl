 'use strict';
const $=id=>document.getElementById(id);
let screen=null,state=null,connected=false,busy=false,syncing=false;
const buttons=[];
const socket=io({autoConnect:false});
function status(text){$('status').textContent=text;}
function notify(title,text){status(`${title}: ${text}`);}
function request(event,payload={}){return new Promise((resolve,reject)=>{
  if(!connected){reject(new Error('Нет связи с сервером.'));return;}
  socket.timeout(10000).emit(event,payload,(error,result)=>{if(error)reject(new Error('Нет подтверждения сервера. Действие могло выполниться.'));else if(!result?.success)reject(new Error(result?.error||'Операция не выполнена.'));else resolve(result);});
});}
function setScreen(value){screen=value;$('emergency-screen').hidden=screen!=='emergency';$('missile-screen').hidden=screen!=='missile';}
function rebuild(count){$('switches').replaceChildren();buttons.length=0;for(let index=0;index<count;index++){const button=document.createElement('button');button.type='button';button.className='switch';button.addEventListener('click',()=>execute('game:missile-switch',{index}));buttons.push(button);$('switches').appendChild(button);}}
function applyState(next){
  if(!next)return;state=next;window.GameAudio?.observe(state);
  const playing=state.phase==='playing',blocked=Boolean(state.meetingLocked),emergency=state.emergency;
  const remaining=emergency?Math.max(0,emergency.limit-emergency.used):Infinity;
  const cooldown=emergency?Math.max(0,Math.ceil((emergency.nextAt-state.serverTime)/1000)):0;
  $('emergency-button').disabled=!connected||busy||!playing||blocked||state.crisisActive||remaining===0||cooldown>0;
  $('emergency-button').title=state.crisisActive?'EMERGENCY MEETING CANNOT BE CALLED DURING CRISIS':remaining===0?'Лимит вызовов исчерпан':cooldown>0?`Подожди ${cooldown} сек.`:'Вызвать собрание';
  $('emergency-meta').textContent=emergency?`Осталось вызовов: ${remaining} / ${emergency.limit}${cooldown?` · КД: ${cooldown} сек.`:''}`:'';
  $('crisis-warning').hidden=!state.crisisActive;
  if(screen==='emergency')MeetingUI.update(state);
  if(screen!=='missile')return;
  const panel=state.missilePanel??[];if(buttons.length!==panel.length)rebuild(panel.length);
  if(!state.rocket){$('missile-timer').textContent=state.phase==='setup'||state.phase==='intro'?'Ожидание старта раунда.':state.phase==='finished'?'Раунд завершён.':'Ракетного удара нет.';return;}
  $('missile-timer').textContent=`До удара: ${Math.max(0,Math.ceil((state.rocket.deadline-state.serverTime)/1000))} сек.`;
  panel.forEach((on,index)=>{const button=buttons[index];button.classList.toggle('on',on);button.textContent=`${index+1}: ${on?'ON':'OFF'}`;button.setAttribute('aria-pressed',String(on));button.disabled=!connected||busy||blocked||!playing;});
}
async function execute(event,payload={}){
  if(busy||!connected)return;busy=true;if(state)applyState(state);
  try{await request(event,payload);if(event==='game:missile-switch')window.GameAudio?.play('click');status('Подключено');}
  catch(error){window.GameAudio?.play('error');notify('Ошибка',error.message);}
  finally{busy=false;if(state)applyState(state);}
}
async function sync(){
  if(!connected||syncing)return;syncing=true;
  try{const result=await request('game:sync');if(!result.internalScreen)throw new Error('Этот аккаунт не является внутренним.');setScreen(result.internalScreen);status('Подключено');applyState(result.state);}
  catch(error){notify('Ожидание',error.message);}finally{syncing=false;}
}
$('emergency-button').addEventListener('click',()=>execute('game:meeting'));
socket.on('connect',()=>{connected=true;status('Подключено. Синхронизация…');sync();});
socket.on('game:state',next=>{if(screen){if(!state)status('Подключено');applyState(next);}});
socket.on('disconnect',reason=>{connected=false;status(`Нет связи с сервером: ${reason}`);if(state)applyState(state);});
socket.on('connect_error',error=>{connected=false;notify('Подключение',error.message);if(!socket.active)$('login-link').hidden=false;if(state)applyState(state);});
MeetingUI.init({send:request,notify,socket});
async function boot(){
  try{const response=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});const account=await response.json();if(!response.ok||!['emergency','missile'].includes(account.internalScreen))throw new Error('Сначала войди во внутренний аккаунт.');setScreen(account.internalScreen);socket.connect();}
  catch(error){notify('Вход',error.message);$('login-link').hidden=false;}
}
setInterval(()=>{if(connected&&screen&&!state&&!busy&&!syncing)sync();},3000);boot();
