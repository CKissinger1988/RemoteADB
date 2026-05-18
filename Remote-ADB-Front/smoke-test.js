/**
 * Remote ADB Smoke Test
 * 
 * This script performs basic connectivity checks against a running backend.
 * Usage: node tests/smoke-test.js [backend-url]
 */

const http = require('http');

const BASE_URL = process.argv[2] || 'http://127.0.0.1:5200';

async function request(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
        };

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log(`Starting smoke tests against ${BASE_URL}...\n`);

    // 1. Check Status
    console.log('[Test] GET /status');
    const status = await request('/status');
    if (status.status === 200 && status.body.status === 'ok') {
        console.log('✅ Backend is online. ADB Installed:', status.body.adbInstalled);
    } else {
        console.error('❌ Backend status check failed:', status.status, status.body);
    }

    // 2. Test AI Chat
    console.log('\n[Test] POST /api/ai/chat');
    const ai = await request('/api/ai/chat', 'POST', { prompt: 'Who are you?' });
    if (ai.status === 200 && ai.body.status === 'ok') {
        console.log('✅ AI integration responding:', ai.body.reply);
    } else {
        console.error('❌ AI integration failed:', ai.status, ai.body);
    }

    console.log('\nSmoke tests completed.');
}

runTests().catch(err => {
    console.error('Test suite failed:', err.message);
    process.exit(1);
});