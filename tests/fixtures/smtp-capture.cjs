const { createServer } = require('node:net');
const { once } = require('node:events');

// Test-owned, bounded SMTP sink. Never exposes its contents through a public route.
async function createSmtpCapture({ stall = false, stallAt = '' } = {}) {
  const messages = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    if (stall) return;
    socket.write('220 capture.test ESMTP\r\n');
    let buffer = '',
      data = false,
      message = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length + message.length > 65536) return socket.destroy();
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === '.') {
            messages.push(message);
            data = false;
            message = '';
            if (stallAt !== 'data') socket.write('250 captured\r\n');
          } else message += line.replace(/^\.\./, '.') + '\r\n';
        } else if (/^EHLO /i.test(line))
          socket.write('250-capture.test\r\n250 8BITMIME\r\n');
        else if (/^(HELO |MAIL FROM:|RCPT TO:|RSET)/i.test(line))
          socket.write('250 OK\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 message\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('500 unsupported\r\n');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    messages,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
function capturedToken(message) {
  const decoded = message.replace(/=\r\n/g, '').replace(/=3D/g, '=');
  return /\/verify-email#token=([A-Za-z0-9_-]{43})/.exec(decoded)?.[1];
}
module.exports = { createSmtpCapture, capturedToken };
