import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { dotStuff, sanitizeHeader, buildMessage, createTransport } from '../src/smtp.js';

const CRLF = '\r\n';
const headerLines = (msg) => msg.split(`${CRLF}${CRLF}`)[0].split(CRLF);
const bodyOf = (msg) => msg.split(`${CRLF}${CRLF}`).slice(1).join(`${CRLF}${CRLF}`);

test('dot-stuffing escapes a line that would otherwise end the message', () => {
  // A bare "." on its own line terminates SMTP DATA. An alert whose text
  // happened to contain one would be truncated mid-sentence.
  const out = dotStuff('line one\n.\nline three');
  assert.equal(out, `line one${CRLF}..${CRLF}line three`);
  assert.equal(dotStuff('.hidden'), '..hidden');
  assert.equal(dotStuff('no dots here'), 'no dots here');
});

test('dot-stuffing normalises line endings to CRLF', () => {
  assert.equal(dotStuff('a\nb'), `a${CRLF}b`);
  assert.equal(dotStuff('a\r\nb'), `a${CRLF}b`);
});

test('header sanitisation strips CR and LF', () => {
  assert.equal(sanitizeHeader('Subject\r\nBcc: attacker@example.com'),
    'Subject Bcc: attacker@example.com');
  assert.equal(sanitizeHeader('  padded  '), 'padded');
});

test('a subject cannot inject an extra header', () => {
  // The classic attack: a newline in a subject creates a new header line.
  // After sanitisation the text survives but only as part of the subject.
  const msg = buildMessage({
    from: 'a@example.com', to: 'b@example.com',
    subject: 'Hello\r\nBcc: attacker@example.com\r\nX-Evil: 1',
    text: 'body', date: new Date(0),
  });
  const lines = headerLines(msg);
  assert.ok(!lines.some((l) => /^Bcc:/i.test(l)), 'no injected Bcc header');
  assert.ok(!lines.some((l) => /^X-Evil:/i.test(l)), 'no injected X-Evil header');
  const subject = lines.find((l) => l.startsWith('Subject:'));
  assert.match(subject, /^Subject: Hello Bcc: attacker@example\.com X-Evil: 1$/);
});

test('a recipient address cannot inject a header either', () => {
  const msg = buildMessage({
    from: 'a@example.com', to: 'b@example.com\r\nBcc: c@example.com',
    subject: 's', text: 'body', date: new Date(0),
  });
  assert.ok(!headerLines(msg).some((l) => /^Bcc:/i.test(l)));
});

test('built messages carry the headers a relay and a mail client need', () => {
  const msg = buildMessage({
    from: 'Lantern <l@example.com>', to: 'b@example.com',
    subject: 'Test', text: 'hello', date: new Date(0), messageId: 'fixed@lantern',
  });
  const lines = headerLines(msg);
  assert.ok(lines.includes('From: Lantern <l@example.com>'));
  assert.ok(lines.includes('To: b@example.com'));
  assert.ok(lines.includes('Subject: Test'));
  assert.ok(lines.includes('Message-ID: <fixed@lantern>'));
  assert.ok(lines.includes('Content-Type: text/plain; charset=utf-8'));
  // These stop an out-of-office bouncing back against an alert thread.
  assert.ok(lines.includes('Auto-Submitted: auto-generated'));
  assert.ok(lines.includes('X-Auto-Response-Suppress: All'));
  assert.equal(bodyOf(msg), 'hello');
});

test('unicode in the body survives intact', () => {
  const msg = buildMessage({
    from: 'a@example.com', to: 'b@example.com', subject: 's',
    text: 'Ada is fine — she rang at 21:00 ✓', date: new Date(0),
  });
  assert.match(bodyOf(msg), /Ada is fine — she rang at 21:00 ✓/);
});

// ---------------------------------------------------------------------------
// Conversation with a real socket
// ---------------------------------------------------------------------------

