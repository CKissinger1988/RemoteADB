const fs = require("fs");
const fsPromises = fs.promises;
const http = require("http");
const https = require("https");
const os = require("os");
const crypto = require("crypto");
const express = require("express");
const { execFile, spawn } = require("child_process");
const path = require("path");
const {
  startUpdateChecker,
  getPendingUpdate,
  checkForUpdate,
  applyUpdate,
  getCurrentVersion,
} = require("./updater");
const tunnel = require("./tunnel");
const QRCode = require("qrcode");
const app = express();
app.disable("x-powered-by");
const port = process.env.PORT || 5200;
const host = process.env.HOST || "0.0.0.0";
const useHttps = process.env.HTTPS && process.env.HTTPS !== "0";
const sslKeyPath =
  process.env.SSL_KEY || path.join(__dirname, "..", "certs", "server.key");
const sslCertPath =
  process.env.SSL_CERT || path.join(__dirname, "..", "certs", "server.crt");
const redirectPort = useHttps
  ? Number(process.env.REDIRECT_PORT || Number(port) + 1)
  : undefined;
const frontRoot = path.resolve(__dirname, "..", "..", "Remote-ADB-Front");
const authSecret = process.env.AUTH_SECRET || null;
const authCookieName = "remote_adb_auth";
const authToken = authSecret
  ? crypto
      .createHmac("sha256", authSecret)
      .update("remote-adb-auth-token")
      .digest("hex")
  : null;

const adbPath =
  process.env.ADB_PATH ||
  path.join(__dirname, "..", "installer", "bin", "adb.exe");
const installScript = path.join(__dirname, "..", "installer", "install.ps1");

let recordingProc = null;
let recordingDevice = null;
let recordingPath = "";
let recordingStopRequested = false; // true while stop handler is orchestrating a pkill+pull

app.use(express.json({ limit: "50mb" }));

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    cookies[name.trim()] = rest.join("=").trim();
  });
  return cookies;
}

// World-class cleanup: ensure device-side recording stops if backend exits
process.on("SIGINT", async () => {
  if (recordingProc && recordingDevice) {
    await runAdb([
      "-s",
      recordingDevice,
      "shell",
      "pkill -2 screenrecord",
    ]).catch(() => {});
  }
  process.exit(0);
});

function isPublicPath(req) {
  const safeStatic = [
    ".css",
    ".js",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".svg",
    ".json",
  ];
  const publicPaths = [
    "/login",
    "/login.html",
    "/login.js",
    "/styles.css",
    "/favicon.ico",
    "/manifest.json",
  ];
  if (publicPaths.includes(req.path)) {
    return true;
  }
  return safeStatic.some((ext) => req.path.endsWith(ext));
}

function isApiPath(req) {
  return (
    req.path.startsWith("/status") ||
    req.path.startsWith("/files") ||
    req.path.startsWith("/connect") ||
    req.path.startsWith("/disconnect") ||
    req.path.startsWith("/screen") ||
    req.path.startsWith("/shell") ||
    req.path.startsWith("/install") ||
    req.path.startsWith("/camera") ||
    req.path.startsWith("/mic") ||
    req.path.startsWith("/api/")
  );
}

app.use((req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "SAMEORIGIN");
  res.header("Referrer-Policy", "no-referrer");
  res.header("X-Permitted-Cross-Domain-Policies", "none");
  res.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  );
  res.header("Cache-Control", "no-store");
  if (useHttps) {
    res.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  if (!authSecret) {
    return next();
  }

  if (req.path === "/login" || req.path === "/logout" || isPublicPath(req)) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie);
  if (cookies[authCookieName] === authToken) {
    return next();
  }

  if (isApiPath(req)) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  if (req.accepts("html")) {
    return res.sendFile(path.join(frontRoot, "login.html"));
  }

  return res.status(401).json({ status: "error", message: "Unauthorized" });
});
app.options("*", (req, res) => res.sendStatus(204));

app.post("/login", (req, res) => {
  const { secret } = req.body || {};
  if (!secret || secret !== authSecret) {
    return res
      .status(401)
      .json({ status: "error", message: "Invalid access secret" });
  }

  res.cookie(authCookieName, authToken, {
    httpOnly: true,
    secure: useHttps,
    sameSite: "Strict",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ status: "ok", message: "Authenticated" });
});

app.post("/logout", (req, res) => {
  res.clearCookie(authCookieName, { path: "/" });
  res.json({ status: "ok", message: "Logged out" });
});

