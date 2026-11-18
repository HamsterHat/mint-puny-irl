 'use strict';
const $=id=>document.getElementById(id);
const clone=id=>$(id).content.firstElementChild.cloneNode(true);
let state=null,schema=[],connected=false,busy=false,clockOffset=0,introShown=true;
let targetMode=null,targetAbility=null,hackTarget=null,targetSignature='';
const abilityButtons=new Map();
const socket=io({autoConnect:false});
RPointsUI.mount({ socket, mode: 'game' });
const now=()=>Date.now()+clockOffset;
const isHost=()=>Boolean(state&&state.me.id===state.hostId);
const abilitySprites={lull:'/assets/ui/abilities/lull.png',gun:'/assets/ui/abilities/gun.png',sabotage:'/assets/ui/abilities/sabotage.png',tea:'/assets/ui/abilities/tea.png',poke:'/assets/ui/abilities/poke.png',fix:'/assets/ui/abilities/fix.png','spy-reveal':'/assets/ui/abilities/spy-reveal.png',hack:'/assets/ui/abilities/hack.png',terminate:'/assets/ui/abilities/terminate.png',judge:'/assets/ui/abilities/judge.png',protect:'/assets/ui/abilities/protect.png',shield: '/assets/ui/abilities/survivor-shield.png','headhunter-shot': '/assets/ui/abilities/gun.png','executioner-shot': '/assets/ui/abilities/gun.png'};
function canAct(){return Boolean(connected&&!busy&&state?.phase==='playing'&&state.me.state==='awake'&&!snowBlocked()&&state.tabletAvailable&&!state.meetingLocked);}
function canUseAbility(ability){
  if(!ability||!connected||busy||state?.phase!=='playing'||state.me.state!=='awake'||ability.disabled)return false;
  if (snowBlocked()) return false;
  if(ability.id==='interrogate')return true;
  if(!state.tabletAvailable&&!ability.offline)return false;
  if(ability.meetingOnly){
    if(ability.id==='terminate')return true; // disabled is authoritative: !meetings.terminable on the server
    return Boolean(state.meeting);
  }
  return !state.meetingLocked&&!state.meeting;
}
function cooldownKey(ability){return ability.id==='sabotage'?'sabotage':ability.id;}
function cooldownLeft(ability){return Math.max(0,(state?.me.cooldowns[cooldownKey(ability)]??0)-now());}
function canReport(){return Boolean(connected&&!busy&&state?.phase==='playing'&&!snowBlocked()&&state.me.state==='awake'&&!state.meetingLocked&&!state.crisisActive);}
function message(title,text){
  if($('meeting-dialog').open){$('meeting-error').textContent=`${title}: ${text}`;return;}
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  $('message-title').textContent=title;$('message-text').textContent=text;$('message-dialog').showModal();
}
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
function request(event,payload={}){
  return new Promise((resolve,reject)=>{
    if(!connected){reject(new Error('Нет связи с сервером.'));return;}
    socket.timeout(10000).emit(event,payload,(error,result)=>{
      if(error)reject(new Error('Нет подтверждения сервера. Действие могло выполниться.'));
      else if(!result?.success)reject(new Error(result?.error||'Действие не выполнено.'));
      else{if(event==='game:vote')window.GameAudio?.play('vote');resolve(result);}
    });
  });
}
async function execute(event,payload={}){
  if(busy)return;
  busy=true;refreshControls();
  try{
    const result=await request(event,payload);
    if(!result.blocked&&!result.hacked){
      if(event==='game:task')window.GameAudio?.play('task');
      if(event==='game:ability'){
        const sound={gun:'shot',tea:'tea',lull:'lull',hack:'click',judge:'click',protect:'click','headhunter-shot': 'shot','executioner-shot': 'shot'}[payload.ability];
        if(sound)window.GameAudio?.play(sound);
      }
    }
    return result;
  }catch(error){window.GameAudio?.play('error');message('Ошибка',error.message);}
  finally{busy=false;refreshControls();}
}
socket.on('connect',async()=>{
  connected=true;$('connection-status').textContent='Подключено';
  try{const result=await request('game:sync');if(result.internalScreen){location.replace('/internal.html');return;}schema=result.schema??[];applyState(result.state);}
  catch(error){message('Игра',error.message);}
});
socket.on('disconnect',reason=>{connected=false;$('connection-status').textContent=`Нет соединения: ${reason}`;refreshControls();});
socket.on('connect_error',error=>{connected=false;$('connection-status').textContent=error.message;refreshControls();});
socket.on('game:state',next=>{if(next?.me)applyState(next);});
let sleepFlashTimer = null;

socket.on('game:lull', effect => {
  if (effect?.success !== true) return;

  window.GameAudio?.play('lull');

  clearTimeout(sleepFlashTimer);

  document.body.classList.remove('sleep-flash');
  void document.body.offsetWidth;
  document.body.classList.add('sleep-flash');

  sleepFlashTimer = setTimeout(() => {
    document.body.classList.remove('sleep-flash');
  }, 650);
});

