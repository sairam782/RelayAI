/* Dependency-free local preview with the same static headers as deployment. */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'dist');
const port = Number(process.argv[2] || 4317);
const headers = require('../vercel.json').headers.find(rule => rule.source === '/(.*)')?.headers || [];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ics': 'text/calendar' };
http.createServer(async (req, res) => {
  for (const {key, value} of headers) res.setHeader(key, value);
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  try {
    let url;
    try { url = decodeURIComponent(req.url.split('?')[0]); }
    catch { res.writeHead(400); return res.end('Invalid URL'); }
    if (url.includes('\0')) { res.writeHead(400); return res.end('Invalid URL'); }
    if (url === '/') url = '/index.html';
    let file = path.resolve(root, '.' + url);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404); return res.end('Not found'); }
    if (!path.extname(file)) file += '.html';
    const stat = await fs.stat(file);
    if (!stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const content = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': content.length });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    res.writeHead(['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 500);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Relay prototype on http://127.0.0.1:${port}`));
