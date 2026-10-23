import {getTranslations} from 'next-intl/server';

export default async function Home() {
  const t=await getTranslations('Foundation');
  return <main><p className="eyebrow">{t('eyebrow')}</p><span className="status">{t('status')}</span><h1>{t('heading')}</h1><p className="description">{t('description')}</p></main>;
}
