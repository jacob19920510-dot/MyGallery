import {useEffect,useState} from 'react';
import {Plus,Star,ArrowUpRight,Search,Check,X,ArrowLeft,ArrowRight,SlidersHorizontal} from 'lucide-react';
import {api,thumbnail} from './api';
import type {Work} from './types';
import {Modal,Busy} from './components';

export default function Featured({revision,onOpen,notify}:{revision:number;onOpen:(work:Work)=>void;notify:(message:string)=>void}){
 const [items,setItems]=useState<Work[]>([]),[editing,setEditing]=useState(false);
 useEffect(()=>{let active=true;api<{items:Work[]}>('featured').then(r=>{if(active)setItems(r.items);}).catch(e=>{if(active)notify(e.message);});return()=>{active=false;};},[revision]);
 return <section className="featured-section" aria-labelledby="featured-heading">
  <div className="featured-heading"><div><h2 id="featured-heading"><Star size={17}/>精选作品</h2><p>把最想回看的作品，留在这里。</p></div><button className="btn featured-manage" onClick={()=>setEditing(true)}><SlidersHorizontal size={15}/>管理精选</button></div>
  <div className="featured-grid">{Array.from({length:3},(_,index)=>{const work=items[index];return work?<button className="featured-card" key={work.id} onClick={()=>onOpen(work)} aria-label={`查看精选作品 ${work.title}`} title={work.title}>
   <img src={thumbnail(work.cover_path)} alt=""/><span className="featured-number">精选 / 0{index+1}</span><div className="featured-caption"><div><strong>{work.title}</strong><span>{(work.artwork_date||work.created_at||'').slice(0,10).replaceAll('-','.')}</span></div><span className="featured-open"><ArrowUpRight size={19}/></span></div>
  </button>:<button className="featured-card featured-empty" key={'empty-'+index} onClick={()=>setEditing(true)}><span className="featured-add"><Plus size={23}/></span><strong>选择第 {index+1} 件精选</strong><span>从已有作品中挑选</span></button>;})}</div>
  {editing&&<FeaturedPicker initial={items} onClose={()=>setEditing(false)} onSave={works=>{setItems(works);setEditing(false);notify('精选作品已更新');}}/>}
 </section>;
}

function FeaturedPicker({initial,onClose,onSave}:{initial:Work[];onClose:()=>void;onSave:(items:Work[])=>void}){
 const [chosen,setChosen]=useState(initial),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[result,setResult]=useState<{items:Work[];total:number}>({items:[],total:0}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(1);},220);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{let active=true;setLoading(true);api<{items:Work[];total:number}>('works?'+new URLSearchParams({view:'all',search:query,page:String(page)})).then(r=>{if(active)setResult(r);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[query,page]);
 const toggle=(work:Work)=>{setError('');setChosen(current=>current.some(w=>w.id===work.id)?current.filter(w=>w.id!==work.id):current.length<3?[...current,work]:current);};
 const move=(index:number,step:number)=>setChosen(current=>{const next=[...current],target=index+step;if(target<0||target>=next.length)return current;[next[index],next[target]]=[next[target],next[index]];return next;});
 const save=async()=>{setSaving(true);setError('');try{const r=await api<{items:Work[]}>('featured',{ids:chosen.map(w=>w.id)});onSave(r.items);}catch(e){setError((e as Error).message);}finally{setSaving(false);}};
 return <Modal wide className="featured-picker" title="管理精选作品" onClose={()=>{if(!saving)onClose();}}>
  <div className="featured-picker-body"><div className="featured-picker-intro"><p>从已有的已发布作品中选择，最多 3 件。下方顺序就是首页展示顺序。</p><strong>已选 {chosen.length} / 3</strong></div>
   <div className="featured-chosen">{Array.from({length:3},(_,index)=>{const work=chosen[index];return <div className={`featured-chosen-slot ${work?'filled':''}`} key={work?.id||index}>{work?<><img src={thumbnail(work.cover_path)} alt=""/><div><small>0{index+1}</small><strong title={work.title}>{work.title}</strong><div className="featured-chosen-actions"><button className="icon-btn" aria-label={`前移精选 ${work.title}`} disabled={saving||index===0} onClick={()=>move(index,-1)}><ArrowLeft size={14}/></button><button className="icon-btn" aria-label={`后移精选 ${work.title}`} disabled={saving||index===chosen.length-1} onClick={()=>move(index,1)}><ArrowRight size={14}/></button><button className="icon-btn" aria-label={`移除精选 ${work.title}`} disabled={saving} onClick={()=>toggle(work)}><X size={14}/></button></div></div></>:<><Plus size={19}/><span>精选位置 0{index+1}</span></>}</div>;})}</div>
   <div className="featured-picker-toolbar"><div className="search-field"><Search size={16}/><input autoFocus aria-label="搜索可选精选作品" placeholder="搜索已有作品…" value={search} disabled={saving} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="icon-btn" aria-label="清空精选搜索" onClick={()=>setSearch('')}><X size={14}/></button>}</div><span>{chosen.length===3?'已选满，可先移除或取消一件后替换':'点击作品加入精选'}</span></div>
   <div className="featured-candidates" aria-label="可选精选作品" aria-busy={loading}>{loading?<div className="featured-picker-empty"><Busy text="正在读取已有作品…"/></div>:result.items.length?result.items.map(work=>{const selected=chosen.some(w=>w.id===work.id);return <button className={`featured-candidate ${selected?'selected':''}`} key={work.id} aria-pressed={selected} disabled={saving||(!selected&&chosen.length===3)} onClick={()=>toggle(work)} title={work.title}><img src={thumbnail(work.cover_path)} alt=""/><div><strong>{work.title}</strong><small>{(work.artwork_date||work.created_at||'').slice(0,10)}</small></div><span className="featured-candidate-check">{selected?<Check size={15}/>:<Plus size={15}/>}</span></button>;}):<div className="featured-picker-empty">{query?'没有找到匹配的作品，试试其他关键词。':'还没有可选作品，先新增并保存一件作品吧。'}</div>}</div>
   <div className="featured-picker-pages"><span>{result.total} 件可选作品</span><div className="pagination"><button className="icon-btn" aria-label="上一页可选作品" disabled={page===1||loading||saving} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={15}/></button><span>{page} / {Math.max(1,Math.ceil(result.total/24))}</span><button className="icon-btn" aria-label="下一页可选作品" disabled={page*24>=result.total||loading||saving} onClick={()=>setPage(p=>p+1)}><ArrowRight size={15}/></button></div></div>
  </div><footer className="modal-foot">{error&&<p className="error" role="alert">{error}</p>}<button className="btn" disabled={saving} onClick={onClose}>取消</button><button className="btn primary" disabled={saving||loading} onClick={save}>{saving?<Busy text="正在保存…"/>:<><Check size={16}/>保存精选</>}</button></footer>
 </Modal>;
}
