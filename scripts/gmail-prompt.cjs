const readline = require('node:readline');
const { Writable } = require('node:stream');

function question(label, { secret = false, timeout = 600000 } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    return Promise.reject(new Error('Use an interactive terminal for Gmail setup'));
  return new Promise((resolve, reject) => {
    process.stdout.write(label);
    const output = secret
      ? new Writable({
          write(_chunk, _encoding, done) {
            done();
          },
        })
      : process.stdout;
    const prompt = readline.createInterface({
      input: process.stdin,
      output,
      terminal: true,
      historySize: 0,
    });
    let answered = false;
    const timer = setTimeout(() => prompt.close(), timeout);
    prompt.once('SIGINT', () => prompt.close());
    prompt.once('close', () => {
      clearTimeout(timer);
      if (secret) process.stdout.write('\n');
      if (!answered) reject(new Error('Gmail setup cancelled or timed out'));
    });
    prompt.question('', (answer) => {
      answered = true;
      prompt.close();
      resolve(answer);
    });
  });
}

async function gmailEnvironment() {
  const sender = await question('Gmail sender address: ');
  process.stdout.write(
    'Use a dedicated Google App Password, never your normal Google password.\n',
  );
  let password = await question('Google App Password (input hidden, never saved): ', {
    secret: true,
  });
  const environment = {
    ...process.env,
    MAIL_PROVIDER: 'gmail',
    GMAIL_SMTP_USER: sender.trim(),
    GMAIL_SMTP_APP_PASSWORD: password,
  };
  password = '';
  return environment;
}
module.exports = { question, gmailEnvironment };
