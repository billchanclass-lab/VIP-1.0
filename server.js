const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const HTML = path.join(__dirname, 'VIP經營雷達_玉山證券版.html');

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const match = url.pathname.match(/^\/api\/quote\/([0-9A-Z.]{4,12})$/i);
  if (req.method === 'GET' && match) {
    const symbol = match[1].toUpperCase();
    if (!/^\d{4,6}\.(TW|TWO)$/.test(symbol)) {
      return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ error: '僅支援台股代碼，例如 2330.TW' }));
    }
    try {
      const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
      const upstream = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0 VIPRadarPrototype/1.0' },
        signal: AbortSignal.timeout(12000)
      });
      if (!upstream.ok) throw new Error(`Yahoo 回應 ${upstream.status}`);
      const payload = await upstream.json();
      const result = payload?.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta) throw new Error(payload?.chart?.error?.description || 'Yahoo 沒有回傳此代碼的報價');
      const price = Number(meta.regularMarketPrice);
      const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
      const timestamp = Number(meta.regularMarketTime || result.timestamp?.at(-1));
      if (!Number.isFinite(price) || !Number.isFinite(timestamp)) throw new Error('Yahoo 回傳的行情欄位不完整');
      const change = Number.isFinite(previousClose) ? price - previousClose : 0;
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify({
        symbol, price, previousClose: Number.isFinite(previousClose) ? previousClose : null,
        change, changePercent: previousClose ? change / previousClose * 100 : 0,
        timestamp, exchange: meta.fullExchangeName || meta.exchangeName || 'Taiwan', source: 'Yahoo Finance Chart'
      }));
    } catch (error) {
      send(res, 502, 'application/json; charset=utf-8', JSON.stringify({ error: error.message || '行情服務連線失敗' }));
    }
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/VIP經營雷達_玉山證券版.html')) {
    try {
      const body = await fs.readFile(HTML);
      return send(res, 200, 'text/html; charset=utf-8', body);
    } catch (error) {
      return send(res, 500, 'text/plain; charset=utf-8', `讀取儀表板失敗：${error.message}`);
    }
  }
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`VIP 雷達已啟動：http://${HOST}:${PORT}`);
  console.log('行情更新經 Yahoo Finance Chart 端點；最新報價的即時性依 Yahoo 資料供應規則。');
});
