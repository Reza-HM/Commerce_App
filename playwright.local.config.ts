import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/local-e2e', testMatch:process.env.LOCAL_DEFAULT_TEST === '1' ? 'local.spec.ts' : 'default.spec.ts', workers:1, retries:0,
  use:{baseURL:'http://localhost:4183',browserName:'chromium'},
  webServer:{
    command:'node node_modules/next/dist/bin/next start apps/web -p 4183 -H 127.0.0.1',
    url:'http://127.0.0.1:4183', reuseExistingServer:false,
    env:{NEXT_TELEMETRY_DISABLED:'1'}
  }
});
