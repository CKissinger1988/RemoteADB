const statusLog = document.getElementById("statusLog");
const backendStatusLabel = document.getElementById("backendStatus");
const deviceStateLabel = document.getElementById("deviceState");
const deviceIdInput = document.getElementById("deviceId");
const commandInput = document.getElementById("commandInput");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const sendCommandBtn = document.getElementById("sendCommandBtn");
const refreshDevicesBtn = document.getElementById("refreshDevicesBtn");
const installAdbBtn = document.getElementById("installAdbBtn");
const installStatusLabel = document.getElementById("installStatus");
const installBanner = document.getElementById("installBanner");
const autoConnectToggle = document.getElementById("autoConnectToggle");
const deviceList = document.getElementById("deviceList");
const filePathInput = document.getElementById("filePathInput");
const browseFilesBtn = document.getElementById("browseFilesBtn");
const remoteFileList = document.getElementById("remoteFileList");
const uploadFileInput = document.getElementById("uploadFileInput");
const uploadFileBtn = document.getElementById("uploadFileBtn");
const uploadProgressContainer = document.getElementById(
  "uploadProgressContainer",
);
const uploadProgressBar = document.getElementById("uploadProgressBar");
const uploadProgressText = document.getElementById("uploadProgressText");
const cancelUploadBtn = document.getElementById("cancelUploadBtn");
const fileManagerPanel = document.getElementById("fileManagerPanel");
const currentPathLabel = document.getElementById("currentPathLabel");
const fileManagerStatusLabel = document.getElementById("fileManagerStatus");
const refreshScreenBtn = document.getElementById("refreshScreenBtn");
const wakeUpBtn = document.getElementById("wakeUpBtn");
// tapBtn, swipeBtn, tapXInput, tapYInput, swipeFromInput, swipeToInput removed —
// the coordinate-input tap/swipe UI was removed from index.html; screen tap now
// works exclusively through the screenPreview click-to-tap handler below.
const tapBtn = null;
const swipeBtn = null;
const tapXInput = null;
const tapYInput = null;
const swipeFromInput = null;
const swipeToInput = null;
const screenPreview = document.getElementById("screenPreview");
const terminalOutput = document.getElementById("terminalOutput");
const clearTerminalBtn = document.getElementById("clearTerminalBtn");

const versionLabel = document.getElementById("versionLabel");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");
const applyUpdateBtn = document.getElementById("applyUpdateBtn");
const updateNotification = document.getElementById("updateNotification");
const themeToggle = document.getElementById("themeToggle");

const openCameraBtn = document.getElementById("openCameraBtn");
const takePhotoBtn = document.getElementById("takePhotoBtn");
const getLatestPhotoBtn = document.getElementById("getLatestPhotoBtn");
const recordVideoBtn = document.getElementById("recordVideoBtn");
const stopVideoBtn = document.getElementById("stopVideoBtn");

const recordMicBtn = document.getElementById("recordMicBtn");
const micDurationInput = document.getElementById("micDuration");

// Tunnel UI elements
const tunnelTypeSelect = document.getElementById("tunnelTypeSelect");
const tunnelStartBtn = document.getElementById("tunnelStartBtn");
const tunnelStopBtn = document.getElementById("tunnelStopBtn");
const tunnelStatusLabel = document.getElementById("tunnelStatusLabel");
const tunnelActivePanel = document.getElementById("tunnelActivePanel");
const tunnelUrlDisplay = document.getElementById("tunnelUrlDisplay");
const tunnelCopyBtn = document.getElementById("tunnelCopyBtn");
const tunnelQrCode = document.getElementById("tunnelQrCode");
const tunnelAuthWarning = document.getElementById("tunnelAuthWarning");
const ngrokTokenRow = document.getElementById("ngrokTokenRow");
const ngrokTokenInput = document.getElementById("ngrokToken");

const backendUrl =
  window.location &&
  window.location.protocol &&
  window.location.protocol.startsWith("http")
    ? `${window.location.protocol}//${window.location.host}`
    : "http://127.0.0.1:5200";
let isConnected = false;
let currentDeviceId = "";
let currentRemotePath = "/sdcard";
let currentUploadXhr = null;
let deviceResolution = { x: 1080, y: 1920 };
let adbInstalled = false;
let autoConnectEnabled =
  localStorage.getItem("adbAutoConnectEnabled") === "true";
let autoConnectDevices = new Set(
  JSON.parse(localStorage.getItem("adbAutoConnectDevices") || "[]"),
);

