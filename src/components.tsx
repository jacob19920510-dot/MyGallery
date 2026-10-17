import {t as translate} from './i18n';
import {useEffect,useRef,type ReactNode} from 'react';
import {X,LoaderCircle} from 'lucide-react';
export function Modal({title,children,onClose,wide=false,className='',closeLabel=translate("关闭")}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean;className?:string;closeLabel?:string}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
 return <dialog ref={ref} className={`modal ${wide?'wide':''} ${className}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><header className="modal-head"><div><span className="eyebrow">MY GALLERY / STUDIO</span><h2>{title}</h2></div><button className="icon-btn" aria-label={closeLabel} title={closeLabel} onClick={onClose}><X/></button></header>{children}</dialog>;
}
export function Empty({icon,heading,children}:{icon:ReactNode;heading:string;children:ReactNode}){return <div className="empty"><div className="empty-icon">{icon}</div><h2>{heading}</h2><div>{children}</div></div>;}
export function Busy({text=translate("正在处理…")}:{text?:string}){return <span className="busy"><LoaderCircle className="spin" size={16}/>{text}</span>;}
