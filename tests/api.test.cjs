const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {startServer}=require('../desktop/server.cjs');
test('本地服务鉴权、发布草稿、目录越界与跨源拒绝',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-api-'));const {server,store}=await startServer({root,port:0});t.after(()=>{server.close();store.db.close();fs.rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/catalog')).status,403);
 const b=await fetch(base+'/api/bootstrap'),cookie=b.headers.get('set-cookie').split(';')[0],{token}=await b.json();
 const headers={cookie,'Content-Type':'application/json','X-Gallery-Token':token};
 assert.equal((await fetch(base+'/api/save',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/catalog',{headers:{cookie,Origin:'https://outside.example'}})).status,403);
 const malformed=await fetch(base+'/api/save',{method:'POST',headers,body:'{"work":'});assert.equal(malformed.status,400);assert.equal((await malformed.json()).code,'INVALID_REQUEST');
 const response=await fetch(base+'/api/save',{method:'POST',headers:{...headers,Origin:'http://localhost:5173'},body:JSON.stringify({work:{title:'API 草稿',status:'draft',tags:['✨']},files:[]})});assert.equal(response.status,200);
 const result=await(await fetch(base+'/api/works?view=drafts',{headers:{cookie}})).json();assert.equal(result.total,1);assert.equal(result.items[0].tags[0].name,'✨');
 assert.equal((await fetch(base+'/media/images/%2e%2e/%2e%2e/gallery.db',{headers:{cookie}})).status,404);
});

test('过期会话的大图片请求经过网页代理仍返回明确的 403，重新授权后可保存',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-upload-'));
 const {server,store}=await startServer({root,port:0});
 const {createServer}=await import('vite');
 const proxy=await createServer({configFile:false,root,appType:'custom',logLevel:'silent',server:{host:'127.0.0.1',port:0,watch:null,proxy:{'/api':`http://127.0.0.1:${server.address().port}`}}});
 t.after(async()=>{await proxy.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();assert.ok(root.startsWith(path.join(os.tmpdir(),'mygallery-upload-')));fs.rmSync(root,{recursive:true,force:true});});
 await proxy.listen();const base=`http://127.0.0.1:${proxy.httpServer.address().port}`;
 const boot=await fetch(base+'/api/bootstrap'),cookie=boot.headers.get('set-cookie').split(';')[0],{token}=await boot.json();
 const image=await require('sharp')(require('node:crypto').randomBytes(1024*900*3),{raw:{width:1024,height:900,channels:3}}).png().toBuffer();
 const body=JSON.stringify({work:{title:'大图会话恢复',status:'published'},files:[{name:'image.png',data:image.toString('base64')}]});
 const headers={cookie,'Content-Type':'application/json','X-Gallery-Token':'expired-session',Origin:'http://127.0.0.1:5173'};
 const denied=await fetch(base+'/api/save',{method:'POST',headers,body});
 assert.equal(denied.status,403);assert.equal((await denied.json()).code,'SESSION_EXPIRED');assert.equal(store.stats().total,0);
 const noCookie=await fetch(base+'/api/save',{method:'POST',headers:{...headers,cookie:'gallery=expired','X-Gallery-Token':token},body});
 assert.equal(noCookie.status,403);assert.equal((await noCookie.json()).code,'SESSION_EXPIRED');
 const external=await fetch(base+'/api/save',{method:'POST',headers:{...headers,'X-Gallery-Token':token,Origin:'https://outside.example'},body});
 assert.equal(external.status,403);assert.equal((await external.json()).code,'ORIGIN_NOT_ALLOWED');assert.equal(store.stats().total,0);
 const renewed=await fetch(base+'/api/bootstrap'),session=await renewed.json();
 const saved=await fetch(base+'/api/save',{method:'POST',headers:{...headers,cookie:renewed.headers.get('set-cookie').split(';')[0],'X-Gallery-Token':session.token},body});
 assert.equal(saved.status,200);const work=await saved.json();assert.equal(store.stats().total,1);assert.deepEqual(fs.readFileSync(store.file(work.images[0].relative_path)),image);
});
