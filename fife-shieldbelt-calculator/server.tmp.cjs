const http = require('http');
const fs = require('fs');
const path = require('path');
const port = 8080;
const mime = {'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'};
http.createServer((req, res) => {
  try {
    let fp = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.join(__dirname, 'index.html');
    const ext = path.extname(fp).toLowerCase();
    const data = fs.readFileSync(fp);
    res.writeHead(200, {'Content-Type': mime[ext]||'text/plain','Cache-Control':'no-cache'});
    res.end(data);
  } catch(e) { res.writeHead(500); res.end('error'); }
}).listen(port, '127.0.0.1', () => console.log('Server ready on port ' + port));
process.on('uncaughtException', e => console.error('server error:', e.message));
