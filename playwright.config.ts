import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  workers:1,
  retries:0,
  use:{baseURL:'http://127.0.0.1:4173',browserName:'chromium'},
  webServer:{
    command:'node node_modules/next/dist/bin/next start apps/web -p 4173 -H 127.0.0.1',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:false,
    env:{NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'web-runtime-private-sentinel',PRIVATE_SENTINEL:'web-runtime-private-sentinel'}
  }
});
