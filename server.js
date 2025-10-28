const express = require('express');
const net = require('net');
const WebSocket = require('ws');
const mavlink = require('mavlinkjs/mavlink_all_v2');

const HTTP_PORT = 3001;
let MAVLINK_TCP_HOST = '192.168.1.1';
//let MAVLINK_TCP_HOST = '127.0.0.1';
let MAVLINK_TCP_PORT = 8888;
const RECONNECT_DELAY_MS = 100;
const HEARTBEAT_INTERVAL_MS = 1000; // send heartbeat every second
const MAVLINK_SYS_ID = 1;
const MAVLINK_COMP_ID = 249;

const app = express();
app.use(express.static('public'));

const args = process.argv.slice(2);

if (args.length > 0) {
  const [host, port] = args[0].split(':');
  if (host) MAVLINK_TCP_HOST = host;
  if (port) MAVLINK_TCP_PORT = parseInt(port, 10);
}

//console.log(`MAVLINK_TCP_HOST: ${MAVLINK_TCP_HOST}`);
//console.log(`MAVLINK_TCP_PORT: ${MAVLINK_TCP_PORT}`);

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
const mav = new mavlink.MAVLink20Processor(null, MAVLINK_SYS_ID, MAVLINK_COMP_ID);

let tcpClient;
let reconnectTimer = null;
let heartbeatTimer = null;

function connectTCP() {
  if (tcpClient) {
    tcpClient.destroy();
    tcpClient = null;
  }

  tcpClient = new net.Socket();

  console.log(`🔌 Attempting to connect to MAVLink server at ${MAVLINK_TCP_HOST}:${MAVLINK_TCP_PORT}...`);
  tcpClient.connect(MAVLINK_TCP_PORT, MAVLINK_TCP_HOST);

  tcpClient.on('connect', () => {
    console.log(`✅ Connected to MAVLink TCP server at ${MAVLINK_TCP_HOST}:${MAVLINK_TCP_PORT} with SYS:COMP ${MAVLINK_SYS_ID}:${MAVLINK_COMP_ID}`);

    // Start sending heartbeat
    startHeartbeat();
  });

  tcpClient.on('data', (data) => {
    let messages;
    try {
      messages = mav.parseBuffer(data);
      for (const m of messages) {
        
        if (m.id > -1) {
          //console.log(m)
          broadcast(m);
        }
      }
    } catch (err) {
      console.error('⚠️ MAVLink parse error:', err.message);
      console.log(data)
    }
  });

  tcpClient.on('error', (err) => {
    console.error('❌ TCP connection error:', err.message);
  });

  tcpClient.on('close', () => {
    console.warn('🔌 TCP connection closed');
    stopHeartbeat();
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

function startHeartbeat() {
  if (heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    try {

      // type, autopilot, base_mode, custom_mode, system_status, mavlink_version
      const hb = new mavlink.mavlink20.messages.heartbeat(6, 8, 0,0,0,3);

      tcpClient.write(Buffer.from(hb.pack(mav)));
      // console.log("❤️ Sent heartbeat");
    } catch (err) {
      console.error("⚠️ Failed to send heartbeat:", err.message);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

connectTCP();
