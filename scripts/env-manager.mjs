#!/usr/bin/env node
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ==================== CONFIGURATION ====================
const ENCRYPTED_FILE = path.join(ROOT, '.env.enc');
const ALGORITHM = 'aes-256-gcm';
const SALT = Buffer.from('AJKMart-Env-Salt-2024-v1', 'utf8');
const MAX_ATTEMPTS = 7;

// ==================== REQUIRED ENV VARIABLES ====================
const REQUIRED_VARIABLES = {
  // Database
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/ajkmart',

  // JWT Secrets
  JWT_SECRET: '',
  ADMIN_ACCESS_TOKEN_SECRET: '',
  ADMIN_REFRESH_TOKEN_SECRET: '',
  ADMIN_CSRF_SECRET: '',
  ADMIN_JWT_SECRET: '',
  ADMIN_REFRESH_SECRET: '',
  ADMIN_SECRET: '',
  VENDOR_JWT_SECRET: '',
  RIDER_JWT_SECRET: '',

  // Admin Seed
  ADMIN_SEED_USERNAME: 'superadmin',
  ADMIN_SEED_PASSWORD: 'Admin@123',
  ADMIN_SEED_EMAIL: 'admin@ajkmart.com',
  ADMIN_SEED_NAME: 'Super Admin',

  // Port Configuration
  PORT: '5000',
  PORT_FALLBACK_ENABLE: 'true',
  PORT_MAX_RETRIES: '10',

  // URLs
  APP_BASE_URL: 'http://localhost:5000',
  ADMIN_BASE_URL: 'http://localhost:5173',
  FRONTEND_URL: 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:19006',
  CLIENT_URL: 'http://localhost:5173',

  // Third-Party (optional but should exist)
  GEMINI_API_KEY: '',
  FIREBASE_PROJECT_ID: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_FROM_NUMBER: '',
  SENDGRID_API_KEY: '',
  SMTP_HOST: '',
  GOOGLE_MAPS_API_KEY: '',
  OSRM_API_URL: '',
  REDIS_URL: '',
  SENTRY_DSN: '',

  // Push Notifications (VAPID)
  VAPID_PRIVATE_KEY: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_CONTACT_EMAIL: '',

  // Feature Flags
  ADMIN_LEGACY_AUTH_DISABLED: '0',
  LOG_LEVEL: 'debug',
  NODE_ENV: 'development',

  // Security
  ERROR_REPORT_HMAC_SECRET: '',
  JWT_ISSUER: 'ajkmart-dev',
  ALLOWED_ORIGINS: '',

  // Admin Config
  ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN: '15',

  // Expo/Vite Config
  EXPO_PUBLIC_DOMAIN: 'http://localhost:5000',
  VITE_API_BASE_URL: 'http://localhost:5000',
  VITE_API_PROXY_TARGET: 'http://localhost:5000',
};

// ==================== COLORS ====================
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// ==================== PASSWORD INPUT (WITH HIDDEN CHARS) ====================
const askPassword = (prompt) => {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdin.setRawMode?.(true);

    let password = '';
    let showPassword = false;

    process.stdout.write(prompt);

    const onData = (char) => {
      char = char.toString();

      if (char === '\r' || char === '\n') {
        process.stdout.write('\n');
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode?.(false);
        rl.close();
        resolve(password);
        return;
      }

      if (char === '\x7f' || char === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      if (char === '\x03') {
        process.stdout.write('\n');
        process.exit(0);
      }

      if (char === '\t') {
        showPassword = !showPassword;
        process.stdout.write('\r\x1b[K');
        process.stdout.write(prompt);
        if (showPassword) {
          process.stdout.write(password);
        } else {
          process.stdout.write('*'.repeat(password.length));
        }
        return;
      }

      password += char;
      if (showPassword) {
        process.stdout.write(char);
      } else {
        process.stdout.write('*');
      }
    };

    process.stdin.on('data', onData);
  });
};

// ==================== ENCRYPTION FUNCTIONS ====================
const deriveKey = (password) => {
  return scryptSync(password, SALT, 32);
};

