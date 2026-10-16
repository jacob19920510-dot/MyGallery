const fs=require('node:fs');
const path=require('node:path');
const {GalleryStore}=require('../desktop/store.cjs');
(async()=>{
 const root=path.join(__dirname,'..');const s=await new GalleryStore().init(root);
 if(s.stats().total||s.stats().trash){console.log('资料库已有作品，跳过示例导入。');s.db.close();return;}
 const sources=JSON.parse(fs.readFileSync(path.join(root,'public/samples/credits.json'),'utf8'));
 const titles=['麦田与丝柏','苹果与报春花','阿让特伊的花园','花瓶旁的女子','戴草帽的自画像','卢河之源','向天空生长','三王来朝'];
 for(const [index,item] of sources.entries()){
  const category=s.catalog().categories.filter(c=>['油画',[3,4,7].includes(index)?'人物习作':'自然风景',index%2?'远方来信':'光与日常'].includes(c.name)).map(c=>c.id);
  const w=await s.save({title:titles[index]||item.title,description:[{type:'heading',text:'示例馆藏 · '+item.title},{type:'paragraph',text:`作者：${item.artist_title}\n年代：${item.date_display}\n\n这是一件用于体验画廊功能的公有领域示例作品，可自由移入回收站。图片已保存在本机，断网后仍可浏览。`},{type:'link',text:'大都会艺术博物馆 · 原始馆藏记录（CC0）',url:item.source}],artwork_date:'2026-10-'+String(16-index).padStart(2,'0'),categories:category,tags:index%2?['光影','灵感收集']:['风景','日常'],status:'published'},[{name:item.file,data:fs.readFileSync(path.join(root,'public/samples',item.file)).toString('base64')}]);
  if([0,2,5].includes(index))s.batch({ids:[w.id],action:'favorite'});
  s.tx(()=>s.db.run('UPDATE works SET created_at=?,updated_at=? WHERE id=?',[`2026-10-${String(16-index).padStart(2,'0')}T12:00:00.000Z`,`2026-10-${String(16-index).padStart(2,'0')}T12:00:00.000Z`,w.id]));
 }
 console.log('已导入 '+sources.length+' 件可删除的公有领域示例作品。');s.db.close();
})();