function appendStatus(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">[${timestamp}]</span><span class="log-msg">${escapeHtml(message)}</span>`;
  statusLog.appendChild(entry);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function setBackendStatus(text, healthy = true) {
  backendStatusLabel.textContent = `Backend: ${text}`;
  backendStatusLabel.style.color = healthy ? "#a7f3d0" : "#fca5a5";
}

function setDeviceState(text) {
  deviceStateLabel.textContent = `Device: ${text}`;
}

function setInstallStatus(text, healthy = true) {
  installStatusLabel.textContent = text;
  installStatusLabel.style.color = healthy ? "#a7f3d0" : "#fca5a5";
}

function setInstallBanner(text, healthy = true) {
  if (!text) {
    installBanner.hidden = true;
    installBanner.textContent = "";
    return;
  }

  installBanner.hidden = false;
  installBanner.textContent = text;
  installBanner.style.color = healthy ? "#0f4727" : "#831010";
  installBanner.style.background = healthy
    ? "rgba(52,211,153,0.12)"
    : "rgba(248,113,113,0.12)";
  installBanner.style.borderColor = healthy ? "#22c55e" : "#f87171";
}

function setFileManagerStatus(text, healthy = true) {
  fileManagerStatusLabel.textContent = text;
  fileManagerStatusLabel.style.color = healthy ? "#a7f3d0" : "#fca5a5";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSelectedDeviceId() {
  return currentDeviceId || deviceIdInput.value.trim() || undefined;
}

function setBusy(busy, elements = []) {
  elements.forEach((el) => {
    if (el) el.disabled = busy;
  });
}

function updateConnectionButtons() {
  connectBtn.disabled = !adbInstalled || isConnected;
  installAdbBtn.disabled = adbInstalled;
}

function enableScreenControls(enabled) {
  refreshScreenBtn.disabled = !enabled;
  if (wakeUpBtn) wakeUpBtn.disabled = !enabled;
  if (tapBtn) tapBtn.disabled = !enabled;
  if (swipeBtn) swipeBtn.disabled = !enabled;
  sendCommandBtn.disabled = !enabled;
  commandInput.disabled = !enabled;
  if (openCameraBtn) openCameraBtn.disabled = !enabled;
  if (takePhotoBtn) takePhotoBtn.disabled = !enabled;
  if (getLatestPhotoBtn) getLatestPhotoBtn.disabled = !enabled;
  if (recordVideoBtn) recordVideoBtn.disabled = !enabled;
  if (stopVideoBtn) stopVideoBtn.disabled = true;
  if (recordMicBtn) recordMicBtn.disabled = !enabled;
}

function showScreenPlaceholder() {
  screenPreview.style.backgroundImage = "none";
  screenPreview.innerHTML =
    '<span class="screen-placeholder">Remote screen preview</span>';
  screenPreview.dataset.hasImage = "false";
}

function updateScreenPreview(imageBase64) {
  if (imageBase64) {
    screenPreview.style.backgroundImage = `url('data:image/png;base64,${imageBase64}')`;
    screenPreview.innerHTML = "";
    screenPreview.dataset.hasImage = "true";
  } else {
    showScreenPlaceholder();
  }
}

function parseCoordinates(value) {
  const [x, y] = value.split(",").map((part) => Number(part.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${backendUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
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
    const status = await apiFetch("/status");
    setBackendStatus("online");
    adbInstalled = status.adbInstalled;
    setInstallStatus(
      adbInstalled ? "ADB installed" : "ADB not installed",
      adbInstalled,
    );

    if (!adbInstalled) {
      setInstallBanner(
        'ADB is missing on the host. Please click "Install ADB" to set up the environment.',
        false,
      );
    } else if (installBanner.textContent.includes("missing")) {
      setInstallBanner(null);
    }

    updateConnectionButtons();
    return status.devices || [];
  } catch (error) {
    setBackendStatus("offline", false);
    setInstallStatus("Backend unreachable", false);
    appendStatus(`Backend unavailable: ${error.message}`);
    return [];
  }
}

function saveAutoConnectSettings() {
  localStorage.setItem(
    "adbAutoConnectEnabled",
    autoConnectEnabled ? "true" : "false",
  );
  localStorage.setItem(
    "adbAutoConnectDevices",
    JSON.stringify(Array.from(autoConnectDevices)),
  );
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
    setFileManagerStatus("Install ADB before browsing files.", false);
    remoteFileList.innerHTML =
      '<div class="device-row device-empty">ADB not installed.</div>';
    return;
  }

  setFileManagerStatus("Loading files...", true);
  try {
    const deviceId = getSelectedDeviceId();
    const query = new URLSearchParams({ path, deviceId });
    const response = await apiFetch(`/files/list?${query}`);
    currentRemotePath = response.path || path;
    currentPathLabel.textContent = `Path: ${currentRemotePath}`;
    filePathInput.value = currentRemotePath;
    renderRemoteFileList(response.items || []);
    setFileManagerStatus("Files loaded.", true);
  } catch (error) {
    setFileManagerStatus(`Browse failed: ${error.message}`, false);
    remoteFileList.innerHTML =
      '<div class="device-row device-empty">Unable to load files.</div>';
  }
}

function renderRemoteFileList(items) {
  if (!items || items.length === 0) {
    remoteFileList.innerHTML =
      '<div class="device-row device-empty">No files found.</div>';
    return;
  }

  remoteFileList.innerHTML = items
    .map((item) => {
      const escapedPath = escapeHtml(item.path);
      const escapedName = escapeHtml(item.name);
      const displaySize = item.size != null ? `${item.size} bytes` : "";
      const isDir = item.type === "dir";
      const icon = isDir ? "📁" : "📄";
      const size =
        item.size != null ? `(${(item.size / 1024).toFixed(1)} KB)` : "";

      return `
        <div class="file-item card">
          <span class="file-icon">${icon}</span>
          <div class="file-name">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${size}</small>
          </div>
          <button class="btn-small file-action-button" data-path="${escapeHtml(item.path)}" data-type="${item.type}">
            ${isDir ? "Open" : "Download"}
          </button>
        </div>`;
    })
    .join("");
}

async function downloadRemoteFile(path, fileName) {
  if (!adbInstalled) {
    setFileManagerStatus("Install ADB before downloading files.", false);
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
    const anchor = document.createElement("a");
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

function uploadRemoteFile(fileOverride) {
  if (!adbInstalled) {
    setFileManagerStatus("Install ADB before uploading files.", false);
    return;
  }

  const file = fileOverride || uploadFileInput.files[0];
  if (!file) {
    setFileManagerStatus("Select a file to upload.", false);
    return;
  }

  setBusy(true, [uploadFileBtn]);
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(",")[1];
    const deviceId = getSelectedDeviceId();
    const payload = JSON.stringify({
      deviceId,
      path: currentRemotePath,
      fileName: file.name,
      data: base64,
    });

    // Show and reset progress bar
    uploadProgressContainer.hidden = false;
    uploadProgressBar.style.width = "0%";
    uploadProgressText.textContent = "0%";
    setFileManagerStatus(`Uploading ${file.name}...`, true);

    const xhr = new XMLHttpRequest();
    currentUploadXhr = xhr;
    xhr.open("POST", `${backendUrl}/files/upload`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        uploadProgressBar.style.width = percent + "%";
        uploadProgressText.textContent = percent + "%";
      }
    };

    xhr.onabort = () => {
      currentUploadXhr = null;
      uploadProgressContainer.hidden = true;
      setBusy(false, [uploadFileBtn]);
      setFileManagerStatus("Upload cancelled.", false);
      appendStatus("File upload cancelled by user.", "warn");
    };

    xhr.onload = async () => {
      currentUploadXhr = null;
      uploadProgressContainer.hidden = true;
      setBusy(false, [uploadFileBtn]);
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        setFileManagerStatus(
          response.message || `Uploaded ${file.name}.`,
          true,
        );
        await loadRemoteFiles(currentRemotePath);
      } else {
        setFileManagerStatus(`Upload failed: ${xhr.statusText}`, false);
      }
    };

    xhr.onerror = () => {
      currentUploadXhr = null;
      uploadProgressContainer.hidden = true;
      setBusy(false, [uploadFileBtn]);
      setFileManagerStatus("Upload failed: Network error", false);
    };

    xhr.send(payload);
  };

  reader.onerror = () =>
    setFileManagerStatus("Unable to read selected file.", false);
  reader.readAsDataURL(file);
}

async function installAdb() {
  appendStatus("Requesting ADB installation...");
  setInstallStatus("Installing ADB...", true);
  installAdbBtn.disabled = true;

  try {
    const response = await apiFetch("/install", { method: "POST" });
    adbInstalled = !!response.adbInstalled;
    const message =
      response.message ||
      (adbInstalled
        ? "ADB installed successfully."
        : "ADB installation completed, but ADB is not available.");
    setInstallStatus(message, adbInstalled ? "success" : "error");
    setInstallBanner(message, adbInstalled);
    appendStatus(message, adbInstalled ? "success" : "warn");
    updateConnectionButtons();
    await refreshDevices();
  } catch (error) {
    const message = error.message || "ADB install failed.";
    setInstallStatus(message, "error");
    setInstallBanner(message, false);
    appendStatus(`Install failed: ${message}`);
  } finally {
    updateConnectionButtons();
    installAdbBtn.disabled = adbInstalled;
  }
}

async function maybeAutoConnect(devices) {
  if (
    !autoConnectEnabled ||
    !adbInstalled ||
    isConnected ||
    !devices ||
    devices.length === 0
  ) {
    return;
  }

  const autoDevices = devices.filter(
    (device) => autoConnectDevices.has(device.id) && device.status === "device",
  );
  if (autoDevices.length === 0) {
    return;
  }

  const bestDevice = autoDevices[0];
  appendStatus(`Auto-connecting to ${bestDevice.id}...`);
  await connectDevice(bestDevice.id);
}

function renderDeviceList(devices) {
  if (!adbInstalled) {
    deviceList.innerHTML =
      '<div class="device-row device-empty">ADB not installed. Click Install ADB to continue.</div>';
    return;
  }

  if (!devices || devices.length === 0) {
    deviceList.innerHTML =
      '<div class="device-row device-empty">No devices found.</div>';
    return;
  }

  deviceList.innerHTML = devices
    .map((device) => {
      const checked = autoConnectDevices.has(device.id) ? "checked" : "";
      const isOnline = device.status === "device";
      return `
        <div class="device-card card ${isOnline ? "border-online" : "border-offline"}">
          <div class="device-info">
            <div class="device-id">${escapeHtml(device.id)}</div>
            <div class="device-status-badge ${isOnline ? "bg-online" : "bg-offline"}">${device.status}</div>
          </div>
          <div class="device-actions">
             <input type="checkbox" class="device-auto-checkbox" data-device-id="${device.id}" ${autoConnectDevices.has(device.id) ? "checked" : ""} />
             <button class="btn-primary device-connect-button" data-device-id="${device.id}" ${!isOnline ? "disabled" : ""}>Connect</button>
          </div>
        </div>`;
    })
    .join("");
}

async function connectDevice(deviceIdOverride) {
  if (!adbInstalled) {
    appendStatus("ADB is not installed yet. Please install ADB first.");
    return;
  }

  const deviceId = deviceIdOverride || deviceIdInput.value.trim() || undefined;

  setBusy(true, [connectBtn]);
  appendStatus("Connecting to backend...");
  try {
    const response = await apiFetch("/connect", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    });

    if (!response.devices || response.devices.length === 0) {
      appendStatus("No device found.");
      return;
    }

    currentDeviceId = response.devices[0].id;
    isConnected = true;
    setDeviceState(`${currentDeviceId} connected`);
    setBackendStatus("online");
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    enableScreenControls(true);
    appendStatus(
      `Connected to ${currentDeviceId}. Reverse forwarding configured.`,
      "success",
    );
    await refreshDevices();
    await fetchDeviceResolution();
    await refreshScreen();
  } catch (error) {
    appendStatus(`Connect failed: ${error.message}`, "error");
    setBackendStatus("offline", false);
    connectBtn.disabled = false;
  } finally {
    setBusy(false, [connectBtn]);
  }
}

async function disconnectDevice() {
  appendStatus("Disconnecting...");
  try {
    await apiFetch("/disconnect", { method: "POST" });
    appendStatus("Reverse forwarding removed.");
  } catch (error) {
    appendStatus(`Disconnect failed: ${error.message}`);
  }

  isConnected = false;
  currentDeviceId = "";
  setDeviceState("disconnected");
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  enableScreenControls(false);
  showScreenPlaceholder();
}

async function fetchLatestPhoto() {
  if (!isConnected) return;
  appendStatus("Fetching latest photo from device...");
  try {
    const query = new URLSearchParams({ deviceId: currentDeviceId });
    const response = await apiFetch(`/camera/latest?${query}`);
    const binary = Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = response.name || "latest_photo.jpg";
    anchor.click();
    URL.revokeObjectURL(url);
    appendStatus(`Downloaded: ${response.name}`, "success");
  } catch (error) {
    appendStatus(`Failed to fetch photo: ${error.message}`, "error");
  }
}

async function checkForUpdates(manual = false) {
  if (manual) appendStatus("Checking for updates...");
  try {
    const update = await apiFetch("/api/update-check");
    if (versionLabel) versionLabel.textContent = `v${update.current}`;

    if (update.updateAvailable) {
      const message = `New version available: v${update.latest}. <a href="${update.releaseUrl}" target="_blank" style="color:inherit; text-decoration: underline;">View release notes</a>.`;
      updateNotification.innerHTML = message;
      updateNotification.hidden = false;
      applyUpdateBtn.hidden = false;
      appendStatus(`Update available: v${update.latest}`, "warn");
    } else {
      if (manual) {
        appendStatus("You are already using the latest version.");
        updateNotification.textContent = "You are using the latest version.";
        updateNotification.hidden = false;
        setTimeout(() => {
          updateNotification.hidden = true;
        }, 3000);
      }
    }
  } catch (error) {
    console.error("Update check failed:", error);
    if (manual) appendStatus(`Update check failed: ${error.message}`);
  }
}

async function applyUpdateUI() {
  if (
    !confirm(
      "The server will download the update and restart. You will be disconnected. Proceed?",
    )
  ) {
    return;
  }

  appendStatus("Applying update...");
  applyUpdateBtn.disabled = true;
  try {
    const response = await apiFetch("/api/update-apply", { method: "POST" });
    appendStatus(response.message || "Updating...");
    updateNotification.textContent =
      "Server is updating and restarting. Please wait...";

    // Disconnect UI
    isConnected = false;
    enableScreenControls(false);

    // Reload after a delay to allow the server to restart
    setTimeout(() => {
      window.location.reload();
    }, 10000);
  } catch (error) {
    appendStatus(`Apply update failed: ${error.message}`, "error");
    applyUpdateBtn.disabled = false;
  }
}

async function takePhoto() {
  if (!isConnected) return;
  appendStatus("Triggering shutter...");
  try {
    await sendShellCommand("input keyevent 27"); // KEYCODE_CAMERA
    appendStatus(
      'Photo taken. Use "Get Latest Media" to download if it does not appear in file manager.',
    );
  } catch (error) {
    appendStatus(`Failed to take photo: ${error.message}`);
    appendStatus(`Failed to take photo: ${error.message}`, "error");
  }
}

async function startRecordVideo() {
  if (!isConnected) return;
  appendStatus("Starting video recording...");
  try {
    await apiFetch("/camera/record/start", {
      method: "POST",
      body: JSON.stringify({ deviceId: currentDeviceId }),
    });
    recordVideoBtn.disabled = true;
    stopVideoBtn.disabled = false;
    appendStatus(
      "Recording... Screen interactions will be captured. Click Stop to finish.",
    );
  } catch (error) {
    appendStatus(`Failed to start recording: ${error.message}`, "error");
  }
}

async function stopRecordVideo() {
  if (!isConnected) return;
  appendStatus("Stopping recording and fetching file...");
  stopVideoBtn.disabled = true;
  try {
    const response = await apiFetch("/camera/record/stop", {
      method: "POST",
      body: JSON.stringify({ deviceId: currentDeviceId }),
    });
    const binary = Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = response.name;
    anchor.click();
    URL.revokeObjectURL(url);
    appendStatus(`Downloaded video: ${response.name}`, "success");
  } catch (error) {
    appendStatus(`Failed to stop recording: ${error.message}`, "error");
  } finally {
    recordVideoBtn.disabled = false;
    stopVideoBtn.disabled = true;
  }
}

async function recordMic() {
  if (!isConnected) return;
  const duration = micDurationInput.value || 5;
  appendStatus(`Recording mic for ${duration}s...`);
  recordMicBtn.disabled = true;
  try {
    const response = await apiFetch("/mic/record", {
      method: "POST",
      body: JSON.stringify({ deviceId: currentDeviceId, duration }),
    });
    const binary = Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = response.name;
    anchor.click();
    URL.revokeObjectURL(url);
    appendStatus(`Downloaded mic recording: ${response.name}`, "success");
  } catch (error) {
    appendStatus(`Mic recording failed: ${error.message}`, "error");
  } finally {
    recordMicBtn.disabled = false;
  }
}

async function wakeUpDevice() {
  if (!isConnected) return;
  appendStatus("Waking up and unlocking device...");
  try {
    // 224 is KEYCODE_WAKEUP (API 20+). 82 is KEYCODE_MENU, which dismisses simple lockscreens.
    // We chain them to ensure the screen turns on and attempts to bypass the swipe layer.
    await sendShellCommand("input keyevent 224 && input keyevent 82");
    appendStatus("Wake up sequence sent.");
    // Short delay to allow the screen to illuminate before refreshing the preview
    setTimeout(refreshScreen, 1000);
  } catch (error) {
    appendStatus(`Wake up failed: ${error.message}`, "error");
  }
}

async function fetchDeviceResolution() {
  try {
    const output = await sendShellCommand("wm size");
    if (output && output.includes("Physical size:")) {
      const match = output.match(/Physical size: (\d+)x(\d+)/);
      if (match) {
        deviceResolution = {
          x: parseInt(match[1], 10),
          y: parseInt(match[2], 10),
        };
        appendStatus(
          `Resolution detected: ${deviceResolution.x}x${deviceResolution.y}`,
          "info",
        );
      }
    }
  } catch (error) {
    console.warn("Failed to fetch resolution:", error);
  }
}

async function refreshScreen() {
  if (!isConnected) {
    appendStatus("Connect first to refresh the screen.");
    return;
  }

  appendStatus("Refreshing remote screen...");
  try {
    const response = await apiFetch(
      `/screen?deviceId=${encodeURIComponent(currentDeviceId)}`,
    );
    updateScreenPreview(response.image);
    appendStatus("Remote screen updated.");
  } catch (error) {
    appendStatus(`Screen refresh failed: ${error.message}`, "error");
    showScreenPlaceholder();
  }
}

async function sendShellCommand(command) {
  appendStatus(`Running shell command: ${command}`);
  try {
    const response = await apiFetch("/shell", {
      method: "POST",
      body: JSON.stringify({ deviceId: currentDeviceId || undefined, command }),
    });
    return response.output;
  } catch (error) {
    appendStatus(`Shell command failed: ${error.message}`, "error");
    return null;
  }
}

connectBtn.addEventListener("click", async () => {
  connectBtn.disabled = true;
  await connectDevice();
});

disconnectBtn.addEventListener("click", async () => {
  await disconnectDevice();
});

refreshDevicesBtn.addEventListener("click", async () => {
  await refreshDevices();
});

installAdbBtn.addEventListener("click", async () => {
  await installAdb();
});

browseFilesBtn.addEventListener("click", async () => {
  const path = filePathInput.value.trim() || currentRemotePath;
  await loadRemoteFiles(path);
});

uploadFileBtn.addEventListener("click", async () => {
  await uploadRemoteFile();
});

if (openCameraBtn) {
  openCameraBtn.addEventListener("click", () =>
    sendShellCommand("am start -a android.media.action.STILL_IMAGE_CAMERA"),
  );
}

if (takePhotoBtn) {
  takePhotoBtn.addEventListener("click", takePhoto);
}

if (getLatestPhotoBtn) {
  getLatestPhotoBtn.addEventListener("click", fetchLatestPhoto);
}

if (wakeUpBtn) {
  wakeUpBtn.addEventListener("click", wakeUpDevice);
}

if (recordVideoBtn) recordVideoBtn.addEventListener("click", startRecordVideo);
if (stopVideoBtn) stopVideoBtn.addEventListener("click", stopRecordVideo);

if (recordMicBtn) {
  recordMicBtn.addEventListener("click", recordMic);
}

autoConnectToggle.addEventListener("change", (event) => {
  autoConnectEnabled = event.target.checked;
  saveAutoConnectSettings();
});

deviceList.addEventListener("change", (event) => {
  if (!event.target.matches(".device-auto-checkbox")) return;
  const deviceId = event.target.dataset.deviceId;
  if (!deviceId) return;
  if (event.target.checked) {
    autoConnectDevices.add(deviceId);
  } else {
    autoConnectDevices.delete(deviceId);
  }
  saveAutoConnectSettings();
});

deviceList.addEventListener("click", async (event) => {
  if (!event.target.matches(".device-connect-button")) return;
  const deviceId = event.target.dataset.deviceId;
  if (!deviceId) return;
  deviceIdInput.value = deviceId;
  await connectDevice(deviceId);
});

remoteFileList.addEventListener("click", async (event) => {
  if (!event.target.matches(".file-action-button")) return;
  const filePath = event.target.dataset.path;
  const fileType = event.target.dataset.type;
  if (!filePath || !fileType) return;

  if (fileType === "dir") {
    await loadRemoteFiles(filePath);
  } else {
    const fileName = filePath.split("/").pop();
    await downloadRemoteFile(filePath, fileName);
  }
});

sendCommandBtn.addEventListener("click", async () => {
  const command = commandInput.value.trim();
  if (!command) {
    appendStatus("Please enter an ADB command.");
    return;
  }

  terminalOutput.textContent += `\n$ ${command}\n`; // Display command in terminal
  sendCommandBtn.disabled = true;
  commandInput.disabled = true;
  try {
    const output = await sendShellCommand(command);
    terminalOutput.textContent += (output || "Command executed.") + "\n";
    appendStatus("Command executed.", "success");
  } catch (error) {
    terminalOutput.textContent += `Error: ${error.message}\n`;
    appendStatus(`Shell command failed: ${error.message}`, "error");
  } finally {
    terminalOutput.scrollTop = terminalOutput.scrollHeight; // Scroll to bottom
    sendCommandBtn.disabled = false;
    commandInput.disabled = false;
    commandInput.value = ""; // Clear input after execution
  }
});

commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !sendCommandBtn.disabled) sendCommandBtn.click();
});

