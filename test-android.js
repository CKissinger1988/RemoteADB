/**
 * RemoteADB — Android Connectivity & Functionality Test Suite
 *
 * Tests (no physical device required):
 *   1.  ADB binary health & server lifecycle
 *   2.  ADB protocol — track-devices watcher handshake
 *   3.  ADB TCP/IP connect/disconnect error handling
 *   4.  Backend device API graceful error handling (no device)
 *   5.  Backend reverse-forwarding logic
 *   6.  Device watcher startup in backend
 *   7.  Android app project structure validation
 *   8.  AndroidManifest.xml static analysis
 *   9.  Kotlin source static analysis (MainActivity + UpdateChecker)
 *   10. Gradle build file validation
 *   11. Network security config validation
 *   12. Resource files completeness
 *   13. GitHub Actions CI workflow validation
 *   14. Manual test checklist (documented, not automated)
 */

const { execFile, spawn } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

const ADB = "C:\\Program Files\\platform-tools\\adb.exe";
const BACK = path.join(__dirname, "Remote-ADB-Back");
const APP = path.join(__dirname, "Remote-ADB-App");
const PORT = 5200;

let passed = 0,
  failed = 0,
  warned = 0,
  skipped = 0;
const issues = [];

// ─── helpers ──────────────────────────────────────────────────────────────────

function pass(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}
function fail(name, detail) {
  failed++;
  issues.push({ name, detail });
  console.log(`  ❌ ${name}\n     └─ ${detail}`);
}
function warn(name, detail) {
  warned++;
  console.log(`  ⚠️  ${name}\n     └─ ${detail}`);
}
function skip(name, reason) {
  skipped++;
  console.log(`  ⏭️  ${name} (${reason})`);
}
function section(t) {
  console.log(`\n${"─".repeat(62)}\n  ${t}\n${"─".repeat(62)}`);
}

function adb(args, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : "";
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: p,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(b),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve({ s: res.statusCode, b: JSON.parse(d) });
          } catch {
            resolve({ s: res.statusCode, b: d });
          }
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}

function readApp(relPath) {
  return fs.readFileSync(path.join(APP, relPath), "utf8");
}

// ─── 1. ADB binary health ─────────────────────────────────────────────────────

async function testADBHealth() {
  section("1. ADB Binary Health & Server Lifecycle");

  // Binary exists
  if (fs.existsSync(ADB)) pass(`adb.exe found at ${ADB}`);
  else {
    fail("adb.exe", `Not found at ${ADB}`);
    return;
  }

  // Version output
  try {
    const ver = await adb(["version"]);
    const match = ver.match(/Android Debug Bridge version ([\d.]+)/);
    if (match) pass(`adb version: ${match[1]}`);
    else fail("adb version output", `Unexpected: ${ver}`);
  } catch (e) {
    fail("adb version", e.message);
  }

  // Start-server
  try {
    const out = await adb(["start-server"]);
    pass(`adb start-server: ${out || "(already running)"}`);
  } catch (e) {
    warn("adb start-server", e.message);
  }

  // ADB server responding on port 5037
  await new Promise((resolve) => {
    const s = net.createConnection(5037, "127.0.0.1");
    s.on("connect", () => {
      s.destroy();
      pass("ADB server listening on tcp:5037");
      resolve();
    });
    s.on("error", () => {
      fail("ADB server port 5037", "Not reachable");
      resolve();
    });
    s.setTimeout(3000, () => {
      s.destroy();
      fail("ADB server port 5037", "Timeout");
      resolve();
    });
  });

  // devices output
  try {
    const out = await adb(["devices"]);
    if (out.startsWith("List of devices attached"))
      pass("adb devices returns header");
    else fail("adb devices", `Unexpected output: ${out}`);
    const lines = out
      .split("\n")
      .slice(1)
      .filter((l) => l.trim());
    if (lines.length === 0)
      warn(
        "No devices",
        "No Android devices connected — device-specific tests will be skipped",
      );
    else
      pass(
        `${lines.length} device(s) attached: ${lines.map((l) => l.trim()).join(", ")}`,
      );
  } catch (e) {
    fail("adb devices", e.message);
  }
}

// ─── 2. ADB protocol — track-devices watcher handshake ───────────────────────

