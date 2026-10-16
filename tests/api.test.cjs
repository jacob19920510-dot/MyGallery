const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {startServer}=require('../desktop/server.cjs');
test('本地服务鉴权、发布草稿、目录越界与跨源拒绝',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-api-'));const {server,store}=await startServer({root,port:0});t.after(()=>{server.close();store.db.close();fs.rmSync(root,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/catalog')).status,403);
 const b=await fetch(base+'/api/bootstrap'),cookie=b.headers.get('set-cookie').split(';')[0],{token}=await b.json();
 const headers={cookie,'Content-Type':'application/json','X-Gallery-Token':token};
 assert.equal((await fetch(base+'/api/save',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/catalog',{headers:{cookie,Origin:'https://outside.example'}})).status,403);
 const response=await fetch(base+'/api/save',{method:'POST',headers,body:JSON.stringify({work:{title:'API 草稿',status:'draft',tags:['✨']},files:[]})});assert.equal(response.status,200);
 const result=await(await fetch(base+'/api/works?view=drafts',{headers:{cookie}})).json();assert.equal(result.total,1);assert.equal(result.items[0].tags[0].name,'✨');
 assert.equal((await fetch(base+'/media/images/%2e%2e/%2e%2e/gallery.db',{headers:{cookie}})).status,404);
});
