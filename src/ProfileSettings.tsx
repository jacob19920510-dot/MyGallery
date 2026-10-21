import {useEffect,useRef,useState} from 'react';
import type {ChangeEvent,FormEvent,KeyboardEvent as ReactKeyboardEvent,PointerEvent as ReactPointerEvent} from 'react';
import {Camera,RotateCcw} from 'lucide-react';
import {t as translate} from './i18n';
import {Modal} from './components';

export type ProfileData={name:string;avatar:string};
type CropSource={url:string;image:HTMLImageElement};

export function AvatarContent({src}:{src:string}){
 return src?<img className="profile-avatar-image" src={src} alt=""/>:<span className="profile-avatar-fallback">M</span>;
}

export function ProfileSettings({profile,onSave,onClose}:{profile:ProfileData;onSave:(value:ProfileData)=>void;onClose:()=>void}){
 const [name,setName]=useState(profile.name),[avatar,setAvatar]=useState(profile.avatar),[error,setError]=useState(''),[processing,setProcessing]=useState(false),[cropSource,setCropSource]=useState<CropSource|null>(null);
 const inputRef=useRef<HTMLInputElement>(null),loadRequest=useRef(0);

 useEffect(()=>{
  if(!cropSource)return;
  const url=cropSource.url;
  return()=>URL.revokeObjectURL(url);
 },[cropSource]);

 const handleAvatarChange=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  if(!file)return;
  if(file.type&&!file.type.startsWith('image/')){setError(translate('请选择有效的图片文件。'));return;}
  if(file.size>20*1024*1024){setError(translate('图片文件不能超过 20 MB。'));return;}

  const request=++loadRequest.current,url=URL.createObjectURL(file);
  let transferred=false;
  setError('');
  setProcessing(true);
  try{
   const image=new window.Image();
   await new Promise<void>((resolve,reject)=>{
    image.onload=()=>resolve();
    image.onerror=()=>reject(new Error('decode'));
    image.src=url;
   });
   if(!image.naturalWidth||!image.naturalHeight)throw new Error('empty');
   if(request!==loadRequest.current)return;
   setCropSource({url,image});
   transferred=true;
  }catch{
   if(request===loadRequest.current)setError(translate('无法读取该图片，请选择其他文件。'));
  }finally{
   if(!transferred)URL.revokeObjectURL(url);
   if(request===loadRequest.current)setProcessing(false);
  }
 };

 const closeCrop=()=>{setCropSource(null);setError('');};
 const handleClose=()=>{
  loadRequest.current+=1;
  onClose();
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  const nextName=name.trim();
  if(!nextName){setError(translate('请输入显示名称。'));return;}
  onSave({name:nextName,avatar});
 };

 return <Modal title={translate(cropSource?'调整头像显示范围':'编辑个人资料')} onClose={handleClose} closeOnBackdrop={!cropSource}>
  {cropSource?<AvatarCropper key={cropSource.url} source={cropSource} onCancel={closeCrop} onApply={value=>{setAvatar(value);setError('');setCropSource(null);}}/>:
   <form className="simple-form profile-editor" onSubmit={submit}>
    <div className="profile-edit-avatar">
     <span className="avatar profile-avatar-preview"><AvatarContent src={avatar}/></span>
     <div className="profile-avatar-details">
      <strong>{translate('头像')}</strong>
      <p>{translate('头像会以圆形显示。选择后可拖动并缩放图片调整范围。')}</p>
      <div className="profile-avatar-actions">
       <button type="button" className="btn" disabled={processing} onClick={()=>inputRef.current?.click()}><Camera size={16}/>{avatar?translate('更换头像'):translate('上传头像')}</button>
       {avatar&&<button type="button" className="btn" disabled={processing} onClick={()=>{setAvatar('');setError('');}}><RotateCcw size={15}/>{translate('恢复默认头像')}</button>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange}/>
     </div>
    </div>
    <label className="field">{translate('显示名称')}<input autoFocus maxLength={40} value={name} onChange={event=>setName(event.target.value)}/></label>
    {processing&&<p className="profile-processing" role="status">{translate('正在处理头像…')}</p>}
    {error&&<p className="profile-form-error" role="alert">{error}</p>}
    <div className="profile-form-actions"><button type="button" className="btn" onClick={onClose}>{translate('取消')}</button><button type="submit" className="btn primary" disabled={!name.trim()||processing}>{translate('保存')}</button></div>
   </form>
  }
 </Modal>;
}

