/**
 * RemoteADB — Secure Tunnel Manager
 *
 * Supports:
 *   - Cloudflare Quick Tunnel (free, no account, auto-downloads cloudflared binary)
 *   - ngrok (requires NGROK_AUTHTOKEN env var or auth token passed at start)
 */
'use strict';

const { spawn }   = require('child_process');
const https       = require('https');
const http        = require('http');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');

// ─── cloudflared binary locations ────────────────────────────────────────────

const CLOUDFLARED_URLS = {
  win32:  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe',
  linux:  'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
  darwin: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz',
};

const BIN_DIR  = path.join(os.homedir(), '.remoteadb', 'bin');
const BIN_NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);

// ─── state ────────────────────────────────────────────────────────────────────

let _proc    = null;   // ChildProcess or { kill: fn } for ngrok
let _url     = null;   // active tunnel URL
let _type    = null;   // 'cloudflare' | 'ngrok'
let _status  = 'idle'; // idle | starting | active | stopping | error
let _error   = null;

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Download a file following redirects (no external deps).
 */
function download(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'RemoteADB-Tunnel/1.1' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, destPath, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode} from ${url}`));
      }
      const tmp = destPath + '.tmp';
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        fs.rename(tmp, destPath, (err) => err ? reject(err) : resolve());
      }));
      file.on('error', (err) => { fs.unlink(tmp, () => {}); reject(err); });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error('Download timed out')); });
  });
}

/**
 * Ensure the cloudflared binary is present; download it if not.
 */
async function ensureCloudflared() {
  if (fs.existsSync(BIN_PATH)) return BIN_PATH;
  const url = CLOUDFLARED_URLS[process.platform];
  if (!url) throw new Error(`cloudflared does not support platform: ${process.platform}`);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log('[tunnel] Downloading cloudflared binary from GitHub...');
  await download(url, BIN_PATH);
  if (process.platform !== 'win32') fs.chmodSync(BIN_PATH, '755');
  console.log('[tunnel] cloudflared ready at', BIN_PATH);
  return BIN_PATH;
}

// ─── Cloudflare Quick Tunnel ──────────────────────────────────────────────────

function startCloudflare(port) {
  return new Promise(async (resolve, reject) => {
    let binPath;
    try {
      binPath = await ensureCloudflared();
    } catch (err) {
      return reject(new Error(`Could not obtain cloudflared: ${err.message}`));
    }

    const args = [
      'tunnel', '--url', `http://127.0.0.1:${port}`,
      '--no-autoupdate',
      '--logfile', path.join(os.tmpdir(), 'cloudflared-remoteadb.log'),
    ];

    _proc = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    // cloudflared prints the URL to stderr
    const TIMEOUT_MS = 45000;
    const timer = setTimeout(() => {
      if (_proc) _proc.kill('SIGKILL');
      reject(new Error('Tunnel did not start within 45 s — check your internet connection'));
    }, TIMEOUT_MS);

    const urlPattern = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

    const onData = (chunk) => {
      const text = chunk.toString();
      const m = text.match(urlPattern);
      if (m && !_url) {
        clearTimeout(timer);
        _url    = m[0];
        _status = 'active';
        resolve(_url);
      }
    };

    _proc.stdout.on('data', onData);
    _proc.stderr.on('data', onData);

    _proc.on('exit', (code, signal) => {
      _proc   = null;
      _url    = null;
      _status = 'idle';
      console.log(`[tunnel] cloudflared exited (code=${code} signal=${signal})`);
    });

    _proc.on('error', (err) => {
      clearTimeout(timer);
      _status = 'error';
      _error  = err.message;
      reject(err);
    });
  });
}

// ─── ngrok ────────────────────────────────────────────────────────────────────

async function startNgrok(port, authToken) {
  let ngrok;
  try {
    ngrok = require('@ngrok/ngrok'); // optional peer dep
  } catch {
    throw new Error(
      'ngrok support requires the @ngrok/ngrok package.\n' +
      'Run: npm install @ngrok/ngrok   in Remote-ADB-Back/'
    );
  }

  const token = authToken || process.env.NGROK_AUTHTOKEN;
  if (!token) {
    throw new Error(
      'ngrok requires an auth token. Set NGROK_AUTHTOKEN env var or pass it in the request body.'
    );
  }

  const listener = await ngrok.forward({ addr: port, authtoken: token });
  _url    = listener.url();
  _status = 'active';
  _type   = 'ngrok';
  // Wrap disconnect so stop() works uniformly
  _proc   = { kill: () => ngrok.disconnect(_url).catch(() => {}) };
  return _url;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a tunnel.
 * @param {{ type?: 'cloudflare'|'ngrok', port?: number, authToken?: string }} options
 * @returns {Promise<string>} The public HTTPS URL.
 */
async function start(options = {}) {
  if (_status === 'active' || _status === 'starting') {
    throw new Error('A tunnel is already running. Stop it first.');
  }

  const type = options.type || 'cloudflare';
  const port = options.port || Number(process.env.PORT) || 5200;

  _status = 'starting';
  _error  = null;
  _type   = type;

  try {
    if (type === 'cloudflare') {
      await startCloudflare(port);
    } else if (type === 'ngrok') {
      await startNgrok(port, options.authToken);
    } else {
      throw new Error(`Unknown tunnel provider: "${type}". Use "cloudflare" or "ngrok".`);
    }
    console.log(`[tunnel] Active: ${_url} (${_type})`);
    return _url;
  } catch (err) {
    _status = 'error';
    _error  = err.message;
    _type   = null;
    throw err;
  }
}

/**
 * Stop the active tunnel.
 */
function stop() {
  if (_proc) {
    try { _proc.kill(); } catch (_) {}
    _proc = null;
  }
  _url    = null;
  _status = 'idle';
  _type   = null;
  _error  = null;
  console.log('[tunnel] Stopped.');
}

/**
 * Return current tunnel state.
 */
function status() {
  return {
    active:  _status === 'active',
    status:  _status,
    url:     _url,
    type:    _type,
    error:   _error,
    binPath: fs.existsSync(BIN_PATH) ? BIN_PATH : null,
  };
}

module.exports = { start, stop, status };
