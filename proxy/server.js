'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

const BAMBU_LOGIN_URL = 'https://api.bambulab.com/v1/user-service/user/login';

// ── CORS helpers ──────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin':  allow ? (ALLOWED_ORIGINS.length === 0 ? '*' : origin) : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── HTTP request handler ──────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  console.log(`${method} ${url}`);

  const origin = req.headers.origin || '';
  const hdrs = corsHeaders(origin);

  // OPTIONS must be handled synchronously — before any async code — so a
  // failed downstream call on a different request can never block or crash
  // the preflight response.
  if (method === 'OPTIONS') {
    res.writeHead(204, hdrs);
    res.end();
    return;
  }

  // Wrap all async paths in a single top-level try/catch.  Without this,
  // an unhandled rejection from fetch() or readJson() would crash the Node
  // process (Node ≥15 default behaviour), making Railway return 502 for
  // every subsequent request — including the next OPTIONS preflight.
  try {
    // Health check
    if (url === '/' || url === '') {
      res.writeHead(200, { ...hdrs, 'Content-Type': 'text/plain' });
      res.end('Tactile Creations MQTT Proxy — OK\n');
      return;
    }

    // POST /login — proxies Bambu auth to avoid browser CORS restrictions
    if (url === '/login' && method === 'POST') {
      let body;
      try {
        body = await readJson(req);
      } catch {
        res.writeHead(400, { ...hdrs, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const { email, password, code } = body;
      if (!email) {
        res.writeHead(400, { ...hdrs, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'email required' }));
        return;
      }

      const bambuBody = { account: email, apiError: '' };
      if (password) bambuBody.password = password;
      if (code)     bambuBody.code = code;

      const upstream = await fetch(BAMBU_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bambuBody),
      });
      const data = await upstream.json();
      console.log(`Bambu login response (HTTP ${upstream.status}):`, JSON.stringify(data));
      res.writeHead(upstream.status, { ...hdrs, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
      return;
    }

    res.writeHead(404, { ...hdrs, 'Content-Type': 'text/plain' });
    res.end('Not found\n');
  } catch (err) {
    console.error(`Error handling ${method} ${url}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(500, { ...hdrs, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`Rejected origin: ${origin}`);
    ws.close(1008, 'Origin not allowed');
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, 'http://localhost');
  } catch {
    ws.close(1008, 'Bad request URL');
    return;
  }

  const userId       = parsedUrl.searchParams.get('userId');
  const accessToken  = parsedUrl.searchParams.get('accessToken');
  const deviceSerial = parsedUrl.searchParams.get('deviceSerial');

  if (!userId || !accessToken || !deviceSerial) {
    ws.close(1008, 'Missing credentials: userId, accessToken, deviceSerial required');
    return;
  }

  let mqttClient = null;
  let wsOpen = true;
  let reconnectTimer = null;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connectMqtt() {
    if (!wsOpen) return;

    mqttClient = mqtt.connect('mqtts://us.mqtt.bambulab.com:8883', {
      username: `u_${userId}`,
      password: accessToken,
      clientId: `tactile_${deviceSerial}_${Date.now()}`,
      // Bambu cloud broker uses a self-signed / private CA cert
      rejectUnauthorized: false,
      reconnectPeriod: 0, // manual reconnect so we respect wsOpen state
      connectTimeout: 15_000,
    });

    mqttClient.on('connect', () => {
      console.log(`[${deviceSerial}] MQTT connected`);
      mqttClient.subscribe(`device/${deviceSerial}/report`, (err) => {
        if (err) console.error(`[${deviceSerial}] subscribe error:`, err.message);
      });
    });

    mqttClient.on('message', (_topic, payload) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload.toString());
      }
    });

    mqttClient.on('error', (err) => {
      console.error(`[${deviceSerial}] MQTT error:`, err.message);
    });

    mqttClient.on('close', () => {
      console.log(`[${deviceSerial}] MQTT closed`);
      if (wsOpen) {
        reconnectTimer = setTimeout(() => {
          console.log(`[${deviceSerial}] Reconnecting MQTT…`);
          connectMqtt();
        }, 5_000);
      }
    });
  }

  connectMqtt();

  // Forward commands from browser → printer
  ws.on('message', (data) => {
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(`device/${deviceSerial}/request`, data.toString());
    }
  });

  ws.on('close', () => {
    console.log(`[${deviceSerial}] WebSocket closed — cleaning up`);
    wsOpen = false;
    clearReconnectTimer();
    if (mqttClient) {
      mqttClient.end(true);
      mqttClient = null;
    }
  });

  ws.on('error', (err) => {
    console.error(`[${deviceSerial}] WebSocket error:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`MQTT proxy listening on port ${PORT}`);
  if (ALLOWED_ORIGINS.length > 0) {
    console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  } else {
    console.warn('ALLOWED_ORIGINS not set — accepting all origins');
  }
});
