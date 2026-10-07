// server.js
import http from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import env from './config/env.js';

const PORT = env.PORT;

// Tạo HTTP server
const server = http.createServer(app);

// Tạo WebSocket server
const wss = new WebSocketServer({ server });

// Lưu trữ kết nối WebSocket
export const webSocketClients = new Set();

// Xử lý kết nối WebSocket
wss.on('connection', (ws) => {
  console.log('Có một kết nối WebSocket mới');
  webSocketClients.add(ws);

  ws.on('close', () => {
    console.log('Kết nối WebSocket đã đóng');
    webSocketClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    webSocketClients.delete(ws);
  });
});

// Hàm gửi thông báo đến tất cả client WebSocket
export function broadcastMessage(message) {
  const deadClients = [];
  webSocketClients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(message);
    } else {
      deadClients.push(client);
    }
  });
  deadClients.forEach(c => webSocketClients.delete(c));
}

// Graceful shutdown: SIGTERM/SIGINT -> close WS clients + server
function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down...`);

  // Đóng tất cả WebSocket clients
  webSocketClients.forEach((client) => {
    try { client.terminate(); } catch {}
  });
  webSocketClients.clear();
  wss.close();

  // Đóng HTTP server rồi exit
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit sau 10s nếu server close bị treo
  setTimeout(() => {
    console.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Sử dụng HTTP server thay vì app để hỗ trợ WebSocket
server.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