if (cancelUploadBtn) {
  cancelUploadBtn.addEventListener("click", () => {
    if (currentUploadXhr) currentUploadXhr.abort();
  });
}

refreshScreenBtn.addEventListener("click", async () => {
  await refreshScreen();
});

if (checkUpdateBtn) {
  checkUpdateBtn.addEventListener("click", () => checkForUpdates(true));
}

if (applyUpdateBtn) {
  applyUpdateBtn.addEventListener("click", applyUpdateUI);
}

if (tapBtn) {
  tapBtn.addEventListener("click", async () => {
    const x = Number(tapXInput.value.trim());
    const y = Number(tapYInput.value.trim());
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      appendStatus("Enter valid tap coordinates.");
      return;
    }

    await sendShellCommand(`input tap ${x} ${y}`);
  });
}

if (swipeBtn) {
  swipeBtn.addEventListener("click", async () => {
    const from = parseCoordinates(swipeFromInput.value);
    const to = parseCoordinates(swipeToInput.value);
    if (!from || !to) {
      appendStatus("Enter swipe coordinates in x1,y1 and x2,y2 format.");
      return;
    }

    await sendShellCommand(
      `input swipe ${from.x} ${from.y} ${to.x} ${to.y} 250`,
    );
  });
}

// Theme Toggle Logic
const savedTheme = localStorage.getItem("theme") || "dark";
if (savedTheme === "light") {
  document.body.classList.add("light-mode");
}

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  const newTheme = document.body.classList.contains("light-mode")
    ? "light"
    : "dark";
  localStorage.setItem("theme", newTheme);
});

