const { contextBridge } = require('electron');
const http = require('http');

const BACKEND_PORT = 5200;
const BACKEND_HOST = '127.0.0.1';

function apiPost(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve({ output: raw });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

contextBridge.exposeInMainWorld('adb', {
  connect: async (deviceId) => {
    try {
      const result = await apiPost('/connect', { deviceId });
      if (result.status === 'ok') {
        const ids = (result.devices || []).map((d) => d.id).join(', ');
        return `Connected. Active devices: ${ids || 'none'}`;
      }
      return `Error: ${result.message || 'Connection failed.'}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  disconnect: async () => {
    try {
      const result = await apiPost('/disconnect', {});
      if (result.status === 'ok') return 'Disconnected. Reverse forwarding removed.';
      return `Error: ${result.message || 'Disconnect failed.'}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  shellCommand: async (command) => {
    try {
      const result = await apiPost('/shell', { command });
      return result.output || result.message || '(no output)';
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
});
