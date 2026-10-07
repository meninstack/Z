// config/constants.js - Application constants

// Relogin/Reconnection settings
export const RELOGIN_COOLDOWN = 5 * 60 * 1000; // 5 minutes
export const MAX_RETRY_ATTEMPTS = 5;
export const HEALTH_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
export const RETRY_RESET_TIME = 30 * 60 * 1000; // 30 minutes

// Session settings
export const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Password hashing settings
export const HASH_ITERATIONS = 1000;
export const HASH_KEY_LENGTH = 64;
export const HASH_DIGEST = 'sha512';