/** A tiny fake SMTP server that records the dialogue. */
function fakeSmtp({ offerStartTls = false, failAt = null } = {}) {
  const received = { commands: [], data: '' };
  const server = createServer((socket) => {
    let inData = false;
    socket.write(`220 fake ESMTP${CRLF}`);
    socket.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (inData) {
        received.data += text;
        if (received.data.endsWith(`${CRLF}.${CRLF}`)) {
          inData = false;
          socket.write(`250 queued${CRLF}`);
        }
        return;
      }
      for (const line of text.split(CRLF).filter(Boolean)) {
        received.commands.push(line);
        const verb = line.split(' ')[0].toUpperCase();
        if (failAt && verb === failAt) { socket.write(`550 refused${CRLF}`); continue; }
        if (verb === 'EHLO') {
          socket.write(`250-fake${CRLF}250-AUTH PLAIN LOGIN${CRLF}`);
          socket.write(offerStartTls ? `250 STARTTLS${CRLF}` : `250 SIZE 1000000${CRLF}`);
        } else if (verb === 'DATA') {
          inData = true; socket.write(`354 go ahead${CRLF}`);
        } else if (verb === 'QUIT') {
          socket.write(`221 bye${CRLF}`); socket.end();
        } else {
          socket.write(`250 ok${CRLF}`);
        }
      }
    });
    socket.on('error', () => {});
  });
  return { server, received };
}

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

test('a message is delivered through a full SMTP conversation', async () => {
  const { server, received } = fakeSmtp();
  const port = await listen(server);
  try {
    const transport = createTransport({
      host: '127.0.0.1', port, from: 'Lantern <l@example.com>',
      user: 'user', pass: 'pass', requireTls: false,
    });
    await transport.sendMail({ to: 'bea@example.com', subject: 'Ada is overdue', text: 'Please call her.' });

    const verbs = received.commands.map((c) => c.split(' ')[0].toUpperCase());
    assert.deepEqual(verbs.slice(0, 2), ['EHLO', 'AUTH']);
    assert.ok(received.commands.some((c) => c === 'MAIL FROM:<l@example.com>'),
      'envelope sender is extracted from the display-name form');
    assert.ok(received.commands.includes('RCPT TO:<bea@example.com>'));
    assert.ok(verbs.includes('DATA'));
    assert.match(received.data, /Subject: Ada is overdue/);
    assert.match(received.data, /Please call her\./);
    assert.ok(received.data.endsWith(`${CRLF}.${CRLF}`), 'message terminated correctly');
  } finally { server.close(); }
});

test('AUTH PLAIN credentials are encoded correctly', async () => {
  const { server, received } = fakeSmtp();
  const port = await listen(server);
  try {
    await createTransport({ host: '127.0.0.1', port, from: 'l@example.com',
      user: 'alice', pass: 'hunter2', requireTls: false })
      .sendMail({ to: 'b@example.com', subject: 's', text: 't' });
    const auth = received.commands.find((c) => c.startsWith('AUTH PLAIN'));
    const decoded = Buffer.from(auth.split(' ')[2], 'base64').toString('utf8');
    assert.equal(decoded, '\0alice\0hunter2');
  } finally { server.close(); }
});

test('a server that refuses a recipient surfaces the error rather than silently dropping it', async () => {
  const { server } = fakeSmtp({ failAt: 'RCPT' });
  const port = await listen(server);
  try {
    await assert.rejects(
      createTransport({ host: '127.0.0.1', port, from: 'l@example.com', requireTls: false })
        .sendMail({ to: 'nobody@example.com', subject: 's', text: 't' }),
      /550|refused/);
  } finally { server.close(); }
});

test('requireTls refuses to send in the clear when STARTTLS is unavailable', async () => {
  // Health information about a named person must not cross the network
  // unencrypted just because the relay did not offer to protect it.
  const { server } = fakeSmtp({ offerStartTls: false });
  const port = await listen(server);
  try {
    await assert.rejects(
      createTransport({ host: '127.0.0.1', port, from: 'l@example.com', requireTls: true })
        .sendMail({ to: 'b@example.com', subject: 's', text: 't' }),
      /STARTTLS/);
  } finally { server.close(); }
});

test('an unreachable host fails promptly rather than hanging', async () => {
  const transport = createTransport({
    host: '127.0.0.1', port: 1, from: 'l@example.com', requireTls: false, timeoutMs: 2000,
  });
  await assert.rejects(transport.sendMail({ to: 'b@example.com', subject: 's', text: 't' }));
});

test('configuration errors are caught at construction, not at send time', () => {
  assert.throws(() => createTransport({ from: 'l@example.com' }), /host is required/);
  assert.throws(() => createTransport({ host: 'x' }), /from address is required/);
});
