const statusLog = document.getElementById('statusLog');
const backendStatusLabel = document.getElementById('backendStatus');
const deviceStateLabel = document.getElementById('deviceState');
const deviceIdInput = document.getElementById('deviceId');
const commandInput = document.getElementById('commandInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const sendCommandBtn = document.getElementById('sendCommandBtn');
const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
const installAdbBtn = document.getElementById('installAdbBtn');
const installStatusLabel = document.getElementById('installStatus');
const installBanner = document.getElementById('installBanner');
const autoConnectToggle = document.getElementById('autoConnectToggle');
const deviceList = document.getElementById('deviceList');
const filePathInput = document.getElementById('filePathInput');
const browseFilesBtn = document.getElementById('browseFilesBtn');
const remoteFileList = document.getElementById('remoteFileList');
const uploadFileInput = document.getElementById('uploadFileInput');
const uploadFileBtn = document.getElementById('uploadFileBtn');
const currentPathLabel = document.getElementById('currentPathLabel');
const fileManagerStatusLabel = document.getElementById('fileManagerStatus');
const refreshScreenBtn = document.getElementById('refreshScreenBtn');
const tapBtn = document.getElementById('tapBtn');
const swipeBtn = document.getElementById('swipeBtn');
const tapXInput = document.getElementById('tapX');
const tapYInput = document.getElementById('tapY');
const swipeFromInput = document.getElementById('swipeFrom');
const swipeToInput = document.getElementById('swipeTo');
const screenPreview = document.getElementById('screenPreview');

const backendUrl = (window.location && window.location.protocol && window.location.protocol.startsWith('http'))
  ? `${window.location.protocol}//${window.location.host}`
  : 'http://127.0.0.1:5200';
let isConnected = false;
let currentDeviceId = '';
let currentRemotePath = '/sdcard';
let adbInstalled = false;
let autoConnectEnabled = localStorage.getItem('adbAutoConnectEnabled') === 'true';
let autoConnectDevices = new Set(JSON.parse(localStorage.getItem('adbAutoConnectDevices') || '[]'));

function appendStatus(message) {
  statusLog.textContent += `\n${new Date().toLocaleTimeString()} - ${message}`;
  statusLog.scrollTop = statusLog.scrollHeight;
}

function setBackendStatus(text, healthy = true) {
  backendStatusLabel.textContent = `Backend: ${text}`;
  backendStatusLabel.style.color = healthy ? '#a7f3d0' : '#fca5a5';
}

function setDeviceState(text) {
  deviceStateLabel.textContent = `Device: ${text}`;
}

function setInstallStatus(text, healthy = true) {
  installStatusLabel.textContent = text;
  installStatusLabel.style.color = healthy ? '#a7f3d0' : '#fca5a5';
}

function setInstallBanner(text, healthy = true) {
  if (!text) {
    installBanner.hidden = true;
    installBanner.textContent = '';
    return;
  }

  installBanner.hidden = false;
  installBanner.textContent = text;
  installBanner.style.color = healthy ? '#0f4727' : '#831010';
  installBanner.style.background = healthy ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)';
  installBanner.style.borderColor = healthy ? '#22c55e' : '#f87171';
}

