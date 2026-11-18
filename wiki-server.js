import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';

const PAGE_ID = /^[a-z0-9][a-z0-9/_-]{0,150}$/;
const SETTING_ID = /^[A-Za-z][A-Za-z0-9_]{0,80}$/;
const callouts = {
  NOTE: ['note','Информация'], TIP: ['tip','Подсказка'],
  IMPORTANT: ['important','Важно'], WARNING: ['warning','Внимание'],
  CAUTION: ['caution','Осторожно'], EXAMPLE: ['example','Пример']
};
class WikiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function check(ok,message,status=400){if(!ok)throw new WikiError(message,status);}
function safeIcon(value){return typeof value==='string'&&/^\/(?:assets|wiki\/icons)\/[a-zA-Z0-9_./-]+$/.test(value)&&!value.includes('..')?value:'/wiki/icons/book.svg';}
function slug(text){return String(text).normalize('NFKC').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/[\s_]+/g,'-')||'section';}
function safeArticleFile(file){
  return typeof file==='string'&&file.startsWith('articles/')&&file.endsWith('.md')&&!file.includes('\\')&&!file.includes('\0')&&file.split('/').every(p=>p&&p!=='.'&&p!=='..');
}
function validateManifest(raw){
  check(raw&&typeof raw==='object'&&!Array.isArray(raw),'Неверный navigation.json.');
  check(Array.isArray(raw.sections)&&Array.isArray(raw.pages),'Нужны sections и pages.');
  check(raw.pages.length<=1000,'Слишком много страниц.');
  const sectionIds=new Set(),groupIds=new Map();
  const sections=raw.sections.map(section=>{
    check(PAGE_ID.test(section.id)&&!sectionIds.has(section.id)&&typeof section.title==='string','Неверный раздел.');sectionIds.add(section.id);
    const groups=(section.groups??[]).map(group=>{
      check(PAGE_ID.test(group.id)&&typeof group.title==='string','Неверная группа.');
      return {id:group.id,title:group.title,icon:safeIcon(group.icon)};
    });
    check(new Set(groups.map(g=>g.id)).size===groups.length,'Повторяющаяся группа.');
    groupIds.set(section.id,new Set(groups.map(g=>g.id)));
    return{id:section.id,title:section.title,icon:safeIcon(section.icon),groups};
  });
  const ids=new Set(),names=new Set(),roleIds=new Set();
  const pages=raw.pages.map(page=>{
    check(page&&PAGE_ID.test(page.id)&&!ids.has(page.id),'Неверный или повторяющийся ID статьи.');
    check(typeof page.title==='string'&&page.title.length>0&&page.title.length<=250,'Неверный заголовок.');
    check(safeArticleFile(page.file)&&!names.has(page.file),'Неверный или повторяющийся путь статьи.');
    check(sectionIds.has(page.section),'Не найден раздел статьи.');
    if(page.group)check(groupIds.get(page.section).has(page.group),'Не найдена группа статьи.');
    if(page.roleId){check(PAGE_ID.test(page.roleId)&&!roleIds.has(page.roleId),'Повторяющийся roleId.');roleIds.add(page.roleId);}
    const settings=page.settings??[];check(Array.isArray(settings)&&settings.every(id=>typeof id==='string'&&SETTING_ID.test(id)),'Неверные настройки статьи.');
    const tags=page.tags??[];check(Array.isArray(tags)&&tags.every(t=>typeof t==='string'),'Неверные теги.');
    ids.add(page.id);names.add(page.file);
    return{id:page.id,title:page.title,file:page.file,section:page.section,group:page.group??null,roleId:page.roleId??null,icon:safeIcon(page.icon),tags,settings:[...new Set(settings)]};
  });
  return {title:typeof raw.title==='string'?raw.title:'Энциклопедия Пуней',sections,pages};
}
function createRenderer(){
  const md=new MarkdownIt({html:false,linkify:false,typographer:true,breaks:false});
  const escape=md.utils.escapeHtml;
  md.block.ruler.before('paragraph','wiki_settings',(state,start,end,silent)=>{
    const text=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]).trim();
    if(text!=='{{settings}}')return false;if(silent)return true;
    state.push('wiki_settings','section',0).block=true;state.line=start+1;return true;
  });
  md.renderer.rules.wiki_settings=(_tokens,_index,_options,env)=>`<section class="live-settings" data-setting-ids="${escape(JSON.stringify(env.page.settings))}"></section>`;
  md.core.ruler.after('inline','wiki_structure',state=>{
    const counts=new Map();state.env.toc=[];
    for(let i=0;i<state.tokens.length;i++){
      const token=state.tokens[i];
      if(token.type==='heading_open'){
        const inline=state.tokens[i+1],text=(inline?.children??[]).filter(t=>['text','code_inline','image'].includes(t.type)).map(t=>t.content).join('')||inline?.content||'';
        const base=slug(text),n=(counts.get(base)??0)+1;counts.set(base,n);
        const id=n===1?`wiki-heading-${base}`:`wiki-heading-${base}-${n}`;token.attrSet('id',id);
        if(token.tag==='h2'||token.tag==='h3')state.env.toc.push({id,title:text,level:Number(token.tag.slice(1))});
      }
      if(token.type!=='blockquote_open')continue;
      const para=state.tokens[i+1],inline=state.tokens[i+2];
      if(para?.type!=='paragraph_open'||inline?.type!=='inline')continue;
      const match=inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|EXAMPLE)\](?:[ \t]+([^\n]+))?(?:\n|$)/);
      if(!match)continue;
      let depth=1,close=i+1;
      for(;close<state.tokens.length;close++){
        if(state.tokens[close].type==='blockquote_open')depth++;
        if(state.tokens[close].type==='blockquote_close'&&--depth===0)break;
      }
      if(close>=state.tokens.length)continue;
      const [kind,title]=callouts[match[1]];
      token.type='wiki_callout_open';token.meta={kind,title:match[2]?.trim()||title};
      state.tokens[close].type='wiki_callout_close';
      inline.content=inline.content.slice(match[0].length);inline.children=[];
      md.inline.parse(inline.content,md,state.env,inline.children);
    }
  });
  md.renderer.rules.wiki_callout_open=(tokens,index)=>{
    const {kind,title}=tokens[index].meta;
    return `<aside class="callout callout-${kind}"><img class="callout-icon" src="/wiki/icons/${kind}.svg" alt=""><div class="callout-body"><p class="callout-title">${escape(title)}</p>`;
  };
  md.renderer.rules.wiki_callout_close=()=>'</div></aside>\n';
  const originalLink=md.renderer.rules.link_open??((tokens,index,options,_env,self)=>self.renderToken(tokens,index,options));
  md.renderer.rules.link_open=(tokens,index,options,env,self)=>{
    const token=tokens[index],href=token.attrGet('href')??'';
    if(href.startsWith('#'))token.attrSet('href',`#/${env.page.id}#wiki-heading-${slug(decodeURIComponentSafe(href.slice(1)))}`);
    else if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)&&!href.startsWith('//')){
      const [file,anchor]=href.split('#');
      const relative=path.posix.normalize(path.posix.join(path.posix.dirname(env.page.file),file));
      const target=env.byFile.get(relative);
      if(target)token.attrSet('href',`#/${target.id}${anchor?'#wiki-heading-'+slug(decodeURIComponentSafe(anchor)):''}`);
      else if(href.startsWith('/wiki/#/'))token.attrSet('href',href.slice(6));
      else{token.attrSet('href','#');token.attrSet('aria-disabled','true');token.attrSet('class','unavailable-link');}
    }else if(/^https?:\/\//i.test(href)){
      token.attrSet('target','_blank');token.attrSet('rel','noopener noreferrer');
    }else if(!/^mailto:/i.test(href)){
      token.attrSet('href','#');token.attrSet('aria-disabled','true');
    }
    return originalLink(tokens,index,options,env,self);
  };
  md.renderer.rules.image=(tokens,index)=>{
    const token=tokens[index],src=token.attrGet('src')??'',safe=safeIcon(src);
    const alt=token.content??'',title=token.attrGet('title');
    return `<img src="${escape(safe)}" alt="${escape(alt)}"${title?` title="${escape(title)}"`:''} loading="lazy" decoding="async">`;
  };
  return md;
}
function decodeURIComponentSafe(value){try{return decodeURIComponent(value);}catch{return value;}}
function publicSchema(schema){
  if(!Array.isArray(schema))return[];
  return schema.map(item=>({id:item.id,label:item.label,type:item.type,default:item.default,min:item.min,max:item.max,step:item.step,options:Array.isArray(item.options)?item.options.map(o=>({value:o.value,label:o.label})):undefined}));
}

