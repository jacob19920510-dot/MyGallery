import {t as translate} from './i18n';
let token='';
let authorizing:Promise<void>|null=null;
export function bootstrap():Promise<void>{
 if(!authorizing)authorizing=(async()=>{
  let r:Response;
  try{r=await fetch('/api/bootstrap',{cache:'no-store',signal:AbortSignal.timeout(10000)});}catch{throw Error(translate("无法连接本地服务，请确认服务已启动后重试。"));}
  if(!r.ok)throw Error(r.status===403?translate("本地服务会话已失效，请重新打开应用。"):translate("本地服务暂时无法连接（HTTP {0}），请稍后重试。", r.status));
  let data:any;try{data=await r.json();}catch{throw Error(translate("本地授权响应不完整，请稍后重试。"));}if(typeof data.token!=='string'||!data.token)throw Error(translate("本地授权信息无效，请重新打开应用。"));
  token=data.token;(window as any).__desktop=data.desktop;
 })().finally(()=>{authorizing=null;});
 return authorizing;
}
export async function api<T=any>(route:string,body?:unknown):Promise<T>{
 // Renew before sending image bytes: a small handshake can recover an old tab
 // after an API restart without risking a reset in the middle of an upload.
 const writing=body!==undefined;
 if(writing||!token)await bootstrap();
 const interrupted=writing?(route==='save'?translate("与本地服务的连接中断，无法确认操作结果。请先查看作品列表确认，避免重复保存；当前填写内容会保留。"):translate("与本地服务的连接中断，无法确认操作结果。请刷新后确认，避免重复操作。")):translate("与本地服务的连接中断，请确认服务已启动后重试。");
 const send=async()=>{try{return await fetch('/api/'+route,writing?{method:'POST',headers:{'Content-Type':'application/json','X-Gallery-Token':token},body:JSON.stringify(body),cache:'no-store'}:{cache:'no-store'});}catch{throw Error(interrupted);}};
 let r=await send();
 // A 403 is safe to retry because authorization rejected it before any write.
 // Never replay a save after a network error: it may already have committed.
 if(r.status===403){await r.text().catch(()=>{});await bootstrap();r=await send();}
 let text:string;try{text=await r.text();}catch{throw Error(interrupted);}
 let j:any={};if(text){try{j=JSON.parse(text);}catch{throw Error(r.status===403?translate("本地服务拒绝了请求，请重新打开应用后再试。"):translate("本地服务返回无法识别的响应（HTTP {0}）。", r.status));}}
 if(!r.ok)throw Error(translate(j.error||([502,503,504].includes(r.status)?interrupted:translate("操作失败（HTTP {0}）", r.status))));return j;
}
export const media=(p?:string)=>p?'/media/'+p:'';
export const thumbnail=(p?:string)=>p?media(p.replace(/^images\//,'thumbnails/').replace(/\.[^.]+$/,'.webp')):'';
export const bytes=(n:number)=>n>1024**3?(n/1024**3).toFixed(2)+' GB':n>1024**2?(n/1024**2).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB';
export const base64=(f:File):Promise<string>=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error(translate("文件读取失败：")+f.name));r.readAsDataURL(f);});