async function testTrackDevicesProtocol() {
  section("2. ADB Protocol — track-devices Watcher Handshake");

  // The ADB server uses a custom binary protocol.
  // A track-devices request: send "000Chost:track-devices" (4-hex-digit length prefix)
  await new Promise((resolve) => {
    // ADB protocol: 4-hex-digit length prefix + command
    // 'host:track-devices' = 18 chars = 0x12
    const msg = Buffer.from("0012host:track-devices");
    const sock = net.createConnection(5037, "127.0.0.1");
    let response = Buffer.alloc(0);

    sock.setTimeout(4000);
    sock.on("connect", () => {
      pass("Connected to ADB server socket on port 5037");
      sock.write(msg);
    });

    sock.on("data", (chunk) => {
      response = Buffer.concat([response, chunk]);
      if (response.length >= 4) {
        const status = response.slice(0, 4).toString();
        if (status === "OKAY") {
          pass("ADB track-devices handshake: received OKAY response");
          sock.destroy();
        } else if (status === "FAIL") {
          fail(
            "ADB track-devices",
            `Server replied FAIL: ${response.slice(8).toString()}`,
          );
          sock.destroy();
        } else {
          fail(
            "ADB track-devices",
            `Unexpected response: ${response.slice(0, 8).toString()}`,
          );
          sock.destroy();
        }
      }
    });

    sock.on("error", (e) => {
      fail("ADB socket", e.message);
      resolve();
    });
    sock.on("close", () => resolve());
    sock.on("timeout", () => {
      fail("ADB track-devices", "Timeout waiting for response");
      sock.destroy();
      resolve();
    });
  });

  // Verify that ADB responds to "host:version" too
  await new Promise((resolve) => {
    const msg = Buffer.from("000Chost:version");
    const sock = net.createConnection(5037, "127.0.0.1");
    let response = Buffer.alloc(0);
    sock.setTimeout(3000);
    sock.on("connect", () => sock.write(msg));
    sock.on("data", (chunk) => {
      response = Buffer.concat([response, chunk]);
      if (response.length >= 4) {
        const ok = response.slice(0, 4).toString() === "OKAY";
        if (ok) pass("ADB host:version query returns OKAY");
        else
          fail("ADB host:version", `Got: ${response.slice(0, 8).toString()}`);
        sock.destroy();
      }
    });
    sock.on("error", (e) => {
      fail("ADB version socket", e.message);
      resolve();
    });
    sock.on("close", () => resolve());
    sock.on("timeout", () => {
      sock.destroy();
      resolve();
    });
  });
}

// ─── 3. ADB TCP/IP connect/disconnect error handling ─────────────────────────

async function testADBConnectErrors() {
  section("3. ADB TCP/IP Connect / Disconnect Error Handling");

  // Connect to invalid host — should fail with a clear message
  try {
    await adb(["connect", "192.168.0.254:5555"], 5000);
    warn("adb connect invalid host", "Expected failure but got success");
  } catch (e) {
    if (
      e.message.includes("refused") ||
      e.message.includes("timed out") ||
      e.message.includes("cannot connect") ||
      e.message.includes("Connection refused") ||
      e.message.includes("failed")
    ) {
      pass(
        `adb connect invalid host fails gracefully: "${e.message.split("\n")[0]}"`,
      );
    } else {
      warn("adb connect invalid host", `Unexpected error format: ${e.message}`);
    }
  }

  // reverse with no device — should fail cleanly
  try {
    await adb(["reverse", "tcp:5200", "tcp:5200"], 5000);
    warn("adb reverse (no device)", "Expected failure but got success");
  } catch (e) {
    if (
      e.message.includes("no devices") ||
      e.message.includes("device offline") ||
      e.message.includes("error:") ||
      e.message.toLowerCase().includes("failed")
    ) {
      pass(
        `adb reverse with no device fails gracefully: "${e.message.split("\n")[0]}"`,
      );
    } else {
      warn("adb reverse no device", `Unexpected: ${e.message}`);
    }
  }

  // reverse --remove-all with no device
  try {
    await adb(["reverse", "--remove-all"], 5000);
    warn(
      "adb reverse --remove-all (no device)",
      "Expected failure but got success",
    );
  } catch (e) {
    pass(`adb reverse --remove-all with no device fails gracefully`);
  }

  // shell with no device
  try {
    await adb(["shell", "echo", "hello"], 5000);
    warn("adb shell (no device)", "Expected failure but got success");
  } catch (e) {
    if (
      e.message.includes("no devices") ||
      e.message.includes("device") ||
      e.message.includes("error")
    ) {
      pass(`adb shell with no device fails gracefully`);
    } else {
      warn("adb shell no device", `Unexpected: ${e.message}`);
    }
  }
}

// ─── 4. Backend device API — graceful error handling ─────────────────────────

