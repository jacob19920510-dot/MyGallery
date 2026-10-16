const fs=require('node:fs');
const path=require('node:path');
module.exports=async ({appOutDir})=>{
  // Portable app data lives beside its executable. Never clean an existing build.
  if(fs.existsSync(appOutDir)&&fs.readdirSync(appOutDir).length){
    throw Error('输出目录已存在。为保护便携资料库，请使用新的输出目录，例如 --config.directories.output=release/build-'+Date.now());
  }
};
