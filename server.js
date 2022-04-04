const express = require('express');
const serveIndex = require('serve-index');

const host = 'localhost';
const port = process.argv[2] || 8000;

const app = express();

app.use(function (req, res, next) {
  res.header('Cross-Origin-Embedder-Policy', 'require-corp');
  res.header('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

app.use(express.static('./public'));

app.use(serveIndex('./public', { icons: true }));

app.listen(port, host, () => {
  console.log(`...listening on ${host}:${port}`);
  console.log(`Press Ctrl + C to shutdown`);
});
