// config/env.js - Centralized environment configuration
import path from 'path';
import dotenv from 'dotenv';

// Load .env từ root, fallback src/config/.env
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), 'src', 'config', '.env') });

const DATA_PATH = process.env.DATA_PATH || './data';

const env = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Bảo mật
  API_KEY: process.env.API_KEY || '',
  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'admin',

  // Webhook
  ERROR_WEBHOOK_URL: process.env.ERROR_WEBHOOK_URL || '',

  // Data path
  DATA_PATH,

  // Proxy
  MAX_ACCOUNTS_PER_PROXY: parseInt(process.env.MAX_ACCOUNTS_PER_PROXY, 10) || 3,

  // Webhook URLs
  MESSAGE_WEBHOOK_URL: process.env.MESSAGE_WEBHOOK_URL || '',
  GROUP_EVENT_WEBHOOK_URL: process.env.GROUP_EVENT_WEBHOOK_URL || '',
  REACTION_WEBHOOK_URL: process.env.REACTION_WEBHOOK_URL || '',
  WEBHOOK_LOGIN_SUCCESS: process.env.WEBHOOK_LOGIN_SUCCESS || '',

  // Getters cho đường dẫn dẫn xuất
  get COOKIES_DIR() {
    return path.join(this.DATA_PATH, 'cookies');
  },
  get PROXIES_FILE() {
    return path.join(this.DATA_PATH, 'proxies.json');
  },
  get USERS_FILE() {
    return path.join(this.DATA_PATH, 'cookies', 'users.json');
  },
};

export default env;

// Log cấu hình (che giá trị nhạy cảm)
export function logConfig() {
  console.log('--- Environment Config ---');
  console.log(`PORT: ${env.PORT}`);
  console.log(`NODE_ENV: ${env.NODE_ENV}`);
  console.log(`DATA_PATH: ${env.DATA_PATH}`);
  console.log(`API_KEY: ${env.API_KEY ? '***set***' : 'empty'}`);
  console.log(`ADMIN_DEFAULT_PASSWORD: ${env.ADMIN_DEFAULT_PASSWORD !== 'admin' ? '***set***' : 'default'}`);
  console.log(`MAX_ACCOUNTS_PER_PROXY: ${env.MAX_ACCOUNTS_PER_PROXY}`);
  console.log(`MESSAGE_WEBHOOK_URL: ${env.MESSAGE_WEBHOOK_URL ? '***set***' : 'empty'}`);
  console.log(`GROUP_EVENT_WEBHOOK_URL: ${env.GROUP_EVENT_WEBHOOK_URL ? '***set***' : 'empty'}`);
  console.log(`REACTION_WEBHOOK_URL: ${env.REACTION_WEBHOOK_URL ? '***set***' : 'empty'}`);
  console.log(`WEBHOOK_LOGIN_SUCCESS: ${env.WEBHOOK_LOGIN_SUCCESS ? '***set***' : 'empty'}`);
  console.log(`ERROR_WEBHOOK_URL: ${env.ERROR_WEBHOOK_URL ? '***set***' : 'empty'}`);
  console.log('-------------------------');
}
