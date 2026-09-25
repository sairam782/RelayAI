/* Minimal static server for the prototype. No dependencies.
   Usage: node scripts/serve.js [port]  →  http://localhost:4317 */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'dist');
const port = Number(process.argv[2] || 4317);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ics': 'text/calendar' };

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  // mirror Vercel's cleanUrls: /app serves app.html
  if (!path.extname(url) && fs.existsSync(path.join(root, url + '.html'))) url += '.html';
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Relay prototype on http://localhost:${port}`));
