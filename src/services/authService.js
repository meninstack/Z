// auth.js - Quản lý xác thực người dùng
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import env from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn đến file lưu thông tin đăng nhập
const userFilePath = env.USERS_FILE;

// Hàm tạo salt + hash mật khẩu dùng chung
const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
};

// Sao lưu file users.json hỏng trước khi tạo lại
const backupCorruptedFile = () => {
  try {
    if (fs.existsSync(userFilePath)) {
      const ts = Date.now();
      const backupPath = `${userFilePath}.backup-${ts}`;
      fs.copyFileSync(userFilePath, backupPath);
      console.log(`Đã sao lưu users.json hỏng vào ${backupPath}`);
    }
  } catch (err) {
    console.error('Không thể sao lưu users.json hỏng:', err.message);
  }
};

// Ghi file users.json nguyên tử: ghi file tạm cùng thư mục rồi rename
const saveUsers = (users) => {
  try {
    const dir = path.dirname(userFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${userFilePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(users, null, 2), { encoding: 'utf8' });
    fs.renameSync(tmpPath, userFilePath);
    return true;
  } catch (error) {
    console.error('Lỗi khi ghi users.json:', error.message);
    try { fs.unlinkSync(`${userFilePath}.tmp`); } catch {}
    return false;
  }
};

let initialized = false;
const ensureInit = () => {
  if (!initialized) {
    initUserFile();
    initialized = true;
  }
};


// Tạo file users.json nếu chưa tồn tại
const initUserFile = () => {
  try {
    console.log("Khởi tạo file người dùng...");

    // Kiểm tra và tạo thư mục cookies nếu chưa tồn tại
    const cookiesDir = path.join(process.cwd(), 'data', 'cookies');
    if (!fs.existsSync(cookiesDir)) {
      console.log("Thư mục cookies không tồn tại, đang tạo...");
      fs.mkdirSync(cookiesDir, { recursive: true });
      console.log("Đã tạo thư mục cookies thành công");
    } else {
      console.log("Thư mục cookies đã tồn tại");
    }

    // Đường dẫn đầy đủ đến file users.json
    console.log("Đường dẫn file users.json:", userFilePath);

    // Kiểm tra file users.json
    if (!fs.existsSync(userFilePath)) {
      console.log("File users.json không tồn tại, đang tạo...");

      // Tạo mật khẩu mặc định 'admin' cho người dùng 'admin'
      const defaultPassword = env.ADMIN_DEFAULT_PASSWORD;
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(defaultPassword, salt);

      const users = [{
        username: 'admin',
        salt,
        hash,
        role: 'admin' // Thêm quyền admin
      }];

      // Tạo file users.json
      const jsonData = JSON.stringify(users, null, 2);
      
      saveUsers(users);
      console.log('Đã tạo file users.json với tài khoản mặc định: admin/admin');
    } else {
      console.log("File users.json đã tồn tại");
      // Kiểm tra nội dung file
      try {
        const content = fs.readFileSync(userFilePath, 'utf8');
        JSON.parse(content); // Kiểm tra xem có phải JSON hợp lệ
        console.log("users.json là JSON hợp lệ");
      } catch (readError) {
        console.error("Lỗi khi đọc/phân tích file users.json:", readError.message);
        backupCorruptedFile();
        // Nếu file không đúng định dạng JSON, tạo lại
        const defaultPassword = env.ADMIN_DEFAULT_PASSWORD;
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashPassword(defaultPassword, salt);

        const users = [{
          username: 'admin',
          salt,
          hash,
          role: 'admin'
        }];

        saveUsers(users);
        console.log('Đã tạo lại file users.json với tài khoản mặc định: admin/admin');
      }
    }
  } catch (error) {
    console.error("Lỗi trong quá trình khởi tạo file người dùng:", error);
  }
};


// Đọc dữ liệu người dùng từ file
const getUsers = () => {
  ensureInit();
  try {
    // Đảm bảo đọc dữ liệu mới nhất từ file (không sử dụng cache)
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });
    
    try {
      const users = JSON.parse(data);
      

      return users;
    } catch (parseError) {
      console.error('Lỗi khi phân tích JSON từ file users.json:', parseError.message);
        backupCorruptedFile();
      return [];
    }
  } catch (error) {
    console.error('Lỗi khi đọc file users.json:', error);
    return [];
  }
};

// Thêm người dùng mới
export const addUser = (username, password, role = 'user') => {
  ensureInit();
  const users = getUsers();

  // Kiểm tra nếu username đã tồn tại
  if (users.some(user => user.username === username)) {
    return false;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  users.push({
    username,
    salt,
    hash,
    role
  });

  saveUsers(users);
  return true;
};

// Xác thực người dùng và trả về thông tin user
export const validateUser = (username, password) => {
  ensureInit();

  // Đọc dữ liệu trực tiếp từ file để đảm bảo dữ liệu mới nhất
  let users = [];
  try {
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });
    users = JSON.parse(data);
      } catch (error) {
    console.error('Error reading users file directly:', error.message);
    backupCorruptedFile();
    return null;
  }

  const user = users.find(user => user.username === username);
  
  if (!user) {
    console.log(`User ${username} not found in database`);
    return null;
  }

      
    
  const hash = hashPassword(password, user.salt);

  if (user.hash === hash) {
    console.log('Authentication successful');
    return {
      username: user.username,
      role: user.role || 'user'
    };
  }

  console.log('Authentication failed - password mismatch');
  return null;
};

