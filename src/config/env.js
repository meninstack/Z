// config/env.js - Centralized environment configuration (minimal for #23)
// Issue #24 will extend this with the full set of options.
import path from 'path';

const DATA_PATH = process.env.DATA_PATH || './data';

const env = {
  DATA_PATH,
  USERS_FILE: path.join(DATA_PATH, 'cookies', 'users.json'),
  ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'admin',
};

export default env;
