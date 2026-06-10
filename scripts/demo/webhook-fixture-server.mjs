import https from 'node:https';
import fs from 'node:fs';

const [portRaw, certPath, keyPath, receiptPath] = process.argv.slice(2);
const port = Number(portRaw ?? 18443);

const server = https.createServer(
  {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  },
  (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      fs.writeFileSync(
        receiptPath,
        JSON.stringify(
          {
            receivedAt: new Date().toISOString(),
            path: req.url,
            headers: {
              'webhook-id': req.headers['webhook-id'] ?? null,
              'webhook-signature': req.headers['webhook-signature'] ? '[redacted]' : null,
            },
            bodyLength: body.length,
          },
          null,
          2,
        ),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  },
);

server.listen(port, '127.0.0.1');