socket.on('game:headhunter-shot', () => {
  window.GameAudio?.play('shot');
});
function applyState(next){
  if(!next?.me)return;
  const previous=state;state=next;clockOffset=state.serverTime-Date.now();
  window.GameAudio?.observe(state);
  const newMeeting=state.meeting&&previous?.meeting?.id!==state.meeting.id;
  const meetingTargetOpen=$('targets-dialog').open&&targetMode==='ability'&&targetAbility?.meetingOnly&&Boolean(state.meeting);
  if(state.meetingLocked||state.meeting){
    for(const dialog of document.querySelectorAll('dialog[open]')){
      if(dialog.id==='meeting-dialog')continue;
      if (dialog.id === 'game-wiki-dialog') continue;
      if(dialog.id==='targets-dialog'&&meetingTargetOpen&&!newMeeting)continue;
      dialog.close();
    }
  }
  MeetingUI.update(state);
  $('player-name').textContent=state.me.username;
  const role=state.me.role;
  $('role-name').textContent=role?.name||'Подготовка';$('role-description').textContent=role?.description||'Хост настраивает раунд.';
  $('state-label').textContent=state.phase==='setup'?'':({awake:'Бодрствуешь',sleeping:'Ты спишь',exiled:'Ты изгнан'})[state.me.state];
  $('tablet-warning').hidden=state.phase!=='playing'||state.tabletAvailable;
  $('host-button').hidden=!isHost();$('start-button').hidden=!isHost()||state.phase!=='setup';$('finish-button').hidden=!isHost()||state.phase!=='playing';
  $('result-label').textContent=state.phase==='finished'?state.result?.reason||'Раунд завершён':'';
  $('return-lobby-button').hidden=state.phase!=='finished';
  const progress=state.taskProgress??{completed:0,total:0};$('task-progress-panel').hidden=state.phase==='setup';$('task-progress').max=Math.max(1,progress.total);$('task-progress').value=progress.completed;$('task-progress-text').textContent=`${progress.completed} / ${progress.total}`;
  const taskSignature=value=>JSON.stringify([value?.phase,value?.me.fakeTasks,value?.me.tasks,value?.me.contractTarget,value?.me.role?.contracts,value?.me.role?.contract]);
  if(taskSignature(previous)!==taskSignature(state))renderTasks();
  updateTrackerBlackjackUI();
  updateAdviserNotebook();
  renderSantaLists();
  refreshHolidayStatus();
  renderTeacherExam();
  refreshTeacherTwo();
  const interrogation=state.me.pendingInterrogation;
  if(interrogation&&!interrogationOpen){
    interrogationOpen=true;
    showInterrogationModal(interrogation.question);
  }
  if(!interrogation&&interrogationOpen){
    interrogationOpen=false;
    $('interrogation-modal')?.classList.add('hidden');
  }
  if(JSON.stringify(previous?.me.abilities)!==JSON.stringify(state.me.abilities))renderAbilities();
  if($('targets-dialog').open)renderTargets();
  refreshControls();
}




// === ИНЕЙ (Ментол) ===
function updateFrost() {
  const overlay = $('frost-overlay');
  if (!overlay) return;
  const frozen = state.me?.frozenUntil > state.serverTime;
  overlay.classList.toggle('active', frozen);
}

// === БЕЙДЖ ВЕТЕРАНА ===
function updateVeteranBadge() {
  const badge = $('veteran-badge');
  if (!badge) return;
  const active = state.me?.role?.alertUntil > state.serverTime;
  badge.classList.toggle('hidden', !active);
}

// === ЗАМЕТКИ СЛЕДОПЫТА ===
function renderTrackerNotes() {
  const panel = $('tracker-panel');
  const list = $('tracker-notes-list');
  if (!panel || !list) return;

  const isTracker = state.me?.role?.id === 'tracker';
  panel.classList.toggle('hidden', !isTracker);
  if (!isTracker) return;

  const notes = state.me.role.notes ?? [];
  list.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tracker-note-empty';
    empty.textContent = 'Записей пока нет...';
    list.appendChild(empty);
    return;
  }

  notes.forEach((note, index) => {
    const li = document.createElement('li');
    li.className = 'tracker-note-item';

    const num = document.createElement('span');
    num.className = 'tracker-note-num';
    num.textContent = `#${index + 1}`;

    const text = document.createElement('span');
    text.className = 'tracker-note-text';
    text.textContent = note;

    li.append(num, text);
    list.appendChild(li);
  });
}

async function addTrackerNote() {
  const input = $('tracker-note-input');
  const text = input?.value?.trim();
  if (!text) return;
  await execute('game:tracker-note', { text });
  if (input) input.value = '';
}

// === ДОПРОС (Следопыт → цель) ===
async function startInterrogation(targetId) {
  const question = prompt('Что спросить у цели?');
  if (!question?.trim()) return;
  await execute('game:ability', {
    ability: 'interrogate',
    targetId,
    params: { question: question.trim() }
  });
}