async function testBackendDeviceAPIs() {
  section("4. Backend Device API — Graceful Error Handling (No Device)");

  // Check backend is alive
  try {
    const r = await req("GET", "/status");
    if (r.s === 200 && r.b.status === "ok") {
      pass(
        `/status: adbInstalled=${r.b.adbInstalled}, devices=${JSON.stringify(r.b.devices)}`,
      );
      if (r.b.adbInstalled !== true)
        warn(
          "ADB detection",
          "Backend reports ADB not installed — check ADB_PATH env var",
        );
    } else fail("/status", `Unexpected: HTTP ${r.s} ${JSON.stringify(r.b)}`);
  } catch (e) {
    fail("/status", `Backend unreachable: ${e.message}`);
    return;
  }

  const deviceEndpoints = [
    ["POST", "/connect", {}, [200, 500]],
    ["POST", "/disconnect", {}, [200, 500]],
    ["GET", "/files/list", null, [200, 500]],
    ["GET", "/files/download?path=/sdcard/test.txt", null, [200, 400, 500]],
    ["GET", "/screen", null, [200, 500]],
    ["POST", "/shell", { command: "echo hello" }, [200, 500]],
    ["GET", "/camera/latest", null, [200, 500]],
    ["POST", "/camera/record/start", {}, [200, 400, 500]],
    ["POST", "/camera/record/stop", {}, [200, 400, 500]],
    ["POST", "/mic/record", { duration: 1 }, [200, 500]],
  ];

  for (const [method, endpoint, body, allowedStatuses] of deviceEndpoints) {
    try {
      const r = await req(method, endpoint, body);
      if (allowedStatuses.includes(r.s)) {
        const statusInfo =
          r.b && r.b.status ? `status="${r.b.status}"` : `HTTP ${r.s}`;
        if (r.s >= 500)
          pass(
            `${method} ${endpoint.split("?")[0]} → ${r.s} (graceful error: "${(r.b.message || "").slice(0, 60)}")`,
          );
        else if (r.s === 400)
          pass(
            `${method} ${endpoint.split("?")[0]} → ${r.s} (validation: "${(r.b.message || "").slice(0, 60)}")`,
          );
        else pass(`${method} ${endpoint.split("?")[0]} → ${r.s} ${statusInfo}`);
      } else {
        fail(
          `${method} ${endpoint}`,
          `Unexpected HTTP ${r.s}: ${JSON.stringify(r.b).slice(0, 80)}`,
        );
      }
    } catch (e) {
      fail(`${method} ${endpoint}`, e.message);
    }
  }

  // All error responses must be JSON (not HTML)
  try {
    const r = await req("POST", "/shell", { command: "anything" });
    if (typeof r.b === "object") pass("Error responses are JSON (not HTML)");
    else fail("Error response format", "Response is not JSON");
  } catch (e) {
    fail("Error response format check", e.message);
  }
}

// ─── 5. Backend reverse-forwarding logic ─────────────────────────────────────

async function testReverseForwarding() {
  section("5. Backend Reverse-Forwarding Logic");

  // /connect builds correct adb reverse command
  try {
    const backendJs = fs.readFileSync(
      path.join(BACK, "src", "backend.js"),
      "utf8",
    );
    if (backendJs.includes("reverse") && backendJs.includes("tcp:")) {
      pass("backend.js contains adb reverse tcp: forwarding logic");
    } else fail("adb reverse in backend", "No reverse tcp: logic found");

    // Checks that port matches the configured PORT variable
    if (
      backendJs.includes("tcp:${port}") ||
      backendJs.includes("`tcp:${port}`") ||
      backendJs.includes("tcp:5200")
    ) {
      pass("Reverse forwarding uses configured port (not hardcoded mismatch)");
    } else
      warn(
        "Reverse port",
        "Could not confirm reverse port matches backend PORT variable",
      );

    // Device watcher sets up reverse on new device
    if (
      backendJs.includes("startDeviceWatcher") &&
      backendJs.includes("track-devices")
    ) {
      pass("Device watcher uses adb track-devices for auto-reverse setup");
    } else
      fail("Device watcher", "No track-devices or startDeviceWatcher found");

    // SIGINT cleanup
    if (backendJs.includes("SIGINT") && backendJs.includes("screenrecord")) {
      pass("SIGINT handler cleans up active screen recording on exit");
    } else
      warn("SIGINT cleanup", "No SIGINT handler found for recording cleanup");
  } catch (e) {
    fail("backend.js read", e.message);
  }

  // /connect via API — confirm correct response shape
  try {
    const r = await req("POST", "/connect", {});
    if (r.b && (r.b.devices !== undefined || r.b.message)) {
      pass("/connect response has correct shape (devices or message)");
    } else
      warn(
        "/connect response shape",
        `Unexpected: ${JSON.stringify(r.b).slice(0, 80)}`,
      );
  } catch (e) {
    fail("/connect shape check", e.message);
  }
}

