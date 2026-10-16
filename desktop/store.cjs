const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSql = require('sql.js');
const sharp = require('sharp');
const Zip = require('adm-zip');
const uid = () => crypto.randomUUID();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const stamp = () => new Date().toISOString();
class GalleryStore {
  async init(root) {
    this.root = path.resolve(root);
    for(const dir of ['images','thumbnails','staging','backups']) fs.mkdirSync(path.join(this.root,dir),{recursive:true});
    // A restore interrupted by a process exit is rolled back before opening SQLite.
    const journal=this.file('restore-journal.json');
    if(fs.existsSync(journal)){
      const {stage}=JSON.parse(fs.readFileSync(journal,'utf8'));
      if(!/^staging\/restore-[a-z0-9-]+$/.test(stage))throw Error('还原恢复记录无效，请保留资料库并联系维护者');
      for(const name of ['thumbnails','images','config.json','gallery.db']){
        const previous=this.file(stage+'/old-'+name);
        if(fs.existsSync(previous)){fs.rmSync(this.file(name),{recursive:true,force:true});fs.renameSync(previous,this.file(name));}
      }
      fs.rmSync(this.file(stage),{recursive:true,force:true});fs.unlinkSync(journal);
    }
    this.SQL = await initSql();
    this.db = new this.SQL.Database(fs.existsSync(this.file('gallery.db')) ? fs.readFileSync(this.file('gallery.db')) : undefined);
    this.db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '[]',artwork_date TEXT,created_at TEXT,updated_at TEXT,is_favorite INTEGER DEFAULT 0,status TEXT DEFAULT 'published',deleted_at TEXT,cover_image_id TEXT);
      CREATE TABLE IF NOT EXISTS work_images(id TEXT PRIMARY KEY,work_id TEXT REFERENCES works(id) ON DELETE CASCADE,relative_path TEXT,original_filename TEXT,mime_type TEXT,width INTEGER,height INTEGER,byte_size INTEGER,sha256 TEXT,sort_order INTEGER);
      CREATE TABLE IF NOT EXISTS category_groups(id TEXT PRIMARY KEY,name TEXT,sort_order INTEGER);
      CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,group_id TEXT REFERENCES category_groups(id) ON DELETE CASCADE,name TEXT,sort_order INTEGER);
      CREATE TABLE IF NOT EXISTS work_categories(work_id TEXT REFERENCES works(id) ON DELETE CASCADE,category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,PRIMARY KEY(work_id,category_id));
      CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS work_tags(work_id TEXT REFERENCES works(id) ON DELETE CASCADE,tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(work_id,tag_id));
      CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE INDEX IF NOT EXISTS idx_works_deleted ON works(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_images_work ON work_images(work_id);`);
    if(!fs.existsSync(this.file('gallery.db'))) {
      ['角色','画风','服装','场景','系列'].forEach((name,i)=>{
        const id=uid(); this.db.run('INSERT INTO category_groups VALUES(?,?,?)',[id,name,i]);
        const names=[['原创角色','人物习作'],['油画','水彩','插画','摄影'],['日常','和服'],['自然风景','城市','室内'],['光与日常','远方来信']][i];
        names.forEach((n,j)=>this.db.run('INSERT INTO categories VALUES(?,?,?,?)',[uid(),id,n,j]));
      });
      ['光影','风景','灵感收集','日常','✨'].forEach(n=>this.db.run('INSERT INTO tags VALUES(?,?)',[uid(),n]));
    }
    this.persist();
    if(!fs.existsSync(this.file('config.json'))) fs.writeFileSync(this.file('config.json'),JSON.stringify({version:1,name:'MyGallery'},null,2));
    return this;
  }
  file(relative) {
    if(typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.includes(':')) throw Error('无效的相对路径');
    const p=path.resolve(this.root,relative); if(p!==this.root&&!p.startsWith(this.root+path.sep))throw Error('路径越界');
    let cursor=p;
    while(cursor!==this.root){if(fs.existsSync(cursor)&&fs.lstatSync(cursor).isSymbolicLink())throw Error('不允许符号链接路径');cursor=path.dirname(cursor);}
    return p;
  }
  all(sql,args=[]) {const s=this.db.prepare(sql); try {s.bind(args); const rows=[];while(s.step())rows.push(s.getAsObject());return rows;} finally{s.free();}}
  snapshot(){const data=Buffer.from(this.db.export());this.db.run('PRAGMA foreign_keys=ON');return data;}
  persist(){const tmp=this.file('gallery.db.tmp');fs.writeFileSync(tmp,this.snapshot());fs.renameSync(tmp,this.file('gallery.db'));}
  tx(fn){this.db.run('BEGIN');try{const v=fn();this.db.run('COMMIT');try{this.persist();}catch(e){this.db.close();this.db=new this.SQL.Database(fs.readFileSync(this.file('gallery.db')));this.db.run('PRAGMA foreign_keys=ON');throw e;}return v;}catch(e){try{this.db.run('ROLLBACK');}catch{}throw e;}}
  catalog(){return {groups:this.all('SELECT * FROM category_groups ORDER BY sort_order'),categories:this.all(`SELECT c.*,COUNT(w.id) AS count FROM categories c LEFT JOIN work_categories wc ON wc.category_id=c.id LEFT JOIN works w ON wc.work_id=w.id AND w.deleted_at IS NULL GROUP BY c.id ORDER BY c.sort_order`),tags:this.all(`SELECT t.*,COUNT(w.id) AS count,COUNT(wt.work_id) AS total_count FROM tags t LEFT JOIN work_tags wt ON wt.tag_id=t.id LEFT JOIN works w ON wt.work_id=w.id AND w.deleted_at IS NULL GROUP BY t.id ORDER BY count DESC,t.name`),stats:this.stats()};}
  stats(){const n=this.all(`SELECT COUNT(*) total,COALESCE(SUM(is_favorite),0) favorites,COALESCE(SUM(status='draft'),0) drafts FROM works WHERE deleted_at IS NULL`)[0];return {...n,trash:this.all('SELECT COUNT(*) n FROM works WHERE deleted_at IS NOT NULL')[0].n,images:this.all('SELECT COUNT(*) n FROM work_images i JOIN works w ON i.work_id=w.id WHERE w.deleted_at IS NULL')[0].n,bytes:this.all('SELECT COALESCE(SUM(byte_size),0) n FROM work_images')[0].n,root:this.root};}
  featured(){
    const ids=JSON.parse(this.all("SELECT value FROM app_settings WHERE key='featured_works'")[0]?.value||'[]');
    return {items:ids.flatMap(id=>{const w=this.all("SELECT id FROM works WHERE id=? AND deleted_at IS NULL AND status='published'",[id])[0];if(!w)return [];const item=this.detail(id);return [{...item,cover_path:item.images.find(i=>i.id===item.cover_image_id)?.relative_path,image_count:item.images.length}];})};
  }
  setFeatured(ids){
    if(!Array.isArray(ids)||ids.length>3||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw Error('请选择最多 3 件不同的作品');
    for(const id of ids)if(!this.all("SELECT id FROM works WHERE id=? AND deleted_at IS NULL AND status='published' AND EXISTS(SELECT 1 FROM work_images WHERE work_id=works.id)",[id]).length)throw Error('只能从已有的已发布作品中选择，请刷新后重试');
    return this.tx(()=>{this.db.run("INSERT OR REPLACE INTO app_settings(key,value) VALUES('featured_works',?)",[JSON.stringify(ids)]);return this.featured();});
  }
  list(q={}) {
    const where=[q.view==='trash'?'w.deleted_at IS NOT NULL':'w.deleted_at IS NULL'],args=[];
    if(q.view==='favorites')where.push('w.is_favorite=1');
    if(q.view==='drafts')where.push("w.status='draft'");else if(q.view!=='trash')where.push("w.status='published'");
    if(q.search){where.push(`(w.title LIKE ? ESCAPE '\\' OR w.description LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM work_tags wt JOIN tags t ON wt.tag_id=t.id WHERE wt.work_id=w.id AND t.name LIKE ? ESCAPE '\\'))`);const s='%'+String(q.search).replace(/[\\%_]/g,'\\$&')+'%';args.push(s,s,s);}
    const grouped={}; for(const id of q.categories||[]){const c=this.all('SELECT group_id FROM categories WHERE id=?',[id])[0];if(c)(grouped[c.group_id]??=[]).push(id);}
    for(const ids of Object.values(grouped)){where.push(`EXISTS(SELECT 1 FROM work_categories wc WHERE wc.work_id=w.id AND wc.category_id IN (${ids.map(()=>'?').join(',')}))`);args.push(...ids);}
    if(q.tag){where.push('EXISTS(SELECT 1 FROM work_tags WHERE work_id=w.id AND tag_id=?)');args.push(q.tag);}
    const sort={created_at:'w.created_at',artwork_date:'w.artwork_date',updated_at:'w.updated_at',title:'w.title',deleted_at:'w.deleted_at'}[q.sort]||'w.created_at';
    const clause=where.join(' AND '),total=this.all(`SELECT COUNT(*) n FROM works w WHERE ${clause}`,args)[0].n;
    const page=Math.max(1,Number(q.page)||1),size=24;
    return {total,page,items:this.all(`SELECT w.*,(SELECT COUNT(*) FROM work_images WHERE work_id=w.id) image_count,(SELECT relative_path FROM work_images WHERE id=w.cover_image_id) cover_path FROM works w WHERE ${clause} ORDER BY ${sort} ${q.direction==='asc'?'ASC':'DESC'},w.id LIMIT ? OFFSET ?`,[...args,size,(page-1)*size]).map(w=>({...w,description:JSON.parse(w.description),categories:this.all('SELECT category_id FROM work_categories WHERE work_id=?',[w.id]).map(x=>x.category_id),tags:this.all('SELECT t.* FROM tags t JOIN work_tags wt ON wt.tag_id=t.id WHERE wt.work_id=?',[w.id])}))};
  }
  detail(id){const w=this.all('SELECT * FROM works WHERE id=?',[id])[0];if(!w)throw Error('作品不存在');return {...w,description:JSON.parse(w.description),images:this.all('SELECT * FROM work_images WHERE work_id=? ORDER BY sort_order',[id]),categories:this.all('SELECT category_id FROM work_categories WHERE work_id=?',[id]).map(x=>x.category_id),tags:this.all('SELECT t.* FROM tags t JOIN work_tags wt ON wt.tag_id=t.id WHERE wt.work_id=?',[id])};}
  async save(data,files=[]) {
    const title=String(data.title||'').trim();if(!title||Array.from(title).length>200)throw Error('标题必填，最多 200 字');
    const description=(Array.isArray(data.description)?data.description:[]).map(b=>({type:['paragraph','heading','quote','list','bold','italic','link'].includes(b.type)?b.type:'paragraph',text:String(b.text||''),...(b.type==='link'&&/^https?:\/\//.test(b.url)?{url:b.url}:{})}));
    if(Array.from(description.map(b=>b.text).join('')).length>20000)throw Error('说明不能超过 20,000 字');
    if(data.artwork_date&&!/^\d{4}-\d{2}-\d{2}$/.test(data.artwork_date))throw Error('创作日期格式错误');
    const id=data.id||uid(),old=data.id?this.detail(id):null;
    const retained=(data.image_ids||[]).map(x=>old?.images.find(i=>i.id===x)).filter(Boolean);
    if(data.status!=='draft'&&!retained.length&&!files.length)throw Error('发布前请至少添加一张图片');
    const stage='staging/'+uid();fs.mkdirSync(this.file(stage),{recursive:true});const prepared=[];
    try {
      for(const f of files){const b=Buffer.from(f.data,'base64');const m=await sharp(b,{limitInputPixels:200000000}).metadata();if(!['png','jpeg','webp','gif'].includes(m.format))throw Error(`${f.name}：仅支持 PNG / JPEG / WebP / GIF`);
        const iid=uid(),rel=`images/${id}/${iid}.${m.format==='jpeg'?'jpg':m.format}`;
        fs.writeFileSync(this.file(stage+'/'+iid),b,{flag:'wx'});
        await sharp(b).rotate().resize(700,850,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(this.file(stage+'/'+iid+'.webp'));
        prepared.push({id:iid,work_id:id,relative_path:rel,original_filename:path.basename(f.name),mime_type:'image/'+m.format,width:m.width,height:m.height,byte_size:b.length,sha256:sha(b)});
      }
      fs.mkdirSync(this.file('images/'+id),{recursive:true});fs.mkdirSync(this.file('thumbnails/'+id),{recursive:true});
      for(const i of prepared){fs.renameSync(this.file(stage+'/'+i.id),this.file(i.relative_path));fs.renameSync(this.file(stage+'/'+i.id+'.webp'),this.file(`thumbnails/${id}/${i.id}.webp`));}
      let imgs=[...retained,...prepared];
      if(Array.isArray(data.image_order)){
        const order=data.image_order.map(key=>typeof key==='number'?prepared[key]:retained.find(i=>i.id===key));
        if(order.length!==imgs.length||order.some(i=>!i)||new Set(order.map(i=>i.id)).size!==imgs.length)throw Error('图片排序无效');
        imgs=order;
      }
      this.tx(()=>{
        if(!old)this.db.run('INSERT INTO works(id,title,created_at) VALUES(?,?,?)',[id,title,stamp()]);
        const cover=imgs.some(i=>i.id===data.cover_image_id)?data.cover_image_id:imgs[Number(data.cover_index)||0]?.id||imgs[0]?.id||null;
        this.db.run('UPDATE works SET title=?,description=?,artwork_date=?,updated_at=?,status=?,cover_image_id=? WHERE id=?',[title,JSON.stringify(description),data.artwork_date||null,stamp(),data.status==='draft'?'draft':'published',cover,id]);
        this.db.run('DELETE FROM work_images WHERE work_id=?',[id]);
        imgs.forEach((i,n)=>this.db.run('INSERT INTO work_images VALUES(?,?,?,?,?,?,?,?,?,?)',[i.id,id,i.relative_path,i.original_filename,i.mime_type,i.width,i.height,i.byte_size,i.sha256,n]));
        this.setRelations(id,data.categories||[],data.tags||[]);
      });
      return this.detail(id);
    }catch(e){for(const i of prepared){fs.rmSync(this.file(i.relative_path),{force:true});fs.rmSync(this.file(`thumbnails/${id}/${i.id}.webp`),{force:true});}throw e;}
    finally{fs.rmSync(this.file(stage),{recursive:true,force:true});}
  }
  setRelations(id,categories,tags){
    this.db.run('DELETE FROM work_categories WHERE work_id=?',[id]);for(const cid of new Set(categories))this.db.run('INSERT INTO work_categories VALUES(?,?)',[id,cid]);
    this.db.run('DELETE FROM work_tags WHERE work_id=?',[id]);for(const raw of tags){const name=String(raw).trim();if(!name)continue;if(name.length>100)throw Error('标签最多 100 字');this.db.run('INSERT OR IGNORE INTO tags VALUES(?,?)',[uid(),name]);const tag=this.all('SELECT id FROM tags WHERE name=?',[name])[0];this.db.run('INSERT OR IGNORE INTO work_tags VALUES(?,?)',[id,tag.id]);}
  }
  batch({ids,action,categories=[],category_id}){if(!Array.isArray(ids))throw Error('无效作品列表');if(action==='remove-category'&&(typeof category_id!=='string'||!this.all('SELECT id FROM categories WHERE id=?',[category_id]).length))throw Error('请选择有效分类');return this.tx(()=>{for(const id of ids){if(action==='favorite'||action==='unfavorite')this.db.run('UPDATE works SET is_favorite=?,updated_at=? WHERE id=?',[action==='favorite'?1:0,stamp(),id]);else if(action==='trash')this.db.run('UPDATE works SET deleted_at=? WHERE id=?',[stamp(),id]);else if(action==='restore')this.db.run('UPDATE works SET deleted_at=NULL WHERE id=?',[id]);else if(action==='categories'){for(const cid of categories)this.db.run('INSERT OR IGNORE INTO work_categories VALUES(?,?)',[id,cid]);}else if(action==='remove-category')this.db.run('DELETE FROM work_categories WHERE work_id=? AND category_id=?',[id,category_id]);else throw Error('无效操作');}return {ok:true};});}
  purge({ids,confirm}){if(confirm!=='永久删除')throw Error('请输入“永久删除”确认');for(const id of ids){const w=this.detail(id);if(!w.deleted_at)throw Error('请先将作品移入回收站');}this.tx(()=>{for(const id of ids)this.db.run('DELETE FROM works WHERE id=?',[id]);});const errors=[];for(const id of ids)for(const folder of ['images/','thumbnails/']){try{fs.rmSync(this.file(folder+id),{recursive:true,force:true});}catch(e){errors.push(e.message);}}return {ok:true,errors};}
  taxonomy({entity,action,id,name,group_id,order}){const table={group:'category_groups',category:'categories',tag:'tags'}[entity];if(!table)throw Error('未知分类类型');return this.tx(()=>{if(action==='delete')this.db.run(`DELETE FROM ${table} WHERE id=?`,[id]);else if(action==='reorder'){order.forEach((v,i)=>this.db.run(`UPDATE ${table} SET sort_order=? WHERE id=?`,[i,v]));}else {name=String(name||'').trim();if(!name||name.length>100)throw Error('名称必填，最多 100 字');if(action==='rename')this.db.run(`UPDATE ${table} SET name=? WHERE id=?`,[name,id]);else if(entity==='category')this.db.run('INSERT INTO categories VALUES(?,?,?,?)',[uid(),group_id,name,Date.now()]);else if(entity==='group')this.db.run('INSERT INTO category_groups VALUES(?,?,?)',[uid(),name,Date.now()]);else this.db.run('INSERT OR IGNORE INTO tags VALUES(?,?)',[uid(),name]);}return this.catalog();});}
  async scan({rebuild=false}={}) {
    const issues=[],images=this.all('SELECT * FROM work_images');let rebuilt=0;
    const integrity=this.all('PRAGMA integrity_check');
    for(const i of images){try{const f=this.file(i.relative_path);if(!fs.existsSync(f)){issues.push({type:'原图缺失',path:i.relative_path});continue;}await sharp(f).metadata();const thumb=`thumbnails/${i.work_id}/${i.id}.webp`;if(!fs.existsSync(this.file(thumb))){issues.push({type:'缩略图缺失',path:thumb});if(rebuild){fs.mkdirSync(path.dirname(this.file(thumb)),{recursive:true});await sharp(f).rotate().resize(700,850,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(this.file(thumb));rebuilt++;}}}catch(e){issues.push({type:'图片或路径异常',path:i.relative_path,reason:e.message});}}
    const known=new Set(images.map(i=>i.relative_path));const walk=dir=>{for(const d of fs.readdirSync(this.file(dir),{withFileTypes:true})){const p=dir+'/'+d.name;if(d.isSymbolicLink()){issues.push({type:'符号链接',path:p});continue;}if(d.isDirectory())walk(p);else if(!known.has(p))issues.push({type:'孤立原图（保留）',path:p});}};walk('images');
    const size=dir=>fs.readdirSync(this.file(dir),{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).reduce((n,e)=>n+fs.statSync(path.join(e.parentPath||e.path,e.name)).size,0);
    return {integrity,issues,rebuilt,checked:images.length,thumbnailBytes:size('thumbnails'),trashBytes:this.all('SELECT COALESCE(SUM(i.byte_size),0) n FROM work_images i JOIN works w ON w.id=i.work_id WHERE w.deleted_at IS NOT NULL')[0].n};
  }
  backupBuffer(){const z=new Zip(),manifest={version:1,created_at:stamp(),works:this.all('SELECT COUNT(*) n FROM works')[0].n,files:[]};
    const add=(name,b)=>{manifest.files.push({path:name,size:b.length,sha256:sha(b)});z.addFile(name,b);};
    add('gallery.db',this.snapshot());add('config.json',fs.readFileSync(this.file('config.json')));
    const referenced=new Set(this.all('SELECT relative_path FROM work_images').map(i=>i.relative_path));for(const name of referenced)add(name,fs.readFileSync(this.file(name)));
    z.addFile('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));return z.toBuffer();
  }
  inspectBackup(buffer){const z=new Zip(buffer);const e=z.getEntry('manifest.json');if(!e)throw Error('缺少备份清单');const m=JSON.parse(e.getData().toString());if(m.version!==1||!Array.isArray(m.files))throw Error('不支持的备份版本');const paths=new Set();for(const f of m.files){this.file(f.path);if(paths.has(f.path)||!(/^(gallery\.db|config\.json|images\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(png|jpg|webp|gif))$/).test(f.path))throw Error('备份含无效或重复路径');paths.add(f.path);const b=z.getEntry(f.path)?.getData();if(!b||sha(b)!==f.sha256||b.length!==f.size)throw Error('备份校验失败：'+f.path);}
    if(!paths.has('gallery.db')||!paths.has('config.json'))throw Error('备份不完整');const check=new this.SQL.Database(z.getEntry('gallery.db').getData());try{const result=check.exec('PRAGMA integrity_check');if(result[0]?.values[0][0]!=='ok'||check.exec('PRAGMA foreign_key_check').length)throw Error('备份数据库损坏');const rows=check.exec('SELECT relative_path FROM work_images')[0]?.values||[];for(const [p] of rows){this.file(p);if(!paths.has(p))throw Error('备份缺少原图：'+p);}const count=check.exec('SELECT COUNT(*) FROM works')[0].values[0][0];if(count!==m.works)throw Error('作品数量与清单不符');}finally{check.close();}return m;
  }
  async restore(buffer,confirm){const m=this.inspectBackup(buffer);if(confirm!=='还原资料库')throw Error('请输入“还原资料库”确认');
    const before='backups/before-restore-'+Date.now()+'.zip';fs.writeFileSync(this.file(before),this.backupBuffer());const z=new Zip(buffer),stage='staging/restore-'+uid();fs.mkdirSync(this.file(stage),{recursive:true});
    for(const f of m.files){const target=this.file(stage+'/'+f.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,z.getEntry(f.path).getData());}
    fs.writeFileSync(this.file('restore-journal.json'),JSON.stringify({stage}));
    const moved=[],installed=[];this.db.close();try{for(const name of ['gallery.db','config.json','images','thumbnails']){const old=stage+'/old-'+name;fs.renameSync(this.file(name),this.file(old));moved.push([name,old]);if(fs.existsSync(this.file(stage+'/'+name))){fs.renameSync(this.file(stage+'/'+name),this.file(name));installed.push(name);}else{fs.mkdirSync(this.file(name),{recursive:true});installed.push(name);}}this.db=new this.SQL.Database(fs.readFileSync(this.file('gallery.db')));this.db.run('PRAGMA foreign_keys=ON');fs.unlinkSync(this.file('restore-journal.json'));}
    catch(e){for(const name of installed)fs.rmSync(this.file(name),{recursive:true,force:true});for(const [name,old] of moved.reverse())fs.renameSync(this.file(old),this.file(name));this.db=new this.SQL.Database(fs.readFileSync(this.file('gallery.db')));this.db.run('PRAGMA foreign_keys=ON');fs.unlinkSync(this.file('restore-journal.json'));throw e;}
    finally{if(!fs.existsSync(this.file('restore-journal.json')))fs.rmSync(this.file(stage),{recursive:true,force:true});}await this.scan({rebuild:true});return {ok:true,backup:before,works:m.works};
  }
}
module.exports={GalleryStore,sha};