const encrypt = (text, password) => {
  const key = deriveKey(password);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedData, password) => {
  const key = deriveKey(password);
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

// ==================== ENV FILE GENERATION ====================
const generateSecureSecret = (length = 64) => {
  return randomBytes(length).toString('hex');
};

const generateEnvContent = (variables) => {
  const lines = [];
  const missingVars = [];

  for (const [key, defaultValue] of Object.entries(variables)) {
    let value = defaultValue;

    if (!value && (
      key.includes('SECRET') ||
      key.includes('JWT') ||
      key.includes('TOKEN') ||
      key.includes('HMAC') ||
      key.includes('KEY')
    )) {
      value = generateSecureSecret(64);
      missingVars.push({ key, generated: true });
    }

    if (!value && !key.includes('KEY') && !key.includes('SECRET')) {
      missingVars.push({ key, generated: false });
    }

    lines.push(`${key}=${value || ''}`);
  }

  return { content: lines.join('\n'), missingVars };
};

// ==================== PARSE ENV CONTENT ====================
const parseEnvContent = (content) => {
  const vars = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
};

// ==================== LOAD ENV TO PROCESS ====================
const loadEnvToProcess = (envContent) => {
  const vars = parseEnvContent(envContent);
  let loaded = 0;

  for (const [key, value] of Object.entries(vars)) {
    if (value && !process.env[key]) {
      process.env[key] = value;
      loaded++;
    }
  }

  return loaded;
};

// ==================== DISPLAY FUNCTIONS ====================
const printHeader = () => {
  console.clear();
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════╗
║         🔐 AJKMart Environment Manager           ║
║         Encrypted Configuration System           ║
╚══════════════════════════════════════════════════╝${colors.reset}
`);
};

const printSuccess = (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`);
const printError = (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`);
const printWarning = (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);

const printPasswordHint = () => {
  console.log(`\n${colors.gray}┌─────────────────────────────────────────────────┐
│ ${colors.yellow}🔑 TIPS:${colors.gray}                                        │
│  ${colors.white}• Password is CASE-SENSITIVE                     ${colors.gray}│
│  ${colors.white}• Minimum 8 characters                             ${colors.gray}│
│  ${colors.white}• Press TAB to toggle password visibility          ${colors.gray}│
│  ${colors.white}• You have 7 attempts before lockout              ${colors.gray}│
│  ${colors.white}• Don't share this password with anyone           ${colors.gray}│
└─────────────────────────────────────────────────┘${colors.reset}\n`);
};

// ==================== DECRYPT COMMAND ====================
const decryptCommand = async () => {
  printHeader();

  if (!existsSync(ENCRYPTED_FILE)) {
    printError('No encrypted environment file found (.env.enc)');
    console.log(`\n${colors.yellow}Run this command to create one:${colors.reset}`);
    console.log(`  ${colors.cyan}node scripts/env-manager.mjs create${colors.reset}`);
    console.log(`\n${colors.yellow}Or set up environment manually:${colors.reset}`);
    console.log(`  ${colors.cyan}cp .env.example .env${colors.reset}\n`);
    process.exit(1);
  }

  printPasswordHint();

  const encryptedData = readFileSync(ENCRYPTED_FILE, 'utf8').trim();

  let attemptsLeft = MAX_ATTEMPTS;
  let decrypted = null;

  while (attemptsLeft > 0) {
    const remainingMsg = attemptsLeft < MAX_ATTEMPTS
      ? `${colors.red}(${attemptsLeft} attempts remaining)${colors.reset} `
      : '';

    const password = await askPassword(
      `${remainingMsg}${colors.bold}🔐 Enter decryption password: ${colors.reset}`
    );

    if (!password || password.length < 4) {
      console.log(`${colors.yellow}⚠️  Password too short (min 4 chars)${colors.reset}\n`);
      continue;
    }

    try {
      decrypted = decrypt(encryptedData, password);
      console.log(`\n${colors.green}✅ Password correct! Decrypting environment...${colors.reset}\n`);
      break;
    } catch (error) {
      attemptsLeft--;

      if (attemptsLeft > 0) {
        console.log(`${colors.red}❌ Wrong password! ${attemptsLeft} attempts remaining${colors.reset}\n`);

        if (attemptsLeft <= 4) {
          console.log(`${colors.gray}💡 Hint: Check if CAPS LOCK is on${colors.reset}`);
          console.log(`${colors.gray}💡 Hint: Try your most commonly used passwords${colors.reset}\n`);
        }
      }
    }
  }

  if (!decrypted) {
    console.clear();
    printHeader();
    console.log(`\n${colors.red}╔══════════════════════════════════════════════════╗
║  🚫 MAX ATTEMPTS EXCEEDED — ENVIRONMENT LOCKED   ║
╚══════════════════════════════════════════════════╝${colors.reset}
`);
    console.log(`${colors.yellow}Too many incorrect password attempts.${colors.reset}`);
    console.log(`${colors.yellow}For security, environment remains encrypted.${colors.reset}`);
    console.log(`\n${colors.green}💡 What to do:${colors.reset}`);
    console.log(`  1. Wait 5 minutes and try again`);
    console.log(`  2. Contact admin to reset the password`);
    console.log(`  3. Use: ${colors.cyan}node scripts/env-manager.mjs reset${colors.reset}`);
    console.log(`     (This will delete existing .env.enc and create new)\n`);
    process.exit(1);
  }

  const loaded = loadEnvToProcess(decrypted);
  writeFileSync(path.join(ROOT, '.env'), decrypted);

  const currentVars = parseEnvContent(decrypted);
  const missing = [];
  const empty = [];

  for (const [key, defaultValue] of Object.entries(REQUIRED_VARIABLES)) {
    if (!(key in currentVars)) {
      missing.push(key);
    } else if (!currentVars[key] && !defaultValue &&
               (key.includes('SECRET') || key.includes('JWT') || key.includes('KEY'))) {
      empty.push(key);
    }
  }

  console.log(`${colors.green}╔══════════════════════════════════════════════════╗
║     ✅ ENVIRONMENT DECRYPTED SUCCESSFULLY         ║
╚══════════════════════════════════════════════════╝${colors.reset}
`);

  console.log(`${colors.green}✅ ${loaded} variables loaded into environment${colors.reset}`);
  console.log(`${colors.green}✅ .env file written for tool compatibility${colors.reset}`);

  console.log(`\n${colors.cyan}📊 Environment Summary:${colors.reset}`);
  console.log(`${'─'.repeat(50)}`);

  const categories = {
    '🔑 Security & Auth': ['JWT_SECRET', 'ADMIN_ACCESS_TOKEN_SECRET', 'ADMIN_CSRF_SECRET'],
    '🗄️  Database': ['DATABASE_URL'],
    '👤 Admin': ['ADMIN_SEED_USERNAME', 'ADMIN_SEED_EMAIL'],
    '🌐 URLs & Ports': ['PORT', 'APP_BASE_URL', 'FRONTEND_URL'],
    '📱 Integrations': ['FIREBASE_PROJECT_ID', 'TWILIO_ACCOUNT_SID', 'GEMINI_API_KEY'],
  };

  for (const [category, vars] of Object.entries(categories)) {
    console.log(`\n${colors.bold}${category}:${colors.reset}`);
    for (const v of vars) {
      if (currentVars[v]) {
        const displayValue = v.includes('SECRET') || v.includes('KEY') || v.includes('JWT')
          ? '••••••••' + currentVars[v].slice(-4)
          : currentVars[v];
        console.log(`  ${colors.green}✓ ${v}${colors.reset} = ${colors.gray}${displayValue}${colors.reset}`);
      } else {
        console.log(`  ${colors.red}✗ ${v}${colors.reset} = ${colors.red}MISSING${colors.reset}`);
      }
    }
  }

  if (missing.length > 0) {
    console.log(`\n${colors.yellow}⚠️  Missing variables detected:${colors.reset}`);
    missing.forEach(v => console.log(`   - ${v}`));
    console.log(`\n${colors.yellow}Run update command to add them:${colors.reset}`);
    console.log(`  ${colors.cyan}node scripts/env-manager.mjs update${colors.reset}`);
  }

  if (empty.length > 0) {
    console.log(`\n${colors.red}⚠️  Empty security variables (will auto-generate):${colors.reset}`);
    empty.forEach(v => console.log(`   - ${v}`));
  }

  console.log(`\n${colors.green}🎯 Ready to start! Run: ${colors.cyan}pnpm dev${colors.reset}\n`);
};

// ==================== CREATE COMMAND ====================
const createCommand = async () => {
  printHeader();

  if (existsSync(ENCRYPTED_FILE)) {
    printWarning('Encrypted environment file already exists!');
    console.log(`\nChoose an option:`);
    console.log(`  ${colors.cyan}1. node scripts/env-manager.mjs decrypt${colors.reset} — Unlock existing`);
    console.log(`  ${colors.cyan}2. node scripts/env-manager.mjs update${colors.reset} — Modify existing`);
    console.log(`  ${colors.cyan}3. node scripts/env-manager.mjs reset${colors.reset} — Delete & create new`);
    return;
  }

  console.log(`${colors.cyan}🔧 Creating new encrypted environment configuration...${colors.reset}\n`);
  console.log(`${colors.yellow}Set your master encryption password:${colors.reset}`);
  console.log(`${colors.gray}(Minimum 8 characters, mix of letters, numbers, symbols)${colors.reset}\n`);

  let password = '';
  let confirmPassword = '';

  while (true) {
    password = await askPassword(`${colors.bold}🔐 Enter master password: ${colors.reset}`);

    if (password.length < 8) {
      printError('Password must be at least 8 characters!');
      continue;
    }

    if (!/[A-Z]/.test(password) && !/[0-9]/.test(password) && !/[!@#$%^&*]/.test(password)) {
      printWarning('Weak password! Add numbers or symbols for better security.');
      const proceed = await askPassword(`${colors.yellow}Enter Y to use anyway, N to change: ${colors.reset}`);
      if (proceed.toLowerCase() === 'y') break;
      continue;
    }

    break;
  }

  console.log('');
  while (true) {
    confirmPassword = await askPassword(`${colors.bold}🔐 Confirm master password: ${colors.reset}`);

    if (password !== confirmPassword) {
      printError('Passwords do not match! Try again.');
      continue;
    }

    break;
  }

  console.log(`\n${colors.green}✅ Password set successfully!${colors.reset}\n`);
  console.log(`${colors.cyan}📝 Generating environment variables...${colors.reset}`);
  const { content, missingVars } = generateEnvContent(REQUIRED_VARIABLES);

  if (missingVars.length > 0) {
    console.log(`\n${colors.yellow}🔑 Auto-generated security keys:${colors.reset}`);
    missingVars
      .filter(v => v.generated)
      .forEach(v => {
        const value = parseEnvContent(content)[v.key];
        console.log(`  ${colors.green}${v.key}${colors.reset} = ${colors.gray}${value?.substring(0, 16)}...${colors.reset}`);
      });
  }

  console.log(`\n${colors.cyan}🔐 Encrypting configuration...${colors.reset}`);
  const encrypted = encrypt(content, password);
  writeFileSync(ENCRYPTED_FILE, encrypted);
  writeFileSync(path.join(ROOT, '.env'), content);
  loadEnvToProcess(content);

  console.log(`\n${colors.green}╔══════════════════════════════════════════════════╗
║   ✅ ENVIRONMENT CREATED & ENCRYPTED SUCCESSFULLY  ║
╚══════════════════════════════════════════════════╝${colors.reset}
`);

  console.log(`${colors.green}✅ Encrypted file saved:${colors.reset} .env.enc`);
  console.log(`${colors.green}✅ Decrypted copy saved:${colors.reset} .env (auto-ignored by git)`);
  console.log(`${colors.green}✅ ${Object.keys(REQUIRED_VARIABLES).length} variables configured${colors.reset}`);
  console.log(`\n${colors.yellow}⚠️  IMPORTANT — Save your master password securely!${colors.reset}`);
  console.log(`${colors.yellow}   It cannot be recovered if lost.${colors.reset}`);
  console.log(`\n${colors.cyan}📋 Next Steps:${colors.reset}`);
  console.log(`   ${colors.green}1. Run: ${colors.cyan}pnpm env:show${colors.reset} — View variables`);
  console.log(`   ${colors.green}2. Run: ${colors.cyan}pnpm replit-start${colors.reset} — Start the platform`);
  console.log(`   ${colors.green}3. Run: ${colors.cyan}pnpm env:update${colors.reset} — Modify later\n`);
};

// ==================== UPDATE COMMAND ====================
const updateCommand = async () => {
  printHeader();
  console.log(`${colors.cyan}🔄 Update Encrypted Environment${colors.reset}\n`);

  if (!existsSync(ENCRYPTED_FILE)) {
    printError('No encrypted environment file found!');
    console.log(`Create one first: ${colors.cyan}node scripts/env-manager.mjs create${colors.reset}\n`);
    return;
  }

  printPasswordHint();
  const encryptedData = readFileSync(ENCRYPTED_FILE, 'utf8').trim();
  let decrypted = null;
  let password = '';

  for (let i = MAX_ATTEMPTS; i > 0; i--) {
    password = await askPassword(`${colors.bold}🔐 Enter current password (${i} attempts): ${colors.reset}`);

    try {
      decrypted = decrypt(encryptedData, password);
      console.log(`${colors.green}✅ Decrypted successfully!${colors.reset}\n`);
      break;
    } catch (e) {
      if (i > 1) {
        printError(`Wrong password! ${i - 1} attempts remaining`);
      } else {
        printError('Max attempts exceeded! Exiting.');
        return;
      }
    }
  }

  const currentVars = parseEnvContent(decrypted);
  console.log(`${colors.cyan}📊 Current Environment (${Object.keys(currentVars).length} variables):${colors.reset}\n`);

  console.log(`${colors.bold}Update Options:${colors.reset}`);
  console.log(`  ${colors.cyan}1.${colors.reset} Add missing variables`);
  console.log(`  ${colors.cyan}2.${colors.reset} Change specific variable`);
  console.log(`  ${colors.cyan}3.${colors.reset} Change master password`);
  console.log(`  ${colors.cyan}4.${colors.reset} View all variables`);
  console.log(`  ${colors.cyan}5.${colors.reset} Cancel\n`);

  const choice = await askPassword(`${colors.bold}👉 Choose option (1-5): ${colors.reset}`);

  switch (choice) {
    case '1': {
      console.log(`\n${colors.cyan}Checking for missing variables...${colors.reset}`);
      const missing = [];

      for (const key of Object.keys(REQUIRED_VARIABLES)) {
        if (!(key in currentVars)) {
          missing.push(key);
        }
      }

      if (missing.length === 0) {
        printSuccess('All required variables are present!');
      } else {
        console.log(`\n${colors.yellow}Adding ${missing.length} missing variables:${colors.reset}`);
        missing.forEach(v => console.log(`  + ${v}`));

        for (const key of missing) {
          let value = REQUIRED_VARIABLES[key];
          if (!value && (key.includes('SECRET') || key.includes('JWT') || key.includes('KEY'))) {
            value = generateSecureSecret(64);
          }
          currentVars[key] = value;
        }

        const newContent = Object.entries(currentVars)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');

        const newEncrypted = encrypt(newContent, password);
        writeFileSync(ENCRYPTED_FILE, newEncrypted);
        writeFileSync(path.join(ROOT, '.env'), newContent);
        printSuccess(`Added ${missing.length} variables and re-encrypted!`);
      }
      break;
    }

    case '2': {
      console.log(`\n${colors.cyan}Current variables:${colors.reset}`);
      const keys = Object.keys(currentVars).sort();
      keys.forEach((k, i) => {
        const val = k.includes('SECRET') || k.includes('KEY')
          ? '••••••••' + (currentVars[k]?.slice(-4) || '')
          : currentVars[k];
        console.log(`  ${colors.gray}${(i + 1).toString().padStart(3)}.${colors.reset} ${colors.yellow}${k}${colors.reset} = ${colors.dim}${val}${colors.reset}`);
      });

      console.log('');
      const varName = await askPassword(`${colors.bold}👉 Enter variable name to change: ${colors.reset}`);

      if (varName in currentVars) {
        console.log(`${colors.yellow}Current value: ${currentVars[varName]?.substring(0, 50)}...${colors.reset}`);
        const newValue = await askPassword(`${colors.bold}👉 Enter new value: ${colors.reset}`);

        if (newValue) {
          currentVars[varName] = newValue;

          const newContent = Object.entries(currentVars)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

          const newEncrypted = encrypt(newContent, password);
          writeFileSync(ENCRYPTED_FILE, newEncrypted);
          writeFileSync(path.join(ROOT, '.env'), newContent);
          printSuccess(`Updated ${varName} successfully!`);
        }
      } else {
        printError(`Variable '${varName}' not found!`);
      }
      break;
    }

    case '3': {
      console.log('');
      const newPassword = await askPassword(`${colors.bold}🔐 Enter new master password: ${colors.reset}`);
      const confirmNew = await askPassword(`${colors.bold}🔐 Confirm new password: ${colors.reset}`);

      if (newPassword === confirmNew && newPassword.length >= 8) {
        const content = Object.entries(currentVars)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');

        const newEncrypted = encrypt(content, newPassword);
        writeFileSync(ENCRYPTED_FILE, newEncrypted);
        printSuccess('Master password changed successfully!');
        console.log(`${colors.yellow}⚠️  Save your new password securely!${colors.reset}`);
      } else {
        printError('Passwords do not match or too short!');
      }
      break;
    }

    case '4': {
      console.log(`\n${colors.cyan}📋 All Environment Variables:${colors.reset}`);
      console.log(`${'─'.repeat(70)}`);
      for (const [key, value] of Object.entries(currentVars).sort()) {
        const displayValue = (key.includes('SECRET') || key.includes('KEY') || key.includes('JWT') || key.includes('TOKEN'))
          ? '••••••••••••••••' + (value?.slice(-4) || '')
          : value || '(empty)';
        console.log(`${colors.yellow}${key.padEnd(35)}${colors.reset} = ${colors.gray}${displayValue}${colors.reset}`);
      }
      console.log(`${'─'.repeat(70)}\n`);
      break;
    }

    default:
      printWarning('Update cancelled.');
  }
};

// ==================== RESET COMMAND ====================
const resetCommand = async () => {
  printHeader();
  console.log(`${colors.red}⚠️  RESET ENVIRONMENT — This will delete existing .env.enc${colors.reset}\n`);

  const confirm = await askPassword(`${colors.red}Type 'DELETE' to confirm reset: ${colors.reset}`);

  if (confirm !== 'DELETE') {
    printWarning('Reset cancelled.');
    return;
  }

  if (existsSync(ENCRYPTED_FILE)) {
    const backupFile = `${ENCRYPTED_FILE}.backup.${Date.now()}`;
    writeFileSync(backupFile, readFileSync(ENCRYPTED_FILE));
    printWarning(`Backup saved to ${path.basename(backupFile)}`);
    writeFileSync(ENCRYPTED_FILE, '');
  }

  if (existsSync(path.join(ROOT, '.env'))) {
    writeFileSync(path.join(ROOT, '.env'), '');
  }

  printSuccess('Old environment cleared!');
  console.log(`\nRun create command now: ${colors.cyan}node scripts/env-manager.mjs create${colors.reset}\n`);
};

// ==================== SHOW COMMAND ====================
const showCommand = async () => {
  printHeader();

  if (!existsSync(ENCRYPTED_FILE)) {
    printError('No encrypted environment file found!');
    return;
  }

  const encryptedData = readFileSync(ENCRYPTED_FILE, 'utf8').trim();

  for (let i = MAX_ATTEMPTS; i > 0; i--) {
    const password = await askPassword(`${colors.bold}🔐 Enter password (${i} attempts): ${colors.reset}`);

    try {
      const decrypted = decrypt(encryptedData, password);
      const vars = parseEnvContent(decrypted);

      console.log(`\n${colors.cyan}📋 Environment Variables:${colors.reset}\n`);
      console.log(`${'─'.repeat(70)}`);

      for (const [key, value] of Object.entries(vars).sort()) {
        const isSecret = key.includes('SECRET') || key.includes('KEY') || key.includes('JWT') || key.includes('TOKEN');
        const displayValue = isSecret
          ? '••••••••••••••••' + (value?.slice(-4) || '****')
          : value || colors.gray + '(empty)' + colors.reset;
        console.log(`  ${colors.yellow}${key.padEnd(38)}${colors.reset}= ${colors.gray}${displayValue}${colors.reset}`);
      }

      console.log(`${'─'.repeat(70)}`);
      console.log(`\n${colors.gray}Total: ${Object.keys(vars).length} variables${colors.reset}\n`);
      return;
    } catch (e) {
      if (i > 1) printError(`Wrong password! ${i - 1} attempts remaining`);
    }
  }

  printError('Max attempts exceeded!');
};

// ==================== EXPORT COMMAND ====================
const exportCommand = async () => {
  printHeader();
  console.log(`${colors.cyan}📤 Export .env.example (secrets redacted)${colors.reset}\n`);

  const envPath    = path.join(ROOT, '.env');
  const outputPath = path.join(ROOT, '.env.example');
  let envContent   = null;

  // Try .env first (no password needed)
  if (existsSync(envPath) && readFileSync(envPath, 'utf8').trim().length > 0) {
    envContent = readFileSync(envPath, 'utf8');
    console.log(`${colors.green}✅ Reading from .env${colors.reset}\n`);
  } else if (existsSync(ENCRYPTED_FILE) && readFileSync(ENCRYPTED_FILE, 'utf8').trim().length > 0) {
    console.log(`${colors.yellow}🔐 .env not found — decrypting .env.enc${colors.reset}\n`);
    const encryptedData = readFileSync(ENCRYPTED_FILE, 'utf8').trim();
    for (let i = MAX_ATTEMPTS; i > 0; i--) {
      const password = await askPassword(`${colors.bold}🔐 Enter password (${i} attempts): ${colors.reset}`);
      try {
        envContent = decrypt(encryptedData, password);
        console.log(`\n${colors.green}✅ Decrypted!${colors.reset}\n`);
        break;
      } catch (e) {
        if (i > 1) printError(`Wrong password! ${i - 1} attempts remaining`);
        else { printError('Max attempts exceeded!'); process.exit(1); }
      }
    }
  } else {
    printError('No .env or .env.enc found!');
    console.log(`\n${colors.yellow}Run: ${colors.cyan}pnpm env:create${colors.reset}\n`);
    process.exit(1);
  }

  const currentVars = parseEnvContent(envContent);

  // ── Placeholder rules ────────────────────────────────────────────────────
  const isSecretKey = (k) =>
    k.includes('SECRET') || k.includes('JWT') || k.includes('TOKEN') ||
    k.includes('HMAC')   || k.includes('KEY') || k.includes('PASSWORD') ||
    k.includes('SID')    || k.includes('AUTH');

  const isApiKey = (k) =>
    k.includes('API_KEY') || k.includes('API_TOKEN') || k.includes('DSN');

  const placeholder = (key) => {
    if (isApiKey(key))        return `your-${key.toLowerCase().replace(/_/g, '-')}`;
    if (isSecretKey(key))     return `your-${key.toLowerCase().replace(/_/g, '-')}-here`;
    return null;  // null = keep real value (not sensitive)
  };

  // ── Build .env.example with category headers ──────────────────────────────
  const domainSections = [
    {
      header: '# ─── Database ────────────────────────────────────────',
      keys: ['DATABASE_URL'],
    },
    {
      header: '# ─── JWT & Auth Secrets ──────────────────────────────',
      keys: ['JWT_SECRET','ADMIN_JWT_SECRET','ADMIN_REFRESH_SECRET','ADMIN_SECRET','ADMIN_ACCESS_TOKEN_SECRET','ADMIN_REFRESH_TOKEN_SECRET','ADMIN_CSRF_SECRET','VENDOR_JWT_SECRET','RIDER_JWT_SECRET','JWT_ISSUER'],
    },
    {
      header: '# ─── Admin Seed ──────────────────────────────────────',
      keys: ['ADMIN_SEED_USERNAME','ADMIN_SEED_PASSWORD','ADMIN_SEED_EMAIL','ADMIN_SEED_NAME'],
    },
    {
      header: '# ─── Security ───────────────────────────────────────',
      keys: ['ERROR_REPORT_HMAC_SECRET','ALLOWED_ORIGINS','ADMIN_LEGACY_AUTH_DISABLED','ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN'],
    },
    {
      header: '# ─── Ports & URLs ───────────────────────────────────',
      keys: ['PORT','PORT_FALLBACK_ENABLE','PORT_MAX_RETRIES','APP_BASE_URL','ADMIN_BASE_URL','FRONTEND_URL','CLIENT_URL'],
    },
    {
      header: '# ─── Firebase ───────────────────────────────────────',
      keys: ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY'],
    },
    {
      header: '# ─── Twilio / SMS ───────────────────────────────────',
      keys: ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER'],
    },
    {
      header: '# ─── Email ──────────────────────────────────────────',
      keys: ['SENDGRID_API_KEY','SMTP_HOST'],
    },
    {
      header: '# ─── AI ─────────────────────────────────────────────',
      keys: ['GEMINI_API_KEY'],
    },
    {
      header: '# ─── Maps & Routing ─────────────────────────────────',
      keys: ['GOOGLE_MAPS_API_KEY','OSRM_API_URL'],
    },
    {
      header: '# ─── Push Notifications (VAPID) ─────────────────────',
      keys: ['VAPID_PRIVATE_KEY','VAPID_PUBLIC_KEY','VAPID_CONTACT_EMAIL'],
    },
    {
      header: '# ─── Infrastructure ─────────────────────────────────',
      keys: ['REDIS_URL','SENTRY_DSN'],
    },
    {
      header: '# ─── Runtime Flags ──────────────────────────────────',
      keys: ['NODE_ENV','LOG_LEVEL'],
    },
    {
      header: '# ─── Expo / Vite ────────────────────────────────────',
      keys: ['EXPO_PUBLIC_DOMAIN','VITE_API_BASE_URL','VITE_API_PROXY_TARGET'],
    },
  ];

  const lines = [
    `# AJKMart Super-App — Environment Example`,
    `# Generated: ${new Date().toISOString()}`,
    `# Copy this file to .env and fill in the values.`,
    `# Secrets marked with YOUR-* must be set before running.`,
    `# Run: pnpm env:create  to set up encrypted environment instead.`,
    '',
  ];

  const accountedFor = new Set();
  let redactedCount = 0;
  let keptCount     = 0;

  for (const section of domainSections) {
    lines.push(section.header);
    for (const key of section.keys) {
      accountedFor.add(key);
      const raw   = currentVars[key] ?? REQUIRED_VARIABLES[key] ?? '';
      const ph    = placeholder(key);
      const value = ph ? ph.toUpperCase().replace(/-/g, '_') : raw;
      if (ph) redactedCount++;
      else    keptCount++;
      lines.push(`${key}=${value}`);
    }
    lines.push('');
  }

  // Any vars in .env that aren't in our sections (user-added custom vars)
  const extra = Object.keys(currentVars).filter(k => !accountedFor.has(k));
  if (extra.length > 0) {
    lines.push('# ─── Custom / Extra ─────────────────────────────────');
    for (const key of extra) {
      const ph    = placeholder(key);
      const value = ph ? ph.toUpperCase().replace(/-/g, '_') : currentVars[key];
      if (ph) redactedCount++;
      else    keptCount++;
      lines.push(`${key}=${value}`);
    }
    lines.push('');
  }

  const output = lines.join('\n');
  writeFileSync(outputPath, output);

  console.log(`${colors.green}╔══════════════════════════════════════════════════╗
║   ✅ .env.example GENERATED SUCCESSFULLY         ║
╚══════════════════════════════════════════════════╝${colors.reset}
`);
  console.log(`${colors.green}✅ File written:${colors.reset}       .env.example`);
  console.log(`${colors.green}✅ Variables kept:${colors.reset}     ${keptCount}  (non-sensitive, real values)`);
  console.log(`${colors.yellow}🔒 Secrets redacted:${colors.reset}   ${redactedCount}  (replaced with placeholders)`);
  if (extra.length > 0) {
    console.log(`${colors.cyan}➕ Extra vars included:${colors.reset} ${extra.length}  (custom variables from .env)`);
  }

  console.log(`\n${colors.cyan}📋 Next steps:${colors.reset}`);
  console.log(`   ${colors.green}1. Review .env.example before committing${colors.reset}`);
  console.log(`   ${colors.green}2. git add .env.example${colors.reset}`);
  console.log(`   ${colors.green}3. Teammates run: ${colors.cyan}cp .env.example .env${colors.reset}${colors.green} then fill secrets${colors.reset}`);
  console.log(`   ${colors.green}   Or better:     ${colors.cyan}pnpm env:create${colors.reset}${colors.green} for encrypted setup${colors.reset}\n`);
};