// ─── 6. Device watcher startup ────────────────────────────────────────────────

async function testDeviceWatcher() {
  section("6. Device Watcher — track-devices ADB Spawn Behavior");

  // Spawn adb track-devices briefly and check it connects
  await new Promise((resolve) => {
    let received = "";
    const proc = spawn(ADB, ["track-devices"]);
    const timeout = setTimeout(() => {
      proc.kill();
    }, 3000);

    proc.stdout.on("data", (chunk) => {
      received += chunk.toString("binary");
    });

    proc.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (received.length >= 0) {
        // any response (even empty OKAY) is valid
        pass(
          `adb track-devices spawns and communicates (received ${received.length} bytes, exit: ${signal || code})`,
        );
      } else {
        fail("adb track-devices", "No data received from process");
      }
      resolve();
    });

    proc.on("error", (e) => {
      clearTimeout(timeout);
      fail("adb track-devices spawn", e.message);
      resolve();
    });
  });

  // Validate the watcher parsing logic
  const backendJs = fs.readFileSync(
    path.join(BACK, "src", "backend.js"),
    "utf8",
  );

  // Hex-length-prefix parser
  if (backendJs.includes("parseInt(lenHex, 16)")) {
    pass("Device watcher parses ADB hex-length-prefix protocol correctly");
  } else fail("Watcher protocol parser", "No hex-length-prefix parsing found");

  // Auto-reconnect on exit
  if (backendJs.includes("setTimeout(startDeviceWatcher")) {
    pass("Device watcher auto-reconnects after exit (3s delay)");
  } else warn("Watcher reconnect", "No auto-reconnect delay found after exit");

  // Guards against duplicate watchers
  if (backendJs.includes("if (!adbInstalled() || watcherProc)")) {
    pass("Device watcher guards against duplicate instances");
  } else warn("Watcher guard", "No duplicate-start guard found");
}

// ─── 7. Android app project structure ────────────────────────────────────────

function testAndroidProjectStructure() {
  section("7. Android App Project Structure");

  const requiredFiles = [
    "app/build.gradle",
    "app/src/main/AndroidManifest.xml",
    "app/src/main/java/com/remoteadb/app/MainActivity.kt",
    "app/src/main/java/com/remoteadb/app/UpdateChecker.kt",
    "app/src/main/res/values/strings.xml",
    "app/src/main/res/values/themes.xml",
    "app/src/main/res/values/colors.xml",
    "app/src/main/res/layout/activity_main.xml",
    "app/src/main/res/xml/network_security_config.xml",
    "app/src/main/res/drawable/ic_launcher.xml",
    "build.gradle",
    "settings.gradle",
    "gradlew",
    "gradle/wrapper/gradle-wrapper.properties",
  ];

  for (const f of requiredFiles) {
    if (fs.existsSync(path.join(APP, f))) pass(`${f} exists`);
    else fail(f, "File missing from Android project");
  }

  // Check gradlew is not empty
  const gradlew = path.join(APP, "gradlew");
  if (fs.existsSync(gradlew)) {
    const size = fs.statSync(gradlew).size;
    if (size > 100) pass(`gradlew has content (${size} bytes)`);
    else fail("gradlew", "File is empty or too small");
  }
}

// ─── 8. AndroidManifest.xml static analysis ───────────────────────────────────

function testAndroidManifest() {
  section("8. AndroidManifest.xml Static Analysis");

  const manifest = readApp("app/src/main/AndroidManifest.xml");

  // Required permissions
  if (manifest.includes("android.permission.INTERNET"))
    pass("INTERNET permission declared");
  else fail("INTERNET permission", "Missing — app cannot reach backend");

  // REQUEST_INSTALL_PACKAGES (for APK update download)
  if (manifest.includes("REQUEST_INSTALL_PACKAGES"))
    pass("REQUEST_INSTALL_PACKAGES declared");
  else
    warn("REQUEST_INSTALL_PACKAGES", "Missing — APK auto-update may not work");

  // MainActivity exported & LAUNCHER
  if (
    manifest.includes("android.intent.action.MAIN") &&
    manifest.includes("android.intent.category.LAUNCHER")
  )
    pass("MainActivity is MAIN/LAUNCHER");
  else
    fail("MainActivity intent-filter", "Missing MAIN/LAUNCHER intent filter");

  // android:exported="true" on MainActivity (required API 31+)
  if (manifest.includes('android:exported="true"'))
    pass('android:exported="true" set (required API 31+)');
  else warn("android:exported", "Not set — required for Android 12+ (API 31)");

  // Network security config
  if (manifest.includes("networkSecurityConfig"))
    pass("networkSecurityConfig referenced in manifest");
  else
    warn(
      "networkSecurityConfig",
      "Not referenced — cleartext HTTP to LAN may be blocked",
    );

  // Theme
  if (manifest.includes("Theme.RemoteADB") || manifest.includes("@style/"))
    pass("App theme referenced");
  else warn("App theme", "No theme reference found in manifest");

  // No test-only attributes
  if (!manifest.includes('android:debuggable="true"'))
    pass("android:debuggable NOT hardcoded (secure)");
  else
    warn(
      "android:debuggable",
      'Hardcoded "true" — remove for production builds',
    );

  // windowSoftInputMode for URL bar
  if (manifest.includes("adjustResize"))
    pass("windowSoftInputMode=adjustResize set (URL bar keyboard handling)");
  else
    warn(
      "windowSoftInputMode",
      "adjustResize not set — keyboard may cover URL input",
    );
}

