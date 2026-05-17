const fs = require('fs');
const https = require('https');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

const GITHUB_REPO = process.env.GITHUB_REPO || 'CKissinger1988/RemoteADB';
const BACKEND_ASSET_PATTERN = /^remote-adb-windows-v[\d.]+\.zip$/;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let _pendingUpdate = null;
let _checkTimer = null;

function getCurrentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function httpsGet(url, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'RemoteADB-Updater',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: 10000 // Native timeout handling
    };
    const req = https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 5) {
        return httpsGet(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function httpsDownload(url, destPath, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'RemoteADB-Updater' } };
    const req = https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectCount < 10) {
        return httpsDownload(res.headers.location, destPath, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

async function checkForUpdate() {
  try {
    const { statusCode, body } = await httpsGet(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (statusCode !== 200 || !body || !body.tag_name) return null;
    const current = getCurrentVersion();
    const latest = body.tag_name.replace(/^v/, '');
    if (compareVersions(latest, current) <= 0) return null;
    const asset = (body.assets || []).find((a) => BACKEND_ASSET_PATTERN.test(a.name));
    return {
      current,
      latest,
      tag: body.tag_name,
      downloadUrl: asset ? asset.browser_download_url : null,
      releaseUrl: body.html_url,
    };
  } catch (err) {
    console.warn(`[updater] Check failed: ${err.message}`);
    return null;
  }
}

async function applyUpdate(downloadUrl) {
  const tmpDir = os.tmpdir();
  const zipPath = path.join(tmpDir, 'remoteadb-update.zip');
  const extractDir = path.join(tmpDir, 'remoteadb-update');
  const installDir = path.resolve(path.join(__dirname, '..', '..'));

  console.log('[updater] Downloading update...');
  await httpsDownload(downloadUrl, zipPath);
  console.log('[updater] Extracting...');

  await new Promise((resolve, reject) => {
    const cmd = `if (Test-Path '${extractDir}') { Remove-Item -Recurse -Force '${extractDir}' }; Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`;

    execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { timeout: 60000 }, (err) => {
      if (err) return reject(new Error(`Extraction failed: ${err.message}`));
      resolve();
    });
  });

  console.log('[updater] Copying files...');
  await new Promise((resolve, reject) => {
    const cmd = `xcopy /s /e /y /i "${extractDir}\\*" "${installDir}\\"`;

    execFile('cmd.exe', ['/c', cmd], { timeout: 30000 }, (err) => {
      if (err) return reject(new Error(`Copy failed: ${err.message}`));
      resolve();
    });
  });

  fs.unlink(zipPath, () => {});
  console.log('[updater] Update applied. Restarting...');

  execFile('schtasks', ['/run', '/tn', 'RemoteADBServer'], (err) => {
    const child = spawn(process.execPath, process.argv.slice(1), {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    });
    child.unref();
    setTimeout(() => process.exit(0), 500);
  });
}

function startUpdateChecker() {
  async function run() {
    const update = await checkForUpdate();
    _pendingUpdate = update;
    if (update) {
      console.log(`[updater] Update available: v${update.current} -> v${update.latest} — ${update.releaseUrl}`);
    }
  }
  run();
  _checkTimer = setInterval(run, CHECK_INTERVAL_MS);
  if (_checkTimer.unref) _checkTimer.unref();
}

function getPendingUpdate() {
  return _pendingUpdate;
}

module.exports = { startUpdateChecker, getPendingUpdate, checkForUpdate, applyUpdate, getCurrentVersion };