function setFileManagerStatus(text, healthy = true) {
  fileManagerStatusLabel.textContent = text;
  fileManagerStatusLabel.style.color = healthy ? '#a7f3d0' : '#fca5a5';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSelectedDeviceId() {
  return currentDeviceId || deviceIdInput.value.trim() || undefined;
}

function updateConnectionButtons() {
  connectBtn.disabled = !adbInstalled || isConnected;
  installAdbBtn.disabled = adbInstalled;
}

function enableScreenControls(enabled) {
  refreshScreenBtn.disabled = !enabled;
  tapBtn.disabled = !enabled;
  swipeBtn.disabled = !enabled;
  sendCommandBtn.disabled = !enabled;
}

function showScreenPlaceholder() {
  screenPreview.style.backgroundImage = 'none';
  screenPreview.innerHTML = '<span class="screen-placeholder">Remote screen preview</span>';
  screenPreview.dataset.hasImage = 'false';
}

function updateScreenPreview(imageBase64) {
  if (imageBase64) {
    screenPreview.style.backgroundImage = `url('data:image/png;base64,${imageBase64}')`;
    screenPreview.innerHTML = '';
    screenPreview.dataset.hasImage = 'true';
  } else {
    showScreenPlaceholder();
  }
}

function parseCoordinates(value) {
  const [x, y] = value.split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${backendUrl}${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Fetch failed: ${response.status}`);
  }

  return response.json();
}

async function checkBackend() {
  try {
    const status = await apiFetch('/status');
    setBackendStatus('online');
    adbInstalled = status.adbInstalled;
    setInstallStatus(adbInstalled ? 'ADB installed' : 'ADB not installed', adbInstalled);
    updateConnectionButtons();
    return status.devices || [];
  } catch (error) {
    setBackendStatus('offline', false);
    setInstallStatus('Backend unreachable', false);
    appendStatus(`Backend unavailable: ${error.message}`);
    return [];
  }
}

function saveAutoConnectSettings() {
  localStorage.setItem('adbAutoConnectEnabled', autoConnectEnabled ? 'true' : 'false');
  localStorage.setItem('adbAutoConnectDevices', JSON.stringify(Array.from(autoConnectDevices)));
}

async function refreshDevices() {
  const devices = await checkBackend();
  renderDeviceList(devices);
  await maybeAutoConnect(devices);
  await loadRemoteFiles(currentRemotePath);
  return devices;
}

async function loadRemoteFiles(pathOverride) {
  const path = pathOverride || currentRemotePath;
  if (!adbInstalled) {
    setFileManagerStatus('Install ADB before browsing files.', false);
    remoteFileList.innerHTML = '<div class="device-row device-empty">ADB not installed.</div>';
    return;
  }

  setFileManagerStatus('Loading files...', true);
  try {
    const deviceId = getSelectedDeviceId();
    const query = new URLSearchParams({ path, deviceId });
    const response = await apiFetch(`/files/list?${query}`);
    currentRemotePath = response.path || path;
    currentPathLabel.textContent = `Path: ${currentRemotePath}`;
    filePathInput.value = currentRemotePath;
    renderRemoteFileList(response.items || []);
    setFileManagerStatus('Files loaded.', true);
  } catch (error) {
    setFileManagerStatus(`Browse failed: ${error.message}`, false);
    remoteFileList.innerHTML = '<div class="device-row device-empty">Unable to load files.</div>';
  }
}

function renderRemoteFileList(items) {
  if (!items || items.length === 0) {
    remoteFileList.innerHTML = '<div class="device-row device-empty">No files found.</div>';
    return;
  }

  remoteFileList.innerHTML = items
    .map((item) => {
      const escapedPath = escapeHtml(item.path);
      const escapedName = escapeHtml(item.name);
      const displaySize = item.size != null ? `${item.size} bytes` : '';
      return `
        <div class="device-row">
          <div class="file-name">
            <strong>${escapedName}</strong>
            <span class="file-type">${item.type === 'dir' ? 'Directory' : 'File'} ${displaySize}</span>
          </div>
          <button class="file-action-button" data-path="${escapedPath}" data-type="${item.type}">
            ${item.type === 'dir' ? 'Open' : 'Download'}
          </button>
        </div>`;
    })
    .join('');
}

async function downloadRemoteFile(path, fileName) {
  if (!adbInstalled) {
    setFileManagerStatus('Install ADB before downloading files.', false);
    return;
  }

  setFileManagerStatus(`Downloading ${fileName}...`, true);
  try {
    const deviceId = getSelectedDeviceId();
    const query = new URLSearchParams({ path, deviceId });
    const response = await apiFetch(`/files/download?${query}`);
    const binary = Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0));
    const blob = new Blob([binary]);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = response.name || fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setFileManagerStatus(`Downloaded ${response.name || fileName}.`, true);
  } catch (error) {
    setFileManagerStatus(`Download failed: ${error.message}`, false);
  }
}

async function uploadRemoteFile() {
  if (!adbInstalled) {
    setFileManagerStatus('Install ADB before uploading files.', false);
    return;
  }

  const file = uploadFileInput.files[0];
  if (!file) {
    setFileManagerStatus('Select a file to upload.', false);
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    setFileManagerStatus(`Uploading ${file.name}...`, true);
    try {
      const deviceId = getSelectedDeviceId();
      const response = await apiFetch('/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          deviceId,
          path: currentRemotePath,
          fileName: file.name,
          data: base64,
        }),
      });
      setFileManagerStatus(response.message || `Uploaded ${file.name}.`, true);
      await loadRemoteFiles(currentRemotePath);
    } catch (error) {
      setFileManagerStatus(`Upload failed: ${error.message}`, false);
    }
  };

  reader.onerror = () => setFileManagerStatus('Unable to read selected file.', false);
  reader.readAsDataURL(file);
}

async function installAdb() {
  appendStatus('Requesting ADB installation...');
  setInstallStatus('Installing ADB...', true);
  installAdbBtn.disabled = true;

  try {
    const response = await apiFetch('/install', { method: 'POST' });
    adbInstalled = !!response.adbInstalled;
    const message = response.message || (adbInstalled ? 'ADB installed successfully.' : 'ADB installation completed, but ADB is not available.');
    setInstallStatus(message, adbInstalled);
    setInstallBanner(message, adbInstalled);
    appendStatus(message);
    updateConnectionButtons();
    await refreshDevices();
  } catch (error) {
    const message = error.message || 'ADB install failed.';
    setInstallStatus(message, false);
    setInstallBanner(message, false);
    appendStatus(`Install failed: ${message}`);
  } finally {
    updateConnectionButtons();
    installAdbBtn.disabled = adbInstalled;
  }
}

async function maybeAutoConnect(devices) {
  if (!autoConnectEnabled || !adbInstalled || isConnected || !devices || devices.length === 0) {
    return;
  }

  const autoDevices = devices.filter((device) => autoConnectDevices.has(device.id) && device.status === 'device');
  if (autoDevices.length === 0) {
    return;
  }

  const bestDevice = autoDevices[0];
  appendStatus(`Auto-connecting to ${bestDevice.id}...`);
  await connectDevice(bestDevice.id);
}

function renderDeviceList(devices) {
  if (!adbInstalled) {
    deviceList.innerHTML = '<div class="device-row device-empty">ADB not installed. Click Install ADB to continue.</div>';
    return;
  }

  if (!devices || devices.length === 0) {
    deviceList.innerHTML = '<div class="device-row device-empty">No devices found.</div>';
    return;
  }

  deviceList.innerHTML = devices
    .map((device) => {
      const checked = autoConnectDevices.has(device.id) ? 'checked' : '';
      return `
        <div class="device-row">
          <label class="device-checkbox">
            <input type="checkbox" class="device-auto-checkbox" data-device-id="${device.id}" ${checked} />
            Auto
          </label>
          <div class="device-meta">
            <span class="device-id">${device.id}</span>
            <span class="device-status ${device.status === 'device' ? 'online' : 'offline'}">${device.status}</span>
          </div>
          <button class="device-connect-button" data-device-id="${device.id}">Connect</button>
        </div>`;
    })
    .join('');
}

async function connectDevice(deviceIdOverride) {
  if (!adbInstalled) {
    appendStatus('ADB is not installed yet. Please install ADB first.');
    return;
  }

  const deviceId = deviceIdOverride || deviceIdInput.value.trim() || undefined;

  appendStatus('Connecting to backend...');
  try {
    const response = await apiFetch('/connect', {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });

    if (!response.devices || response.devices.length === 0) {
      appendStatus('No device found.');
      return;
    }

    currentDeviceId = response.devices[0].id;
    isConnected = true;
    setDeviceState(`${currentDeviceId} connected`);
    setBackendStatus('online');
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    enableScreenControls(true);
    appendStatus(`Connected to ${currentDeviceId}. Reverse forwarding configured.`);
    await refreshDevices();
    await refreshScreen();
  } catch (error) {
    appendStatus(`Connect failed: ${error.message}`);
    setBackendStatus('offline', false);
    connectBtn.disabled = false;
  }
}

async function disconnectDevice() {
  appendStatus('Disconnecting...');
  try {
    await apiFetch('/disconnect', { method: 'POST' });
    appendStatus('Reverse forwarding removed.');
  } catch (error) {
    appendStatus(`Disconnect failed: ${error.message}`);
  }

  isConnected = false;
  currentDeviceId = '';
  setDeviceState('disconnected');
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  enableScreenControls(false);
  showScreenPlaceholder();
}

async function refreshScreen() {
  if (!isConnected) {
    appendStatus('Connect first to refresh the screen.');
    return;
  }

  appendStatus('Refreshing remote screen...');
  try {
    const response = await apiFetch(`/screen?deviceId=${encodeURIComponent(currentDeviceId)}`);
    updateScreenPreview(response.image);
    appendStatus('Remote screen updated.');
  } catch (error) {
    appendStatus(`Screen refresh failed: ${error.message}`);
    showScreenPlaceholder();
  }
}

async function sendShellCommand(command) {
  appendStatus(`Running shell command: ${command}`);
  try {
    const response = await apiFetch('/shell', {
      method: 'POST',
      body: JSON.stringify({ deviceId: currentDeviceId || undefined, command }),
    });
    appendStatus(response.output || 'Command executed.');
  } catch (error) {
    appendStatus(`Shell command failed: ${error.message}`);
  }
}

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  await connectDevice();
});

disconnectBtn.addEventListener('click', async () => {
  await disconnectDevice();
});

refreshDevicesBtn.addEventListener('click', async () => {
  await refreshDevices();
});

installAdbBtn.addEventListener('click', async () => {
  await installAdb();
});

browseFilesBtn.addEventListener('click', async () => {
  const path = filePathInput.value.trim() || currentRemotePath;
  await loadRemoteFiles(path);
});

uploadFileBtn.addEventListener('click', async () => {
  await uploadRemoteFile();
});

autoConnectToggle.addEventListener('change', (event) => {
  autoConnectEnabled = event.target.checked;
  saveAutoConnectSettings();
});

deviceList.addEventListener('change', (event) => {
  if (!event.target.matches('.device-auto-checkbox')) return;
  const deviceId = event.target.dataset.deviceId;
  if (!deviceId) return;
  if (event.target.checked) {
    autoConnectDevices.add(deviceId);
  } else {
    autoConnectDevices.delete(deviceId);
  }
  saveAutoConnectSettings();
});

deviceList.addEventListener('click', async (event) => {
  if (!event.target.matches('.device-connect-button')) return;
  const deviceId = event.target.dataset.deviceId;
  if (!deviceId) return;
  deviceIdInput.value = deviceId;
  await connectDevice(deviceId);
});

remoteFileList.addEventListener('click', async (event) => {
  if (!event.target.matches('.file-action-button')) return;
  const filePath = event.target.dataset.path;
  const fileType = event.target.dataset.type;
  if (!filePath || !fileType) return;

  if (fileType === 'dir') {
    await loadRemoteFiles(filePath);
  } else {
    const fileName = filePath.split('/').pop();
    await downloadRemoteFile(filePath, fileName);
  }
});

sendCommandBtn.addEventListener('click', async () => {
  const command = commandInput.value.trim();
  if (!command) {
    appendStatus('Please enter an ADB command.');
    return;
  }

  await sendShellCommand(command);
});

refreshScreenBtn.addEventListener('click', async () => {
  await refreshScreen();
});

tapBtn.addEventListener('click', async () => {
  const x = Number(tapXInput.value.trim());
  const y = Number(tapYInput.value.trim());
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    appendStatus('Enter valid tap coordinates.');
    return;
  }

  await sendShellCommand(`input tap ${x} ${y}`);
});

swipeBtn.addEventListener('click', async () => {
  const from = parseCoordinates(swipeFromInput.value);
  const to = parseCoordinates(swipeToInput.value);
  if (!from || !to) {
    appendStatus('Enter swipe coordinates in x1,y1 and x2,y2 format.');
    return;
  }

  await sendShellCommand(`input swipe ${from.x} ${from.y} ${to.x} ${to.y} 250`);
});

screenPreview.addEventListener('click', async (event) => {
  if (!isConnected) {
    appendStatus('Connect first to interact with the screen.');
    return;
  }

  const rect = screenPreview.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 1080);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 1920);
  await sendShellCommand(`input tap ${x} ${y}`);
});

async function pollDevices() {
  if (isConnected) return;
  const devices = await checkBackend();
  renderDeviceList(devices);
  await maybeAutoConnect(devices);
}

autoConnectToggle.checked = autoConnectEnabled;
filePathInput.value = currentRemotePath;
enableScreenControls(false);
showScreenPlaceholder();
updateConnectionButtons();
refreshDevices();
setInterval(pollDevices, 5000);
