const express=require('express');
const path=require('node:path');
const fs=require('node:fs');
const {randomBytes}=require('node:crypto');
const {GalleryStore}=require('./store.cjs');
// Finish reading rejected uploads before replying. Closing a request with an
// unread image body can reset Vite's upstream socket and hide the 403 response.
function rejectRequest(req,res,status,code,error){
  if(req.method!=='GET')console.warn(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl.split('?')[0]} rejected: ${code}`);
  const respond=()=>{if(!res.destroyed&&!res.headersSent)res.status(status).json({code,error});};
  if(req.readableEnded)return respond();
  req.once('end',respond);req.once('error',()=>{});req.resume();
}
async function startServer({root,port=4174,production=false,onOpenFolder,onBackup,onRestore}={}){
  const store=await new GalleryStore().init(root||path.join(__dirname,'..'));
  const app=express(),token=randomBytes(32).toString('hex');let queue=Promise.resolve();
  app.use((req,res,next)=>{if(!['127.0.0.1','localhost'].includes(req.hostname))return rejectRequest(req,res,403,'LOCAL_ONLY','只允许本机访问');const origins=['127.0.0.1','localhost'].flatMap(host=>[`http://${host}:5173`,`http://${host}:${server.address().port}`]);if(req.headers.origin&&!origins.includes(req.headers.origin))return rejectRequest(req,res,403,'ORIGIN_NOT_ALLOWED','请求来源不受信任，请使用本机画廊地址访问');res.setHeader('X-Content-Type-Options','nosniff');if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');next();});
  app.get('/api/bootstrap',(req,res)=>{if(production&&!req.headers.cookie?.includes('gallery='+token))return rejectRequest(req,res,403,'SESSION_EXPIRED','本地服务会话已失效，请重新打开应用');if(!production&&!['same-origin','same-site',undefined].includes(req.headers['sec-fetch-site']))return rejectRequest(req,res,403,'ORIGIN_NOT_ALLOWED','请求来源不受信任');res.cookie('gallery',token,{httpOnly:true,sameSite:'strict'});res.json({token,desktop:!!onBackup});});
  if(production)app.get('/',(req,res,next)=>{if(req.query.session===token){res.cookie('gallery',token,{httpOnly:true,sameSite:'strict'});return res.redirect('/');}if(!req.headers.cookie?.includes('gallery='+token))return res.sendStatus(403);next();});
  app.use(['/api','/media'],(req,res,next)=>{if(!req.headers.cookie?.includes('gallery='+token)||req.method!=='GET'&&req.headers['x-gallery-token']!==token)return rejectRequest(req,res,403,'SESSION_EXPIRED','本地服务会话已失效，请重新授权后重试');next();});
  app.use(express.json({limit:'800mb'}));
  app.use((error,req,res,next)=>{if(res.headersSent||res.destroyed)return next(error);const tooLarge=error.type==='entity.too.large';console.error(`[api] ${req.method} ${req.path}: ${error.type||error.message}`);res.status(tooLarge?413:400).json({code:tooLarge?'PAYLOAD_TOO_LARGE':'INVALID_REQUEST',error:tooLarge?'本次上传内容过大，请减少图片数量后保存':'请求内容不完整或格式错误，请重新选择图片后保存'});});
  app.get('/media/*file',(req,res)=>{try{const rel=req.params.file.join('/');if(!/^(images|thumbnails)\//.test(rel))return res.sendStatus(403);res.sendFile(store.file(rel));}catch{res.sendStatus(404);}});
  app.get('/api/catalog',(req,res)=>res.json(store.catalog()));
  app.get('/api/featured',(req,res)=>{try{res.json(store.featured());}catch(e){res.status(400).json({error:e.message});}});
  app.get('/api/works',(req,res)=>{try{res.json(store.list({...req.query,categories:req.query.categories?String(req.query.categories).split(','):[]}));}catch(e){res.status(400).json({error:e.message});}});
  app.get('/api/works/:id',(req,res)=>{try{res.json(store.detail(req.params.id));}catch(e){res.status(404).json({error:e.message});}});
  const post=(route,fn)=>app.post('/api/'+route,(req,res)=>{const run=async()=>{try{res.json(await fn(req.body));}catch(e){console.error(e);res.status(400).json({error:e.message});}};queue=queue.then(run,run);});
  post('save',b=>store.save(b.work,b.files));post('batch',b=>store.batch(b));post('purge',b=>store.purge(b));post('taxonomy',b=>store.taxonomy(b));post('scan',b=>store.scan(b));
  post('featured',b=>store.setFeatured(b.ids));
  app.get('/api/backup',(req,res)=>{queue=queue.then(()=>{try{res.setHeader('Content-Disposition','attachment; filename="MyGallery-'+Date.now()+'.zip"');res.type('zip').send(store.backupBuffer());}catch(e){res.status(400).json({error:e.message});}});});
  post('backup-desktop',async()=>{if(!onBackup)throw Error('请在桌面版使用原生目录选择');return onBackup(store.backupBuffer());});
  post('inspect-backup',b=>store.inspectBackup(Buffer.from(b.data,'base64')));
  post('restore',b=>store.restore(Buffer.from(b.data,'base64'),b.confirm));
  post('open-folder',b=>{if(!onOpenFolder)throw Error('打开目录仅在桌面版可用');const rel=b.id?store.detail(b.id).images[0]?.relative_path:null;return onOpenFolder(rel?path.dirname(store.file(rel)):store.root);});
  if(production)app.use(express.static(path.join(__dirname,'../dist')));
  const server=await new Promise(resolve=>{const s=app.listen(port,'127.0.0.1',()=>resolve(s));});
  return {store,server,url:`http://127.0.0.1:${server.address().port}/?session=${token}`};
}
if(require.main===module)startServer({root:process.env.MYGALLERY_ROOT}).then(()=>console.log('MyGallery API ready at http://127.0.0.1:4174'));
module.exports={startServer};
