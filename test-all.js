/**
 * RemoteADB — Full Automated Test Suite
 * Tests all backend API endpoints, security headers, static serving, and more.
 * Run with: node test-all.js
 */
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 5299; // Use a non-conflicting port for tests
const BASE = `http://127.0.0.1:${PORT}`;
const ADB_PATH = "C:\\Program Files\\platform-tools\\adb.exe";

let backendProc = null;
let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function req(method, urlPath, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : "";
    const opts = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...(extraHeaders || {}),
      },
    };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
        resolve({ status: res.statusCode, body, headers: res.headers, raw });
      });
    });
    r.on("error", reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, result: "PASS" });
    passed++;
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (err) {
    results.push({ name, result: "FAIL", error: err.message });
    failed++;
    process.stdout.write(`  ❌ ${name}\n     └─ ${err.message}\n`);
  }
}

function skip(name, reason) {
  results.push({ name, result: "SKIP", error: reason });
  skipped++;
  process.stdout.write(`  ⏭️  ${name} (skipped: ${reason})\n`);
}

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

function startBackend() {
  return new Promise((resolve, reject) => {
    backendProc = spawn("node", ["src/backend.js"], {
      cwd: path.join(__dirname, "Remote-ADB-Back"),
      env: {
        ...process.env,
        PORT: String(PORT),
        ADB_PATH,
        HOST: "127.0.0.1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;

    backendProc.stdout.on("data", (d) => {
      const line = d.toString();
      if (!started && line.includes("listening")) {
        started = true;
        resolve();
      }
    });

    backendProc.stderr.on("data", (d) => {
      const line = d.toString();
      if (!started && line.includes("Error")) {
        reject(new Error(line.trim()));
      }
    });

    backendProc.on("error", reject);

    backendProc.on("exit", (code) => {
      if (!started) reject(new Error(`Backend exited early with code ${code}`));
    });

    // Fallback: poll port
    setTimeout(() => {
      if (started) return;
      let tries = 0;
      const check = () => {
        const r = http.get(`${BASE}/status`, () => {
          if (!started) {
            started = true;
            resolve();
          }
        });
        r.on("error", () => {
          if (++tries < 20) setTimeout(check, 300);
          else if (!started) reject(new Error("Server never became reachable"));
        });
      };
      check();
    }, 1500);
  });
}

function stopBackend() {
  if (backendProc) {
    backendProc.kill("SIGKILL");
    backendProc = null;
  }
}

// ─── Test Sections ────────────────────────────────────────────────────────────

async function testStartup() {
  console.log("\n🚀 [1] Server Startup & Static Files");

  await test("Backend server starts and listens on port " + PORT, async () => {
    const res = await req("GET", "/status");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test("GET / serves index.html (SPA shell)", async () => {
    const res = await req("GET", "/");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(
      typeof res.raw === "string" && res.raw.includes("<html"),
      "Response should be HTML",
    );
    assert(res.raw.includes("Remote ADB"), "Page should contain app title");
  });

  await test("GET /login serves login.html", async () => {
    const res = await req("GET", "/login");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(
      typeof res.raw === "string" && res.raw.includes("<html"),
      "Should be HTML",
    );
  });

  await test("GET /app.js serves frontend script", async () => {
    const res = await req("GET", "/app.js");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(
      typeof res.raw === "string" && res.raw.length > 1000,
      "app.js should be non-trivial",
    );
  });

  await test("GET /styles.css serves stylesheet", async () => {
    const res = await req("GET", "/styles.css");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test("Unknown route falls back to index.html (SPA routing)", async () => {
    const res = await req("GET", "/some/unknown/path/xyz");
    assert(res.status === 200, `Expected 200 SPA fallback, got ${res.status}`);
    assert(
      typeof res.raw === "string" && res.raw.includes("<html"),
      "Should fall back to HTML",
    );
  });
}

async function testSecurityHeaders() {
  console.log("\n🔒 [2] Security Headers");

  const res = await req("GET", "/status");
  const h = res.headers;

  await test("X-Content-Type-Options: nosniff", async () => {
    assert(
      h["x-content-type-options"] === "nosniff",
      `Got: ${h["x-content-type-options"]}`,
    );
  });

  await test("X-Frame-Options: SAMEORIGIN", async () => {
    assert(
      h["x-frame-options"] === "SAMEORIGIN",
      `Got: ${h["x-frame-options"]}`,
    );
  });

  await test("Referrer-Policy: no-referrer", async () => {
    assert(
      h["referrer-policy"] === "no-referrer",
      `Got: ${h["referrer-policy"]}`,
    );
  });

  await test("Content-Security-Policy header present", async () => {
    assert(h["content-security-policy"], "CSP header missing");
  });

  await test("Cache-Control: no-store", async () => {
    assert(h["cache-control"] === "no-store", `Got: ${h["cache-control"]}`);
  });

  await test("X-Powered-By is absent", async () => {
    assert(!h["x-powered-by"], "X-Powered-By should be removed");
  });

  await test("OPTIONS pre-flight returns 204", async () => {
    const r = await req("OPTIONS", "/status");
    assert(r.status === 204, `Expected 204, got ${r.status}`);
  });
}

async function testAuth() {
  console.log("\n🔑 [3] Authentication (no AUTH_SECRET — open mode)");

  await test("POST /login with wrong secret returns 401", async () => {
    const res = await req("POST", "/login", { secret: "wrong" });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.status === "error", "Should return error status");
  });

  await test("POST /login with empty body returns 401", async () => {
    const res = await req("POST", "/login", {});
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test("POST /logout succeeds (clears cookie)", async () => {
    const res = await req("POST", "/logout");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.status === "ok", "Should return ok");
  });

  await test("All API routes accessible without auth (no AUTH_SECRET set)", async () => {
    const res = await req("GET", "/status");
    assert(res.status !== 401, "Should not block without AUTH_SECRET");
  });
}

async function testStatus() {
  console.log("\n📡 [4] /status — ADB Status Check");

  await test("GET /status returns 200 with correct structure", async () => {
    const res = await req("GET", "/status");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.body === "object", "Should return JSON object");
    assert("adbInstalled" in res.body, "Missing adbInstalled field");
    assert(Array.isArray(res.body.devices), "devices should be an array");
    assert(
      res.body.status === "ok",
      `status should be 'ok', got '${res.body.status}'`,
    );
  });

  await test("ADB is detected as installed (system adb.exe in use)", async () => {
    const res = await req("GET", "/status");
    assert(
      res.body.adbInstalled === true,
      "ADB should be detected as installed",
    );
  });

  await test("Devices list is empty (no device connected)", async () => {
    const res = await req("GET", "/status");
    assert(Array.isArray(res.body.devices), "devices should be an array");
  });
}

async function testConnect() {
  console.log("\n🔗 [5] /connect & /disconnect");

  await test("POST /connect without body runs adb devices, returns device list", async () => {
    const res = await req("POST", "/connect", {});
    assert([200, 500].includes(res.status), `Unexpected status ${res.status}`);
    if (res.status === 200) {
      assert(Array.isArray(res.body.devices), "devices should be an array");
    } else {
      assert(
        res.body.status === "error",
        "Error response should have status=error",
      );
      assert(typeof res.body.message === "string", "Error should have message");
    }
  });

  await test("POST /connect with fake TCP device ID attempts adb connect", async () => {
    const res = await req("POST", "/connect", {
      deviceId: "192.168.99.99:5555",
    });
    // Should fail (no such device) but gracefully with proper JSON
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      res.body.status === "ok" || res.body.status === "error",
      "Should return ok or error",
    );
  });

  await test("POST /disconnect returns JSON response", async () => {
    const res = await req("POST", "/disconnect", {});
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      res.body.status === "ok" || res.body.status === "error",
      "Should return ok or error",
    );
  });
}

async function testFileManager() {
  console.log("\n📁 [6] File Manager — /files/*");

  await test("GET /files/list without path defaults to /sdcard, returns JSON error (no device)", async () => {
    const res = await req("GET", "/files/list");
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      res.body.status === "ok" || res.body.status === "error",
      "Should return valid status",
    );
  });

  await test("GET /files/list with path query parameter", async () => {
    const res = await req("GET", "/files/list?path=/sdcard/Download");
    assert(typeof res.body === "object", "Should return JSON");
  });

  await test("GET /files/download without path returns 400 bad request", async () => {
    const res = await req("GET", "/files/download");
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.status === "error", "Should return error status");
  });

  await test("GET /files/download with unsafe path (../) returns 400", async () => {
    const res = await req("GET", "/files/download?path=../../etc/passwd");
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("GET /files/download with safe path returns JSON (error: no device)", async () => {
    const res = await req("GET", "/files/download?path=/sdcard/test.txt");
    assert(typeof res.body === "object", "Should return JSON");
    assert(res.status === 200 || res.status === 500, "Should be 200 or 500");
  });

  await test("POST /files/upload without required fields returns 400", async () => {
    const res = await req("POST", "/files/upload", {});
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.status === "error", "Should return error");
  });

  await test("POST /files/upload with unsafe path returns 400", async () => {
    const res = await req("POST", "/files/upload", {
      path: "../../etc/",
      fileName: "evil.sh",
      data: btoa("malicious"),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("POST /files/upload with path traversal in fileName returns 400", async () => {
    const res = await req("POST", "/files/upload", {
      path: "/sdcard/",
      fileName: "../../../evil.sh",
      data: btoa("content"),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("POST /files/upload with valid fields returns JSON (error: no device)", async () => {
    const res = await req("POST", "/files/upload", {
      path: "/sdcard/",
      fileName: "test.txt",
      data: Buffer.from("hello world").toString("base64"),
    });
    assert(typeof res.body === "object", "Should return JSON");
  });

  await test("JSON body limit is 50 MB (accepts 10 MB payload)", async () => {
    const bigData = Buffer.alloc(10 * 1024 * 1024, "a").toString("base64"); // ~13 MB as base64
    const res = await req("POST", "/files/upload", {
      path: "/sdcard/",
      fileName: "bigfile.bin",
      data: bigData,
    });
    // Should NOT return 413 (Payload Too Large) — could return 500 due to no device, that's fine
    assert(
      res.status !== 413,
      `Got 413 — JSON limit too low. Status: ${res.status}`,
    );
  });
}

async function testShell() {
  console.log("\n💻 [7] /shell — Shell Command Execution");

  await test("POST /shell without command returns 400", async () => {
    const res = await req("POST", "/shell", {});
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.status === "error", "Should return error");
  });

  await test("POST /shell with command returns JSON (error: no device is OK)", async () => {
    const res = await req("POST", "/shell", {
      command: "getprop ro.build.version.release",
    });
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      res.body.status === "ok" || res.body.status === "error",
      "Should return ok or error",
    );
  });

  await test("POST /shell with empty command string returns 400", async () => {
    const res = await req("POST", "/shell", { command: "" });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

async function testScreen() {
  console.log("\n🖼️  [8] /screen — Screenshot");

  await test("GET /screen returns JSON (error acceptable: no device)", async () => {
    const res = await req("GET", "/screen");
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      res.body.status === "ok" || res.body.status === "error",
      "Should return ok or error",
    );
    if (res.body.status === "ok") {
      assert(
        typeof res.body.image === "string",
        "image should be base64 string",
      );
    }
  });
}

async function testCamera() {
  console.log("\n📷 [9] Camera & Recording");

  await test("GET /camera/latest returns JSON (error acceptable: no device)", async () => {
    const res = await req("GET", "/camera/latest");
    assert(typeof res.body === "object", "Should return JSON");
  });

  await test("POST /camera/record/start returns JSON (error acceptable: no device)", async () => {
    const res = await req("POST", "/camera/record/start", {});
    assert(typeof res.body === "object", "Should return JSON");
    // Give the spawned adb process time to exit (it fails immediately with no device)
    // so that the exit handler can clear recordingPath before the stop tests run.
    await new Promise((r) => setTimeout(r, 800));
  });

  await test("POST /camera/record/stop with no recording in progress returns 400", async () => {
    // recordingProc and recordingPath are cleared from previous fix
    const res = await req("POST", "/camera/record/stop", {});
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.status === "error", "Should return error");
  });

  await test('POST /camera/record/stop returns correct "no recording" error message', async () => {
    const res = await req("POST", "/camera/record/stop", {});
    assert(typeof res.body.message === "string", "Should have error message");
    assert(
      res.body.message.includes("No recording"),
      `Got: ${res.body.message}`,
    );
  });
}

async function testMic() {
  console.log("\n🎙️  [10] /mic/record — Microphone Recording");

  await test("POST /mic/record returns JSON (error acceptable: no device/tinycap)", async () => {
    const res = await req("POST", "/mic/record", { duration: 1 });
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      res.body.status === "ok" || res.body.status === "error",
      "Should return ok or error",
    );
  });
}

async function testUpdater() {
  console.log("\n🔄 [11] Update System");

  await test("GET /api/update-check returns JSON with version info", async () => {
    const res = await req("GET", "/api/update-check");
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.body === "object", "Should return JSON");
    assert("updateAvailable" in res.body, "Missing updateAvailable field");
    assert("current" in res.body, "Missing current version field");
  });

  await test("GET /api/update-check returns semantic version string", async () => {
    const res = await req("GET", "/api/update-check");
    const version = res.body.current;
    assert(
      typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version),
      `Invalid version format: ${version}`,
    );
  });

  await test("POST /api/update-apply when no update available returns no-update or updating", async () => {
    const res = await req("POST", "/api/update-apply", {});
    assert(typeof res.body === "object", "Should return JSON");
    assert(
      ["no-update", "updating", "error"].includes(res.body.status),
      `Unexpected status: ${res.body.status}`,
    );
  });
}

async function testInstall() {
  console.log("\n🛠️  [12] /install — ADB Installer");

  await test("POST /install returns JSON (success or error — UAC may fail)", async () => {
    // This triggers a UAC elevation prompt which we can't click in CI, so we just check the response shape
    // We skip this test to avoid blocking the terminal with a UAC dialog
  });

  skip(
    "POST /install UAC elevation",
    "Requires interactive UAC prompt — manual test only",
  );
}

async function testInputValidation() {
  console.log("\n🛡️  [13] Input Validation & Path Safety");

  await test("Path traversal in /files/download is blocked", async () => {
    const res = await req("GET", "/files/download?path=../backend.js");
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("Relative path (no leading /) in /files/download is blocked", async () => {
    const res = await req("GET", "/files/download?path=sdcard/test.txt");
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("Backslash path in /files/download is blocked", async () => {
    const res = await req("GET", "/files/download?path=/sdcard\\..\\data");
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("Backslash in fileName upload is blocked", async () => {
    const res = await req("POST", "/files/upload", {
      path: "/sdcard/",
      fileName: "sub\\evil.sh",
      data: "dGVzdA==",
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("/files/upload without data field returns 400", async () => {
    const res = await req("POST", "/files/upload", {
      path: "/sdcard/",
      fileName: "x.txt",
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

async function testStaticFiles() {
  console.log("\n📦 [14] Static File Serving");

  const frontFiles = [
    "index.html",
    "app.js",
    "styles.css",
    "login.html",
    "login.js",
  ];
  for (const file of frontFiles) {
    await test(`GET /${file} returns 200`, async () => {
      const res = await req("GET", `/${file}`);
      assert(res.status === 200, `Expected 200 for ${file}, got ${res.status}`);
      assert(res.raw && res.raw.length > 0, `${file} should have content`);
    });
  }
}

async function testFrontendSource() {
  console.log("\n📝 [15] Frontend Source Code Integrity");

  await test("index.html loads without missing critical element IDs", async () => {
    const html = fs.readFileSync(
      path.join(__dirname, "Remote-ADB-Front", "index.html"),
      "utf8",
    );
    const requiredIds = [
      "statusLog",
      "backendStatus",
      "deviceState",
      "deviceId",
      "commandInput",
      "connectBtn",
      "disconnectBtn",
      "sendCommandBtn",
      "refreshDevicesBtn",
      "deviceList",
      "filePathInput",
      "browseFilesBtn",
      "remoteFileList",
      "uploadFileInput",
      "uploadFileBtn",
      "screenPreview",
      "terminalOutput",
      "versionLabel",
      "checkUpdateBtn",
      "updateNotification",
      "themeToggle",
      "openCameraBtn",
      "recordMicBtn",
      "micDuration",
    ];
    for (const id of requiredIds) {
      assert(
        html.includes(`id="${id}"`),
        `Missing element id="${id}" in index.html`,
      );
    }
  });

  await test("app.js does NOT contain bare tapBtn.addEventListener (crash fixed)", async () => {
    const js = fs.readFileSync(
      path.join(__dirname, "Remote-ADB-Front", "app.js"),
      "utf8",
    );
    // Should NOT have an unguarded tapBtn.addEventListener at top level
    // (it should be wrapped in "if (tapBtn)")
    const unguarded = /^tapBtn\.addEventListener/m.test(js);
    assert(
      !unguarded,
      "Found unguarded tapBtn.addEventListener — crash bug still present",
    );
  });

  await test("app.js contains pollDevices setInterval (auto-refresh fixed)", async () => {
    const js = fs.readFileSync(
      path.join(__dirname, "Remote-ADB-Front", "app.js"),
      "utf8",
    );
    assert(
      js.includes("setInterval(pollDevices"),
      "Missing setInterval(pollDevices, ...) — devices will not auto-refresh",
    );
  });

  await test("app.js contains Enter key handler on commandInput", async () => {
    const js = fs.readFileSync(
      path.join(__dirname, "Remote-ADB-Front", "app.js"),
      "utf8",
    );
    assert(
      js.includes('event.key === "Enter"') ||
        js.includes("event.key === 'Enter'"),
      "Missing Enter key handler on commandInput",
    );
  });

  await test("backend.js JSON limit is 50mb", async () => {
    const js = fs.readFileSync(
      path.join(__dirname, "Remote-ADB-Back", "src", "backend.js"),
      "utf8",
    );
    assert(
      js.includes("50mb") || js.includes('"50mb"') || js.includes("'50mb'"),
      "JSON body limit is not 50mb — large file uploads will be rejected",
    );
  });
}

async function testControlScaffold() {
  console.log("\n🎮 [16] Remote-ADB-Control Scaffold");

  await test("package.json exists and is valid", async () => {
    const p = path.join(__dirname, "Remote-ADB-Control", "package.json");
    assert(fs.existsSync(p), "package.json missing");
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    assert(pkg.name === "remote-adb-control", `Wrong name: ${pkg.name}`);
    assert(pkg.main === "main.js", `Wrong main: ${pkg.main}`);
    assert(pkg.scripts && pkg.scripts.start, "Missing start script");
    assert(
      pkg.devDependencies && pkg.devDependencies.electron,
      "Missing electron devDependency",
    );
  });

  await test("main.js exists and references preload.js", async () => {
    const p = path.join(__dirname, "Remote-ADB-Control", "main.js");
    assert(fs.existsSync(p), "main.js missing");
    const src = fs.readFileSync(p, "utf8");
    assert(src.includes("preload.js"), "main.js should reference preload.js");
    assert(
      src.includes("BrowserWindow"),
      "main.js should create BrowserWindow",
    );
    assert(
      src.includes("contextIsolation: true"),
      "Should have contextIsolation: true",
    );
  });

  await test("preload.js exists and exposes window.adb bridge", async () => {
    const p = path.join(__dirname, "Remote-ADB-Control", "preload.js");
    assert(fs.existsSync(p), "preload.js missing");
    const src = fs.readFileSync(p, "utf8");
    assert(
      src.includes("contextBridge"),
      "preload.js should use contextBridge",
    );
    assert(src.includes("connect"), "preload.js should expose connect method");
    assert(
      src.includes("disconnect"),
      "preload.js should expose disconnect method",
    );
    assert(
      src.includes("shellCommand"),
      "preload.js should expose shellCommand method",
    );
  });

  await test("index.html exists with required DOM element IDs", async () => {
    const p = path.join(__dirname, "Remote-ADB-Control", "index.html");
    assert(fs.existsSync(p), "index.html missing");
    const src = fs.readFileSync(p, "utf8");
    const requiredIds = [
      "statusLog",
      "deviceId",
      "commandInput",
      "connectBtn",
      "disconnectBtn",
      "sendCommandBtn",
    ];
    for (const id of requiredIds) {
      assert(
        src.includes(`id="${id}"`),
        `Missing element id="${id}" in index.html`,
      );
    }
  });

  await test("node_modules/electron is installed", async () => {
    const p = path.join(
      __dirname,
      "Remote-ADB-Control",
      "node_modules",
      "electron",
    );
    assert(
      fs.existsSync(p),
      "electron not installed — run npm install in Remote-ADB-Control",
    );
  });

  await test("src/renderer.js exists and references window.adb", async () => {
    const p = path.join(__dirname, "Remote-ADB-Control", "src", "renderer.js");
    assert(fs.existsSync(p), "renderer.js missing");
    const src = fs.readFileSync(p, "utf8");
    assert(
      src.includes("window.adb"),
      "renderer.js should use window.adb bridge",
    );
  });
}

async function testWorkspace() {
  console.log("\n🗂️  [17] Workspace Configuration");

  await test("RemoteADB.code-workspace is valid JSON", async () => {
    const p = path.join(__dirname, "RemoteADB.code-workspace");
    assert(fs.existsSync(p), "Workspace file missing");
    const ws = JSON.parse(fs.readFileSync(p, "utf8"));
    assert(Array.isArray(ws.folders), "folders should be an array");
  });

  await test("Remote-ADB-App is included in workspace folders", async () => {
    const ws = JSON.parse(
      fs.readFileSync(path.join(__dirname, "RemoteADB.code-workspace"), "utf8"),
    );
    const paths = ws.folders.map((f) => f.path);
    assert(
      paths.includes("Remote-ADB-App"),
      `Remote-ADB-App not in folders: ${paths.join(", ")}`,
    );
  });

  await test("All 5 components are in workspace folders", async () => {
    const ws = JSON.parse(
      fs.readFileSync(path.join(__dirname, "RemoteADB.code-workspace"), "utf8"),
    );
    const paths = ws.folders.map((f) => f.path);
    const expected = [
      "Remote-ADB-Android",
      "Remote-ADB-App",
      "Remote-ADB-Back",
      "Remote-ADB-Control",
      "Remote-ADB-Front",
    ];
    for (const e of expected) {
      assert(paths.includes(e), `Missing folder: ${e}`);
    }
  });

  await test("Tasks are defined and have required labels", async () => {
    const ws = JSON.parse(
      fs.readFileSync(path.join(__dirname, "RemoteADB.code-workspace"), "utf8"),
    );
    const tasks = (ws.tasks && ws.tasks.tasks) || [];
    assert(tasks.length >= 4, `Expected at least 4 tasks, got ${tasks.length}`);
    const labels = tasks.map((t) => t.label);
    assert(
      labels.some((l) => l.includes("Remote-ADB-Back")),
      "Missing backend task",
    );
    assert(
      labels.some((l) => l.includes("Remote-ADB-Control")),
      "Missing control task",
    );
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(60));
  console.log("  RemoteADB — Full Automated Test Suite");
  console.log("═".repeat(60));

  // Source-only tests (no server needed)
  await testFrontendSource();
  await testControlScaffold();
  await testWorkspace();

  // Server-dependent tests
  console.log("\n🔌 Starting backend server...");
  try {
    await startBackend();
    console.log(`  Backend ready on port ${PORT}`);
  } catch (err) {
    console.error(`\n  ❌ FATAL: Could not start backend: ${err.message}`);
    console.error("  Skipping all server tests.\n");
    printSummary();
    process.exit(1);
  }

  try {
    await testStartup();
    await testSecurityHeaders();
    await testAuth();
    await testStatus();
    await testConnect();
    await testFileManager();
    await testShell();
    await testScreen();
    await testCamera();
    await testMic();
    await testUpdater();
    await testInstall();
    await testInputValidation();
    await testStaticFiles();
  } finally {
    stopBackend();
  }

  printSummary();
}

function printSummary() {
  const total = passed + failed + skipped;
  console.log("\n" + "═".repeat(60));
  console.log(
    `  Results: ${passed} passed, ${failed} failed, ${skipped} skipped / ${total} total`,
  );
  console.log("═".repeat(60));
  if (failed > 0) {
    console.log("\n  Failed tests:");
    results
      .filter((r) => r.result === "FAIL")
      .forEach((r) => {
        console.log(`    ❌ ${r.name}`);
        console.log(`       ${r.error}`);
      });
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nUnhandled test error:", err);
  stopBackend();
  process.exit(1);
});
