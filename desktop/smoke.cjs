const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startServer}=require('./server.cjs');
module.exports=async function smoke(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mygallery-electron-smoke-'));let result;
 try{result=await startServer({root,port:0,production:true});const {store,url}=result;
  const login=await fetch(url,{redirect:'manual'});const cookie=login.headers.get('set-cookie').split(';')[0];const origin=new URL(url).origin;
  const html=await fetch(origin+'/',{headers:{cookie}});if(!html.ok||!(await html.text()).includes('MyGallery'))throw Error('Packaged UI unavailable');
  const bytes=await require('sharp')({create:{width:40,height:30,channels:3,background:'#657846'}}).png().toBuffer();
  const w=await store.save({title:'Electron 原生模块验收',status:'published',tags:['✨']},[{name:'测试.png',data:bytes.toString('base64')}]);
  if((await store.scan()).issues.length)throw Error('Image scan failed');const backup=store.backupBuffer();if(store.inspectBackup(backup).works!==1)throw Error('Backup failed');
  const image=await fetch(origin+'/media/'+w.images[0].relative_path,{headers:{cookie}});if(!image.ok)throw Error('Local image loading failed');
  return {ok:true,electron:process.versions.electron,sqlite:'ok',sharp:'ok',staticUI:'ok',backup:'ok'};
 }finally{result?.server.close();result?.store.db.close();fs.rmSync(root,{recursive:true,force:true});}
};