app.get("/login", (req, res) => {
  const loginPath = path.join(frontRoot, "login.html");
  if (fs.existsSync(loginPath)) {
    return res.sendFile(loginPath);
  }
  res.status(404).send("Login page not found.");
});

if (fs.existsSync(frontRoot)) {
  app.use(express.static(frontRoot));
} else {
  console.warn(
    `Frontend folder not found at ${frontRoot}. Static frontend hosting disabled.`,
  );
}

function adbInstalled() {
  return fs.existsSync(adbPath);
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    execFile(adbPath, args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).toString().trim()));
        return;
      }
      resolve(stdout.toString().trim());
    });
  });
}

function runAdbBinary(args) {
  return new Promise((resolve, reject) => {
    execFile(
      adbPath,
      args,
      { encoding: null, timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).toString().trim()));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function buildAdbArgs(deviceId, args) {
  return deviceId ? ["-s", deviceId, ...args] : args;
}

function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line)
    .map((line) => {
      const [id, status] = line.split(/\s+/);
      return { id, status };
    });
}

function escapeAdbShellArg(value) {
  return '"' + value.replace(/(["\\$`])/g, "\\$1") + '"';
}

function parseFileList(output, basePath) {
  return output
    .split(/\r?\n/)
    .filter(
      (line) =>
        line &&
        !line.startsWith("total") &&
        !line.includes("Permission denied"),
    )
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(
        /^([\-ld].*?)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+\S+\s+(.+)$/,
      );
      if (!match) {
        return {
          name: trimmed,
          path: `${basePath}/${trimmed}`.replace(/\/+/g, "/"),
          type: "file",
        };
      }

      const perms = match[1];
      const size = Number(match[2]);
      const rawName = match[3].replace(/ -> .*$/, "");
      const name = rawName.trim();
      const type = perms.startsWith("d") ? "dir" : "file";
      return {
        name,
        path: `${basePath}/${name}`.replace(/\/\/+/, "/"),
        type,
        size,
      };
    });
}

async function runAdbShellList(deviceId, dir) {
  const command = `ls -lA ${escapeAdbShellArg(dir)}`;
  const output = await runAdb(buildAdbArgs(deviceId, ["shell", command]));
  return parseFileList(output, dir);
}

async function runAdbPull(deviceId, remotePath) {
  const localTemp = path.join(
    os.tmpdir(),
    `adb-pull-${crypto.randomBytes(8).toString("hex")}`,
  );
  await runAdb(buildAdbArgs(deviceId, ["pull", remotePath, localTemp]));
  const content = await fsPromises.readFile(localTemp);
  await fsPromises.unlink(localTemp);
  return content;
}

async function runAdbPush(deviceId, remoteDir, fileName, dataBuffer) {
  const localTemp = path.join(
    os.tmpdir(),
    `adb-push-${crypto.randomBytes(8).toString("hex")}`,
  );
  await fsPromises.writeFile(localTemp, dataBuffer);
  const remotePath = `${remoteDir.replace(/\/$/, "")}/${fileName}`;
  await runAdb(buildAdbArgs(deviceId, ["push", localTemp, remotePath]));
  await fsPromises.unlink(localTemp);
  return remotePath;
}

function isSafeRemoteFileName(fileName) {
  return (
    typeof fileName === "string" &&
    fileName.length > 0 &&
    !/[\/]/.test(fileName) &&
    path.basename(fileName) === fileName
  );
}

function isSafeRemotePath(remotePath) {
  return (
    typeof remotePath === "string" &&
    remotePath.length > 0 &&
    remotePath.startsWith("/") &&
    !remotePath.includes("\\") &&
    !remotePath.includes("..")
  );
}

function runInstaller() {
  return new Promise((resolve, reject) => {
    const escapedScript = installScript.replace(/"/g, '""');
    const command = `Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${escapedScript}"' -Verb RunAs -Wait`;
    const args = ["-NoProfile", "-Command", command];

    execFile(
      "powershell.exe",
      args,
      { timeout: 300000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message).toString().trim()));
          return;
        }
        resolve(stdout.toString().trim());
      },
    );
  });
}

async function isAdbAvailable() {
  if (!adbInstalled()) {
    return false;
  }

  try {
    await runAdb(["version"]);
    return true;
  } catch {
    return false;
  }
}

