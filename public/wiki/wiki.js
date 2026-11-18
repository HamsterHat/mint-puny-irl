'use strict';
(() => {
  const $=id=>document.getElementById(id),main=$('wiki-main'),body=$('article-body');
  const embedded=new URLSearchParams(location.search).get('embed')==='1'&&window.parent!==window;
  const cache=new Map();let catalog=null,currentPage=null,context={settings:null,roleId:null},sequence=0,searchController=null,searchTimer=null,tocObserver=null;
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function icon(src){const n=el('img');n.src=src||'/wiki/icons/book.svg';n.alt='';n.loading='lazy';return n;}
  function status(text,error=false){$('page-status').textContent=text;$('page-status').classList.toggle('is-error',error);}
  async function api(endpoint,signal){const response=await fetch(`/api/wiki/${endpoint}`,{cache:'no-store',signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось открыть вики.');return data;}
  function route(){const raw=location.hash.startsWith('#/')?location.hash.slice(2):'';const[a,b='']=raw.split('#');try{return{id:decodeURIComponent(a),anchor:decodeURIComponent(b)};}catch{return{id:'',anchor:''};}}
  function href(id,anchor=''){return`#/${encodeURIComponent(id)}${anchor?'#'+encodeURIComponent(anchor):''}`;}
  function navigate(id,anchor=''){const link=href(id,anchor);if(location.hash===link)void renderRoute();else location.hash=link;}
  function closeMenu() {document.body.classList.remove('nav-open');$('menu-button').setAttribute('aria-expanded','false');$('menu-backdrop').hidden=true;}
  function pageLink(page,cls='nav-page') {const a=el('a',cls);a.href=href(page.id);a.dataset.page=page.id;a.appendChild(icon(page.icon));a.appendChild(el('span','',page.title));a.addEventListener('click',()=>{closeMenu();hideSearch();});return a;}
  function nav(){
    const side=$('side-navigation'),tabs=$('top-tabs');side.replaceChildren();tabs.replaceChildren();
    for(const section of catalog.sections){
      const tab=el('a','top-tab',section.title);tab.href=href(`section:${section.id}`);tab.dataset.section=section.id;tabs.appendChild(tab);
      const details=el('details','nav-section');details.open=true;details.dataset.section=section.id;
      const summary=el('summary');summary.appendChild(icon(section.icon));summary.appendChild(el('span','',section.title));details.appendChild(summary);
      const pages=catalog.pages.filter(p=>p.section===section.id),direct=pages.filter(p=>!p.group);
      for(const page of direct)details.appendChild(pageLink(page));
      for(const group of section.groups){
        const children=pages.filter(p=>p.group===group.id),part=el('details','nav-group');part.open=true;
        const label=el('summary');label.appendChild(icon(group.icon));label.appendChild(el('span','',group.title));part.appendChild(label);
        for(const page of children)part.appendChild(pageLink(page));
        if(!children.length)part.appendChild(el('p','nav-empty','Пока пусто'));details.appendChild(part);
      }
      if(!pages.length&&!section.groups.length)details.appendChild(el('p','nav-empty','Пока пусто'));
      side.appendChild(details);
    }
    $('page-count').textContent=`Статей: ${catalog.pages.length}`;
  }
  function updateActive(id,section){
    document.querySelectorAll('[data-page]').forEach(n=>{const active=n.dataset.page===id;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
    $('top-tabs').querySelectorAll('[data-section]').forEach(n=>n.classList.toggle('active',n.dataset.section===section));
  }
  function breadcrumbs(page){
    const target=$('breadcrumbs');target.replaceChildren();const home=el('a','','Вики');home.href=href('');target.appendChild(home);
    if(!page)return;
    const section=catalog.sections.find(s=>s.id===page.section);target.appendChild(el('span','','/'));
    const link=el('a','',section?.title??'');link.href=href(`section:${page.section}`);target.appendChild(link);
    if(page.group){const group=section?.groups.find(g=>g.id===page.group);if(group){target.appendChild(el('span','','/'));target.appendChild(el('span','',group.title));}}
    target.appendChild(el('span','','/'));target.appendChild(el('span','',page.title));
  }
  function showHome(sectionId=null){
    sequence++;currentPage=null;tocObserver?.disconnect();$('toc').replaceChildren();body.hidden=true;$('article-header').hidden=true;$('article-footer').hidden=true;$('home-panel').hidden=false;
    const section=catalog.sections.find(s=>s.id===sectionId),home=$('home-panel');
    home.querySelector('h1').textContent=section?.title??catalog.title;
    home.querySelector('p').textContent=catalog.pages.length?'Выбери статью в меню или воспользуйся поиском.':'Здесь будут собраны статьи об игре.';
    const cards=$('section-cards');cards.replaceChildren();
    if(section){for(const page of catalog.pages.filter(p=>p.section===sectionId))cards.appendChild(pageLink(page,'section-card'));}
    else for(const item of catalog.sections){const a=el('a','section-card');a.href=href(`section:${item.id}`);a.appendChild(icon(item.icon));a.appendChild(el('span','',item.title));cards.appendChild(a);}
    breadcrumbs(null);updateActive(null,sectionId);status('');document.title=section?`${section.title} — ${catalog.title}`:catalog.title;main.scrollTop=0;
  }
  function toc(items){
    const root=$('toc');root.replaceChildren();tocObserver?.disconnect();
    for(const item of items){const a=el('a',item.level===3?'toc-sub':'',item.title);a.href=href(currentPage.id,item.id);a.dataset.anchor=item.id;root.appendChild(a);}
    if(!items.length){root.appendChild(el('p','nav-empty','Нет подразделов'));return;}
    if('IntersectionObserver'in window){tocObserver=new IntersectionObserver(entries=>{
      const entry=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(!entry)return;
      root.querySelectorAll('a').forEach(a=>a.classList.toggle('active',a.dataset.anchor===entry.target.id));
    },{root:main,rootMargin:'-5% 0px -65% 0px',threshold:0});for(const item of items){const n=document.getElementById(item.id);if(n&&body.contains(n))tocObserver.observe(n);}}
  }
  function format(item,value){if(value===undefined||value===null)return'—';if(item.type==='select')return item.options?.find(o=>o.value===value)?.label??String(value);return String(value);}
  function settingsTables(){
    if(!catalog)return;
    for(const slot of body.querySelectorAll('.live-settings')){
      let ids=[];try{ids=JSON.parse(slot.dataset.settingIds);}catch{}
      const settings=catalog.schema.filter(item=>ids.includes(item.id));slot.replaceChildren();
      if(!settings.length){slot.appendChild(el('p','muted','Нет отдельных настроек.'));continue;}
      const title=el('h3','','Настройки');slot.appendChild(title);
      const wrap=el('div','table-scroll'),table=el('table'),head=el('thead'),headRow=el('tr');
      const labels=['Параметр','По умолчанию',...(context.settings?['В этом матче']:[]),'Допустимые значения'];
      for(const label of labels){const th=el('th','',label);th.scope='col';headRow.appendChild(th);}head.appendChild(headRow);table.appendChild(head);
      const tbody=el('tbody');for(const item of settings){const row=el('tr');row.appendChild(el('td','',item.label));row.appendChild(el('td','',format(item,item.default)));
        if(context.settings)row.appendChild(el('td','',format(item,context.settings[item.id])));
        row.appendChild(el('td','',item.type==='number'?`${item.min}–${item.max}`:item.options?.map(o=>o.label).join(' / ')??'—'));tbody.appendChild(row);
      }table.appendChild(tbody);wrap.appendChild(table);slot.appendChild(wrap);
    }
    $('context-caption').textContent=context.settings?'Показаны настройки текущего матча.':'Показаны значения по умолчанию.';
  }
  function applyContext(data){
    const values=data&&typeof data==='object'?data:{};
    const settings=values.settings&&typeof values.settings==='object'&&!Array.isArray(values.settings)?values.settings:null;
    const clean={};if(settings&&catalog)for(const item of catalog.schema){const value=settings[item.id];if(item.type==='number'&&Number.isFinite(value)||item.type==='select'&&item.options?.some(o=>o.value===value))clean[item.id]=value;}
    context={settings:settings?clean:null,roleId:typeof values.roleId==='string'?values.roleId:null};
    const own=catalog?.pages.find(p=>p.roleId===context.roleId);$('my-role').disabled=!own;settingsTables();
  }
  async function renderRoute(){
    if(!catalog)return;const selected=route();try{sessionStorage.setItem('punya.wiki.route',location.hash);}catch{}
    if(!selected.id){showHome();return;}if(selected.id.startsWith('section:')){showHome(selected.id.slice(8));return;}
    const page=catalog.pages.find(p=>p.id===selected.id);
    if(!page){showHome();status('Такой страницы пока нет.',true);return;}
    if(currentPage?.id===page.id){scrollAnchor(selected.anchor);return;}
    const token=++sequence;status('Открываем страницу…');
    try{
      let data=cache.get(page.id);if(!data){data=await api(`article?id=${encodeURIComponent(page.id)}`);cache.set(page.id,data);}
      if(token!==sequence)return;
      currentPage=page;$('home-panel').hidden=true;$('article-header').hidden=false;$('article-footer').hidden=false;body.hidden=false;
      $('article-title').textContent=page.title;$('article-icon').src=page.icon;body.innerHTML=data.html;
      for(const table of body.querySelectorAll('table')){if(table.parentElement.classList.contains('table-scroll'))continue;const wrap=el('div','table-scroll');table.before(wrap);wrap.appendChild(table);}
      breadcrumbs(page);toc(data.toc);updateActive(page.id,page.section);settingsTables();document.title=`${page.title} — ${catalog.title}`;status('');main.scrollTop=0;
      if(selected.anchor)requestAnimationFrame(()=>scrollAnchor(selected.anchor));
    }catch(error){if(token===sequence){currentPage=null;body.hidden=true;$('article-header').hidden=true;$('article-footer').hidden=true;$('home-panel').hidden=false;status(error.message,true);}}
  }
  function scrollAnchor(id){if(!id){main.scrollTop=0;return;}const target=document.getElementById(id);if(target&&body.contains(target))target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  function hideSearch(){$('search-results').hidden=true;}
  function highlighted(text,query){const span=el('span'),lower=text.toLocaleLowerCase('ru'),at=lower.indexOf(query.toLocaleLowerCase('ru'));if(at<0){span.textContent=text;return span;}span.append(document.createTextNode(text.slice(0,at)),el('mark','',text.slice(at,at+query.length)),document.createTextNode(text.slice(at+query.length)));return span;}
  async function search(){
    searchController?.abort();const q=$('wiki-search').value.trim(),root=$('search-results');
    if(q.length<2){hideSearch();return;}const controller=new AbortController();searchController=controller;root.replaceChildren(el('p','nav-empty','Ищем…'));root.hidden=false;
    try{const data=await api(`search?q=${encodeURIComponent(q)}`,controller.signal);if(controller.signal.aborted)return;root.replaceChildren();
      for(const item of data.results){const a=el('a','search-result');a.href=href(item.id);const title=el('strong');title.appendChild(highlighted(item.title,q));a.appendChild(title);a.appendChild(el('span','',item.snippet));a.addEventListener('click',()=>{hideSearch();closeMenu();});root.appendChild(a);}
      if(!data.results.length)root.appendChild(el('p','nav-empty','Ничего не нашлось.'));
    }catch(error){if(error.name!=='AbortError'){root.replaceChildren(el('p','nav-empty','Поиск пока недоступен.'));}}
  }
  async function load(){status('Открываем вики…');try{catalog=await api('catalog');$('brand-title').textContent=catalog.title;nav();applyContext(context);await renderRoute();if(embedded)window.parent.postMessage({type:'punya-wiki:ready'},location.origin);}catch(error){status(error.message,true);}}
  function theme(value){document.documentElement.dataset.theme=value;try{localStorage.setItem('punya.wiki.theme',value);}catch{}}
  let saved;try{saved=localStorage.getItem('punya.wiki.theme');}catch{}theme(saved==='light'?'light':'dark');
  $('theme-button').addEventListener('click',()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
  $('menu-button').addEventListener('click',()=>{const open=!document.body.classList.contains('nav-open');document.body.classList.toggle('nav-open',open);$('menu-button').setAttribute('aria-expanded',String(open));$('menu-backdrop').hidden=!open;});
  $('menu-backdrop').addEventListener('click',closeMenu);
  $('wiki-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,180);});
  $('wiki-search').addEventListener('keydown',event=>{if(event.key==='ArrowDown'){$('search-results').querySelector('a')?.focus();event.preventDefault();}});
  $('my-role').addEventListener('click',()=>{const page=catalog?.pages.find(p=>p.roleId===context.roleId);if(page)navigate(page.id);});
  $('reload-button').addEventListener('click',()=>{cache.clear();currentPage=null;void load();});
  $('scroll-top').addEventListener('click',()=>main.scrollTo({top:0,behavior:'smooth'}));
  $('copy-link').addEventListener('click',async()=>{const url=new URL('/wiki/',location.origin);url.hash=location.hash;try{await navigator.clipboard.writeText(url.href);status('Ссылка скопирована.');}catch{status(`Ссылка: ${url.href}`);}});
  $('close-button').hidden=!embedded;$('close-button').addEventListener('click',()=>window.parent.postMessage({type:'punya-wiki:close'},location.origin));
  window.addEventListener('message',event=>{
    if(!embedded||event.origin!==location.origin||event.source!==window.parent||!event.data||typeof event.data!=='object')return;
    if(event.data.type==='punya-wiki:context')applyContext(event.data.context);
    if(event.data.type==='punya-wiki:navigate'&&typeof event.data.id==='string')navigate(event.data.id);
  });
  window.addEventListener('hashchange',()=>{hideSearch();closeMenu();void renderRoute();});
  document.addEventListener('keydown',event=>{
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
    if((event.key==='/'&&!typing)||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')){event.preventDefault();$('wiki-search').focus();}
    if(event.key==='Escape'){if(!$('search-results').hidden)hideSearch();else if(document.body.classList.contains('nav-open'))closeMenu();else if(embedded)window.parent.postMessage({type:'punya-wiki:close'},location.origin);}
  });
  body.addEventListener('click',event=>{const a=event.target.closest('a');if(a?.getAttribute('aria-disabled')==='true')event.preventDefault();});
  if(!location.hash){try{const last=sessionStorage.getItem('punya.wiki.route');if(last?.startsWith('#/'))history.replaceState(null,'',last);}catch{}}
  void load();
})();