import {useSyncExternalStore} from 'react';
import translations from './locales.json';

export const languages = [
 {value:'zh-TW',name:'繁體中文'},
 {value:'zh-CN',name:'简体中文'},
 {value:'en',name:'English'},
 {value:'ja',name:'日本語'},
] as const;
export type Language = typeof languages[number]['value'];
const messages:Record<string,string[]> = translations;
const isLanguage = (value:string|null):value is Language => languages.some(item=>item.value===value);
let language:Language = 'zh-CN';
try { const saved=localStorage.getItem('gallery-language'); if(isLanguage(saved))language=saved; } catch {}
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const getLanguage=()=>language;
export function setLanguage(next:Language){
 if(!isLanguage(next)||next===language)return;
 language=next;
 updateDocumentLanguage();
 try {localStorage.setItem('gallery-language',next);} catch {}
 listeners.forEach(listener=>listener());
}
if(typeof window!=='undefined')window.addEventListener?.('storage',event=>{
 if(event.key==='gallery-language')setLanguage(isLanguage(event.newValue)?event.newValue:'zh-CN');
});
export const useLanguage=()=>useSyncExternalStore(subscribe,getLanguage,getLanguage);
const interpolate=(message:string,values:unknown[])=>message.replace(/\{(\d+)\}/g,(match,index)=>values[Number(index)]===undefined?match:String(values[Number(index)]));
// Also recognize complete messages returned by the local service, keeping file names intact.
const patterns=Object.keys(messages).filter(key=>key.indexOf('{0}')>=4).sort((a,b)=>b.length-a.length).map(key=>({
 key,
 pattern:new RegExp('^'+key.split(/\{\d+\}/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('(.*?)')+'$','s'),
}));
export function t(source:string,...values:unknown[]):string{
 if(language==='zh-CN')return interpolate(source,values);
 const index=language==='zh-TW'?0:language==='en'?1:2;
 const translated=messages[source]?.[index];
 if(translated!==undefined)return interpolate(translated,values);
 if(!values.length){
  for(const {key,pattern} of patterns){const match=source.match(pattern);if(match)return interpolate(messages[key][index],match.slice(1));}
 }
 return interpolate(source,values);
}

function updateDocumentLanguage(){
 if(typeof document==='undefined')return;
 document.documentElement.lang=language;
 document.title='MyGallery · '+t('私人艺术馆');
}
updateDocumentLanguage();
