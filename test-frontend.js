/**
 * RemoteADB — Comprehensive Frontend Test Suite
 *
 * Tests:
 *   1.  Live HTTP delivery (status codes, headers, content-type)
 *   2.  HTML structure & completeness (doctype, meta, charset, viewport)
 *   3.  All IDs referenced in app.js exist in index.html
 *   4.  CSS class coverage (classes used in HTML that are NOT defined in CSS)
 *   5.  CSS dead-code (classes defined in CSS but never used in HTML)
 *   6.  Accessibility (labels, alt text, ARIA, keyboard nav, heading order)
 *   7.  Tab navigation completeness (data-tab ↔ panel id mapping)
 *   8.  data-* attribute integrity (every data-* used in JS is set in HTML)
 *   9.  Performance — file sizes
 *   10. Security — CSP, no inline scripts except known safe ones
 *   11. Login page integrity
 *   12. Theme toggle (light-mode CSS variable overrides present)
 *   13. Console-log panel present and styled
 *   14. Duplicate CSS rule detection
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const FRONT = path.join(__dirname, "Remote-ADB-Front");
const PORT = 5200;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0,
  failed = 0,
  warned = 0;
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
  issues.push({ name, detail, level: "warn" });
  console.log(`  ⚠️  ${name}\n     └─ ${detail}`);
}
function section(title) {
  console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`);
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const r = http.get(`${BASE}${urlPath}`, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString(),
          headers: res.headers,
        }),
      );
    });
    r.on("error", reject);
  });
}

function readFront(name) {
  return fs.readFileSync(path.join(FRONT, name), "utf8");
}

// ─── 1. Live HTTP delivery ─────────────────────────────────────────────────────

async function testHTTP() {
  section("1. Live HTTP Delivery");

  const pages = [
    { path: "/", expectHtml: true, title: "GET / → index.html" },
    { path: "/index.html", expectHtml: true, title: "GET /index.html" },
    { path: "/login", expectHtml: true, title: "GET /login → login.html" },
    { path: "/login.html", expectHtml: true, title: "GET /login.html" },
    { path: "/app.js", expectJs: true, title: "GET /app.js" },
    { path: "/login.js", expectJs: true, title: "GET /login.js" },
    { path: "/styles.css", expectCss: true, title: "GET /styles.css" },
    { path: "/favicon.ico", expectBin: true, title: "GET /favicon.ico" },
    {
      path: "/not-a-page",
      expectHtml: true,
      title: "GET /not-a-page → SPA fallback",
    },
  ];

  for (const p of pages) {
    try {
      const res = await get(p.path);
      if (res.status !== 200) {
        fail(p.title, `HTTP ${res.status}`);
        continue;
      }
      const ct = (res.headers["content-type"] || "").toLowerCase();
      if (p.expectHtml && !ct.includes("html")) {
        fail(p.title, `Wrong content-type: ${ct}`);
        continue;
      }
      if (p.expectJs && !ct.includes("javascript")) {
        fail(p.title, `Wrong content-type: ${ct}`);
        continue;
      }
      if (p.expectCss && !ct.includes("css")) {
        fail(p.title, `Wrong content-type: ${ct}`);
        continue;
      }
      if (p.expectHtml && !res.body.includes("<html")) {
        fail(p.title, "No <html> in body");
        continue;
      }
      pass(p.title);
    } catch (e) {
      fail(p.title, e.message);
    }
  }

  // Security headers on all HTML pages
  try {
    const res = await get("/");
    const h = res.headers;
    const checks = [
      ["x-content-type-options", "nosniff"],
      ["x-frame-options", "SAMEORIGIN"],
      ["referrer-policy", "no-referrer"],
      ["cache-control", "no-store"],
    ];
    for (const [hdr, expected] of checks) {
      if (h[hdr] === expected) pass(`Security header: ${hdr}: ${expected}`);
      else
        fail(
          `Security header: ${hdr}`,
          `Expected "${expected}", got "${h[hdr]}"`,
        );
    }
    if (h["content-security-policy"])
      pass("Content-Security-Policy header present");
    else fail("Content-Security-Policy header", "Missing");
    if (!h["x-powered-by"])
      pass("X-Powered-By absent (fingerprinting suppressed)");
    else fail("X-Powered-By", `Should be absent, found "${h["x-powered-by"]}"`);
  } catch (e) {
    fail("Security headers check", e.message);
  }
}

// ─── 2. HTML structure ────────────────────────────────────────────────────────

function testHTMLStructure() {
  section("2. HTML Structure & Meta Tags");

  const html = readFront("index.html");

  // Doctype
  if (/^<!DOCTYPE html>/i.test(html.trim())) pass("DOCTYPE html declared");
  else fail("DOCTYPE", "Missing or malformed DOCTYPE html");

  // charset
  if (
    html.includes('charset="UTF-8"') ||
    html.includes("charset='UTF-8'") ||
    html.toLowerCase().includes("charset=utf-8")
  )
    pass("charset=UTF-8 declared");
  else fail("charset", "Missing charset=UTF-8 meta tag");

  // viewport
  if (html.includes('name="viewport"') && html.includes("width=device-width"))
    pass("Viewport meta tag present");
  else fail("Viewport meta", "Missing or incomplete viewport meta tag");

  // title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) pass(`<title> is "${titleMatch[1].trim()}"`);
  else fail("<title>", "Missing page title");

  // stylesheet link
  if (html.includes('href="styles.css"')) pass("styles.css linked");
  else fail("styles.css link", "Not found in <head>");

  // script tag
  if (html.includes('src="app.js"')) pass("app.js script tag present");
  else fail("app.js script", "Not found in HTML");

  // script defer or at bottom
  if (
    html.includes("</body>") &&
    html.lastIndexOf('src="app.js"') > html.indexOf("</body>") - 200
  )
    pass("app.js loaded at end of body (non-blocking)");
  else
    warn(
      "app.js placement",
      "Script should be at bottom of <body> or use defer",
    );

  // No inline scripts (except onclick for console clear)
  const inlineScripts = [
    ...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi),
  ];
  const unsafeInline = inlineScripts.filter((m) => !m[1].includes("statusLog"));
  if (unsafeInline.length === 0) pass("No unsafe inline <script> blocks");
  else
    warn(
      "Inline <script>",
      `Found ${unsafeInline.length} inline script block(s) without src`,
    );

  // Tabs exist
  for (const tab of ["dashboard", "files", "media", "settings"]) {
    if (html.includes(`id="${tab}"`)) pass(`Tab panel id="${tab}" exists`);
    else fail(`Tab panel "${tab}"`, `id="${tab}" not found in HTML`);
  }

  // Tab buttons
  const tabBtns = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  if (tabBtns.length === 4) pass(`4 tab buttons found: ${tabBtns.join(", ")}`);
  else
    fail(
      "Tab buttons",
      `Expected 4, found ${tabBtns.length}: ${tabBtns.join(", ")}`,
    );

  // Every data-tab value has matching panel
  for (const tab of tabBtns) {
    if (html.includes(`id="${tab}"`))
      pass(`data-tab="${tab}" matches panel id`);
    else fail(`data-tab="${tab}"`, `No matching panel with id="${tab}"`);
  }
}

// ─── 3. ID coverage: every getElementById in app.js exists in index.html ─────

function testIDCoverage() {
  section("3. JavaScript → HTML ID Coverage");

  const js = readFront("app.js");
  const html = readFront("index.html");

  // Extract all getElementById calls
  const idRefs = [...js.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map(
    (m) => m[1],
  );
  const unique = [...new Set(idRefs)];

  // Known nulls that are intentional (old tap/swipe UI, replaced with explicit null)
  const intentionalNulls = new Set([
    "tapBtn",
    "swipeBtn",
    "tapX",
    "tapY",
    "swipeFrom",
    "swipeTo",
  ]);

  let missingCount = 0;
  for (const id of unique) {
    if (intentionalNulls.has(id)) {
      pass(
        `id="${id}" — intentionally null (tap/swipe UI removed, explicit null)`,
      );
      continue;
    }
    if (html.includes(`id="${id}"`)) pass(`id="${id}" exists in index.html`);
    else {
      fail(`getElementById("${id}")`, `id="${id}" not found in index.html`);
      missingCount++;
    }
  }

  if (missingCount === 0)
    pass(`All ${unique.length} getElementById targets resolved`);
}

// ─── 4 & 5. CSS class coverage ────────────────────────────────────────────────

function testCSSCoverage() {
  section("4. CSS Class Coverage (HTML → CSS)");

  const html = readFront("index.html");
  const css = readFront("styles.css");

  // Extract classes used in HTML (from class="..." attributes)
  const htmlClasses = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => htmlClasses.add(c));
  }

  // Extract class selectors defined in CSS
  const cssClasses = new Set();
  for (const m of css.matchAll(/(?<![0-9-])\.([\w-]+)[\s{:,>~+\[]/g)) {
    cssClasses.add(m[1]);
  }

  const missing = [...htmlClasses].filter((c) => !cssClasses.has(c));
  if (missing.length === 0) {
    pass(`All ${htmlClasses.size} HTML classes have CSS definitions`);
  } else {
    for (const c of missing) {
      warn(
        `CSS missing for class "${c}"`,
        `Used in index.html but no .${c} rule in styles.css`,
      );
    }
  }

  section("5. CSS Dead Code (CSS → HTML)");

  // Classes defined in CSS but not used in HTML (informational)
  // Exclude pseudo-classes, modifiers, and dynamic classes added by JS
  const jsContent = readFront("app.js");
  const dynamicClasses = new Set();
  for (const m of jsContent.matchAll(
    /classList\.(?:add|remove|toggle)\(["']([^"']+)["']\)/g,
  )) {
    m[1].split(/\s+/).forEach((c) => dynamicClasses.add(c));
  }
  // Also extract classes injected via innerHTML/template literals
  for (const m of jsContent.matchAll(/class="([^"]+)"/g)) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => dynamicClasses.add(c));
  }
  for (const m of jsContent.matchAll(/class=\\?"([^"\\]+)\\?"/g)) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => dynamicClasses.add(c));
  }
  // Detect classes injected via template literals (e.g. `log-entry log-${type}`)
  for (const m of jsContent.matchAll(/`[^`]*class[^`]*`/g)) {
    const classMatches = m[0].matchAll(/[\s"'`]([a-z][\w-]+)/g);
    for (const cm of classMatches) dynamicClasses.add(cm[1]);
  }
  // Also look for .className = `...` template literal patterns
  for (const m of jsContent.matchAll(
    /\.className\s*=\s*[`'"]([^`'"]+)[`'"]/g,
  )) {
    m[1]
      .split(/\s+|\${[^}]+}/)
      .filter((s) => /^[a-z][\w-]+$/.test(s))
      .forEach((c) => dynamicClasses.add(c));
  }

  const loginHtml = readFront("login.html");
  const loginClasses = new Set();
  for (const m of loginHtml.matchAll(/class="([^"]+)"/g)) {
    m[1]
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => loginClasses.add(c));
  }

  const allUsed = new Set([...htmlClasses, ...dynamicClasses, ...loginClasses]);
  const unused = [...cssClasses].filter((c) => !allUsed.has(c));

  if (unused.length === 0) pass("No CSS dead-code detected");
  else {
    for (const c of unused) {
      warn(
        `Possibly unused CSS class ".${c}"`,
        "Not found in HTML or dynamic class operations",
      );
    }
  }
}

// ─── 6. Accessibility ─────────────────────────────────────────────────────────

function testAccessibility() {
  section("6. Accessibility");

  const html = readFront("index.html");

  // All inputs have associated labels (by id, for= or wrapping label)
  const inputIds = [...html.matchAll(/<input[^>]+id="([^"]+)"/g)].map(
    (m) => m[1],
  );
  for (const id of inputIds) {
    const hasFor = html.includes(`for="${id}"`);
    const hasLabel = new RegExp(`<label[^>]*>.*?id="${id}"`, "s").test(html);
    // Check for aria-label directly on the input element
    const hasAriaLabel =
      new RegExp(`id="${id}"[^>]*aria-label`).test(html) ||
      new RegExp(`aria-label[^>]*id="${id}"`).test(html);
    const hasPlaceholder =
      new RegExp(`id="${id}"[^>]*placeholder`).test(html) ||
      new RegExp(`placeholder[^>]*id="${id}"`).test(html);
    if (hasFor || hasLabel) pass(`Input #${id} has associated <label>`);
    else if (hasAriaLabel) pass(`Input #${id} has aria-label attribute`);
    else if (hasPlaceholder)
      warn(
        `Input #${id}`,
        "No <label> or aria-label \u2014 relies on placeholder only",
      );
    else warn(`Input #${id}`, "No associated <label> or aria-label found");
  }

  // Buttons have text content (not just icons)
  const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
  for (const [full, content] of buttons) {
    const text = content.replace(/<[^>]+>/g, "").trim();
    const hasTitle = full.includes("title=");
    if (text.length > 0)
      pass(`Button "${text.slice(0, 30)}" has visible label`);
    else if (hasTitle) pass(`Icon-only button has title attribute`);
    else
      warn(
        "Button without text",
        `Button has no visible text or title: ${full.slice(0, 60)}...`,
      );
  }

  // Heading hierarchy
  const headings = [...html.matchAll(/<(h[1-6])[^>]*>/g)].map((m) => m[1]);
  if (headings.length > 0) {
    const levels = headings.map((h) => parseInt(h[1]));
    let ok = true;
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        ok = false;
        break;
      }
    }
    if (ok) pass(`Heading hierarchy is logical: ${headings.join(" → ")}`);
    else
      warn(
        "Heading hierarchy",
        `Skipped levels detected: ${headings.join(" → ")}`,
      );
  }

  // lang attribute on <html>
  if (html.match(/<html[^>]+lang=/))
    pass('<html lang="..."> attribute present');
  else warn("<html lang>", "Missing lang attribute on <html> element");

  // Tab panel roles (ARIA)
  if (html.includes('role="tab"') || html.includes('role="tabpanel"'))
    pass("ARIA tab roles present");
  else
    warn(
      "ARIA tab roles",
      'Tab nav has no role="tab"/role="tabpanel" — consider adding for screen readers',
    );

  // tabindex on screen preview (keyboard interaction)
  if (html.includes('tabindex="0"') && html.includes('id="screenPreview"'))
    pass('screenPreview has tabindex="0" (keyboard accessible)');
  else
    warn(
      "screenPreview keyboard access",
      'No tabindex="0" on interactive screen preview',
    );
}

// ─── 7. data-* attribute integrity ────────────────────────────────────────────

function testDataAttributes() {
  section("7. data-* Attribute Integrity");

  const html = readFront("index.html");
  const js = readFront("app.js");

  // Find all dataset.X accesses in JS
  const datasetRefs = new Set();
  for (const m of js.matchAll(/dataset\.(\w+)/g)) {
    datasetRefs.add(m[1]);
  }
  // Convert camelCase to kebab-case for HTML data- attribute name
  const camelToKebab = (s) => s.replace(/([A-Z])/g, "-$1").toLowerCase();

  for (const ref of datasetRefs) {
    const attrName = `data-${camelToKebab(ref)}`;
    if (html.includes(attrName))
      pass(`dataset.${ref} → ${attrName} present in HTML`);
    else
      warn(
        `dataset.${ref}`,
        `No ${attrName} attribute found in index.html (may be set dynamically)`,
      );
  }
}

// ─── 8. Performance — file sizes ──────────────────────────────────────────────

function testPerformance() {
  section("8. Performance — File Sizes");

  const files = [
    { name: "index.html", warnKB: 50, failKB: 200 },
    { name: "app.js", warnKB: 150, failKB: 500 },
    { name: "styles.css", warnKB: 50, failKB: 200 },
    { name: "login.html", warnKB: 20, failKB: 100 },
    { name: "login.js", warnKB: 10, failKB: 50 },
  ];

  for (const f of files) {
    const filepath = path.join(FRONT, f.name);
    if (!fs.existsSync(filepath)) {
      fail(`${f.name}`, "File not found");
      continue;
    }
    const bytes = fs.statSync(filepath).size;
    const kb = (bytes / 1024).toFixed(1);
    if (bytes > f.failKB * 1024)
      fail(`${f.name} size`, `${kb} KB — exceeds ${f.failKB} KB limit`);
    else if (bytes > f.warnKB * 1024)
      warn(`${f.name} size`, `${kb} KB — larger than ideal (${f.warnKB} KB)`);
    else pass(`${f.name}: ${kb} KB`);
  }

  // Check for unused/redundant large blocks in CSS
  const css = readFront("styles.css");
  const dupRules = [];
  const seen = new Map();
  for (const m of css.matchAll(/\.[\w-]+(?:\s*,\s*\.[\w-]+)*\s*\{[^}]*\}/g)) {
    const selector = m[0].match(/^([^{]+)/)[1].trim();
    if (seen.has(selector)) dupRules.push(selector);
    else seen.set(selector, true);
  }
  if (dupRules.length === 0) pass("No duplicate CSS rule selectors found");
  else
    warn(
      "Duplicate CSS selectors",
      `Found ${dupRules.length}: ${dupRules.slice(0, 5).join(", ")}`,
    );
}

// ─── 9. Login page integrity ──────────────────────────────────────────────────

function testLoginPage() {
  section("9. Login Page");

  const html = readFront("login.html");
  const js = readFront("login.js");

  // Basic structure
  if (/^<!DOCTYPE html>/i.test(html.trim())) pass("login.html has DOCTYPE");
  else fail("login.html DOCTYPE", "Missing");

  if (html.includes("charset")) pass("login.html has charset");
  else fail("login.html charset", "Missing");

  // Form present
  if (html.includes("<form")) pass("login.html has a <form> element");
  else fail("login.html form", "No <form> found");

  // Password input
  if (html.includes('type="password"'))
    pass('Password input uses type="password"');
  else fail("Password input", 'Should use type="password"');

  // Autocomplete off
  if (html.includes("autocomplete"))
    pass("Autocomplete attribute present on login form");
  else
    warn(
      "Autocomplete",
      'Consider autocomplete="current-password" for password managers',
    );

  // login.js wired
  if (html.includes('src="login.js"') || html.includes("src='login.js'"))
    pass("login.js is loaded");
  else fail("login.js", "Not referenced in login.html");

  // login.js posts to /login
  if (js.includes("/login")) pass("login.js calls POST /login");
  else fail("login.js /login", "No reference to /login endpoint");

  // Redirects on success
  if (js.includes("window.location") || js.includes("location.href"))
    pass("login.js redirects on success");
  else fail("login.js redirect", "No redirect after login found");

  // Error message element
  if (html.includes('id="loginError"') || html.includes('class="login-error"'))
    pass("Login error display element found");
  else
    warn("Login error display", "No error message element found in login.html");
}

// ─── 10. Theme system ─────────────────────────────────────────────────────────

function testThemeSystem() {
  section("10. Theme System (Dark / Light Mode)");

  const css = readFront("styles.css");
  const js = readFront("app.js");

  // CSS variables defined in :root
  const rootVars = [...css.matchAll(/:root\s*\{([^}]+)\}/gs)];
  if (rootVars.length > 0) {
    const vars = [...rootVars[0][1].matchAll(/--([\w-]+)\s*:/g)].map(
      (m) => m[1],
    );
    pass(
      `:root defines ${vars.length} CSS variables: ${vars.slice(0, 6).join(", ")}...`,
    );
  } else fail(":root CSS variables", "No :root { } block found in styles.css");

  // light-mode overrides
  if (css.includes("body.light-mode"))
    pass("body.light-mode override block exists");
  else fail("light-mode CSS", "No body.light-mode override found");

  // light-mode override uses same vars
  const lightBlock = css.match(/body\.light-mode\s*\{([^}]+)\}/s);
  if (lightBlock) {
    const lightVars = [...lightBlock[1].matchAll(/--([\w-]+)\s*:/g)].map(
      (m) => m[1],
    );
    pass(
      `light-mode overrides ${lightVars.length} variables: ${lightVars.join(", ")}`,
    );
  }

  // JS toggles light-mode class
  if (
    js.includes("classList.toggle('light-mode')") ||
    js.includes('classList.toggle("light-mode")')
  )
    pass("app.js toggles light-mode class on theme switch");
  else fail("Theme toggle JS", 'No classList.toggle("light-mode") in app.js');

  // localStorage persistence
  if (
    js.includes("localStorage.setItem('theme'") ||
    js.includes('localStorage.setItem("theme"')
  )
    pass("Theme preference saved to localStorage");
  else fail("Theme persistence", 'No localStorage.setItem("theme") in app.js');

  // Transitions
  if (
    css.includes("transition: background") ||
    css.includes("transition:background")
  )
    pass("CSS transitions on theme change present");
  else
    warn(
      "Theme transitions",
      "No transition on background-color for smooth theme switch",
    );
}

// ─── 11. Screen preview & interaction ─────────────────────────────────────────

function testScreenPreview() {
  section("11. Screen Preview & Interaction");

  const html = readFront("index.html");
  const js = readFront("app.js");
  const css = readFront("styles.css");

  if (html.includes('id="screenPreview"'))
    pass("screenPreview element present");
  else fail("screenPreview", 'id="screenPreview" not in HTML');

  // CSS for screen-preview
  if (css.includes(".screen-preview")) pass(".screen-preview CSS rule defined");
  else fail(".screen-preview CSS", "No .screen-preview rule in styles.css");

  // Background-image tap hint
  if (css.includes("screen-preview::after"))
    pass("::after hint overlay on screen preview");
  else
    warn("Screen preview hint", "No ::after hint text CSS on .screen-preview");

  // data-has-image used in JS and CSS
  if (js.includes("dataset.hasImage") || js.includes("data-has-image"))
    pass("data-has-image attribute used by JS");
  else warn("data-has-image", "JS does not set/check data-has-image");

  if (
    css.includes("[data-has-image='true']") ||
    css.includes('[data-has-image="true"]')
  )
    pass(
      "CSS [data-has-image='true'] rule hides placeholder on active screenshot",
    );
  else warn("data-has-image CSS", 'No CSS rule for [data-has-image="true"]');

  // Click-to-tap handler
  if (
    js.includes("screenPreview.addEventListener('click'") ||
    js.includes('screenPreview.addEventListener("click"')
  )
    pass("Click-to-tap handler on screenPreview");
  else fail("Click-to-tap", "No click listener on screenPreview");

  // deviceResolution used in scaling
  if (js.includes("deviceResolution.x") && js.includes("deviceResolution.y"))
    pass("Tap coordinates scaled against deviceResolution");
  else fail("Coordinate scaling", "deviceResolution not used in tap handler");
}

// ─── 12. File manager drag-and-drop ───────────────────────────────────────────

function testFileManager() {
  section("12. File Manager & Drag-and-Drop");

  const html = readFront("index.html");
  const js = readFront("app.js");
  const css = readFront("styles.css");

  if (html.includes('id="fileManagerPanel"'))
    pass("fileManagerPanel element present");
  else fail("fileManagerPanel", 'id="fileManagerPanel" not in HTML');

  // DnD events registered
  for (const evt of ["dragenter", "dragover", "dragleave", "drop"]) {
    if (js.includes(`'${evt}'`) || js.includes(`"${evt}"`))
      pass(`Drag-and-drop: "${evt}" event handled`);
    else fail(`DnD event "${evt}"`, "Not found in app.js");
  }

  // drag-over CSS
  if (css.includes(".file-manager-panel.drag-over"))
    pass(".file-manager-panel.drag-over highlight style defined");
  else
    fail(
      "drag-over CSS",
      "No .file-manager-panel.drag-over rule in styles.css",
    );

  // Upload progress bar
  if (
    html.includes('id="uploadProgressContainer"') &&
    html.includes('id="uploadProgressBar"')
  )
    pass("Upload progress bar elements present");
  else
    fail(
      "Upload progress bar",
      "Missing uploadProgressContainer or uploadProgressBar",
    );

  // XHR upload with progress
  if (js.includes("xhr.upload.onprogress"))
    pass("XHR upload uses onprogress for progress bar");
  else fail("Upload progress", "No xhr.upload.onprogress in app.js");

  // Cancel upload
  if (
    html.includes('id="cancelUploadBtn"') &&
    js.includes("currentUploadXhr")
  ) {
    pass("Upload cancel button and XHR abort wired");
  } else warn("Upload cancel", "cancelUploadBtn or xhr abort may not be wired");
}

// ─── 13. API surface completeness ─────────────────────────────────────────────

function testAPISurface() {
  section("13. API Surface — Frontend Coverage");

  const js = readFront("app.js");

  const endpoints = [
    ["/status", "GET", "Device status / ADB check"],
    ["/connect", "POST", "Connect to device"],
    ["/disconnect", "POST", "Disconnect / remove reverse"],
    ["/shell", "POST", "Shell command execution"],
    ["/screen", "GET", "Screenshot capture"],
    ["/files/list", "GET", "File browser list"],
    ["/files/download", "GET", "File download"],
    ["/files/upload", "POST", "File upload"],
    ["/install", "POST", "ADB installer trigger"],
    ["/camera/latest", "GET", "Latest camera photo"],
    ["/camera/record/start", "POST", "Start screen recording"],
    ["/camera/record/stop", "POST", "Stop & pull recording"],
    ["/mic/record", "POST", "Microphone recording"],
    ["/api/update-check", "GET", "Update check"],
    ["/api/update-apply", "POST", "Apply update"],
  ];

  for (const [ep, method, desc] of endpoints) {
    if (
      js.includes(`'${ep}'`) ||
      js.includes(`"${ep}"`) ||
      js.includes(`\`${ep}`) ||
      js.includes(`/${ep.slice(1)}`)
    )
      pass(`${method} ${ep} \u2014 ${desc}`);
    else
      fail(
        `${method} ${ep}`,
        `Not found in app.js \u2014 "${desc}" may be missing`,
      );
  }

  // /login is handled by login.js, not app.js \u2014 test it separately
  const loginJs = readFront("login.js");
  if (loginJs.includes("/login"))
    pass("POST /login \u2014 Authenticate (in login.js)");
  else fail("POST /login", "Not found in login.js");
}

// ─── 14. Console log panel ────────────────────────────────────────────────────

function testConsolePanel() {
  section("14. Console Log Panel");

  const html = readFront("index.html");
  const js = readFront("app.js");
  const css = readFront("styles.css");

  if (html.includes('id="statusLog"')) pass("statusLog container present");
  else fail("statusLog", 'id="statusLog" missing from HTML');

  if (css.includes(".log-container")) pass(".log-container CSS rule defined");
  else fail(".log-container", "No CSS rule found");

  for (const cls of [
    "log-entry",
    "log-info",
    "log-success",
    "log-error",
    "log-warn",
  ]) {
    if (css.includes(`.${cls}`)) pass(`.${cls} styled`);
    else fail(`.${cls}`, "No CSS rule defined");
  }

  if (js.includes("appendStatus")) pass("appendStatus() function present");
  else fail("appendStatus()", "Function not found in app.js");

  // Clear button inline
  if (
    html.includes("innerHTML=''") ||
    html.includes('innerHTML=""') ||
    html.includes("innerHTML = ''")
  )
    pass("Console Clear button wired inline");
  else warn("Console Clear", "Inline onclick clear may be missing");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(62));
  console.log("  RemoteADB — Frontend Test Suite");
  console.log("═".repeat(62));

  // Static analysis (no server needed)
  testHTMLStructure();
  testIDCoverage();
  testCSSCoverage();
  testAccessibility();
  testDataAttributes();
  testPerformance();
  testLoginPage();
  testThemeSystem();
  testScreenPreview();
  testFileManager();
  testAPISurface();
  testConsolePanel();

  // Live HTTP tests
  await testHTTP();

  // Summary
  const total = passed + failed + warned;
  console.log("\n" + "═".repeat(62));
  console.log(
    `  Results: ${passed} passed  ${failed} failed  ${warned} warnings  (${total} total)`,
  );
  console.log("═".repeat(62));

  if (failed > 0) {
    console.log("\n  ❌ Failures:");
    issues
      .filter((i) => !i.level)
      .forEach((i) => console.log(`    • ${i.name}\n      ${i.detail}`));
  }
  if (warned > 0) {
    console.log("\n  ⚠️  Warnings:");
    issues
      .filter((i) => i.level === "warn")
      .forEach((i) => console.log(`    • ${i.name}\n      ${i.detail}`));
  }
  console.log("");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unhandled:", e);
  process.exit(1);
});
