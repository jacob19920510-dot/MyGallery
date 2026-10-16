const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const sharp=require('sharp');const Zip=require('adm-zip');
const {GalleryStore}=require('../desktop/store.cjs');
async function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-test-'));const store=await new GalleryStore().init(root);t.after(()=>{store.db.close();fs.rmSync(root,{recursive:true,force:true});});const img=await sharp({create:{width:50,height:40,channels:3,background:'#60764d'}}).png().toBuffer();return {root,store,file:{name:'中文 名称.png',data:img.toString('base64')}};}

test('精选最多三件已有作品，顺序持久化并随备份还原，排除草稿和回收站',async t=>{
 const {root,store:s,file}=await fixture(t);assert.deepEqual(s.featured().items,[]);
 const works=[];for(let i=0;i<4;i++)works.push(await s.save({title:'精选 '+i,status:'published'},[file]));
 const ids=[works[2].id,works[0].id,works[1].id],draft=await s.save({title:'未发布',status:'draft'},[]);
 s.setFeatured(ids);assert.deepEqual(s.featured().items.map(w=>w.id),ids);assert.ok(s.featured().items[0].cover_path);
 for(const invalid of [works.map(w=>w.id),[ids[0],ids[0]],['missing'],[draft.id],null])assert.throws(()=>s.setFeatured(invalid));
 assert.deepEqual(s.featured().items.map(w=>w.id),ids);
 s.db.close();await s.init(root);assert.deepEqual(s.featured().items.map(w=>w.id),ids);
 s.batch({ids:[ids[1]],action:'trash'});assert.deepEqual(s.featured().items.map(w=>w.id),[ids[0],ids[2]]);assert.throws(()=>s.setFeatured([ids[1]]));
 s.batch({ids:[ids[1]],action:'restore'});const backup=s.backupBuffer();s.setFeatured([]);assert.deepEqual(s.featured().items,[]);
 await s.restore(backup,'还原资料库');assert.deepEqual(s.featured().items.map(w=>w.id),ids);
});
test('十图、第六张封面、2万字、分类标签、重启与迁移',async t=>{
 const {root,store:s,file}=await fixture(t);const cs=s.catalog().categories;const first=cs[0];
 s.taxonomy({entity:'category',action:'create',name:first.name,group_id:first.group_id});assert.equal(s.catalog().categories.filter(c=>c.name===first.name).length,2);
 const cats=[...new Set(cs.map(c=>c.group_id))].slice(0,3).map(id=>cs.find(c=>c.group_id===id).id);
 const w=await s.save({title:'测试画作',description:[{type:'paragraph',text:'字'.repeat(20000)}],status:'published',categories:cats,tags:[' ✨ ','✨','新标签'],cover_index:5},Array(10).fill(file));
 assert.equal(w.images.length,10);assert.equal(w.cover_image_id,w.images[5].id);assert.equal(w.tags.length,2);assert.equal(w.categories.length,3);assert.ok(!path.isAbsolute(w.images[0].relative_path));
 assert.equal(s.list({search:'✨'}).total,1);assert.equal(s.list({categories:cats}).total,1);
 s.batch({ids:[w.id],action:'favorite'});s.batch({ids:[w.id],action:'trash'});assert.equal(s.list().total,0);assert.equal(s.list({view:'trash'}).total,1);s.batch({ids:[w.id],action:'restore'});assert.equal(s.detail(w.id).is_favorite,1);
 s.taxonomy({entity:'category',action:'delete',id:cats[0]});assert.equal(s.detail(w.id).images.length,10);assert.equal(s.detail(w.id).categories.length,2);
 const moved=fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-move-'));fs.cpSync(root,moved,{recursive:true});const other=await new GalleryStore().init(moved);assert.equal(other.detail(w.id).description[0].text.length,20000);assert.equal(other.detail(w.id).cover_image_id,w.images[5].id);assert.equal((await other.scan()).issues.length,0);other.db.close();fs.rmSync(moved,{recursive:true,force:true});
});
test('备份校验、还原先备份、损坏包拒绝、缩图重建',async t=>{
 const {root,store:s,file}=await fixture(t);const w=await s.save({title:'备份',tags:['保留'],status:'published'},[file]);const b=s.backupBuffer();assert.equal(s.inspectBackup(b).works,1);
 s.batch({ids:[w.id],action:'trash'});await s.restore(b,'还原资料库');assert.equal(s.list().total,1);assert.ok(fs.readdirSync(path.join(root,'backups')).some(n=>n.startsWith('before-restore-')));
 fs.unlinkSync(path.join(root,'thumbnails',w.id,w.images[0].id+'.webp'));assert.equal((await s.scan()).issues.length,1);assert.equal((await s.scan({rebuild:true})).rebuilt,1);assert.equal((await s.scan()).issues.length,0);
 const zip=new Zip(b);zip.updateFile('gallery.db',Buffer.from('corrupt'));assert.throws(()=>s.inspectBackup(zip.toBuffer()),/校验/);assert.equal(s.list().total,1);
});
test('验证失败不留文件，草稿无需图片，标签独立保留，永久删除确认',async t=>{
 const {root,store:s,file}=await fixture(t);await assert.rejects(s.save({title:'无图'},[]),/图片/);await assert.rejects(s.save({title:'破损'},[{name:'bad.png',data:'aGVsbG8='}]));assert.equal(s.stats().total,0);assert.equal(fs.readdirSync(path.join(root,'staging')).length,0);
 const draft=await s.save({title:'草稿',status:'draft',tags:['长期标签']});assert.equal(s.list({view:'drafts'}).total,1);s.batch({ids:[draft.id],action:'trash'});assert.throws(()=>s.purge({ids:[draft.id],confirm:'yes'}),/确认/);s.purge({ids:[draft.id],confirm:'永久删除'});assert.ok(s.catalog().tags.some(t=>t.name==='长期标签'));
 assert.throws(()=>s.file('../outside'),/越界/);assert.throws(()=>s.file('C:/outside'),/相对路径/);
});

