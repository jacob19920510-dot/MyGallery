let token='';
export async function bootstrap(){const r=await fetch('/api/bootstrap');if(!r.ok)throw Error(r.status===403?'本地服务会话已失效，请重新打开应用。':'本地服务连接失败，请重新启动应用');const data=await r.json();if(typeof data.token!=='string'||!data.token)throw Error('本地授权信息无效，请重新打开应用。');token=data.token;(window as any).__desktop=data.desktop;}
export async function api<T=any>(route:string,body?:unknown):Promise<T>{const send=()=>fetch('/api/'+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Gallery-Token':token},body:JSON.stringify(body)});let r=await send();if(r.status===403){await bootstrap();r=await send();}const text=await r.text();let j:any={};if(text){try{j=JSON.parse(text);}catch{throw Error(r.status===403?'本地服务拒绝了请求，请重新打开应用后再试。':`本地服务返回无法识别的响应（HTTP ${r.status}）。`);}}if(!r.ok)throw Error(j.error||'操作失败');return j;}
export const media=(p?:string)=>p?'/media/'+p:'';
export const thumbnail=(p?:string)=>p?media(p.replace(/^images\//,'thumbnails/').replace(/\.[^.]+$/,'.webp')):'';
export const bytes=(n:number)=>n>1024**3?(n/1024**3).toFixed(2)+' GB':n>1024**2?(n/1024**2).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB';
export const base64=(f:File):Promise<string>=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('文件读取失败：'+f.name));r.readAsDataURL(f);});
