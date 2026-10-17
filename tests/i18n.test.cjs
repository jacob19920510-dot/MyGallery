const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {rolldown}=require('rolldown');
const {parseSync}=require('rolldown/utils');
const messages=require('../src/locales.json');
let code;
before(async()=>{
 const bundle=await rolldown({input:'src/i18n.ts',external:['react']});
 try {const result=await bundle.generate({format:'cjs'});code=result.output.find(item=>item.type==='chunk').code;}
 finally {await bundle.close();}
});
function runtime(saved){
 const data=new Map(saved?[['gallery-language',saved]]:[]),events=new Map(),module={exports:{}};
 const document={documentElement:{lang:''},title:''};
 vm.runInNewContext(code,{module,exports:module.exports,require,document,localStorage:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)},window:{addEventListener:(name,callback)=>events.set(name,callback)}});
 return {...module.exports,data,events,document};
}
test('all interface translation keys have all three translated variants and matching placeholders',()=>{
 const placeholders=text=>[...text.matchAll(/\{\d+\}/g)].map(match=>match[0]).sort();
 for(const [source,variants] of Object.entries(messages)){
  assert.equal(variants.length,3,source);
  for(const value of variants){assert.equal(typeof value,'string');assert.deepEqual(placeholders(value),placeholders(source),source);}
 }
 let count=0;
 for(const file of fs.readdirSync('src').filter(name=>/\.tsx?$/.test(name)&&name!=='i18n.ts')){
  const ast=parseSync(file,fs.readFileSync('src/'+file,'utf8'));
  assert.equal(ast.errors.length,0,file);
  function walk(node){
   if(!node||typeof node!=='object')return;
   if(node.type==='CallExpression'&&['translate','t'].includes(node.callee?.name)&&node.arguments[0]?.type==='Literal'){
    const key=node.arguments[0].value;assert.ok(Object.hasOwn(messages,key),file+': '+key);count++;
   }
   for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
  }
  walk(ast.program);
 }
 assert.ok(count>400,'Expected complete interface coverage');
});
test('language selection applies immediately, updates document language and survives reload',()=>{
 const app=runtime();assert.equal(app.getLanguage(),'zh-CN');
 for(const [language,expected]of [['zh-TW','設定與維護'],['en','Settings & maintenance'],['ja','設定とメンテナンス'],['zh-CN','设置与维护']]){
  app.setLanguage(language);assert.equal(app.t('设置与维护'),expected);assert.equal(app.document.documentElement.lang,language);
  assert.equal(app.data.get('gallery-language'),language);assert.equal(runtime(language).getLanguage(),language);
 }
});
test('dynamic translations reorder placeholders without changing work titles or file names',()=>{
 const app=runtime('ja');
 assert.equal(app.t('已呈现 {0}–{1} / {2} 件作品',1,50,78),'78 件中 1–50 件を表示');
 assert.equal(app.t('查看作品 {0}','我的日常作品'),'作品「我的日常作品」を表示');
 app.setLanguage('en');
 assert.equal(app.t('备份缺少原图：images/我的作品.png'),'Original image missing from backup: images/我的作品.png');
 assert.equal(app.t('Unrecognized system error'),'Unrecognized system error');
});
test('invalid saved values fall back safely and another tab can update the language',()=>{
 const app=runtime('unsupported');assert.equal(app.getLanguage(),'zh-CN');
 app.events.get('storage')({key:'gallery-language',newValue:'ja'});
 assert.equal(app.getLanguage(),'ja');assert.equal(app.document.documentElement.lang,'ja');
 app.events.get('storage')({key:'gallery-language',newValue:null});assert.equal(app.getLanguage(),'zh-CN');
});