export function mountWiki(app,{contentRoot,getSettingsSchema=()=>[],apiPrefix='/api/wiki'}={}){
  check(typeof contentRoot==='string','Нужен contentRoot.');
  const root=path.resolve(contentRoot),articles=path.join(root,'articles'),md=createRenderer();
  const cache=new Map();let lastVersion=null,lastManifest=null;
  async function manifest(){
    const text=await fs.readFile(path.join(root,'navigation.json'),'utf8');
    const version=createHash('sha256').update(text).digest('hex').slice(0,16);
    if(version!==lastVersion){lastManifest=validateManifest(JSON.parse(text));lastVersion=version;cache.clear();}
    return{...lastManifest,version,schema:publicSchema(await getSettingsSchema())};
  }
  async function source(page){
    const base=await fs.realpath(articles),file=await fs.realpath(path.resolve(root,page.file)).catch(error=>{if(error.code==='ENOENT')throw new WikiError('Статья пока недоступна.',404);throw error;});
    check(file.startsWith(base+path.sep),'Неверный путь.',403);
    const stat=await fs.stat(file);check(stat.isFile()&&stat.size<=1024*1024,'Неверный файл статьи.');
    const key=`${stat.mtimeMs}:${stat.size}`,cached=cache.get(page.id);
    if(cached?.key===key)return cached;
    const text=await fs.readFile(file,'utf8');const entry={key,text,html:null,toc:null};cache.set(page.id,entry);return entry;
  }
  const route=action=>(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    Promise.resolve().then(()=>action(req,res)).catch(error=>{
      console.error('[wiki]',error);
      if(!res.headersSent)res.status(error.status??500).json({error:error.status===404?'Статья пока недоступна.':'Не удалось открыть вики. Попробуй ещё раз.'});
    });
  };
  app.get(`${apiPrefix}/catalog`,route(async(_req,res)=>{const data=await manifest();res.json({...data,pages:data.pages.map(({file,...page})=>page)});}));
  app.get(`${apiPrefix}/article`,route(async(req,res)=>{
    const data=await manifest(),id=req.query.id;check(typeof id==='string'&&PAGE_ID.test(id),'Неверный ID.');
    const page=data.pages.find(p=>p.id===id);check(page,'Статья не найдена.',404);
    const entry=await source(page);
    if(entry.html===null){const env={page,byFile:new Map(data.pages.map(p=>[p.file,p]))};entry.html=md.render(entry.text,env);entry.toc=env.toc;}
    const {file,...publicPage}=page;res.json({page:publicPage,html:entry.html,toc:entry.toc,version:`${data.version}:${entry.key}`});
  }));
  app.get(`${apiPrefix}/search`,route(async(req,res)=>{
    const q=typeof req.query.q==='string'?req.query.q.trim().slice(0,100):'';
    if(q.length<2){res.json({results:[]});return;}
    const data=await manifest(),terms=q.toLocaleLowerCase('ru').split(/\s+/).filter(Boolean),results=[];
    for(const page of data.pages){
      let text='';try{text=(await source(page)).text;}catch(error){if(error.status===404)continue;throw error;}
      const clean=text.replace(/```[\s\S]*?```/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/[\n\r#>*`|]/g,' ').replace(/\s+/g,' ').trim();
      const title=page.title.toLocaleLowerCase('ru'),hay=`${title} ${page.tags.join(' ')} ${clean}`.toLocaleLowerCase('ru');
      if(!terms.every(term=>hay.includes(term)))continue;
      const at=Math.max(0,clean.toLocaleLowerCase('ru').indexOf(terms[0])-55);
      results.push({id:page.id,title:page.title,icon:page.icon,snippet:(at?'…':'')+clean.slice(at,at+190)+(clean.length>at+190?'…':''),score:terms.reduce((n,t)=>n+(title.includes(t)?5:1),0)});
    }
    results.sort((a,b)=>b.score-a.score);res.json({results:results.slice(0,30).map(({score,...r})=>r)});
  }));
  return{clearCache(){cache.clear();lastVersion=null;}};
}