// Tab Switching Logic
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    document
      .querySelectorAll(".tab-pane")
      .forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));

    document.getElementById(target).classList.add("active");
    btn.classList.add("active");
    if (target === "files") loadRemoteFiles();
  });
});

screenPreview.addEventListener("click", async (event) => {
  if (!isConnected) {
    appendStatus("Connect first to interact with the screen.", "warn");
    return;
  }

  const rect = screenPreview.getBoundingClientRect();
  const x = Math.round(
    ((event.clientX - rect.left) / rect.width) * deviceResolution.x,
  );
  const y = Math.round(
    ((event.clientY - rect.top) / rect.height) * deviceResolution.y,
  );
  await sendShellCommand(`input tap ${x} ${y}`);
});

if (clearTerminalBtn) {
  clearTerminalBtn.addEventListener(
    "click",
    () => (terminalOutput.textContent = ""),
  );
}

// Tunnel controls
if (tunnelTypeSelect) {
  tunnelTypeSelect.addEventListener("change", () => {
    if (ngrokTokenRow)
      ngrokTokenRow.hidden = tunnelTypeSelect.value !== "ngrok";
  });
}

if (tunnelStartBtn) {
  tunnelStartBtn.addEventListener("click", async () => {
    tunnelStartBtn.disabled = true;
    if (tunnelStopBtn) tunnelStopBtn.disabled = true;
    if (tunnelStatusLabel) {
      tunnelStatusLabel.textContent =
        "⏳ Starting tunnel (may take 10–30 s on first run)…";
      tunnelStatusLabel.style.color = "";
    }
    appendStatus("Starting secure tunnel…", "info");
    try {
      const body = {
        type: tunnelTypeSelect ? tunnelTypeSelect.value : "cloudflare",
      };
      if (body.type === "ngrok" && ngrokTokenInput && ngrokTokenInput.value) {
        body.authToken = ngrokTokenInput.value.trim();
      }
      const data = await apiFetch("/api/tunnel/start", {
        method: "POST",
        body: JSON.stringify(body),
      });
      applyTunnelState(data);
      appendStatus(`Tunnel active: ${data.url}`, "success");
      if (data.authWarning) {
        appendStatus(
          "⚠️  No AUTH_SECRET set — tunnel is open to the internet without a password!",
          "warn",
        );
      }
    } catch (err) {
      if (tunnelStatusLabel) {
        tunnelStatusLabel.textContent = `❌ ${err.message}`;
        tunnelStatusLabel.style.color = "#fca5a5";
      }
      if (tunnelStartBtn) tunnelStartBtn.disabled = false;
      appendStatus(`Tunnel failed: ${err.message}`, "error");
    }
  });
}