app.get("/status", async (req, res) => {
  try {
    const available = await isAdbAvailable();
    let devices = [];

    if (available) {
      const output = await runAdb(["devices"]);
      devices = parseDevices(output);
    }

    res.json({ status: "ok", adbInstalled: available, devices });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/install", async (req, res) => {
  try {
    const output = await runInstaller();
    const available = await isAdbAvailable();
    if (available) startDeviceWatcher();
    res.json({
      status: "ok",
      adbInstalled: available,
      message: available
        ? "ADB installation succeeded. ADB is available."
        : `Installer finished but ADB is still unavailable. Output: ${output}`,
      output,
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", adbInstalled: false, message: error.message });
  }
});

app.get("/files/list", async (req, res) => {
  const deviceId = req.query.deviceId;
  const remotePath = req.query.path || "/sdcard";

  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }

    const items = await runAdbShellList(deviceId, remotePath);
    res.json({ status: "ok", path: remotePath, items });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/files/download", async (req, res) => {
  const deviceId = req.query.deviceId;
  const remotePath = req.query.path;

  if (!remotePath || !isSafeRemotePath(remotePath)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or missing path query parameter.",
    });
  }

  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }

    const content = await runAdbPull(deviceId, remotePath);
    res.json({
      status: "ok",
      name: path.basename(remotePath),
      data: content.toString("base64"),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/files/upload", async (req, res) => {
  const deviceId = req.body.deviceId;
  const remotePath = req.body.path;
  const fileName = req.body.fileName;
  const data = req.body.data;

  if (!remotePath || !fileName || !data) {
    return res
      .status(400)
      .json({ status: "error", message: "Missing upload body fields." });
  }

  if (!isSafeRemotePath(remotePath) || !isSafeRemoteFileName(fileName)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid upload path or file name." });
  }

  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }

    const buffer = Buffer.from(data, "base64");
    const remoteFile = await runAdbPush(deviceId, remotePath, fileName, buffer);
    res.json({
      status: "ok",
      message: `Uploaded ${fileName} to ${remoteFile}`,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/connect", async (req, res) => {
  const deviceId = req.body.deviceId;

  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }

    if (deviceId) {
      const devices = parseDevices(await runAdb(["devices"]));
      if (!devices.some((device) => device.id === deviceId)) {
        await runAdb(["connect", deviceId]);
      }
    }

    const devices = parseDevices(
      await runAdb(buildAdbArgs(deviceId, ["devices"])),
    );
    const reverseOutput = await runAdb(
      buildAdbArgs(deviceId, ["reverse", "tcp:5200", "tcp:5200"]),
    );

    res.json({ status: "ok", devices, reverse: reverseOutput });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/disconnect", async (req, res) => {
  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }
    const output = await runAdb(["reverse", "--remove-all"]);
    res.json({ status: "ok", output });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/camera/latest", async (req, res) => {
  const deviceId = req.query.deviceId;
  try {
    if (!(await isAdbAvailable())) {
      throw new Error("ADB is not installed or not available.");
    }
    const dir = "/sdcard/DCIM/Camera";
    const fileName = (
      await runAdb(
        buildAdbArgs(deviceId, ["shell", `ls -1t ${dir} | head -n 1`]),
      )
    ).trim();

    if (!fileName || fileName.includes("No such file") || fileName === "") {
      return res
        .status(404)
        .json({ status: "error", message: "No recent camera files found." });
    }

    const remotePath = `${dir}/${fileName}`;
    const content = await runAdbPull(deviceId, remotePath);
    res.json({
      status: "ok",
      name: fileName,
      data: content.toString("base64"),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/camera/record/start", async (req, res) => {
  const { deviceId } = req.body;
  if (recordingProc)
    return res
      .status(400)
      .json({ status: "error", message: "Recording already in progress." });

  try {
    if (!(await isAdbAvailable())) {
      throw new Error("ADB is not installed or not available.");
    }

    recordingDevice = deviceId;
    recordingPath = `/sdcard/remote_vid_${Date.now()}.mp4`;
    const args = buildAdbArgs(deviceId, [
      "shell",
      "screenrecord",
      "--time-limit",
      "180",
      recordingPath,
    ]);
    recordingProc = spawn(adbPath, args);

    recordingProc.on("exit", (code) => {
      recordingProc = null;
      // If the process exited on its own (error, device disconnect, 3-min timeout reached
      // naturally) and we are NOT in the middle of a controlled stop, clear all recording
      // state so subsequent /camera/record/stop correctly returns 400 instead of attempting
      // to pull a file that may never have been written.
      if (!recordingStopRequested) {
        recordingPath = "";
        recordingDevice = null;
      }
    });
    res.json({ status: "ok", message: "Recording started (max 3 mins)." });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/camera/record/stop", async (req, res) => {
  if (!recordingProc && !recordingPath)
    return res.status(400).json({
      status: "error",
      message: "No recording in progress or available.",
    });

  try {
    if (recordingProc) {
      recordingStopRequested = true;
      await runAdb(
        buildAdbArgs(recordingDevice, ["shell", "pkill -2 screenrecord"]),
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const content = await runAdbPull(recordingDevice, recordingPath);
    await runAdb(buildAdbArgs(recordingDevice, ["shell", "rm", recordingPath]));

    recordingProc = null;
    recordingStopRequested = false;
    const recordedName = path.basename(recordingPath);
    recordingPath = "";
    recordingDevice = null;
    res.json({
      status: "ok",
      name: recordedName,
      data: content.toString("base64"),
    });
  } catch (error) {
    recordingStopRequested = false; // always clear the flag, even on error
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/mic/record", async (req, res) => {
  const { deviceId, duration = 5 } = req.body;
  const timeoutMs = (Number(duration) + 15) * 1000;

  try {
    if (!(await isAdbAvailable())) {
      throw new Error("ADB is not installed or not available.");
    }

    const remotePath = `/sdcard/remote_mic_${Date.now()}.wav`;
    const args = buildAdbArgs(deviceId, [
      "shell",
      `tinycap ${remotePath} -t ${duration}`,
    ]);

    await new Promise((resolve, reject) => {
      execFile(adbPath, args, { timeout: timeoutMs }, (error) => {
        if (error)
          return reject(
            new Error(
              `Recording failed. Ensure 'tinycap' exists on the device. Error: ${error.message}`,
            ),
          );
        resolve();
      });
    });

    const content = await runAdbPull(deviceId, remotePath);
    await runAdb(buildAdbArgs(deviceId, ["shell", `rm ${remotePath}`]));
    res.json({
      status: "ok",
      name: `remote_mic_${Date.now()}.wav`,
      data: content.toString("base64"),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/screen", async (req, res) => {
  const deviceId = req.query.deviceId;
  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }
    const imageBuffer = await runAdbBinary(
      buildAdbArgs(deviceId, ["exec-out", "screencap", "-p"]),
    );
    res.json({ status: "ok", image: imageBuffer.toString("base64") });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/shell", async (req, res) => {
  const command = req.body.command;
  const deviceId = req.body.deviceId;
  if (!command) {
    return res
      .status(400)
      .json({ status: "error", message: "Missing command body." });
  }

  try {
    if (!(await isAdbAvailable())) {
      throw new Error(
        "ADB is not installed or not available. Run /install as Administrator.",
      );
    }
    const output = await runAdb(buildAdbArgs(deviceId, ["shell", command]));
    res.json({ status: "ok", output });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/api/update-check", async (req, res) => {
  const current = getCurrentVersion();
  let update = getPendingUpdate();
  if (!update) {
    update = await checkForUpdate();
  }
  if (update) {
    return res.json({
      updateAvailable: true,
      current: update.current,
      latest: update.latest,
      downloadUrl: update.downloadUrl,
      releaseUrl: update.releaseUrl,
    });
  }
  return res.json({ updateAvailable: false, current });
});

app.post("/api/update-apply", async (req, res) => {
  let update = getPendingUpdate();
  if (!update) {
    update = await checkForUpdate();
  }
  if (!update) {
    return res.json({ status: "no-update", message: "Already up to date." });
  }
  if (!update.downloadUrl) {
    return res.status(400).json({
      status: "error",
      message: "No backend asset found in the latest release.",
    });
  }
  res.json({
    status: "updating",
    message: `Updating to v${update.latest}. Server will restart shortly.`,
  });
  setImmediate(() =>
    applyUpdate(update.downloadUrl).catch((err) =>
      console.error("[updater] Apply failed:", err.message),
    ),
  );
});

// ─── Tunnel Management ────────────────────────────────────────────────────────

app.get("/api/tunnel/status", async (req, res) => {
  const s = tunnel.status();
  let qrDataUrl = null;
  if (s.url) {
    try {
      qrDataUrl = await QRCode.toDataURL(s.url, {
        width: 240,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch (e) {
      console.warn("[tunnel] QR code generation failed:", e.message);
    }
  }
  res.json({
    ...s,
    qrDataUrl,
    authSet: !!authSecret,
    authWarning: s.active && !authSecret,
  });
});

app.post("/api/tunnel/start", async (req, res) => {
  const type = req.body.type || "cloudflare";
  const authToken = req.body.authToken || undefined;

  if (!authSecret) {
    console.warn(
      "[tunnel] WARNING: AUTH_SECRET is not set — tunnel is open to the internet without authentication!",
    );
  }

  try {
    const url = await tunnel.start({ type, authToken, port: Number(port) });
    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
    } catch (_) {}
    res.json({
      status: "ok",
      url,
      type,
      qrDataUrl,
      authSet: !!authSecret,
      authWarning: !authSecret,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/tunnel/stop", (req, res) => {
  tunnel.stop();
  res.json({ status: "ok", message: "Tunnel stopped." });
});

app.get("*", (req, res) => {
  const indexPath = path.join(frontRoot, "index.html");
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Frontend not found.");
});

let watcherProc = null;
let watcherBuffer = "";
let watcherConnectedDevices = new Set();

function parseTrackDevicesPayload(payload) {
  return payload
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .map((line) => {
      const parts = line.split("\t");
      return {
        id: parts[0] && parts[0].trim(),
        status: parts[1] && parts[1].trim(),
      };
    })
    .filter((d) => d.id && d.status);
}

function startDeviceWatcher() {
  if (!adbInstalled() || watcherProc) return;

  watcherProc = spawn(adbPath, ["track-devices"]);
  watcherBuffer = "";

  watcherProc.stdout.on("data", (chunk) => {
    watcherBuffer += chunk.toString("binary");
    while (watcherBuffer.length >= 4) {
      const lenHex = watcherBuffer.slice(0, 4);
      const len = parseInt(lenHex, 16);
      if (isNaN(len)) {
        watcherBuffer = "";
        break;
      }
      if (watcherBuffer.length < 4 + len) break;
      const payload = watcherBuffer.slice(4, 4 + len);
      watcherBuffer = watcherBuffer.slice(4 + len);
      const devices = parseTrackDevicesPayload(payload);
      const nowConnected = new Set(
        devices.filter((d) => d.status === "device").map((d) => d.id),
      );
      for (const id of nowConnected) {
        if (!watcherConnectedDevices.has(id)) {
          console.log(
            `Device connected: ${id} — setting up reverse port forwarding...`,
          );
          runAdb(["-s", id, "reverse", `tcp:${port}`, `tcp:${port}`])
            .then(() => console.log(`Reverse tcp:${port} set for ${id}`))
            .catch((err) =>
              console.warn(`Reverse setup failed for ${id}: ${err.message}`),
            );
        }
      }
      watcherConnectedDevices = nowConnected;
    }
  });

  watcherProc.on("error", (err) => {
    console.warn(`Device watcher error: ${err.message}`);
  });

  watcherProc.on("exit", () => {
    watcherProc = null;
    watcherBuffer = "";
    if (adbInstalled()) {
      setTimeout(startDeviceWatcher, 3000);
    }
  });
}

const server = useHttps
  ? https.createServer(
      { key: fs.readFileSync(sslKeyPath), cert: fs.readFileSync(sslCertPath) },
      app,
    )
  : http.createServer(app);

const protocol = useHttps ? "https" : "http";
const displayHost = host === "0.0.0.0" ? "0.0.0.0" : host;
server.listen(port, host, () => {
  console.log(
    `Remote ADB backend listening on ${protocol}://${displayHost}:${port}`,
  );
  startDeviceWatcher();
  startUpdateChecker();
  if (useHttps) {
    console.log(`Using SSL key: ${sslKeyPath}`);
    console.log(`Using SSL cert: ${sslCertPath}`);
    if (redirectPort) {
      console.log(
        `HTTP redirect server available on http://${displayHost}:${redirectPort} -> https://${displayHost}:${port}`,
      );
    }
  }
});

if (useHttps && redirectPort) {
  http
    .createServer((req, res) => {
      const location = `https://${displayHost}:${port}${req.url}`;
      res.writeHead(301, { Location: location });
      res.end();
    })
    .listen(redirectPort, host, () => {
      console.log(
        `Redirecting HTTP traffic from http://${displayHost}:${redirectPort} to https://${displayHost}:${port}`,
      );
    });
}