// === ДОПРОС (цель отвечает) ===
let pendingInterrogation = null;
let interrogationOpen=false;

function showInterrogationModal(question) {
  const modal = $('interrogation-modal');
  const qEl = $('interrogation-question');
  if (!modal || !qEl) return;
  qEl.textContent = `Следопыт спрашивает: «${question}»`;
  modal.classList.remove('hidden');
}

async function sendInterrogationAnswer(answer){
  await execute('game:interrogation-reply',{answer:answer??''});
  $('interrogation-modal')?.classList.add('hidden');
  interrogationOpen=false;
}

// === БЛЕКДЖЕК — ОБЫЧНЫЙ ВЫСТРЕЛ ===
async function blackjackShot(targetId) {
  if (!confirm('Выстрелить в этого игрока? Патрон будет потрачен.')) return;
  await execute('game:ability', {
    ability: 'blackjack-shot',
    targetId
  });
}

// === БЛЕКДЖЕК — УГАДЫВАНИЕ (на голосовании) ===
let blackjackGuessTargetId = null;

function openBlackjackGuess(targetId) {
  blackjackGuessTargetId = targetId;
  const modal = document.getElementById('blackjack-guess-modal');
  const list = document.getElementById('blackjack-role-list');
  const search = document.getElementById('blackjack-role-search');
  const targetLabel = document.getElementById('blackjack-picker-target');
  if (!modal || !list) return;

  const targetPlayer = state.players?.find(p => p.id === targetId);
  if (targetLabel) targetLabel.textContent = 'Цель: ' + (targetPlayer?.username ?? '');

  if (search) {
    search.value = '';
    search.oninput = () => {
      const q = search.value.toLocaleLowerCase();
      for (const b of list.querySelectorAll('.gun-role-option')) {
        b.hidden = !b.textContent.toLocaleLowerCase().includes(q);
      }
    };
  }

  const roles =
    state.me?.role?.roles ??
    state.gunRoles ??
    state.roles ??
    state.me?.modifiers?.find(m => m.id === 'gun-guesser')?.roles ??
    [];

  list.replaceChildren();
  for (const role of roles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gun-role-option';
    btn.textContent = role.name;
    btn.addEventListener('click', () => confirmBlackjackGuess(role.id));
    list.appendChild(btn);
  }

  modal.hidden = false;
  search?.focus();
}

async function confirmBlackjackGuess(roleId) {
  if (!blackjackGuessTargetId || !roleId) return;
  const targetId = blackjackGuessTargetId;
  cancelBlackjackGuess();
  await execute('game:ability', {
    ability: 'blackjack-guess',
    targetId,
    params: { roleId }
  });
}

function cancelBlackjackGuess() {
  const modal = document.getElementById('blackjack-guess-modal');
  if (modal) modal.hidden = true;
  blackjackGuessTargetId = null;
}





// === ОБНОВЛЕНИЕ ПОСЛЕ КАЖДОГО STATE ===
function updateTrackerBlackjackUI() {
  updateFrost();
  updateVeteranBadge();
  renderTrackerNotes();
}




$('interrogation-send')?.addEventListener('click', () => {
  const answer = $('interrogation-answer')?.value;
  sendInterrogationAnswer(answer);
});
$('interrogation-skip')?.addEventListener('click', () => {
  sendInterrogationAnswer('');
});
$('blackjack-guess-confirm')?.addEventListener('click', confirmBlackjackGuess);
$('blackjack-guess-cancel')?.addEventListener('click', cancelBlackjackGuess);
$('tracker-note-add')?.addEventListener('click', addTrackerNote);



// === ЖУРНАЛИСТ ===
let journalistPhoto = null;

function triggerJournalistPhoto() {
  $('journalist-file-input').click();
}

$('journalist-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const image = await compressImage(file, 800);
  journalistPhoto = image;
  await execute('game:journalist-photo', { image });
  e.target.value = '';
});