if (tunnelStopBtn) {
  tunnelStopBtn.addEventListener("click", async () => {
    try {
      await apiFetch("/api/tunnel/stop", {
        method: "POST",
        body: JSON.stringify({}),
      });
      applyTunnelState({ active: false, status: "idle" });
      appendStatus("Tunnel stopped.", "info");
    } catch (err) {
      appendStatus(`Tunnel stop failed: ${err.message}`, "error");
    }
  });
}

if (tunnelCopyBtn) {
  tunnelCopyBtn.addEventListener("click", () => {
    if (!tunnelUrlDisplay || !tunnelUrlDisplay.value) return;
    navigator.clipboard
      .writeText(tunnelUrlDisplay.value)
      .then(() => {
        tunnelCopyBtn.textContent = "✓ Copied!";
        setTimeout(() => (tunnelCopyBtn.textContent = "Copy"), 2000);
      })
      .catch(() => {
        tunnelUrlDisplay.select();
        document.execCommand("copy");
      });
  });
}

// Drag and Drop Logic for File Explorer
if (fileManagerPanel) {
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    fileManagerPanel.addEventListener(
      eventName,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      false,
    );
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    fileManagerPanel.addEventListener(
      eventName,
      () => {
        fileManagerPanel.classList.add("drag-over");
      },
      false,
    );
  });

  ["dragleave", "drop"].forEach((eventName) => {
    fileManagerPanel.addEventListener(
      eventName,
      () => {
        fileManagerPanel.classList.remove("drag-over");
      },
      false,
    );
  });

  fileManagerPanel.addEventListener(
    "drop",
    (e) => {
      const dt = e.dataTransfer;
      if (dt.files && dt.files.length > 0) {
        uploadRemoteFile(dt.files[0]);
      }
    },
    false,
  );
}

