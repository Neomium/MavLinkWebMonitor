const express = require('express');
const net = require('net');
const WebSocket = require('ws');
const mavlink = require('mavlinkjs/mavlink_all_v2');

const HTTP_PORT = 3001;
const MAVLINK_TCP_HOST = '192.168.1.1';
const MAVLINK_TCP_PORT = 8888;
const RECONNECT_DELAY_MS = 100;

const app = express();
app.use(express.static('public'));

const server = app.listen(HTTP_PORT, () => {
  console.log(`🌐 HTTP server running at http://localhost:${HTTP_PORT}`);
});

const wss = new WebSocket.Server({ server });

function broadcast(msg) {
  const json = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

// MAVLink parser
const mav = new mavlink.MAVLink20Processor(null, 0, 0);

let tcpClient;
let reconnectTimer = null;

function connectTCP() {
  if (tcpClient) {
    tcpClient.destroy();
    tcpClient = null;
  }

  tcpClient = new net.Socket();

  console.log(`🔌 Attempting to connect to MAVLink server at ${MAVLINK_TCP_HOST}:${MAVLINK_TCP_PORT}...`);
  tcpClient.connect(MAVLINK_TCP_PORT, MAVLINK_TCP_HOST);

  tcpClient.on('connect', () => {
    console.log(`✅ Connected to MAVLink TCP server at ${MAVLINK_TCP_HOST}:${MAVLINK_TCP_PORT}`);
  });

  tcpClient.on('data', (data) => {
    try {
      const messages = mav.parseBuffer(data);
      //console.log(messages)
      for (const m of messages) {
        if(m.id > -1){
          broadcast(m);
          }
      }
    } catch (err) {
      console.error('⚠️ MAVLink parse error:', err.message);
    }
  });

  tcpClient.on('error', (err) => {
    console.error('❌ TCP connection error:', err.message);
  });

  tcpClient.on('close', () => {
    console.warn('🔌 TCP connection closed');
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`⏳ Reconnecting in ${RECONNECT_DELAY_MS / 1000} seconds...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectTCP();
  }, RECONNECT_DELAY_MS);
}

connectTCP();
