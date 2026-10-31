import { getMessages, getTranslations } from 'next-intl/server';
import { RecoveryForm } from '../../../src/accounts/recovery-form';
import type { AccountMessages } from '../../../src/accounts/messages';
export async function generateMetadata() {
  const t = await getTranslations('Accounts');
  return {
    title: t('recoveryRequestTitle'),
    description: t('recoveryRequestDescription'),
  };
}
export default async function RecoveryPage() {
  const t = await getTranslations('Accounts');
  return (
    <>
      <h1 className="text-[2.5rem] leading-[1.12] font-semibold tracking-[-.055em] sm:text-[2.85rem]">
        {t('recoveryRequestTitle')}
      </h1>
      <p className="mt-3 mb-9 text-sm leading-7 text-muted">
        {t('recoveryRequestDescription')}
      </p>
      <RecoveryForm
        confirm={false}
        messages={(await getMessages()).Accounts as AccountMessages}
      />
    </>
  );
}
