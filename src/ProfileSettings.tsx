import {useRef,useState} from 'react';
import type {ChangeEvent,FormEvent} from 'react';
import {Camera,RotateCcw} from 'lucide-react';
import {t as translate} from './i18n';
import {Modal} from './components';

export type ProfileData={name:string;avatar:string};

export function AvatarContent({src}:{src:string}){
 return src?<img className="profile-avatar-image" src={src} alt=""/>:<span className="profile-avatar-fallback">M</span>;
}

export function ProfileSettings({profile,onSave,onClose}:{profile:ProfileData;onSave:(value:ProfileData)=>void;onClose:()=>void}){
 const [name,setName]=useState(profile.name),[avatar,setAvatar]=useState(profile.avatar),[error,setError]=useState(''),[processing,setProcessing]=useState(false);
 const inputRef=useRef<HTMLInputElement>(null);
 const handleAvatarChange=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
  if(file.type&&!file.type.startsWith('image/')){setError(translate("请选择有效的图片文件。"));return;}
  if(file.size>20*1024*1024){setError(translate("图片文件不能超过 20 MB。"));return;}
  setError('');setProcessing(true);const url=URL.createObjectURL(file);
  try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const loaded=new window.Image();loaded.onload=()=>resolve(loaded);loaded.onerror=()=>reject(new Error('decode'));loaded.src=url;});
   const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const context=canvas.getContext('2d');if(!context)throw new Error('canvas');context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
   const optimized=canvas.toDataURL('image/webp',0.86);if(optimized==='data:,')throw new Error('empty');setAvatar(optimized);
  }catch{setError(translate("无法读取该图片，请选择其他文件。"));}
  finally{URL.revokeObjectURL(url);setProcessing(false);}
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const nextName=name.trim();if(!nextName){setError(translate("请输入显示名称。"));return;}onSave({name:nextName,avatar});};
 return <Modal title={translate("编辑个人资料")} onClose={onClose}><form className="simple-form profile-editor" onSubmit={submit}>
  <div className="profile-edit-avatar"><span className="avatar profile-avatar-preview"><AvatarContent src={avatar}/></span><div className="profile-avatar-details"><strong>{translate("头像")}</strong><p>{translate("建议使用正方形图片，系统会自动缩放。")}</p><div className="profile-avatar-actions"><button type="button" className="btn" disabled={processing} onClick={()=>inputRef.current?.click()}><Camera size={16}/>{avatar?translate("更换头像"):translate("上传头像")}</button>{avatar&&<button type="button" className="btn" disabled={processing} onClick={()=>{setAvatar('');setError('');}}><RotateCcw size={15}/>{translate("恢复默认头像")}</button>}</div><input ref={inputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange}/></div></div>
  <label className="field">{translate("显示名称")}<input autoFocus maxLength={40} value={name} onChange={event=>setName(event.target.value)}/></label>
  {processing&&<p className="profile-processing" role="status">{translate("正在处理头像…")}</p>}{error&&<p className="profile-form-error" role="alert">{error}</p>}
  <div className="profile-form-actions"><button type="button" className="btn" onClick={onClose}>{translate("取消")}</button><button type="submit" className="btn primary" disabled={!name.trim()||processing}>{translate("保存")}</button></div>
 </form></Modal>;
}