'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Tactile Creations MQTT Proxy — OK\n');
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