function compressImage(file, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function showJournalistPhoto() {
  if (!journalistPhoto) return;
  $('journalist-photo-img').src = journalistPhoto;
  $('journalist-photo-title').textContent = 'Твоё последнее фото';
  $('journalist-photo-modal').showModal();
}

async function sendJournalistPhoto() {
  if (!journalistPhoto) return;
  await execute('game:journalist-send', {});
}

// === РАЗРАБОТЧИК ===
let devConsolePassword = null;

async function openDevConsole() {
  try {
    const result = await request('game:dev-console-open', {});
    devConsolePassword = result.password;
    $('dev-console-output').textContent =
      `todays password: ${result.password}\npassword for sudo: `;
    $('dev-console-modal').showModal();
  } catch (e) { message('SUDO', e.message); }
}

async function unlockDevConsole() {
  const input = $('dev-console-password')?.value;
  if (!input) return;
  try {
    const result = await request('game:dev-console-unlock', { password: input });
    if (result.failed) {
      if (result.closed) {
        $('dev-console-output').textContent += '\nДоступ запрещён. Консоль закрыта.';
        setTimeout(() => $('dev-console-modal').close(), 1500);
      } else {
        $('dev-console-output').textContent += `\nНеверный пароль. Осталось попыток: ${result.attemptsLeft}`;
      }
      return;
    }
    renderDevConsole(result.data);
  } catch (e) { message('SUDO', e.message); }
}

function renderDevConsole(data) {
  let out = '';
  for (const p of data.players) {
    out += `name: ${p.name}\nid: ${p.id}\nstate: ${p.state}\narmed: ${p.armed}\nfaction: ${p.faction}\n\n`;
  }
  out += 'logs:\n' + data.logs.join('\n');
  $('dev-console-output').textContent = out;
  $('dev-console-password').hidden = true;
  $('dev-console-unlock').hidden = true;
}

// === ОБРАБОТЧИКИ ===
$('journalist-photo-close')?.addEventListener('click', () => $('journalist-photo-modal').close());
$('dev-console-unlock')?.addEventListener('click', unlockDevConsole);
$('dev-console-close')?.addEventListener('click', () => $('dev-console-modal').close());

// Broadcast фото Журналиста
socket.on('game:journalist-photo-broadcast', (data) => {
  $('journalist-photo-img').src = data.image;
  $('journalist-photo-title').textContent = `${data.sender} опубликовал фото!`;
  $('journalist-photo-modal').showModal();
});




let adviserReportGameId = null;
const shownAdviserReports = new Set();

function updateAdviserNotebook() {
  if (!state) return;

  if (adviserReportGameId !== state.gameId) {
    adviserReportGameId = state.gameId;
    shownAdviserReports.clear();
    $('adviser-notebook')?.close();
  }

  if (state.me.role?.id !== 'adviser') return;

  const reports = state.me.role.reports ?? [];
  const report = reports[reports.length - 1];

  if (!report || shownAdviserReports.has(report.id)) return;
  shownAdviserReports.add(report.id);

  const list = $('adviser-report');
  const dialog = $('adviser-notebook');

  if (!list || !dialog) return;

  list.replaceChildren();

  for (const [label, value] of [
    ['Имя:', report.name],
    ['Вооружён:', report.armed ? 'да' : 'нет'],
    ['Фракция:', report.faction]
  ]) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');

    dt.textContent = label;
    dd.textContent = value;

    list.append(dt, dd);
  }

  if (!dialog.open) dialog.showModal();
}

$('adviser-notebook-close')?.addEventListener('click', () => {
  $('adviser-notebook').close();
});



function snowBlocked() {
  return Boolean(
    state?.me &&
    (state.me.snowUntil ?? 0) > now()
  );
}

function renderSantaLists() {
  const panel = document.getElementById('santa-lists');
  if (!panel) return;

  const role = state?.me?.role;
  const isSanta = role?.id === 'santa';

  panel.hidden = !isSanta;
  if (!isSanta) return;

  function fill(elementId, entries) {
    const list = document.getElementById(elementId);
    if (!list) return;

    list.replaceChildren();

    for (const entry of entries ?? []) {
      const player = state.players.find(
        item => item.id === entry.targetId
      );

      const li = document.createElement('li');
      const name = player?.username ?? 'Неизвестный игрок';

      li.classList.toggle('santa-done', entry.done);

      li.textContent =
        `${entry.done ? 'Выполнено' : 'Ожидает'} — ${name}`;

      list.appendChild(li);
    }
  }

  fill('santa-good-list', role.good);
  fill('santa-bad-list', role.bad);
}

function refreshHolidayStatus() {
  const me = state?.me;

  const blackmail = document.getElementById(
    'blackmail-warning'
  );

  const snow = document.getElementById(
    'santa-snow-overlay'
  );

  const snowTime = document.getElementById(
    'santa-snow-time'
  );

  const gift = document.getElementById(
    'santa-gift-status'
  );

  const playing = state?.phase === 'playing';
  const awake = me?.state === 'awake';

  const showBlackmail = Boolean(
    playing &&
    awake &&
    me.blackmailed &&
    state.meeting
  );

  if (blackmail) {
    blackmail.hidden = !showBlackmail;

    const meetingDialog = document.getElementById(
      'meeting-dialog'
    );

    const parent = showBlackmail && meetingDialog?.open
      ? meetingDialog
      : document.body;

    if (blackmail.parentElement !== parent) {
      parent.appendChild(blackmail);
    }
  }

  const snowLeft = Math.max(
    0,
    (me?.snowUntil ?? 0) - now()
  );

  const showSnow = Boolean(
    playing &&
    awake &&
    !state.meeting &&
    snowLeft > 0
  );

  if (snow) {
    snow.hidden = !showSnow;
  }

  if (snowTime && showSnow) {
    snowTime.textContent =
      `Осталось: ${Math.ceil(snowLeft / 1000)} сек.`;
  }

  const giftLeft = Math.max(
    0,
    (me?.santaGiftUntil ?? 0) - now()
  );

  const showGift = Boolean(
    playing &&
    awake &&
    giftLeft > 0
  );

  if (gift) {
    gift.hidden = !showGift;

    if (showGift) {
      gift.textContent =
        `Подарок Санты: защита ${Math.ceil(giftLeft / 1000)} сек.`;
    }
  }
}


