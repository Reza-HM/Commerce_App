import tseslint from 'typescript-eslint';
import architecture from './scripts/import-boundaries.cjs';

const typescriptFiles = ['**/*.ts', '**/*.tsx'];

export default [
  {ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/coverage/**', '**/test-results/**', '**/playwright-report/**', '.agents/**', 'openspec/**', '.local/**']},
  ...tseslint.configs.recommended.map(config => ({...config, files: typescriptFiles})),
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    plugins: {architecture},
    rules: {'architecture/import-boundaries': 'error'}
  }
];
