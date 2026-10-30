import { getMessages, getTranslations } from 'next-intl/server';
import { VerificationForm } from '../../../src/accounts/verification-form';
import type { AccountMessages } from '../../../src/accounts/messages';

export async function generateMetadata() {
  const t = await getTranslations('Accounts');
  return { title: t('verificationTitle'), description: t('verificationDescription') };
}
export default async function VerifyEmailPage() {
  const t = await getTranslations('Accounts');
  return (
    <>
      <h1 className="text-[2.5rem] leading-[1.12] font-semibold tracking-[-.055em] sm:text-[2.85rem]">
        {t('verificationTitle')}
      </h1>
      <p className="mt-3 mb-9 text-sm leading-7 text-muted">
        {t('verificationDescription')}
      </p>
      <VerificationForm
        confirm
        messages={(await getMessages()).Accounts as AccountMessages}
      />
    </>
  );
}
