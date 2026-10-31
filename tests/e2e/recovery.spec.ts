import { test, expect, confirmEmail } from './account-fixture';
import { accountMail } from '../../apps/api/src/accounts/mail-content';
import type { Page } from '@playwright/test';

const email = 'recovery@example.test';
const oldPassword = 'Synthetic previous browser passphrase';
const newPassword = ' Synthetic recovered browser passphrase é ';

test('recovery pages remain usable with API unavailable, system changes and 200% zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/accounts/**', (route) => route.abort());
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const route of [
      '/forgot-password',
      '/reset-password#token=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE',
    ]) {
      await page.goto(route);
      await page.evaluate(() => {
        document.body.style.zoom = '2';
      });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await expect(page.getByRole('combobox', { name: 'Appearance' })).toHaveValue(
        'system',
      );
      await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark');
      await page.reload();
      await expect(page.getByRole('combobox', { name: 'Appearance' })).toHaveValue(
        'dark',
      );
      await page.getByRole('combobox', { name: 'Appearance' }).selectOption('system');
    }
  }
});
async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(
    page.getByText('Registration request processed.', { exact: true }),
  ).toBeVisible();
}
async function request(page: Page) {
  await page.goto('/forgot-password');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Request reset link', exact: true }).click();
  await expect(
    page.getByText('Password recovery request processed.', { exact: true }),
  ).toBeVisible();
}
async function enterNewPassword(page: Page, value = newPassword) {
  await page.getByLabel('New password', { exact: true }).fill(value);
  await page.getByLabel('Confirm new password', { exact: true }).fill(value);
}
async function signIn(page: Page, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

for (const colorScheme of ['light', 'dark'] as const)
  for (const width of [1280, 375]) {
    test(`verified recovery revokes old access in ${colorScheme} at ${width}px`, async ({
      page,
      api,
      context,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await register(page);
      await confirmEmail(page, api, oldPassword);
      await signIn(page, oldPassword);
      await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
      await request(page);
      await page.screenshot({
        path: `.local/design-review/forgot-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      const link = await api.recoveryLink(),
        token = new URL(link).hash.slice('#token='.length);
      let confirmations = 0,
        signIns = 0;
      page.on('request', (request) => {
        expect(request.url().split('#')[0]).not.toContain(token);
        if (
          request.method() === 'POST' &&
          request.url().endsWith('/password-recovery/confirm')
        )
          confirmations++;
        if (request.method() === 'POST' && request.url().endsWith('/accounts/sessions'))
          signIns++;
      });
      const response = await page.goto(link);
      await expect(page).toHaveURL(/\/reset-password$/);
      expect(response?.headers()['referrer-policy']).toBe('no-referrer');
      expect(confirmations).toBe(0);
      await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute(
        'autocomplete',
        'new-password',
      );
      await expect(page.getByLabel('New password', { exact: true })).toHaveCSS(
        'cursor',
        'text',
      );
      await expect(
        page.getByRole('button', { name: 'Reset password', exact: true }),
      ).toHaveCSS('cursor', 'pointer');
      await enterNewPassword(page);
      await page
        .getByLabel('Confirm new password', { exact: true })
        .fill('Mismatch phrase');
      await page.getByRole('button', { name: 'Reset password', exact: true }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'do not match',
      );
      expect(confirmations).toBe(0);
      await expect(
        page.getByLabel('Confirm new password', { exact: true }),
      ).toBeFocused();
      await enterNewPassword(page, ' Synthetic recovered browser passphrase e\u0301 ');
      await page.getByRole('button', { name: 'Show password', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute(
        'type',
        'text',
      );
      await page.screenshot({
        path: `.local/design-review/reset-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Reset password', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByText('Your password is updated', { exact: true }),
      ).toBeVisible();
      expect(confirmations).toBe(1);
      expect(signIns).toBe(0);
      expect(await api.notificationReceived()).toBe(true);
      const storage = await page.evaluate(() =>
        JSON.stringify([{ ...localStorage }, { ...sessionStorage }]),
      );
      for (const secret of [token, oldPassword, newPassword]) {
        expect(storage).not.toContain(secret);
        expect(api.logs.join(' ')).not.toContain(secret);
        expect(await page.content()).not.toContain(secret);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await page.goto('/account');
      await expect(page).toHaveURL(/\/sign-in\?reason=session-required$/);
      await signIn(page, oldPassword);
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'email or password is incorrect',
      );
      await signIn(page, newPassword);
      await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
      const mail = await context.newPage();
      await mail.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await mail.setViewportSize({ width, height: 900 });
      await mail.setContent(
        accountMail('recovery', 'http://127.0.0.1:3000', 'synthetic').html,
      );
      await mail.screenshot({
        path: `.local/design-review/recovery-mail-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      await mail.setContent(accountMail('notification', 'http://127.0.0.1:3000').html);
      await mail.screenshot({
        path: `.local/design-review/reset-notification-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      await mail.close();
    });
  }

test('unverified recovery requires fresh verification with the new password', async ({
  page,
  api,
}) => {
  await register(page);
  const oldLink = await api.verificationLink();
  await request(page);
  await page.goto(await api.recoveryLink());
  await enterNewPassword(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Your password is updated', { exact: true })).toBeVisible();
  await signIn(page, newPassword);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Confirm your email before signing in',
  );
  await page.goto(oldLink);
  await page.getByLabel('Password', { exact: true }).fill(oldPassword);
  await page.getByRole('button', { name: 'Confirm email address', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t confirm',
  );
  await page.goto('/verify-email/request');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page
    .getByRole('button', { name: 'Request verification email', exact: true })
    .click();
  await expect(
    page.getByText('Verification request processed.', { exact: true }),
  ).toBeVisible();
  await confirmEmail(page, api, newPassword);
  await signIn(page, newPassword);
  await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
});

test('reset links are transient and invalid, expired or used links offer recovery', async ({
  page,
  api,
}) => {
  await register(page);
  await request(page);
  const link = await api.recoveryLink();
  await page.goto(link);
  await enterNewPassword(page);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByText(/Open a valid reset link/)).toBeVisible();
  await page.goto(link);
  await page.reload();
  await expect(page.getByText(/Open a valid reset link/)).toBeVisible();
  await page.goto('/reset-password#token=malformed');
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(
    page.getByRole('button', { name: 'Reset password', exact: true }),
  ).toHaveCount(0);
  await page.goto(link);
  await enterNewPassword(page, 'short');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('15–128');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Confirm new password', { exact: true })).toHaveValue('');
  await enterNewPassword(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Your password is updated', { exact: true })).toBeVisible();
  await page.goto(link);
  await enterNewPassword(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'invalid, expired, or already used',
  );
  await request(page);
  const fresh = await api.recoveryLink();
  api.expireRecovery();
  await page.goto(fresh);
  await enterNewPassword(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'invalid, expired, or already used',
  );
});

test('unavailable recovery has honest feedback, generic requests and no automatic retry', async ({
  page,
  api,
}) => {
  await register(page);
  await request(page);
  const link = await api.recoveryLink();
  let attempts = 0;
  await page.route('**/accounts/password-recovery/confirm', (route) => {
    attempts++;
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.goto(link);
  await enterNewPassword(page);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'may already have changed',
  );
  expect(attempts).toBe(1);
  await page.goto('/forgot-password');
  await page.getByLabel('Email address', { exact: true }).fill('unknown@example.test');
  await page.getByRole('button', { name: 'Request reset link', exact: true }).click();
  await expect(
    page.getByText('Password recovery request processed.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/If this address has an eligible account/)).toBeVisible();
});

test('blocked storage and fragment cleanup preserve safe recovery behavior', async ({
  page,
  api,
}) => {
  await register(page);
  await request(page);
  const link = await api.recoveryLink();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    const replace = window.history.replaceState.bind(window.history);
    window.history.replaceState = (state, unused, url) => {
      if (url === '/reset-password') throw new Error('blocked');
      return replace(state, unused, url);
    };
  });
  await page.goto(link);
  await expect(page.getByText(/Open a valid reset link/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reset password', exact: true }),
  ).toHaveCount(0);
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'Find your way back' })).toBeVisible();
});