function renderTeacherExam() {
  const dialog = $(
    'teacher-exam-dialog'
  );

  const form = $(
    'teacher-exam-form'
  );

  const questionsBox = $(
    'teacher-exam-questions'
  );

  const timer = $(
    'teacher-exam-timer'
  );

  if (!dialog || !form || !questionsBox) return;

  const exam = state?.me?.exam;

  if (!exam) {
    if (dialog.open) dialog.close();
    return;
  }

  if (!dialog.open) dialog.showModal();

  const left = Math.max(
    0,
    (exam.deadline ?? 0) - now()
  );

  if (timer) {
    timer.textContent =
      `Осталось: ${Math.ceil(left / 1000)} сек.`;
  }

  if (left <= 0) {
    dialog.close();
    return;
  }

  if (
    questionsBox.dataset.examStartedAt !==
    String(exam.startedAt)
  ) {
    questionsBox.dataset.examStartedAt =
      String(exam.startedAt);

    questionsBox.replaceChildren();

    exam.questions.forEach((question, index) => {
      const block = document.createElement('div');
      block.className = 'exam-question';

      const title = document.createElement('h3');
      title.textContent =
        `${index + 1}. ${question.question}`;

      block.appendChild(title);

      if (question.type === 'single') {
        question.choices.forEach((choice, choiceIndex) => {
          const label = document.createElement('label');
          label.className = 'exam-choice';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = `question-${index}`;
          input.value = String(choiceIndex);

          label.appendChild(input);

          const text = document.createElement('span');
          text.textContent = choice;

          label.appendChild(text);
          block.appendChild(label);
        });
      } else if (question.type === 'multiple') {
        question.choices.forEach((choice, choiceIndex) => {
          const label = document.createElement('label');
          label.className = 'exam-choice';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.name = `question-${index}`;
          input.value = String(choiceIndex);

          label.appendChild(input);

          const text = document.createElement('span');
          text.textContent = choice;

          label.appendChild(text);
          block.appendChild(label);
        });
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `question-${index}`;
        input.className = 'exam-text-input';
        input.autocomplete = 'off';

        block.appendChild(input);
      }

      questionsBox.appendChild(block);
    });
  }
}

async function submitTeacherExam(event) {
  event.preventDefault();

  const dialog = document.getElementById(
    'teacher-exam-dialog'
  );

  const form = document.getElementById(
    'teacher-exam-form'
  );

  if (!dialog || !form) return;

  const exam = state?.me?.exam;
  if (!exam) return;

  const answers = exam.questions.map((question, index) => {
    if (question.type === 'text') {
      const input = form.querySelector(
        `input[name="question-${index}"]`
      );

      return input?.value ?? '';
    }

    const selected = [
      ...form.querySelectorAll(
        `input[name="question-${index}"]:checked`
      )
    ].map(input => Number(input.value));

    return question.type === 'single'
      ? selected[0] ?? null
      : selected;
  });

  console.log('SUBMIT ANSWERS', answers);

  try {
    await request('game:exam-submit', { answers });
  } catch (error) {
    console.error('EXAM SUBMIT ERROR', error);
    alert(error.message);
  } finally {
    dialog.close();
  }
}

$('teacher-exam-form')
  ?.addEventListener('submit', submitTeacherExam);

function refreshTeacherTwo() {
  const overlay = $(
    'teacher-two-overlay'
  );

  if (!overlay) return;

  const left = Math.max(
    0,
    (state?.me?.snowUntil ?? 0) - now()
  );

  overlay.hidden = !(
    state?.phase === 'playing' &&
    state?.me?.state === 'awake' &&
    !state?.meeting &&
    left > 0
  );
}

function showInfoModal(title, rows) {
  const old = document.getElementById('modifier-info-modal');

  if (old) old.remove();

  const dialog = document.createElement('dialog');
  dialog.id = 'modifier-info-modal';
  dialog.className = 'modifier-info-modal';

  const header = document.createElement('header');
  header.className = 'modifier-info-header';

  const h2 = document.createElement('h2');
  h2.textContent = title;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'modifier-info-close';
  close.textContent = '×';
  close.addEventListener('click', () => dialog.close());

  header.appendChild(h2);
  header.appendChild(close);

  const body = document.createElement('div');
  body.className = 'modifier-info-body';

  for (const row of rows) {
    body.appendChild(row);
  }

  dialog.appendChild(header);
  dialog.appendChild(body);

  document.body.appendChild(dialog);
  dialog.showModal();
}