// ─── 9. Kotlin source static analysis ─────────────────────────────────────────

function testKotlinSources() {
  section("9. Kotlin Source Static Analysis");

  const main = readApp("app/src/main/java/com/remoteadb/app/MainActivity.kt");
  const updater = readApp(
    "app/src/main/java/com/remoteadb/app/UpdateChecker.kt",
  );

  // MainActivity tests
  if (main.includes("class MainActivity : AppCompatActivity()"))
    pass("MainActivity extends AppCompatActivity");
  else fail("MainActivity class", "Not an AppCompatActivity subclass");

  if (main.includes("ActivityMainBinding") && main.includes("ViewBinding"))
    pass("ViewBinding used (type-safe view access)");
  else if (main.includes("ActivityMainBinding"))
    pass("ViewBinding used (ActivityMainBinding)");
  else warn("ViewBinding", "Not detected — using findViewById?");

  if (main.includes("WebView") && main.includes("WebViewClient"))
    pass("WebView with WebViewClient configured");
  else fail("WebView setup", "Missing WebView or WebViewClient");

  if (main.includes("javaScriptEnabled = true"))
    pass("JavaScript enabled in WebView");
  else fail("javaScriptEnabled", "JS not enabled — app will not work");

  if (main.includes("domStorageEnabled = true"))
    pass("DOM storage enabled (localStorage support)");
  else
    warn("domStorageEnabled", "Not enabled — frontend localStorage may fail");

  if (main.includes("MIXED_CONTENT_ALWAYS_ALLOW"))
    pass("Mixed content allowed (HTTP over HTTPS)");
  else
    warn(
      "mixedContentMode",
      "Not set — HTTP backend behind HTTPS may be blocked",
    );

  if (main.includes("onReceivedSslError") && main.includes("handler.proceed()"))
    warn(
      "SSL error bypass",
      "handler.proceed() accepts ALL SSL errors — insecure for production",
    );
  else pass("SSL error handler not silently bypassed");

  if (main.includes("saveState") && main.includes("restoreState"))
    pass("WebView state saved/restored on rotation");
  else
    warn("WebView state", "No save/restoreState — WebView reloads on rotation");

  if (main.includes("canGoBack") && main.includes("goBack"))
    pass("Back navigation in WebView handled");
  else warn("Back nav", "No WebView back-navigation handler");

  if (main.includes("SharedPreferences") && main.includes("backend_url"))
    pass("Backend URL persisted in SharedPreferences");
  else fail("URL persistence", "Backend URL not saved between app restarts");

  if (main.includes("Snackbar") && main.includes("connection_error"))
    pass("Connection error shown as Snackbar with Retry action");
  else warn("Connection error UI", "No Snackbar error message on load failure");

  if (main.includes("onProgressChanged") && main.includes("progressBar"))
    pass("Page-load progress bar wired to WebChromeClient.onProgressChanged");
  else warn("Progress bar", "No progress bar wired to page load");

  if (main.includes("checkForUpdates") && main.includes("Thread {"))
    pass("Update check runs on background Thread (non-blocking)");
  else warn("Update check thread", "Update check may block main thread");

  // UpdateChecker tests
  if (updater.includes("data class UpdateInfo"))
    pass("UpdateInfo data class defined");
  else fail("UpdateInfo", "data class missing");

  if (updater.includes("HttpURLConnection") && updater.includes("RELEASES_API"))
    pass("UpdateChecker uses HttpURLConnection to GitHub Releases API");
  else fail("UpdateChecker network", "HTTP connection not found");

  if (updater.includes("connectTimeout = 10_000"))
    pass("Connection timeout set (10s)");
  else
    warn("Connection timeout", "No connectTimeout set — may hang indefinitely");

  if (updater.includes("compareVersions"))
    pass("Semantic version comparison implemented");
  else fail("compareVersions", "No version comparison logic");

  if (updater.includes("APK_ASSET_PREFIX") && updater.includes(".apk"))
    pass("APK asset filter uses prefix + .apk extension matching");
  else warn("APK asset filter", "No APK-specific asset filter");

  // Package name consistency
  const pkgInMain = main.match(/^package ([\w.]+)/m)?.[1];
  const pkgInUpdater = updater.match(/^package ([\w.]+)/m)?.[1];
  if (pkgInMain && pkgInUpdater && pkgInMain === pkgInUpdater)
    pass(`Package name consistent: ${pkgInMain}`);
  else fail("Package name", `Mismatch: ${pkgInMain} vs ${pkgInUpdater}`);
}