// Thay đổi mật khẩu
export const changePassword = (username, oldPassword, newPassword) => {
  ensureInit();

  // Đọc dữ liệu trực tiếp từ file để đảm bảo dữ liệu mới nhất
  let users = [];
  try {
    const data = fs.readFileSync(userFilePath, { encoding: 'utf8', flag: 'r' });
    users = JSON.parse(data);
      } catch (error) {
    console.error('Error reading users file directly for password change:', error.message);
    backupCorruptedFile();
    return false;
  }

  const userIndex = users.findIndex(user => user.username === username);
  
  if (userIndex === -1) {
    console.log(`User ${username} not found in database`);
    return false;
  }

  const user = users[userIndex];
      
  const hash = hashPassword(oldPassword, user.salt);

  if (user.hash !== hash) {
    console.log('Old password verification failed');
    return false; // Mật khẩu cũ không chính xác
  }

  // Cập nhật mật khẩu mới
  const salt = crypto.randomBytes(16).toString('hex');

  const newHash = hashPassword(newPassword, salt);

  users[userIndex].salt = salt;
  users[userIndex].hash = newHash;


  try {
    if (!saveUsers(users)) {
      console.error('Error saving password change');
      return false;
    }
    console.log('Password change successful and verified');
    return true;
  } catch (error) {
    console.error('Error writing password change to file:', error.message);
    return false;
  }
};

// Middleware xác thực cho các route
export const authMiddleware = (req, res, next) => {
  // Kiểm tra nếu đã đăng nhập (thông qua session)
  if (req.session && req.session.authenticated) {
    return next();
  }

  // Chuyển hướng về trang đăng nhập
  res.redirect('/admin-login');
};

// Middleware kiểm tra quyền admin
export const adminMiddleware = (req, res, next) => {
  if (req.session && req.session.authenticated && req.session.role === 'admin') {
    return next();
  }

  res.status(403).send('Không có quyền truy cập. Chỉ admin mới có thể thực hiện chức năng này.');
};

// Lấy toàn bộ danh sách người dùng (chỉ admin mới có quyền)
export const getAllUsers = () => {
  ensureInit();
  const users = getUsers();
  return users.map(user => ({
    username: user.username,
    role: user.role || 'user'
  }));
};

// Danh sách các route công khai (không cần xác thực)
export const publicRoutes = [
  '/health', // Health check endpoint
  '/', // Trang chủ hiển thị nút đăng nhập
  '/admin-login', // Trang đăng nhập
  '/session-test', // Trang kiểm tra session
  '/api/login', // API đăng nhập
  '/api/simple-login', // API đăng nhập đơn giản
  '/api/test-login', // API đăng nhập test
  '/api/logout', // API đăng xuất
  '/api/check-auth', // API kiểm tra trạng thái xác thực
  '/api/session-test', // API kiểm tra session
  '/api/test-json', // API test JSON
  '/api/account-webhook/', // API webhook có tham số
  '/api/debug-users-file', // API debug file users.json
  '/api/reset-admin-password', // API reset mật khẩu admin
  '/reset-password', // Trang reset mật khẩu admin
  '/favicon.ico', // Favicon
  '/ws', // WebSocket

  // Thêm các API Zalo không cần xác thực
  '/api/findUser',
  '/api/getUserInfo',
  '/api/sendFriendRequest',
  '/api/sendmessage',
  '/api/createGroup',
  '/api/getGroupInfo',
  '/api/addUserToGroup',
  '/api/removeUserFromGroup',
  '/api/sendImageToUser',
  '/api/sendImagesToUser',
  '/api/sendImageToGroup',
  '/api/sendImagesToGroup'
];

// Kiểm tra xem route có phải là public hay không
export const isPublicRoute = (path) => {

  // Kiểm tra các route API công khai
  if (path.startsWith('/api/')) {
    // Xử lý các route có tham số động
    if (path.startsWith('/api/account-webhook/')) {
      return true;
    }

    // Kiểm tra các route cụ thể trong danh sách publicRoutes
    for (const route of publicRoutes) {
      if (route.startsWith('/api/') && (
        path === route || // Trùng khớp chính xác
        (route.endsWith('/') && path.startsWith(route)) // Route kết thúc bằng / và path bắt đầu bằng route
      )) {
        return true;
      }
    }

    return false;
  }

  // Kiểm tra các route UI công khai
  for (const route of publicRoutes) {
    // Bỏ qua các route API
    if (route.startsWith('/api/')) continue;

    // Kiểm tra exact match
    if (path === route) {
      return true;
    }

    // Kiểm tra prefix match cho routes như /route/*
    if (route.endsWith('*') && path.startsWith(route.slice(0, -1))) {
      return true;
    }
  }

  return false;
};