function AvatarCropper({source,onCancel,onApply}:{source:CropSource;onCancel:()=>void;onApply:(value:string)=>void}){
 const stageRef=useRef<HTMLDivElement>(null),wheelRef=useRef<HTMLDivElement>(null);
 const dragRef=useRef<{pointerId:number;startX:number;startY:number;originX:number;originY:number}|null>(null);
 const [stageSize,setStageSize]=useState(280),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[dragging,setDragging]=useState(false),[error,setError]=useState('');
 const {image}=source,naturalWidth=image.naturalWidth,naturalHeight=image.naturalHeight;
 const previewScale=Math.min(1,4096/Math.max(naturalWidth,naturalHeight));
 const previewWidth=naturalWidth*previewScale,previewHeight=naturalHeight*previewScale;
 const fitScale=stageSize/Math.min(previewWidth,previewHeight);
 const sourceScale=previewScale*fitScale*zoom;
 const renderedWidth=previewWidth*fitScale*zoom,renderedHeight=previewHeight*fitScale*zoom;

 useEffect(()=>{
  const stage=stageRef.current;
  if(!stage)return;
  const updateSize=()=>setStageSize(Math.min(stage.clientWidth,stage.clientHeight)||280);
  const observer=new ResizeObserver(updateSize);
  observer.observe(stage);
  updateSize();
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const viewport=wheelRef.current;
  if(!viewport)return;
  const handleWheel=(event:WheelEvent)=>{
   event.preventDefault();
   event.stopPropagation();
   const delta=event.deltaMode===1?event.deltaY*16:event.deltaMode===2?event.deltaY*stageSize:event.deltaY;
   setZoom(current=>Math.max(1,Math.min(3,current-delta*0.002)));
  };
  viewport.addEventListener('wheel',handleWheel,{passive:false});
  return()=>viewport.removeEventListener('wheel',handleWheel);
 },[stageSize]);

 const clampOffset=(x:number,y:number,scale=zoom)=>{
  const width=previewWidth*fitScale*scale,height=previewHeight*fitScale*scale;
  const maxX=Math.max(0,(width-stageSize)/2),maxY=Math.max(0,(height-stageSize)/2);
  return{x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
 };
 useEffect(()=>{setOffset(current=>clampOffset(current.x,current.y));},[zoom,stageSize]);

 const moveBy=(x:number,y:number)=>setOffset(current=>clampOffset(current.x+x,current.y+y));
 const startDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(event.button!==0)return;
  event.preventDefault();
  event.currentTarget.focus();
  event.currentTarget.setPointerCapture(event.pointerId);
  dragRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:offset.x,originY:offset.y};
  setDragging(true);
 };
 const continueDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const drag=dragRef.current;
  if(!drag||drag.pointerId!==event.pointerId)return;
  setOffset(clampOffset(drag.originX+event.clientX-drag.startX,drag.originY+event.clientY-drag.startY));
 };
 const stopDrag=()=>{dragRef.current=null;setDragging(false);};
 const handleStageKeyDown=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
  const distance=event.shiftKey?24:8;
  const nudges:Record<string,[number,number]>={ArrowUp:[0,-distance],ArrowDown:[0,distance],ArrowLeft:[-distance,0],ArrowRight:[distance,0]};
  const nudge=nudges[event.key];
  if(!nudge)return;
  event.preventDefault();
  moveBy(nudge[0],nudge[1]);
 };
 const applyCrop=()=>{
  try{
   const canvas=document.createElement('canvas');
   canvas.width=512;canvas.height=512;
   const context=canvas.getContext('2d');
   if(!context)throw new Error('canvas');
   const cropSize=stageSize/sourceScale;
   const centerX=naturalWidth/2-offset.x/sourceScale,centerY=naturalHeight/2-offset.y/sourceScale;
   const left=Math.max(0,Math.min(naturalWidth-cropSize,centerX-cropSize/2));
   const top=Math.max(0,Math.min(naturalHeight-cropSize,centerY-cropSize/2));
   context.imageSmoothingQuality='high';
   context.drawImage(image,left,top,cropSize,cropSize,0,0,512,512);
   const data=canvas.toDataURL('image/webp',0.88);
   if(data==='data:,')throw new Error('empty');
   onApply(data);
  }catch{
   setError(translate('无法读取该图片，请选择其他文件。'));
  }
 };

 return <div className="profile-cropper">
  <p className="profile-crop-instructions" id="profile-crop-instructions">{translate('拖动图片调整显示范围，滚动鼠标滚轮或使用缩放滑块缩放，也可用方向键微调。')}</p>
  <div ref={wheelRef} className="profile-crop-stage-wrap">
   <div ref={stageRef} className={`profile-crop-stage${dragging?' dragging':''}`} role="group" aria-label={translate('头像预览区域')} aria-describedby="profile-crop-instructions" tabIndex={0} onKeyDown={handleStageKeyDown} onPointerDown={startDrag} onPointerMove={continueDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
    <img src={source.url} alt="" draggable={false} style={{width:renderedWidth,height:renderedHeight,left:stageSize/2+offset.x,top:stageSize/2+offset.y}}/>
   </div>
  </div>
  <div className="profile-crop-controls">
   <label className="profile-crop-zoom"><span>{translate('缩放头像')}</span><input type="range" min="1" max="3" step="0.01" aria-label={translate('缩放头像')} value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label>
  </div>
  {error&&<p className="profile-form-error" role="alert">{error}</p>}
  <div className="profile-form-actions"><button type="button" className="btn" onClick={onCancel}>{translate('取消')}</button><button type="button" className="btn primary" onClick={applyCrop}>{translate('使用此头像')}</button></div>
 </div>;
}
