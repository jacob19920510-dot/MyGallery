const {app,BrowserWindow,dialog,shell,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {startServer}=require('./server.cjs');
let server;
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  if(process.argv.includes('--smoke-test')){try{const result=await require('./smoke.cjs')();fs.writeFileSync(path.join(app.isPackaged?path.dirname(app.getPath('exe')):path.join(__dirname,'..'),'smoke-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(0);}catch(e){console.error(e);fs.writeFileSync(path.join(app.isPackaged?path.dirname(app.getPath('exe')):path.join(__dirname,'..'),'smoke-result.json'),JSON.stringify({ok:false,error:e.stack}));app.exit(1);}return;}
  try{
    const root=app.isPackaged?path.dirname(app.getPath('exe')):path.join(__dirname,'..');
    const result=await startServer({root,port:0,production:true,onOpenFolder:async p=>{const error=await shell.openPath(p);if(error)throw Error(error);return {ok:true};},onBackup:async buffer=>{const r=await dialog.showSaveDialog({title:'备份资料库',defaultPath:path.join(app.getPath('documents'),'MyGallery-'+Date.now()+'.zip'),filters:[{name:'MyGallery 备份',extensions:['zip']}]});if(r.canceled)return {canceled:true};fs.writeFileSync(r.filePath,buffer);return {ok:true,path:r.filePath};}});server=result.server;
    session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
    const win=new BrowserWindow({width:1480,height:960,minWidth:900,minHeight:650,title:'MyGallery · 私人艺术馆',icon:path.join(__dirname,'../dist/icon.png'),backgroundColor:'#f5f8fc',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    const origin=new URL(result.url).origin;
    win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))dialog.showMessageBox(win,{type:'question',buttons:['取消','打开浏览器'],defaultId:0,title:'打开外部链接',message:'即将在系统浏览器中访问外部网站',detail:url}).then(r=>{if(r.response===1)shell.openExternal(url);});return {action:'deny'};});
    win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
    win.loadURL(result.url);
    app.on('second-instance',()=>{if(win.isMinimized())win.restore();win.focus();});
  }catch(e){dialog.showErrorBox('MyGallery 无法启动','请将整个程序目录移动到可写文件夹后重试。\n'+e.message);app.quit();}
});
app.on('window-all-closed',()=>{server?.close();app.quit();});
