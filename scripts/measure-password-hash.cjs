// Small local observation only; no credentials, hash bytes, or capacity claims.
const {hashPassword} = require('../apps/api/dist/accounts/password-hasher.js');

async function main() {
  const baseline = process.memoryUsage().rss;
  let peak = baseline;
  const sample = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  const started = performance.now();
  try {
    await Promise.all([hashPassword('Synthetic measurement passphrase'), hashPassword('Synthetic second measurement passphrase')]);
    peak = Math.max(peak, process.memoryUsage().rss);
    console.log(JSON.stringify({operations: 2, elapsedMs: Math.round(performance.now() - started), baselineRssMiB: Math.round(baseline / 1048576), peakRssMiB: Math.round(peak / 1048576)}));
  } finally { clearInterval(sample); }
}
main().catch(() => { console.error('Password hash observation failed'); process.exitCode = 1; });
