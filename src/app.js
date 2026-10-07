// app.js
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { authMiddleware, isPublicRoute } from './services/authService.js';
import { loadWebhookConfig } from './services/webhookService.js';
import routes from './routes/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import env, { logConfig } from './config/env.js';
import { SESSION_MAX_AGE } from './config/constants.js';
import { zaloAccounts } from './api/zalo/zalo.js';
import { initLoginFromCookies } from './utils/initLoginFromCookies.js';

// Dành cho ES Module: xác định __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, 'config', '.env') });
logConfig();

const app = express();

// Cấu hình EJS
app.set('view engine', 'ejs');
const viewsPath = path.join(__dirname, 'views');
console.log('Views path:', viewsPath);
app.set('views', viewsPath);

// Kiểm tra thư mục views
if (fs.existsSync(viewsPath)) {
  const files = fs.readdirSync(viewsPath);
  console.log('Views directory exists. Files:', files);
} else {
  console.error('Views directory does not exist at', viewsPath);
  // Nếu không tồn tại, thử tạo thư mục
  try {
    fs.mkdirSync(viewsPath, { recursive: true });
    console.log('Created views directory at', viewsPath);
  } catch (error) {
    console.error('Failed to create views directory:', error);
  }
}

// Tải cấu hình webhook từ file
loadWebhookConfig();
console.log("Đã tải cấu hình webhook");

// Thiết lập middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Dùng để parse dữ liệu form
app.use(cookieParser());

// Thiết lập middleware phục vụ file tĩnh
app.use(express.static(path.join(__dirname, 'public')));
console.log('Static files path:', path.join(__dirname, 'public'));

// Định nghĩa SESSION_SECRET từ biến môi trường hoặc mặc định

// Thiết lập session với cấu hình rõ ràng hơn
app.use(session({
  secret: env.SESSION_SECRET,
  resave: false, // Chỉ lưu session khi có thay đổi
  saveUninitialized: false, // Chỉ lưu session khi đã đăng nhập
  name: 'zalo-server.sid', // Tên cookie cụ thể
  cookie: {
    secure: false, // false để hoạt động với HTTP
    httpOnly: true, // Chỉ truy cập được qua HTTP, không qua JS
    maxAge: SESSION_MAX_AGE, // 24 giờ
    path: '/',
    sameSite: 'lax' // Thêm cấu hình sameSite để tránh vấn đề với cross-site
  },
  rolling: true // Session được làm mới mỗi request
}));

// Log để debug session
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Middleware xác thực cho tất cả các route trừ những route công khai
app.use((req, res, next) => {
  // Bỏ qua xác thực cho các API route và các route công khai
  if (isPublicRoute(req.path)) {
    console.log(`Skipping auth for public route: ${req.path}`);
    return next();
  }

  // Áp dụng middleware xác thực cho các route khác
  console.log(`Applying auth middleware for protected route: ${req.path}`);
  authMiddleware(req, res, next);
});

// Thiết lập route
app.use('/', routes);

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    accounts: {
      total: zaloAccounts.length,
      online: zaloAccounts.filter(a => a.listener && a.listener.isStarted).length
    }
  });
});


initLoginFromCookies().catch(err => {
    console.error('Lỗi khi khởi tạo đăng nhập từ cookie:', err);
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// 500 handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;