const { createServer } = require('node:net');
const { once } = require('node:events');
const { createServer: createTlsServer } = require('node:tls');

// Test-owned, bounded SMTP sink. Never exposes its contents through a public route.
async function createSmtpCapture({
  stall = false,
  stallAt = '',
  tls,
  auth,
  rejectRecipient = false,
} = {}) {
  const messages = [];
  const sockets = new Set();
  let authenticated = 0;
  const connected = (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    if (stall) return;
    socket.write('220 capture.test ESMTP\r\n');
    let buffer = '',
      data = false,
      message = '',
      authorized = !auth;
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
          socket.write(
            '250-capture.test\r\n' +
              (auth ? '250-AUTH PLAIN\r\n' : '') +
              '250 8BITMIME\r\n',
          );
        else if (line.startsWith('AUTH PLAIN ')) {
          if (stallAt === 'auth') continue;
          const [, user, pass] = Buffer.from(line.slice(11), 'base64')
            .toString('utf8')
            .split('\0');
          authorized = !!socket.encrypted && user === auth?.user && pass === auth?.pass;
          if (authorized) authenticated++;
          socket.write(authorized ? '235 authenticated\r\n' : '535 rejected\r\n');
        } else if (line.startsWith('RCPT TO:') && rejectRecipient)
          socket.write('550 rejected\r\n');
        else if (/^(MAIL FROM:|RCPT TO:|DATA)/i.test(line) && !authorized)
          socket.write('530 authentication required\r\n');
        else if (/^(HELO |MAIL FROM:|RCPT TO:|RSET)/i.test(line))
          socket.write('250 OK\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 message\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('500 unsupported\r\n');
      }
    });
  };
  const server = tls ? createTlsServer(tls, connected) : createServer(connected);
  server.on('tlsClientError', () => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    messages,
    get authenticated() {
      return authenticated;
    },
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