// ==================== VERIFY COMMAND ====================
const verifyCommand = async () => {
  printHeader();
  console.log(`${colors.cyan}🔍 Environment Health Verification${colors.reset}\n`);

  const envPath = path.join(ROOT, '.env');
  let envContent = null;

  // Try .env first (no password needed)
  if (existsSync(envPath) && readFileSync(envPath, 'utf8').trim().length > 0) {
    envContent = readFileSync(envPath, 'utf8');
    console.log(`${colors.green}✅ Reading from .env (no password needed)${colors.reset}\n`);
  } else if (existsSync(ENCRYPTED_FILE) && readFileSync(ENCRYPTED_FILE, 'utf8').trim().length > 0) {
    console.log(`${colors.yellow}🔐 .env not found — will decrypt .env.enc${colors.reset}\n`);
    const encryptedData = readFileSync(ENCRYPTED_FILE, 'utf8').trim();
    for (let i = MAX_ATTEMPTS; i > 0; i--) {
      const password = await askPassword(`${colors.bold}🔐 Enter password (${i} attempts): ${colors.reset}`);
      try {
        envContent = decrypt(encryptedData, password);
        console.log(`\n${colors.green}✅ Decrypted successfully!${colors.reset}\n`);
        break;
      } catch (e) {
        if (i > 1) printError(`Wrong password! ${i - 1} attempts remaining`);
        else { printError('Max attempts exceeded!'); process.exit(1); }
      }
    }
  } else {
    printError('No .env or .env.enc found!');
    console.log(`\n${colors.yellow}Run: ${colors.cyan}pnpm env:create${colors.reset}${colors.yellow} to set up environment.${colors.reset}\n`);
    process.exit(1);
  }

  const currentVars = parseEnvContent(envContent);
  const total = Object.keys(REQUIRED_VARIABLES).length;

  // ── Categorize every required variable ──────────────────────────────────
  const results = {
    ready:       [],  // real value, not a secret
    secret:      [],  // real secret value (masked on display)
    placeholder: [],  // has a value but it is a template / needs replacing
    default:     [],  // empty in .env but has a hardcoded default
    autogen:     [],  // empty, no default, but can be auto-generated
    empty:       [],  // key present, empty, no default, not auto-gen
    missing:     [],  // key not in .env at all
  };

  const isSecretKey = (k) =>
    k.includes('SECRET') || k.includes('JWT') || k.includes('TOKEN') ||
    k.includes('HMAC')   || k.includes('KEY');

  const isPlaceholder = (key, value) => {
    if (!value) return false;
    const vu = value.toUpperCase();
    if (vu.includes('PLACEHOLDER') || vu.includes('REPLACE_WITH') || vu.includes('YOUR_')) return true;
    // Value that looks like an env var name (all-caps + underscores, no special chars)
    if (/^[A-Z][A-Z_0-9]{4,}$/.test(value)) return true;
    return false;
  };

  for (const [key, defaultValue] of Object.entries(REQUIRED_VARIABLES)) {
    const inEnv   = key in currentVars;
    const value   = currentVars[key] ?? '';
    const hasVal  = value.trim().length > 0;
    const hasDef  = defaultValue.trim().length > 0;
    const canGen  = isSecretKey(key);

    if (!inEnv) {
      results.missing.push(key);
    } else if (hasVal && isPlaceholder(key, value)) {
      results.placeholder.push({ key, value });
    } else if (hasVal && canGen) {
      results.secret.push({ key, value });
    } else if (hasVal) {
      results.ready.push({ key, value });
    } else if (!hasVal && hasDef) {
      results.default.push({ key, defaultValue });
    } else if (!hasVal && canGen) {
      results.autogen.push(key);
    } else {
      results.empty.push(key);
    }
  }

  // ── Health Score ──────────────────────────────────────────────────────────
  const configured      = results.ready.length + results.secret.length + results.default.length;
  const partial         = results.placeholder.length;
  const actionable      = results.autogen.length;
  const scoreReal       = Math.round((configured / total) * 100);
  const score           = Math.round(((configured + partial * 0.5) / total) * 100);
  const scoreWithAutogen = Math.round(((configured + partial * 0.5 + actionable) / total) * 100);

  const scoreColor =
    scoreReal >= 90 ? colors.green :
    scoreReal >= 70 ? colors.yellow :
    colors.red;

  console.log(`${colors.bold}📊 Health Score:${colors.reset}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Real values set      : ${scoreColor}${scoreReal}%${colors.reset}  (${configured}/${total} vars)`);
  if (partial > 0) {
    console.log(`  Including placeholders: ${colors.yellow}${score}%${colors.reset}  (${partial} vars need real values)`);
  }
  if (actionable > 0) {
    console.log(`  After auto-generate  : ${colors.cyan}${scoreWithAutogen}%${colors.reset}  (run pnpm env:update)`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  // ── Domain Groups ─────────────────────────────────────────────────────────
  const domainGroups = {
    '🗄️  Database':        ['DATABASE_URL'],
    '🔑 JWT & Auth':       ['JWT_SECRET','ADMIN_JWT_SECRET','ADMIN_REFRESH_SECRET','ADMIN_SECRET','ADMIN_ACCESS_TOKEN_SECRET','ADMIN_REFRESH_TOKEN_SECRET','ADMIN_CSRF_SECRET','VENDOR_JWT_SECRET','RIDER_JWT_SECRET','JWT_ISSUER'],
    '👤 Admin Seed':       ['ADMIN_SEED_USERNAME','ADMIN_SEED_PASSWORD','ADMIN_SEED_EMAIL','ADMIN_SEED_NAME'],
    '🔒 Security':         ['ERROR_REPORT_HMAC_SECRET','ALLOWED_ORIGINS','ADMIN_LEGACY_AUTH_DISABLED','ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN'],
    '🌐 URLs & Ports':     ['PORT','PORT_FALLBACK_ENABLE','PORT_MAX_RETRIES','APP_BASE_URL','ADMIN_BASE_URL','FRONTEND_URL','CLIENT_URL'],
    '📱 Firebase':         ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY'],
    '📞 Twilio / SMS':     ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER'],
    '📧 Email':            ['SENDGRID_API_KEY','SMTP_HOST'],
    '🤖 AI':               ['GEMINI_API_KEY'],
    '🗺️  Maps & OSRM':     ['GOOGLE_MAPS_API_KEY','OSRM_API_URL'],
    '🔔 Push (VAPID)':     ['VAPID_PRIVATE_KEY','VAPID_PUBLIC_KEY','VAPID_CONTACT_EMAIL'],
    '⚡ Infrastructure':   ['REDIS_URL','SENTRY_DSN'],
    '🏗️  Runtime Flags':   ['NODE_ENV','LOG_LEVEL'],
    '📲 Expo / Vite':      ['EXPO_PUBLIC_DOMAIN','VITE_API_BASE_URL','VITE_API_PROXY_TARGET'],
  };

  for (const [group, keys] of Object.entries(domainGroups)) {
    const lines = [];
    for (const key of keys) {
      const inReady       = results.ready.find(r => r.key === key);
      const inSecret      = results.secret.find(r => r.key === key);
      const inPlaceholder = results.placeholder.find(r => r.key === key);
      if (inSecret) {
        const masked = '••••••••' + inSecret.value.slice(-4);
        lines.push(`  ${colors.green}✅ ${key.padEnd(38)}${colors.reset}${colors.gray}${masked}${colors.reset}`);
      } else if (inReady) {
        const display = inReady.value.length > 50 ? inReady.value.slice(0, 47) + '...' : inReady.value;
        lines.push(`  ${colors.green}✅ ${key.padEnd(38)}${colors.reset}${colors.gray}${display}${colors.reset}`);
      } else if (inPlaceholder) {
        const display = inPlaceholder.value.length > 42 ? inPlaceholder.value.slice(0, 39) + '...' : inPlaceholder.value;
        lines.push(`  ${colors.yellow}🟡 ${key.padEnd(38)}${colors.reset}${colors.dim}PLACEHOLDER: ${display}${colors.reset}`);
      } else if (results.default.find(r => r.key === key)) {
        const def = results.default.find(r => r.key === key);
        lines.push(`  ${colors.yellow}⚠️  ${key.padEnd(37)}${colors.reset}${colors.dim}(empty — default: ${def.defaultValue})${colors.reset}`);
      } else if (results.autogen.includes(key)) {
        lines.push(`  ${colors.cyan}🔧 ${key.padEnd(38)}${colors.reset}${colors.dim}(empty — can auto-generate)${colors.reset}`);
      } else if (results.empty.includes(key)) {
        lines.push(`  ${colors.yellow}○  ${key.padEnd(38)}${colors.reset}${colors.yellow}(empty)${colors.reset}`);
      } else if (results.missing.includes(key)) {
        lines.push(`  ${colors.red}❌ ${key.padEnd(38)}${colors.reset}${colors.red}MISSING from .env${colors.reset}`);
      }
    }
    if (lines.length > 0) {
      console.log(`${colors.bold}${group}${colors.reset}`);
      lines.forEach(l => console.log(l));
      console.log('');
    }
  }

  // ── Summary Table ─────────────────────────────────────────────────────────
  console.log(`${'─'.repeat(60)}`);
  console.log(`${colors.green}  ✅ Ready (real value)      ${colors.reset}: ${results.ready.length + results.secret.length}`);
  console.log(`${colors.yellow}  🟡 Placeholder (needs real)${colors.reset}: ${results.placeholder.length}`);
  console.log(`${colors.yellow}  ⚠️  Has default value       ${colors.reset}: ${results.default.length}`);
  console.log(`${colors.cyan}  🔧 Can auto-generate       ${colors.reset}: ${results.autogen.length}`);
  console.log(`${colors.yellow}  ○  Empty (no default)      ${colors.reset}: ${results.empty.length}`);
  console.log(`${colors.red}  ❌ Missing entirely         ${colors.reset}: ${results.missing.length}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  ${colors.bold}Total                       : ${total} variables${colors.reset}\n`);

  // ── Action Hints ──────────────────────────────────────────────────────────
  if (results.autogen.length > 0) {
    console.log(`${colors.cyan}🔧 Auto-generatable secrets (run update → option 1):${colors.reset}`);
    results.autogen.forEach(k => console.log(`   ${colors.dim}+ ${k}${colors.reset}`));
    console.log(`\n  ${colors.cyan}→ pnpm env:update${colors.reset}  (choose option 1: Add missing variables)\n`);
  }

  if (results.missing.length > 0) {
    console.log(`${colors.red}❌ Missing variables (must be added manually):${colors.reset}`);
    results.missing.forEach(k => console.log(`   ${colors.red}- ${k}${colors.reset}`));
    console.log(`\n  ${colors.cyan}→ pnpm env:update${colors.reset}  (choose option 2: Change specific variable)\n`);
  }

  if (results.empty.length > 0) {
    console.log(`${colors.yellow}○ Empty variables (optional but recommended):${colors.reset}`);
    results.empty.forEach(k => console.log(`   ${colors.yellow}- ${k}${colors.reset}`));
    console.log('');
  }

  // ── Final verdict ─────────────────────────────────────────────────────────
  const placeholderList = results.placeholder.map(r => r.key);
  if (placeholderList.length > 0) {
    console.log(`${colors.yellow}🟡 Vars that need real values (run pnpm env:update → option 2):${colors.reset}`);
    placeholderList.forEach(k => console.log(`   ${colors.yellow}→ ${k}${colors.reset}`));
    console.log('');
  }

  if (scoreReal === 100 && partial === 0) {
    console.log(`${colors.green}🎉 PERFECT — all ${total} variables have real values!${colors.reset}\n`);
  } else if (scoreReal >= 85 && partial > 0) {
    console.log(`${colors.yellow}🟡 ALMOST — ${partial} placeholder(s) need real values. Run ${colors.cyan}pnpm env:update${colors.yellow}.${colors.reset}\n`);
  } else if (scoreWithAutogen >= 90) {
    console.log(`${colors.green}✅ GOOD — run ${colors.cyan}pnpm env:update${colors.green} to complete setup.${colors.reset}\n`);
  } else if (scoreReal >= 70) {
    console.log(`${colors.yellow}⚠️  PARTIAL — some important variables are missing.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}🚨 CRITICAL — environment is not ready. Run ${colors.cyan}pnpm env:create${colors.red}.${colors.reset}\n`);
    process.exit(1);
  }
};

// ==================== HELP ====================
const printHelp = () => {
  console.log(`
${colors.cyan}🔐 AJKMart Environment Manager${colors.reset}
${'─'.repeat(45)}

${colors.green}Commands:${colors.reset}
  ${colors.cyan}create${colors.reset}     Create new encrypted environment
  ${colors.cyan}decrypt${colors.reset}    Decrypt & load existing environment
  ${colors.cyan}update${colors.reset}     Update variables or password
  ${colors.cyan}show${colors.reset}       View all variables (secrets masked)
  ${colors.cyan}verify${colors.reset}     Health-check report with score
  ${colors.cyan}export${colors.reset}     Generate .env.example (secrets redacted)
  ${colors.cyan}reset${colors.reset}      Delete & start fresh (with backup)
  ${colors.cyan}help${colors.reset}       Show this help

${colors.green}Usage via pnpm:${colors.reset}
  ${colors.yellow}pnpm env:create${colors.reset}
  ${colors.yellow}pnpm env:decrypt${colors.reset}
  ${colors.yellow}pnpm env:update${colors.reset}
  ${colors.yellow}pnpm env:show${colors.reset}
  ${colors.yellow}pnpm env:verify${colors.reset}
  ${colors.yellow}pnpm env:export${colors.reset}
  ${colors.yellow}pnpm env:reset${colors.reset}

${colors.green}Direct usage:${colors.reset}
  ${colors.yellow}node scripts/env-manager.mjs create${colors.reset}
  ${colors.yellow}node scripts/env-manager.mjs decrypt${colors.reset}
  ${colors.yellow}node scripts/env-manager.mjs update${colors.reset}

${colors.yellow}Note:${colors.reset} Running without command defaults to 'decrypt'

${colors.green}Security:${colors.reset}
  AES-256-GCM encryption, scrypt key derivation
  Max ${MAX_ATTEMPTS} attempts before lockout
  Secrets auto-masked in display
  Auto-backup on reset
`);
};

// ==================== MAIN ====================
const main = async () => {
  const command = process.argv[2]?.toLowerCase();

  switch (command) {
    case 'create':
    case 'new':
    case 'init':
      await createCommand();
      break;

    case 'decrypt':
    case 'open':
    case 'unlock':
    case undefined:
    case '':
      await decryptCommand();
      break;

    case 'update':
    case 'edit':
    case 'modify':
      await updateCommand();
      break;

    case 'reset':
    case 'delete':
    case 'clean':
      await resetCommand();
      break;

    case 'show':
    case 'view':
    case 'list':
      await showCommand();
      break;

    case 'verify':
    case 'check':
    case 'health':
    case 'status':
      await verifyCommand();
      break;

    case 'export':
    case 'example':
    case 'template':
      await exportCommand();
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      console.log(`\n${colors.red}Unknown command: ${command}${colors.reset}\n`);
      printHelp();
  }
};

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
  process.exit(1);
});
