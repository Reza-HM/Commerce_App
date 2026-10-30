import { test, expect } from './account-fixture';
import type { Page, Route } from '@playwright/test';

const email = 'flow@example.test';
const password = '  Synthetic browser e\u0301 passphrase  ';
const endpoint = 'http://127.0.0.1:4174';
const current = endpoint + '/accounts/sessions/current';
const cors = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-credentials': 'true',
};
async function fill(page: Page, secret = password, address = email) {
  await page.getByLabel('Email address', { exact: true }).fill(address);
  await page.getByLabel('Password', { exact: true }).fill(secret);
}
async function register(page: Page) {
  await page.goto('/register');
  await fill(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(
    page.getByText('Registration request processed.', { exact: true }),
  ).toBeVisible();
}
async function signIn(page: Page) {
  await page.goto('/sign-in');
  await fill(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
}
async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

for (const width of [1280, 375]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`complete browser journey in ${colorScheme} at ${width}px preserves registration, original credential and privacy`, async ({
      page,
      api,
      context,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const posts: { path: string; headers: Record<string, string>; body: unknown }[] =
        [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().startsWith(endpoint))
          posts.push({
            path: new URL(request.url()).pathname,
            headers: request.headers(),
            body: request.postDataJSON(),
          });
      });
      await page.goto('/');
      await page
        .locator('section')
        .getByRole('link', { name: 'Create an account', exact: true })
        .click();
      await fill(page);
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await expect(
        page.getByText('Registration request processed.', { exact: true }),
      ).toBeVisible();
      expect(posts.map((post) => post.path)).toEqual(['/accounts/register']);
      await page.goto('/register');
      await fill(page, 'A different synthetic passphrase');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await expect(
        page.getByText('Registration request processed.', { exact: true }),
      ).toBeVisible();
      expect(posts[0]!.body).toEqual({ email, password });
      expect(posts[0]!.headers.cookie).toBeUndefined();
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
      await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
      await fill(page, 'A different synthetic passphrase');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(
        'The email or password is incorrect. Please try again.',
      );
      await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
      await fill(page);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByText('You’re signed in', { exact: true })).toBeVisible();
      expect(posts.at(-1)!.headers['x-commerce-request']).toBe('1');
      const storage = await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }));
      expect(JSON.stringify(storage)).not.toContain('Synthetic');
      expect(JSON.stringify(storage)).not.toContain(email);
      expect(page.url()).not.toContain(email);
      expect(page.url()).not.toContain('Synthetic');
      expect(api.logs.join('\n')).not.toContain(email);
      expect(api.logs.join('\n')).not.toContain('Synthetic');
      const cookies = await context.cookies();
      const session = cookies.find((cookie) => cookie.name === '__Host-commerce_session');
      // Never print a bearer value, including in a failed assertion's object diff.
      expect(!!session).toBe(true);
      expect(session?.secure).toBe(true);
      expect(session?.httpOnly).toBe(true);
      expect(session?.sameSite).toBe('Strict');
      await page.screenshot({
        path: `.local/design-review/account-${colorScheme}-${width}.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByText('You’re signed out.', { exact: true })).toBeVisible();
      const after = await page.evaluate(
        async (url) =>
          (
            await fetch(url, {
              headers: { 'X-Commerce-Request': '1' },
              credentials: 'include',
            })
          ).status,
        current,
      );
      expect(after).toBe(401);
      expect(errors).toEqual([]);
    });
  }
}

test('public routes remain accessible and localized at desktop and mobile without API responses', async ({
  page,
}) => {
  await page.route(endpoint + '/**', (route) => route.abort());
  const inspected = new Set<string>();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [path, title] of [
      ['/register', 'Create your account'],
      ['/sign-in', 'Welcome back'],
      ['/account', 'Your account'],
    ]) {
      const response = await page.goto(path!);
      await expect(page).toHaveTitle(title!);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.getByRole('main')).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect(response?.headers()['x-frame-options']).toBe('DENY');
      expect(response?.headers()['x-content-type-options']).toBe('nosniff');
      if (!inspected.has(path!)) {
        inspected.add(path!);
        const rsc = await page.request.get(path + '?_rsc=account', {
          headers: { RSC: '1' },
        });
        expect(rsc.headers()['content-type']).toContain('text/x-component');
        const sources = [await response!.text(), await rsc.text()];
        const scripts = await page
          .locator('script[src]')
          .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src));
        for (const script of scripts)
          sources.push(await (await page.request.get(script)).text());
        for (const source of sources)
          expect(source).not.toMatch(
            /web-build-private-sentinel|web-runtime-private-sentinel|@commerce\/database|node-postgres|pg-pool/,
          );
      }
    }
  }
  await expect(page.getByRole('main').getByRole('alert')).toContainText('couldn’t check');
});

test('registration supports keyboard, paste, visibility, policy feedback and restored password clearing', async ({
  page,
}) => {
  await page.goto('/register');
  const input = page.getByLabel('Password', { exact: true });
  await expect(input).toHaveAttribute('autocomplete', 'new-password');
  await page.getByLabel('Email address', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.fill('short');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('15–128');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.fill(password);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/sign-in');
  await page.goBack();
  await expect(page).toHaveURL('/register');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
});

test('pending submissions are locked and malformed or rate-limited results never become acceptance', async ({
  page,
}) => {
  let count = 0;
  let release!: () => void;
  await page.route(endpoint + '/accounts/register', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    count++;
    await new Promise<void>((done) => {
      release = done;
    });
    await json(route, 202, { status: 'accepted', message: 'untrusted success' });
  });
  await page.goto('/register');
  await fill(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Create account', exact: true }),
  ).toBeDisabled();
  await page.locator('form').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(count).toBe(1);
  release();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t complete',
  );
  await page.unroute(endpoint + '/accounts/register');
  await page.route(endpoint + '/accounts/register', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.continue()
      : json(route, 429, { error: 'http_429' }),
  );
  await fill(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Too many attempts',
  );
});

test('sign-in uses generic errors and permits passwords outside new-password policy', async ({
  page,
}) => {
  await register(page);
  await page.goto('/sign-in');
  await fill(page, 'short');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const expected = 'The email or password is incorrect. Please try again.';
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(expected);
  await fill(page, 'short', 'unknown@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(expected);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
});

test('missing or unusable cookie redirects without signed-in presentation; server failures allow retry', async ({
  page,
  context,
}) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/sign-in\?reason=session-required$/);
  await register(page);
  // Discard the cookie returned by a real sign-in before inspection.
  await page.route(current, async (route) => {
    await context.clearCookies();
    const headers = { ...route.request().headers() };
    delete headers.cookie;
    await route.continue({ headers });
  });
  await page.goto('/sign-in');
  await fill(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?reason=session-required$/);
  await page.unroute(current);
  for (const status of [403, 503]) {
    await page.route(current, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.continue()
        : json(route, status, { error: 'safe' }),
    );
    await page.goto('/account');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'couldn’t check',
    );
    await expect(page.getByText('You’re signed in', { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/account$/);
    await page.unroute(current);
  }
});

test('idle periods do not renew; foreground and history restoration recheck revoked sessions', async ({
  page,
  api,
}) => {
  await register(page);
  await signIn(page);
  const before = api.counts.current;
  await page.clock.install();
  await page.clock.runFor(31 * 60 * 1000);
  expect(api.counts.current).toBe(before);
  api.expire();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page).toHaveURL(/\/sign-in\?reason=session-required$/);
  await signIn(page);
  api.expire();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page).toHaveURL(/\/sign-in\?reason=session-required$/);
});

test('failed revocation keeps warning through foreground events and supports DELETE retry without inspection', async ({
  page,
  api,
}) => {
  await register(page);
  await signIn(page);
  api.failRevocation(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t confirm sign-out',
  );
  const before = api.counts.current;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(api.counts.current).toBe(before);
  await expect(page.getByText('You’re signed in', { exact: true })).toHaveCount(0);
  api.failRevocation(false);
  await page.getByRole('button', { name: 'Try signing out again', exact: true }).click();
  await expect(page.getByText('You’re signed out.', { exact: true })).toBeVisible();
});

test('lost sign-out response remains uncertain and delayed inspection cannot affect navigation', async ({
  page,
}) => {
  await register(page);
  await signIn(page);
  await page.route(current, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'couldn’t confirm sign-out',
  );
  await page.unroute(current);
  await page.getByRole('button', { name: 'Try signing out again', exact: true }).click();
  await expect(page.getByText('You’re signed out.', { exact: true })).toBeVisible();
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((done) => {
    started = done;
  });
  await page.route(current, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    started();
    await new Promise<void>((done) => {
      release = done;
    });
    await json(route, 200, {
      status: 'signed_in',
      accountId: '11111111-1111-4111-8111-111111111111',
    }).catch(() => {});
  });
  await page.goto('/account');
  await pending;
  await page.getByRole('link', { name: 'Commerce home', exact: true }).click();
  release();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('You’re signed in', { exact: true })).toHaveCount(0);
});

test('client deadline releases pending input without automatic resubmission', async ({
  page,
}) => {
  let count = 0;
  await page.route(endpoint + '/accounts/sessions', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    count++;
    await new Promise((resolve) => setTimeout(resolve, 17000));
    await json(route, 503, { error: 'safe' }).catch(() => {});
  });
  await page.goto('/sign-in');
  await fill(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('took too long', {
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect(count).toBe(1);
});

test('unenhanced forms never put credentials in a native GET URL', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.route('http://127.0.0.1:4173/register', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 405,
            body: 'JavaScript is required for account requests.',
          })
        : route.continue(),
    );
    await page.goto('http://127.0.0.1:4173/register');
    await fill(page);
    const posted = page.waitForRequest((request) => request.method() === 'POST');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const request = await posted;
    expect(request.url()).toBe('http://127.0.0.1:4173/register');
    expect(request.url()).not.toContain(email);
    expect(page.url()).not.toContain('Synthetic');
  } finally {
    await context.close();
  }
});