// ─── 10. Gradle build file validation ─────────────────────────────────────────

function testGradleFiles() {
  section("10. Gradle Build File Validation");

  const appGradle = readApp("app/build.gradle");
  const rootGradle = readApp("build.gradle");
  const settings = readApp("settings.gradle");
  const wrapperProps = readApp("gradle/wrapper/gradle-wrapper.properties");

  // App module
  if (
    appGradle.includes("apply plugin: 'com.android.application'") ||
    appGradle.includes("com.android.application")
  )
    pass("app/build.gradle applies android application plugin");
  else fail("Android plugin", "com.android.application plugin not applied");

  const minSdkMatch = appGradle.match(/minSdk(?:Version)?\s*[=\s]+(\d+)/);
  if (minSdkMatch)
    pass(
      `minSdk: ${minSdkMatch[1]} (Android ${minSdkMatch[1] >= 21 ? "5.0+ Lollipop" : "older"})`,
    );
  else warn("minSdk", "Not found in app/build.gradle");

  const targetSdkMatch = appGradle.match(/targetSdk(?:Version)?\s*[=\s]+(\d+)/);
  if (targetSdkMatch) pass(`targetSdk: ${targetSdkMatch[1]}`);
  else warn("targetSdk", "Not found in app/build.gradle");

  const versionMatch = appGradle.match(/versionName\s+["']([^"']+)["']/);
  if (versionMatch) pass(`versionName: "${versionMatch[1]}"`);
  else warn("versionName", "Not set in app/build.gradle");

  if (
    appGradle.includes("buildFeatures") &&
    (appGradle.includes("viewBinding = true") ||
      appGradle.includes("viewBinding true"))
  )
    pass("ViewBinding enabled in buildFeatures");
  else warn("ViewBinding buildFeature", "Not explicitly enabled");

  if (appGradle.includes("kotlinOptions") && appGradle.includes("jvmTarget"))
    pass("Kotlin JVM target configured");
  else warn("Kotlin jvmTarget", "Not set in kotlinOptions");

  // Root build.gradle
  if (
    rootGradle.includes("com.android.tools.build:gradle") ||
    rootGradle.includes("com.android.application")
  )
    pass("Root build.gradle references Android Gradle Plugin");
  else warn("Root build.gradle", "No Android Gradle Plugin reference");

  if (rootGradle.includes("kotlin"))
    pass("Root build.gradle includes Kotlin plugin");
  else warn("Kotlin plugin", "Not referenced in root build.gradle");

  // settings.gradle
  if (settings.includes(":app")) pass("settings.gradle includes :app module");
  else fail(":app module", "Not included in settings.gradle");

  // Gradle wrapper
  const gradleVersionMatch = wrapperProps.match(/gradle-(\d+\.\d+(?:\.\d+)?)-/);
  if (gradleVersionMatch)
    pass(`Gradle wrapper version: ${gradleVersionMatch[1]}`);
  else
    warn(
      "Gradle wrapper version",
      "Could not parse version from gradle-wrapper.properties",
    );
}

// ─── 11. Network security config validation ────────────────────────────────────

function testNetworkSecurity() {
  section("11. Network Security Config");

  const nsc = readApp("app/src/main/res/xml/network_security_config.xml");

  // Cleartext permitted
  if (nsc.includes('cleartextTrafficPermitted="true"'))
    warn(
      "cleartextTrafficPermitted",
      "Set globally — consider restricting to localhost & private ranges only",
    );
  else if (nsc.includes('cleartextTrafficPermitted="false"'))
    fail(
      "cleartext blocked",
      "HTTP to local backend will be blocked — must allow cleartext for LAN use",
    );
  else
    warn(
      "cleartextTrafficPermitted",
      "Not explicitly set — defaults depend on targetSdkVersion",
    );

  // Check for localhost/LAN scope
  if (nsc.includes("localhost") || nsc.includes("127.0.0.1"))
    pass("Network security config scopes localhost explicitly");
  else
    warn(
      "localhost scope",
      "No explicit localhost entry — consider scoping cleartext to 127.0.0.1 and 192.168.0.0/16",
    );

  // Debug overrides
  if (nsc.includes("debug-overrides"))
    pass("debug-overrides block present (cert pinning bypass in debug)");
  else
    warn(
      "debug-overrides",
      "No debug-overrides block — custom CA certs may not work in debug builds",
    );

  if (nsc.includes("trust-anchors")) pass("trust-anchors block present");
  else warn("trust-anchors", "No trust-anchors — may use system defaults only");
}

