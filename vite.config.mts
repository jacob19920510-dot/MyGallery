import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'./',plugins:[react()],server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/release/**','**/images/**','**/thumbnails/**','**/staging/**','**/backups/**','**/gallery.db*']},fs:{deny:['.env','.env.*','**/gallery.db*','**/images/**','**/thumbnails/**','**/backups/**','**/staging/**','**/config.json','**/release/**']},proxy:{'/api':'http://127.0.0.1:4174','/media':'http://127.0.0.1:4174'}}});