function buildPlayerStatusRow(player) {
  const row = document.createElement('div');
  row.className = 'modifier-status-row';

  const name = document.createElement('span');
  name.className = 'modifier-status-name';
  name.textContent = player.username;

  const state = document.createElement('span');
  state.className = 'modifier-status-state';

  if (player.state === 'awake') {
    state.textContent = 'OK';
    state.classList.add('status-ok');
  } else if (player.state === 'sleeping') {
    state.textContent = 'SLEP';
    state.classList.add('status-slep');
  } else if (player.state === 'exiled') {
    state.textContent = 'EXD';
    state.classList.add('status-exd');
  } else {
    state.textContent = 'D\\C';
    state.classList.add('status-dc');
  }

  row.appendChild(name);
  row.appendChild(state);

  return row;
}


function renderTasks(){
  const container=$('tasks-list');container.replaceChildren();
  $('tasks-title').textContent=state.me.fakeTasks?'Фальшивые задания':'Задания';
  $('tasks-hint').textContent=state.me.fakeTasks?'Отметки нужны только для твоей маскировки.':'Выполни действие в реальности, затем нажми на задание.';

  // Баннер: ты — цель Хедхантера
  if(state.headhunterTarget){
    const banner=document.createElement('div');
    banner.className='contract-banner';
    banner.textContent='ВЫ — ЦЕЛЬ ХЕДХАНТЕРА!';
    container.appendChild(banner);
  }

  // Список целей Хедхантера
  if(state.me.role?.id==='headhunter'&&state.me.role.contracts?.length){
    const list=document.createElement('div');
    list.className='contract-list';
    const names=state.me.role.contracts.map(id=>{
      const p=state.players.find(x=>x.id===id);
      return p?p.username:'???';
    });
    list.textContent=`Твои цели: ${names.join(', ')}`;
    container.appendChild(list);
  }

  // Цель Палача
  if(state.me.role?.id==='executioner'&&state.me.role.contract){
    const list=document.createElement('div');
    list.className='contract-list';
    const p=state.players.find(x=>x.id===state.me.role.contract);
    list.textContent=`Твоя цель: ${p?p.username:'???'}`;
    container.appendChild(list);
  }

  if(!state.me.tasks.length){
    const note=document.createElement('p');
    note.className='muted';
    note.textContent=state.phase==='setup'?'Задания появятся после старта.':'Задания пока не добавлены.';
    container.appendChild(note);
    return;
  }

  for(const task of state.me.tasks){
    const button=clone('task-template');
    button.textContent=task.name;
    button.title=task.description;
    button.dataset.completed=String(task.completed);
    button.classList.toggle('completed',task.completed);
    button.addEventListener('click',()=>execute('game:task',{taskId:task.id}));
    container.appendChild(button);
  }
}


function renderAbilities(){
  if(!state)return;
  const container=$('role-abilities');container.replaceChildren();abilityButtons.clear();
  for(const ability of state.me.abilities){
    // Meeting abilities NEVER go into the ordinary lower-right panel.
    if(ability.meetingOnly)continue;
    const button=clone('ability-template');button.querySelector('img').src=abilitySprites[ability.id]||abilitySprites.lull;button.querySelector('.ability-label').textContent=ability.name;button.title=ability.name;
    button.addEventListener('click',()=>activateAbility(ability));abilityButtons.set(ability.id,{button,ability});container.appendChild(button);
  }
}

async function activateAbility(ability){
  // Refresh the descriptor because uses/permissions may have changed.
  ability=state?.me.abilities.find(item=>item.id===ability.id);
  if(!canUseAbility(ability)||cooldownLeft(ability)>0)return;
  $('meeting-error').textContent='';
  if(ability.id==='hack'||ability.menu==='hack'){
    window.GameAudio?.play('click');openTargets('hack',ability);return;
  }
  if(ability.menu==='sabotage'){$('sabotage-dialog').showModal();return;}
  if (ability.id === 'photo') { triggerJournalistPhoto(); return; }
  if (ability.id === 'show') { showJournalistPhoto(); return; }
  if (ability.id === 'send') { sendJournalistPhoto(); return; }
  if (ability.id === 'sudo-grep') { openDevConsole(); return; }
  if (ability.id === 'informed-log') {
    const result = await execute('game:ability', {
      ability: 'informed-log'
    });

    if (result?.log) {
      const rows = result.log.map(entry => {
        const row = document.createElement('div');
        row.className = 'modifier-log-row';

        row.textContent = `${entry.actorName}: ${entry.ability}${
          entry.targetName ? ` → ${entry.targetName}` : ''
        }`;

        return row;
      });

      showInfoModal('ЛОГ ДЕЙСТВИЙ', rows);
    }

    return;
  }

  if (ability.id === 'satellite-request') {
    const result = await execute('game:ability', {
      ability: 'satellite-request'
    });

    if (result?.players) {
      const rows = result.players.map(buildPlayerStatusRow);

      showInfoModal('СВЯЗЬ СО СПУТНИКОМ', rows);
    }

    return;
  }

  if(ability.targets){openTargets('ability',ability);return;}
  execute('game:ability',{ability:ability.id});
}
function targetAllowed(player, ability) {
  const policy = ability?.targetPolicy ?? 'awake-other';
  if (policy === 'sleeping-other') return player.state === 'sleeping' && player.id !== state.me.id;
  if (policy === 'any-not-exiled') return player.state !== 'exiled';
  if (policy === 'awake-with-self') return player.state === 'awake';
  return player.state === 'awake' && player.id !== state.me.id;
}

