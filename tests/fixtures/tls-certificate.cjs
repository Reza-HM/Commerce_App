const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, unlinkSync, rmdirSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

// Fresh test-only keys never enter source control, command output or CI artifacts.
function tlsCertificate() {
  const folder = mkdtempSync(join(tmpdir(), 'commerce-smtp-tls-'));
  const keyPath = join(folder, 'key.pem'),
    certPath = join(folder, 'cert.pem');
  const cleanup = () => {
    for (const path of [keyPath, certPath]) {
      try {
        unlinkSync(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    rmdirSync(folder);
  };
  try {
    const args = [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=smtp.gmail.com',
      '-addext',
      'subjectAltName=DNS:smtp.gmail.com',
    ];
    const options = { timeout: 15000, windowsHide: true, stdio: 'ignore' };
    let result = spawnSync('openssl', args, options);
    if (result.error?.code === 'ENOENT' && process.platform === 'win32')
      result = spawnSync(
        join(
          process.env.ProgramFiles || 'C:\\Program Files',
          'Git',
          'usr',
          'bin',
          'openssl.exe',
        ),
        args,
        options,
      );
    if (result.status !== 0)
      throw new Error('OpenSSL is required for owned SMTP TLS fixtures');
    return { key: readFileSync(keyPath), cert: readFileSync(certPath), cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
module.exports = { tlsCertificate };
