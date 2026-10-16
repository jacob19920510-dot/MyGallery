import {useId,useLayoutEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import type {Block} from './types';

export default function ExpandableNotes({blocks}:{blocks:Block[]}){
 const [expanded,setExpanded]=useState(false),[overflow,setOverflow]=useState(false),[previewHeight,setPreviewHeight]=useState(0);
 const content=useRef<HTMLDivElement>(null),section=useRef<HTMLDivElement>(null);const id=useId();
 useLayoutEffect(()=>{
  const node=content.current;if(!node)return;
  const measure=()=>{const limit=parseFloat(getComputedStyle(node).lineHeight)*6;setPreviewHeight(limit);setOverflow(node.getBoundingClientRect().height>limit+1);};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[blocks]);
 const collapsed=overflow&&!expanded;
 return <div className="detail-notes" ref={section}>
  <div id={id} className={`notes-preview ${collapsed?'is-collapsed':''}`} style={collapsed?{maxHeight:previewHeight}:undefined}>
   <div className="prose" ref={content}>{blocks.length?blocks.map((block,index)=>block.type==='heading'?<h3 key={index}>{block.text}</h3>:block.type==='quote'?<blockquote key={index}>{block.text}</blockquote>:block.type==='bold'?<p key={index}><strong>{block.text}</strong></p>:block.type==='italic'?<p key={index}><em>{block.text}</em></p>:block.type==='list'?<ul key={index}>{block.text.split('\n').map((text,i)=><li key={i}>{text}</li>)}</ul>:block.type==='link'?<p key={index}><a href={/^https?:\/\//.test(block.url||'')?block.url:undefined} tabIndex={collapsed?-1:undefined} onClick={e=>{if(!confirm('在浏览器中打开外部链接？\n'+block.url))e.preventDefault();}} target="_blank" rel="noreferrer">{block.text}</a></p>:<p key={index}>{block.text}</p>):<p className="muted">还没有创作手记。</p>}</div>
  </div>
  {overflow&&<button type="button" className="notes-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>{setExpanded(value=>!value);if(expanded)requestAnimationFrame(()=>section.current?.scrollIntoView({block:'nearest'}));}}>{expanded?'收起':'阅读全部'}<ChevronDown size={15} style={{transform:expanded?'rotate(180deg)':undefined}}/></button>}
 </div>;
}
