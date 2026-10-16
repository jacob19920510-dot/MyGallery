const fs=require('node:fs');const path=require('node:path');
(async()=>{const root=path.join(__dirname,'../public/samples');fs.mkdirSync(root,{recursive:true});const items=[];
for(const id of [436535,435882,436965,436121,436532,436023,437980,436984,438011,437430,436534]){try{
const {title,artistDisplayName:artist_title,objectDate:date_display,isPublicDomain,primaryImageSmall,objectURL}=await(await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)).json();if(!isPublicDomain||!primaryImageSmall)continue;
const file=id+'.jpg',target=path.join(root,file);if(!fs.existsSync(target)){const r=await fetch(primaryImageSmall);if(!r.ok)throw Error(r.status);fs.writeFileSync(target,Buffer.from(await r.arrayBuffer()));}
items.push({id,title,artist_title,date_display,file,source:objectURL});console.log(id,'ready');if(items.length===8)break;
}catch(e){console.error(id,e.message);}}
fs.writeFileSync(path.join(root,'credits.json'),JSON.stringify(items,null,2));})();