function openTargets(mode,ability=null){
  targetMode=mode;targetAbility=ability;targetSignature='';
  $('targets-title').textContent=mode==='hack'?'HACK: выбери игрока':mode==='ability'?ability.name:({report:'Найден спящий Пуня',wake:'Кого разбудить?',exile:'Кого изгнать?'})[mode];
  renderTargets();if(!$('targets-dialog').open)$('targets-dialog').showModal();
}
function renderTargets() {
  const container = $('targets-list');
  const signature = JSON.stringify([
    targetMode,
    targetAbility,
    state.players.map(player => [player.id, player.username, player.state]),
    connected,
    busy,
    state.meetingLocked,
    state.crisisActive,
    state.me.state,
    targetAbility ? Math.ceil(cooldownLeft(targetAbility) / 1000) : 0
  ]);

  if (signature === targetSignature) return;
  targetSignature = signature;
  container.replaceChildren();

  const list = state.players.filter(player => {
    if (targetMode === 'report') return player.state === 'sleeping';
    if (targetMode === 'hack') return player.id !== state.me.id;
    if (targetMode === 'ability' && !['any-not-exiled', 'awake-with-self'].includes(targetAbility?.targetPolicy)) {
      return player.id !== state.me.id;
    }
    return true;
  });

  if (!list.length) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Подходящих игроков нет.';
    container.appendChild(note);
    return;
  }

  for (const player of list) {
    const button = clone('target-template');
    button.querySelector('.target-name').textContent = player.username;
    button.querySelector('small').textContent = ({ awake: '', sleeping: 'Спит', exiled: 'Изгнан' })[player.state];

    let allowed;
    if (targetMode === 'ability') {
      allowed = targetAllowed(player, targetAbility) && canUseAbility(targetAbility) && cooldownLeft(targetAbility) === 0;
    } else if (targetMode === 'hack') {
      allowed = player.state === 'awake' && canUseAbility(targetAbility) && cooldownLeft(targetAbility) === 0;
    } else if (targetMode === 'report') {
      allowed = player.state === 'sleeping' && canReport();
    } else {
      allowed = (isHost() || state.me.username === 'Alex') && !state.meetingLocked && (targetMode === 'wake' ? player.state === 'sleeping' : player.state !== 'exiled');
    }

    button.disabled = !connected || busy || !allowed;
    button.classList.toggle('unavailable', player.state !== 'awake');

    button.addEventListener('click', () => {
      $('targets-dialog').close();

      if (targetMode === 'hack') {
        loadHackOptions(player);
        return;
      }

      if (targetMode === 'ability') {
        if (targetAbility.id === 'interrogate') {
          const question = prompt(`Что спросить у ${player.username}?`);
          if (!question?.trim()) return;
          execute('game:ability', {
            ability: 'interrogate',
            targetId: player.id,
            params: { question: question.trim() }
          });
          return;
        }
        execute('game:ability', { ability: targetAbility.id, targetId: player.id });
        return;
      }

      if (targetMode === 'report') {
        execute('game:report', { targetId: player.id });
        return;
      }

      execute('game:host-action', { action: targetMode, targetId: player.id });
    });

    container.appendChild(button);
  }
}

