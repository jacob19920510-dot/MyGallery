import {Languages} from 'lucide-react';
import {languages,setLanguage,t,useLanguage,type Language} from './i18n';

export default function LanguageSettings(){
 const language=useLanguage();
 return <section className="management-panel language-settings full">
  <div className="panel-title"><h3><Languages size={19}/>{t('系统语言')}</h3></div>
  <p id="language-description">{t('选择界面使用的语言，切换后立即生效，并自动记住选择。')}</p>
  <label className="language-field" htmlFor="gallery-language">{t('显示语言')}
   <select id="gallery-language" aria-describedby="language-description" value={language} onChange={event=>setLanguage(event.target.value as Language)}>
    {languages.map(item=><option key={item.value} value={item.value} lang={item.value}>{item.name}</option>)}
   </select>
  </label>
  <p className="muted small">{t('作品标题、创作手记、分类和标签等个人内容保留原文。')}</p>
 </section>;
}
