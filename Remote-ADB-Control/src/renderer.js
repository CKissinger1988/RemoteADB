const statusLog = document.getElementById('statusLog');
const deviceIdInput = document.getElementById('deviceId');
const commandInput = document.getElementById('commandInput');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const sendCommandBtn = document.getElementById('sendCommandBtn');

function appendStatus(message) {
  statusLog.textContent += `\n${new Date().toLocaleTimeString()} - ${message}`;
  statusLog.scrollTop = statusLog.scrollHeight;
}

connectBtn.addEventListener('click', async () => {
  const deviceId = deviceIdInput.value.trim();
  if (!deviceId) {
    appendStatus('Enter a device ID first.');
    return;
  }

  connectBtn.disabled = true;
  appendStatus(`Connecting to ${deviceId}...`);

  const result = await window.adb.connect(deviceId);
  appendStatus(result);
  disconnectBtn.disabled = false;
  sendCommandBtn.disabled = false;
});

disconnectBtn.addEventListener('click', async () => {
  const result = await window.adb.disconnect();
  appendStatus(result);
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  sendCommandBtn.disabled = true;
});

sendCommandBtn.addEventListener('click', async () => {
  const command = commandInput.value.trim();
  if (!command) {
    appendStatus('Enter a shell command first.');
    return;
  }

  appendStatus(`Sending command: ${command}`);
  const output = await window.adb.shellCommand(command);
  appendStatus(output);
});
