const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {startServer}=require('../desktop/server.cjs');

test('上传客户端可恢复旧页面会话，连接中断时不会重复保存作品',async t=>{
 const roots=[0,1].map(()=>fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-client-')));
 const services=[];
 for(const root of roots)services.push(await startServer({root,port:0}));
 const {createServer}=await import('vite');
 const compiler=await createServer({configFile:false,root:path.join(__dirname,'..'),appType:'custom',logLevel:'silent',server:{middlewareMode:true,watch:null}});
 const nativeFetch=global.fetch,oldWindow=global.window;
 let active=0,cookie='',behavior='',saveCalls=0,handshakes=0;
 global.window={};
 global.fetch=async(url,options={})=>{
  const route=String(url);
  if(route==='/api/bootstrap'){
   handshakes++;
   if(behavior==='offline')throw new TypeError('Failed to fetch');
  }
  const headers=new Headers(options.headers);if(cookie)headers.set('Cookie',cookie);
  if(route==='/api/save'){
   saveCalls++;
   if(behavior==='expire-once'){headers.set('X-Gallery-Token','expired');behavior='';}
  }
  const response=await nativeFetch(`http://127.0.0.1:${services[active].server.address().port}`+route,{...options,headers});
  const nextCookie=response.headers.get('set-cookie');if(nextCookie)cookie=nextCookie.split(';')[0];
  if(route==='/api/save'&&behavior==='lose-response'){
   await response.arrayBuffer();throw new TypeError('Failed to fetch');
  }
  return response;
 };
 t.after(async()=>{
  global.fetch=nativeFetch;if(oldWindow===undefined)delete global.window;else global.window=oldWindow;
  await compiler.close();
  for(let i=0;i<services.length;i++){
   const {server,store}=services[i];server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();
   assert.ok(roots[i].startsWith(path.join(os.tmpdir(),'mygallery-client-')));fs.rmSync(roots[i],{recursive:true,force:true});
  }
 });
 const {api,bootstrap}=await compiler.ssrLoadModule('/src/api.ts');
 await bootstrap();assert.equal(handshakes,1);
 // The tab still holds server 0's token and cookie, as after an API restart.
 active=1;
 const first=await api('save',{work:{title:'重启服务后的旧页面',status:'draft'},files:[]});
 assert.equal(first.title,'重启服务后的旧页面');assert.equal(saveCalls,1);assert.equal(handshakes,2);
 assert.equal(services[0].store.stats().total,0);assert.equal(services[1].store.stats().total,1);
 behavior='expire-once';
 await api('save',{work:{title:'请求期间过期',status:'draft'},files:[],probe:'a'.repeat(3600000)});
 assert.equal(saveCalls,3);assert.equal(services[1].store.stats().total,2);
 // A lost response can follow a successful commit. Retrying would duplicate it.
 behavior='lose-response';
 await assert.rejects(api('save',{work:{title:'响应丢失但已保存',status:'draft'},files:[]}),/无法确认操作结果/);
 assert.equal(saveCalls,4);assert.equal(services[1].store.stats().total,3);
 behavior='offline';
 await assert.rejects(api('save',{work:{title:'断线时不发送',status:'draft'},files:[]}),/无法连接本地服务/);
 assert.equal(saveCalls,4);assert.equal(services[1].store.stats().total,3);
 behavior='';await api('save',{work:{title:'连接恢复后保存',status:'draft'},files:[]});
 assert.equal(saveCalls,5);assert.equal(services[1].store.stats().total,4);
});