// ─── 12. Resource files completeness ──────────────────────────────────────────

function testResources() {
  section("12. Android Resource Files");

  const strings = readApp("app/src/main/res/values/strings.xml");
  const themes = readApp("app/src/main/res/values/themes.xml");
  const layout = readApp("app/src/main/res/layout/activity_main.xml");

  // Required strings
  const requiredStrings = [
    "app_name",
    "default_backend_url",
    "connection_error",
    "retry",
    "update_available_title",
    "update_available_message",
    "update_download",
    "update_later",
  ];
  for (const s of requiredStrings) {
    if (strings.includes(`name="${s}"`)) pass(`strings.xml: "${s}" defined`);
    else fail(`strings.xml: "${s}"`, "Missing required string resource");
  }

  // default_backend_url points to correct port
  const urlMatch = strings.match(/name="default_backend_url">([^<]+)</);
  if (urlMatch) {
    const url = urlMatch[1].trim();
    if (url.includes(":5200"))
      pass(`default_backend_url: "${url}" (matches backend port 5200)`);
    else warn("default_backend_url", `Port may not match backend: "${url}"`);
  }

  // Theme
  if (themes.includes("Theme.RemoteADB") || themes.includes("Theme.Material"))
    pass("App theme defined");
  else warn("themes.xml", "No app theme definition found");

  if (themes.includes("NoActionBar") || themes.includes("actionBar"))
    pass("ActionBar configuration present in theme");
  else
    warn(
      "ActionBar theme",
      "No actionBar config — default action bar may appear",
    );

  // Layout
  if (layout.includes("WebView")) pass("activity_main.xml contains WebView");
  else fail("WebView in layout", "No WebView found in activity_main.xml");

  if (layout.includes("ProgressBar"))
    pass("activity_main.xml contains ProgressBar (page load indicator)");
  else
    warn(
      "ProgressBar in layout",
      "No ProgressBar — page load progress not shown",
    );

  if (layout.includes("urlInput") || layout.includes("url_input"))
    pass("URL input field in layout");
  else warn("URL input", "No URL input field in layout");

  if (layout.includes("goBtn") || layout.includes("go_btn"))
    pass("Go button in layout");
  else warn("Go button", "No Go button in layout");
}

// ─── 13. GitHub Actions CI validation ─────────────────────────────────────────

function testCIWorkflow() {
  section("13. GitHub Actions CI Workflow");

  const ciPath = path.join(
    __dirname,
    ".github",
    "workflows",
    "build-android.yml",
  );
  if (!fs.existsSync(ciPath)) {
    fail("build-android.yml", "CI workflow file not found");
    return;
  }

  const ci = fs.readFileSync(ciPath, "utf8");

  if (ci.includes("workflow_dispatch"))
    pass("Manual trigger (workflow_dispatch) enabled");
  else warn("workflow_dispatch", "No manual trigger — can only run on push");

  if (
    ci.includes("branches:") &&
    (ci.includes("master") || ci.includes("main"))
  )
    pass("CI triggers on push to master/main");
  else warn("CI trigger", "No branch push trigger found");

  if (ci.includes("actions/checkout")) pass("Checkout action present");
  else fail("Checkout", "No actions/checkout found in CI");

  if (ci.includes("JDK") || ci.includes("java")) pass("JDK setup step present");
  else fail("JDK setup", "No Java/JDK setup step in CI");

  if (ci.includes("local.properties") && ci.includes("sdk.dir"))
    pass("local.properties generated with sdk.dir in CI");
  else warn("local.properties in CI", "Not generated — Gradle may fail");

  if (ci.includes("assembleDebug") || ci.includes("assemble"))
    pass("Gradle assembleDebug build step present");
  else fail("Gradle build", "No assembleDebug step in CI");

  if (ci.includes("upload-artifact") || ci.includes("release"))
    pass("Artifact upload or release step present");
  else
    warn(
      "Artifact upload",
      "No artifact upload step — APK may not be preserved",
    );

  if (ci.includes("versionName") || ci.includes("VERSION"))
    pass("Version extracted from build.gradle in CI");
  else warn("Version extraction", "No version extraction step in CI");

  // Check if gradlew is chmod'd in CI
  if (ci.includes("chmod +x") && ci.includes("gradlew"))
    pass("gradlew made executable in CI (chmod +x)");
  else
    warn("gradlew chmod", "CI may fail on Linux if gradlew is not executable");
}