async function loadHackOptions(player){
  if(busy)return;busy=true;refreshControls();
  try{
    const result=await request('game:hack-options',{targetId:player.id});hackTarget=result.targetId;
    const hack=state.me.abilities.find(item=>item.id==='hack');
    if(state.phase!=='playing'||state.meetingLocked||state.me.state!=='awake')return;
    $('hack-title').textContent=`HACK: ${result.targetName}`;
    const container=$('hack-options');container.replaceChildren();
    for(const option of result.options){
      const button=document.createElement('button');button.type='button';button.textContent=`${option.name}${option.hacked?' — уже взломано':''}`;button.disabled=option.hacked;
      button.addEventListener('click',()=>{
        $('hack-dialog').close();execute('game:ability',{ability:hack?.id??'hack',targetId:hackTarget,params:{abilityId:option.id}});
      });container.appendChild(button);
    }
    if(!result.options.length){const note=document.createElement('p');note.textContent='У цели нет доступных для взлома способностей.';container.appendChild(note);}
    $('hack-dialog').showModal();
  }catch(error){message('HACK',error.message);}
  finally{busy=false;refreshControls();}
}
$('report-button').addEventListener('click',()=>{if(canReport())openTargets('report');});
for(const type of ['rocket','wifi'])$(`${type}-button`).addEventListener('click',()=>{$('sabotage-dialog').close();execute('game:ability',{ability:type});});
$('settings-button').addEventListener('click',()=>{
  if(!state||state.meetingLocked)return;
  const editable=isHost()&&state.phase==='setup';const container=$('settings-fields');container.replaceChildren();
  for(const setting of schema){
    const label=clone('setting-template');label.querySelector('span').textContent=setting.label;let input;
    if(setting.type==='select'){input=document.createElement('select');for(const option of setting.options){const element=document.createElement('option');element.value=option.value;element.textContent=option.label;input.appendChild(element);}}
    else{input=document.createElement('input');input.type='number';input.min=setting.min;input.max=setting.max;input.step=setting.step;input.required=true;}
    input.name=setting.id;input.value=state.settings[setting.id];input.disabled=!editable;label.appendChild(input);container.appendChild(label);
  }
  $('save-settings').hidden=!editable;$('settings-dialog').showModal();
});
$('settings-form').addEventListener('submit',event=>{event.preventDefault();if(!isHost()||state.phase!=='setup'||busy)return;const data=new FormData(event.currentTarget);const settings={};for(const setting of schema)settings[setting.id]=setting.type==='number'?Number(data.get(setting.id)):data.get(setting.id);$('settings-dialog').close();execute('game:settings',{settings});});
$('start-button').addEventListener('click',()=>execute('game:start'));$('finish-button').addEventListener('click',()=>execute('game:finish'));
$('host-button').addEventListener('click',()=>{if((isHost() || me.username == "Alex")&&state.phase==='playing'&&!state.meetingLocked)$('host-dialog').showModal();});
for(const action of ['wake','exile'])$(`${action}-button`).addEventListener('click',()=>{$('host-dialog').close();openTargets(action);});
$('return-lobby-button').addEventListener('click',()=>{if(state?.phase==='finished')location.assign('/?resume=1');});

function updateSapperWarning(state) {
  const warning = $('sapper-warning');
  const time = $('sapper-time');
  if (!warning || !time) return;

  const blast = state.sapperBlast;
  if (!blast || state.phase !== 'playing') {
    warning.hidden = true;
    return;
  }

  warning.hidden = false;
  const seconds = Math.max(0, Math.ceil((blast.deadline - state.serverTime) / 1000));
  time.textContent = `${seconds} сек.`;
}

function refreshControls(){
  if(!state)return;$('abilities').hidden=state.phase!=='playing';
  for(const entry of abilityButtons.values()){
    const fresh=state.me.abilities.find(item=>item.id===entry.ability.id)??entry.ability;const remaining=cooldownLeft(fresh);
    entry.button.disabled=!canUseAbility(fresh)||remaining>0;entry.button.classList.toggle('cooling',remaining>0);entry.button.querySelector('small').textContent=remaining>0?`${Math.ceil(remaining/1000)} сек.`:'';
  }
  const meetingActions=state.me.abilities.filter(ability=>ability.meetingOnly).map(ability=>({id:ability.id,name:ability.name,image:abilitySprites[ability.id]||abilitySprites.lull,disabled:!canUseAbility(ability)||cooldownLeft(ability)>0,cooldownText:cooldownLeft(ability)>0?`${Math.ceil(cooldownLeft(ability)/1000)} сек.`:''}));
  MeetingUI.setActions(meetingActions,id=>{const ability=state.me.abilities.find(item=>item.id===id);if(ability)activateAbility(ability);});
  $('tasks-list').querySelectorAll('button').forEach(button=>{button.disabled=!canAct()||button.dataset.completed==='true';});
  const sabotageLeft=(state.me.cooldowns.sabotage??0)-now();$('rocket-button').disabled=!canAct()||sabotageLeft>0||Boolean(state.rocket);$('wifi-button').disabled=!canAct()||sabotageLeft>0||Boolean(state.wifi);
  $('report-button').disabled=!canReport();$('report-button').title=state.crisisActive?'EMERGENCY MEETING CANNOT BE CALLED DURING CRISIS':'Сообщить о спящем игроке';
  $('settings-button').disabled=!connected||state.meetingLocked;$('start-button').disabled=!connected||busy||state.meetingLocked;$('finish-button').disabled=!connected||busy;
  $('host-button').disabled=!connected||busy||state.phase!=='playing'||state.meetingLocked;
  $('rocket-warning').hidden=state.phase!=='playing'||!state.rocket;
  updateSapperWarning(state);
  refreshHolidayStatus();
  refreshTeacherTwo();
  if(state.rocket)$('rocket-time').textContent=`${Math.max(0,Math.ceil((state.rocket.deadline-now())/1000))} сек.`;
}
MeetingUI.init({send:request,notify:message,socket});
setInterval(refreshControls,150);socket.connect();
