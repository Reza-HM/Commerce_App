import { runInNewContext } from 'node:vm';
import { themeBootstrap } from '../../apps/web/src/components/theme-script';

test.each([
  ['dark', false, 'dark'],
  ['light', true, 'light'],
  ['system', true, 'dark'],
  [null, false, 'light'],
  ['invalid', true, 'dark'],
])('first-paint bootstrap resolves preference %s', (value, dark, expected) => {
  const root = { dataset: {} as Record<string, string> };
  const getItem = jest.fn(() => value);
  runInNewContext(themeBootstrap, {
    document: { documentElement: root },
    localStorage: { getItem },
    matchMedia: () => ({ matches: dark }),
  });
  expect(root.dataset.theme).toBe(expected);
  expect(getItem).toHaveBeenCalledWith('commerce-theme');
});

test('first-paint bootstrap catches unavailable storage', () => {
  const root = { dataset: {} as Record<string, string> };
  runInNewContext(themeBootstrap, {
    document: { documentElement: root },
    get localStorage() {
      throw new Error('blocked');
    },
    matchMedia: () => ({ matches: true }),
  });
  expect(root.dataset.theme).toBe('dark');
});