test('标签管理删除后解除全部关联，保留作品和原图，未使用统计包含回收站',async t=>{
 const {root,store:s,file}=await fixture(t);
 const work=await s.save({title:'保留的作品',status:'published',tags:['废弃标签','保留标签']},[file]);
 const draft=await s.save({title:'回收站草稿',status:'draft',tags:['废弃标签','仅回收站']},[]);
 s.batch({ids:[draft.id],action:'trash'});
 let tags=s.catalog().tags;assert.equal(tags.find(t=>t.name==='仅回收站').count,0);assert.equal(tags.find(t=>t.name==='仅回收站').total_count,1);
 const id=tags.find(t=>t.name==='废弃标签').id;s.taxonomy({entity:'tag',action:'delete',id});
 assert.equal(s.catalog().tags.some(t=>t.id===id),false);assert.deepEqual(s.detail(work.id).tags.map(t=>t.name),['保留标签']);assert.deepEqual(s.detail(draft.id).tags.map(t=>t.name),['仅回收站']);
 assert.equal(s.detail(work.id).images.length,1);assert.ok(fs.existsSync(path.join(root,work.images[0].relative_path)));assert.equal(s.all('SELECT * FROM work_tags WHERE tag_id=?',[id]).length,0);
 s.db.close();await s.init(root);assert.equal(s.catalog().tags.some(t=>t.id===id),false);assert.equal(s.detail(work.id).title,'保留的作品');
});
test('编辑移除封面自动回退、旧图保留为可检查孤立文件',async t=>{
 const {store:s,file}=await fixture(t);const w=await s.save({title:'两张',status:'published',cover_index:1},[file,file]);const edited=await s.save({...w,tags:[],image_ids:[w.images[0].id]},[]);assert.equal(edited.cover_image_id,w.images[0].id);assert.equal(edited.images.length,1);assert.equal((await s.scan()).issues.filter(i=>i.type.startsWith('孤立')).length,1);
});

