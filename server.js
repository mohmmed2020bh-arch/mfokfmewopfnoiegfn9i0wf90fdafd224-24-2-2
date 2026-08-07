const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// ===== In-memory store =====
let messages = [];          // all messages
let clients  = [];          // SSE clients

// ===== MIME types =====
const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css',
  '.js':'application/javascript',     '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',               '.png':'image/png',
  '.gif':'image/gif',                 '.ico':'image/x-icon',
  '.webm':'audio/webm',               '.mp3':'audio/mpeg',
  '.mp4':'video/mp4',                 '.svg':'image/svg+xml',
};

// ===== Helper: collect body =====
function body(req) {
  return new Promise((res, rej) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 20_000_000) rej(new Error('too large')); });
    req.on('end', () => res(d));
    req.on('error', rej);
  });
}

// ===== Broadcast to all SSE clients =====
function broadcast(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  clients = clients.filter(c => {
    try { c.write(data); return true; }
    catch(e) { return false; }
  });
}

// ===== CORS headers =====
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ===== Server =====
const server = http.createServer(async (req, res) => {
  cors(res);
  const url = req.url.split('?')[0];

  // OPTIONS preflight
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /events  (SSE) ──────────────────────────────────────
  if (req.method === 'GET' && url === '/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',        // disable nginx buffering
    });
    // Send all existing messages on connect
    res.write(`data: ${JSON.stringify({ type:'history', msgs: messages })}\n\n`);
    clients.push(res);
    req.on('close', () => { clients = clients.filter(c => c !== res); });
    return;
  }

  // ── POST /send ───────────────────────────────────────────────
  if (req.method === 'POST' && url === '/send') {
    try {
      const raw = await body(req);
      const msg = JSON.parse(raw);
      msg.id   = Date.now() + Math.random();
      msg.time = new Date().toLocaleTimeString('ar-SA', { hour:'2-digit', minute:'2-digit' });
      messages.push(msg);
      if (messages.length > 300) messages = messages.slice(-300);
      broadcast({ type:'msg', msg });
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ ok:true }));
    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ ok:false, err: e.message }));
    }
    return;
  }

  // ── GET /history ─────────────────────────────────────────────
  if (req.method === 'GET' && url === '/history') {
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end(JSON.stringify(messages));
    return;
  }

  // ── Static files ─────────────────────────────────────────────
  let filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
        res.end(d2);
      });
      return;
    }
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`✅ Chat server on port ${PORT}`));