async function pollDevices() {
  if (isConnected || document.visibilityState !== "visible") return;
  const devices = await checkBackend();
  renderDeviceList(devices);
  await maybeAutoConnect(devices);
}

// ─── Tunnel Management ──────────────────────────────────────────────────────────────────────────────

function applyTunnelState(data) {
  if (!tunnelStatusLabel) return;
  if (data.active) {
    tunnelStatusLabel.textContent = `✅ Tunnel active — ${data.type}`;
    tunnelStatusLabel.style.color = "#a7f3d0";
    if (tunnelStartBtn) tunnelStartBtn.disabled = true;
    if (tunnelStopBtn) tunnelStopBtn.disabled = false;
    if (tunnelActivePanel) tunnelActivePanel.hidden = false;
    if (tunnelUrlDisplay && data.url) tunnelUrlDisplay.value = data.url;
    if (tunnelQrCode && data.qrDataUrl) {
      tunnelQrCode.src = data.qrDataUrl;
      tunnelQrCode.hidden = false;
    }
    if (tunnelAuthWarning) tunnelAuthWarning.hidden = !data.authWarning;
  } else {
    const text =
      data.status === "starting"
        ? "⏳ Starting tunnel…"
        : data.status === "error"
          ? `❌ Error: ${data.error || "unknown"}`
          : "Tunnel: inactive";
    tunnelStatusLabel.textContent = text;
    tunnelStatusLabel.style.color = data.status === "error" ? "#fca5a5" : "";
    if (tunnelStartBtn) tunnelStartBtn.disabled = data.status === "starting";
    if (tunnelStopBtn) tunnelStopBtn.disabled = true;
    if (tunnelActivePanel) tunnelActivePanel.hidden = true;
  }
}

async function loadTunnelStatus() {
  try {
    const data = await apiFetch("/api/tunnel/status");
    applyTunnelState(data);
  } catch (_) {}
}

autoConnectToggle.checked = autoConnectEnabled;
filePathInput.value = currentRemotePath;
enableScreenControls(false);
showScreenPlaceholder();
updateConnectionButtons();

// Initial backend check, periodic polling, and update version badge
pollDevices();
setInterval(pollDevices, 5000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !isConnected) pollDevices();
});
checkForUpdates();
loadTunnelStatus();
