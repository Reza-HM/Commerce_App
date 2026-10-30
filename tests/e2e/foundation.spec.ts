import { test, expect } from '@playwright/test';

test('production English shell works independently at desktop and mobile sizes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Commerce | A considered beginning');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('One account.');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(response?.headers()['x-content-type-options']).toBe('nosniff');
    expect(response?.headers()['x-frame-options']).toBe('DENY');
    expect(response?.headers()['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
  }
  const urls = await page
    .locator('script[src]')
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
  const html = await page.request.get('/');
  const rsc = await page.request.get('/?_rsc=foundation', { headers: { RSC: '1' } });
  expect(rsc.headers()['content-type']).toContain('text/x-component');
  const sources = [await html.text(), await rsc.text()];
  for (const url of urls) {
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    sources.push(await response.text());
  }
  for (const source of sources)
    expect(source).not.toMatch(
      /web-build-private-sentinel|web-runtime-private-sentinel|@commerce\/database|node-postgres|pg-pool/,
    );
  expect(errors).toEqual([]);
});