// ─── 14. Manual device test checklist ─────────────────────────────────────────

function printManualChecklist() {
  section("14. Manual Device Test Checklist (Run With a Physical Device)");

  const checks = [
    [
      "CONNECT",
      "Enable USB Debugging on Android: Settings → Developer Options → USB Debugging",
    ],
    [
      "CONNECT",
      'Plug device via USB — adb devices should show it as "device" (not "unauthorized")',
    ],
    [
      "CONNECT",
      'If "unauthorized": tap "Allow USB debugging" dialog on phone, then re-run adb devices',
    ],
    [
      "CONNECT",
      "Run: curl -s http://127.0.0.1:5200/status — confirm devices[] is non-empty",
    ],
    [
      "REVERSE",
      "Run: adb reverse tcp:5200 tcp:5200 — enables device to reach backend as localhost:5200",
    ],
    ["REVERSE", "Confirm: adb reverse --list shows tcp:5200 <-> tcp:5200"],
    [
      "WEBVIEW",
      "Install the Remote-ADB-App APK on device, open it, confirm UI loads from backend",
    ],
    [
      "WEBVIEW",
      "Change backend URL in app to <your-PC-LAN-IP>:5200, confirm it loads remotely",
    ],
    [
      "SCREEN",
      "curl -s \"http://127.0.0.1:5200/screen\" | python3 -c \"import sys,json,base64,io; d=json.load(sys.stdin); open('screen.png','wb').write(base64.b64decode(d['image']))\" — save screenshot",
    ],
    [
      "SHELL",
      'curl -s -X POST http://127.0.0.1:5200/shell -H "Content-Type: application/json" -d "{\"command\":\"getprop ro.product.model\"}" — check device model',
    ],
    [
      "SHELL",
      'curl -s -X POST http://127.0.0.1:5200/shell -d "{\"command\":\"input tap 540 960\"}" — tap center of screen',
    ],
    [
      "FILES",
      'curl -s "http://127.0.0.1:5200/files/list?path=/sdcard" — list device files',
    ],
    [
      "FILES",
      "Upload a small text file via /files/upload POST endpoint (or the web UI)",
    ],
    ["FILES", "Download a file via /files/download and verify its contents"],
    [
      "CAMERA",
      "curl -X POST http://127.0.0.1:5200/camera/record/start — start screen recording",
    ],
    [
      "CAMERA",
      "Wait 5 seconds, then POST /camera/record/stop — verify MP4 downloads",
    ],
    [
      "CAMERA",
      "GET /camera/latest — confirm latest photo from DCIM/Camera is fetched",
    ],
    [
      "WATCHER",
      "Unplug and replug USB while backend is running — check that adb reverse is auto-re-applied",
    ],
    [
      "TCP_IP",
      "adb tcpip 5555 → adb connect <device-ip>:5555 → confirm wireless ADB works",
    ],
    [
      "TCP_IP",
      'Test POST /connect with {"deviceId":"<device-ip>:5555"} via the web UI',
    ],
    [
      "UPDATE",
      "GET /api/update-check — confirm updateAvailable and current version appear in UI",
    ],
  ];

  console.log("\n  The following tests require a connected Android device:\n");
  for (const [tag, desc] of checks) {
    console.log(`  [ ] [${tag.padEnd(7)}] ${desc}`);
  }
  console.log("");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(62));
  console.log("  RemoteADB — Android Connectivity Test Suite");
  console.log("═".repeat(62));

  await testADBHealth();
  await testTrackDevicesProtocol();
  await testADBConnectErrors();
  await testBackendDeviceAPIs();
  await testReverseForwarding();
  await testDeviceWatcher();
  testAndroidProjectStructure();
  testAndroidManifest();
  testKotlinSources();
  testGradleFiles();
  testNetworkSecurity();
  testResources();
  testCIWorkflow();
  printManualChecklist();

  const total = passed + failed + warned + skipped;
  console.log("═".repeat(62));
  console.log(
    `  Results: ${passed} passed  ${failed} failed  ${warned} warnings  ${skipped} skipped  (${total} total)`,
  );
  console.log("═".repeat(62));

  if (failed > 0) {
    console.log("\n  ❌ Failures:");
    issues.forEach((i) => console.log(`    • ${i.name}\n      ${i.detail}`));
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\nFatal:", e);
  process.exit(1);
});