test('从分类批量添加已有作品与草稿，保留原分类，重复添加不产生重复关联',async t=>{
 const {root,store:s,file}=await fixture(t);const cats=s.catalog().categories,original=cats[0],target=cats.find(c=>c.group_id!==original.group_id);
 const work=await s.save({title:'已有作品',status:'published',categories:[original.id]},[file]);
 const draft=await s.save({title:'已有草稿',status:'draft',categories:[original.id]},[]);
 const payload={action:'categories',ids:[work.id,draft.id],categories:[target.id]};s.batch(payload);s.batch(payload);
 for(const id of payload.ids){assert.deepEqual(new Set(s.detail(id).categories),new Set([original.id,target.id]));assert.equal(s.all('SELECT * FROM work_categories WHERE work_id=? AND category_id=?',[id,target.id]).length,1);}
 assert.equal(s.catalog().categories.find(c=>c.id===target.id).count,2);assert.equal(s.list({categories:[target.id]}).items[0].id,work.id);assert.equal(s.list({view:'drafts',categories:[target.id]}).items[0].id,draft.id);
 assert.equal(s.detail(work.id).cover_image_id,work.cover_image_id);assert.ok(fs.existsSync(path.join(root,work.images[0].relative_path)));
 s.db.close();await s.init(root);assert.ok(s.detail(work.id).categories.includes(target.id));assert.ok(s.detail(draft.id).categories.includes(target.id));
});
test('混合新旧图片排序与封面保存后重启保持一致',async t=>{
 const {root,store:s,file}=await fixture(t);const first=await s.save({title:'拖拽排序',status:'published'},[file,file]);
 const w=await s.save({...first,tags:[],image_ids:first.images.map(i=>i.id),image_order:[1,first.images[1].id,0,first.images[0].id],cover_image_id:null,cover_index:1},[{...file,name:'new-one.png'},{...file,name:'new-two.png'}]);
 assert.deepEqual(w.images.map(i=>i.original_filename),['new-two.png',file.name,'new-one.png',file.name]);assert.equal(w.images[1].id,first.images[1].id);assert.equal(w.images[3].id,first.images[0].id);assert.equal(w.cover_image_id,first.images[1].id);
 s.db.close();await s.init(root);assert.deepEqual(s.detail(w.id).images.map(i=>i.id),w.images.map(i=>i.id));assert.equal(s.detail(w.id).cover_image_id,first.images[1].id);
});
test('一万件作品分页与同组 OR / 跨组 AND',async t=>{
 const {store:s}=await fixture(t);const cs=s.catalog().categories,a=cs[0],b=cs.find(c=>c.group_id===a.group_id&&c.id!==a.id),c=cs.find(c=>c.group_id!==a.group_id);
 s.tx(()=>{for(let i=0;i<10000;i++){const id='stress-'+i;s.db.run("INSERT INTO works(id,title,description,created_at,status) VALUES(?,?,?,'2026-10-16','published')",[id,'作品 '+i,'[]']);if(i<10)s.db.run('INSERT INTO work_categories VALUES(?,?)',[id,i%2?a.id:b.id]);if(i<3)s.db.run('INSERT INTO work_categories VALUES(?,?)',[id,c.id]);}});
 const before=performance.now();const r=s.list({page:200});assert.equal(r.total,10000);assert.equal(r.items.length,24);assert.equal(s.list({categories:[a.id,b.id]}).total,10);assert.equal(s.list({categories:[a.id,b.id,c.id]}).total,3);console.log('10,000 作品分页查询耗时：'+(performance.now()-before).toFixed(1)+'ms');
});
test('还原过程中断后，启动自动回滚旧资料库',async t=>{
 const {root,store:s}=await fixture(t);await s.save({title:'中断前草稿',status:'draft'},[]);s.db.close();const stage='staging/restore-test';fs.mkdirSync(path.join(root,stage),{recursive:true});fs.renameSync(path.join(root,'gallery.db'),path.join(root,stage,'old-gallery.db'));fs.writeFileSync(path.join(root,'gallery.db'),'broken');fs.writeFileSync(path.join(root,'restore-journal.json'),JSON.stringify({stage}));await s.init(root);assert.equal(s.list({view:'drafts'}).items[0].title,'中断前草稿');assert.equal(fs.existsSync(path.join(root,'restore-journal.json')),false);
});
