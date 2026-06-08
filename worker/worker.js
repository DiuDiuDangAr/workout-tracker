/**
 * Cloudflare Worker - Workout Tracker API (Final Stable Version)
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // 1. 登入邏輯
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (username !== env.USERNAME || password !== env.PASSWORD) {
          return jsonResponse({ error: '帳號或密碼錯誤' }, 401, corsHeaders);
        }
        const token = await createJWT(env.JWT_SECRET);
        return jsonResponse({ token }, 200, corsHeaders);
      }

      // 2. 驗證 Token
      const auth = request.headers.get('Authorization');
      if (!auth || !auth.startsWith('Bearer ')) {
        return jsonResponse({ error: '未授權' }, 401, corsHeaders);
      }
      const token = auth.slice(7);
      let payload;
      try {
        payload = await verifyJWT(token, env.JWT_SECRET);
        if (payload.exp < Date.now() / 1000) throw new Error('Expired');
      } catch (e) {
        return jsonResponse({ error: 'Token 無效或已過期' }, 401, corsHeaders);
      }

      // 3. 業務邏輯
      if (url.pathname === '/api/workouts') {
        if (request.method === 'GET') {
          const data = await readGitHubFile(env);
          return jsonResponse({ workouts: data.workouts || [] }, 200, corsHeaders);
        }
        
        if (request.method === 'POST') {
          const workout = await request.json();
          if (!workout.date) return jsonResponse({ error: '缺少日期' }, 400, corsHeaders);

          const data = await readGitHubFile(env);
          const workouts = data.workouts || [];
          const idx = workouts.findIndex(w => w.date === workout.date);
          
          if (idx >= 0) workouts[idx] = workout;
          else workouts.push(workout);
          
          workouts.sort((a, b) => a.date.localeCompare(b.date));
          await writeGitHubFile(env, { workouts }, data.sha);
          return jsonResponse({ success: true }, 200, corsHeaders);
        }
      }

      return jsonResponse({ error: 'Not Found' }, 404, corsHeaders);
    } catch (err) {
      console.error('Fatal Worker Error:', err.message);
      return jsonResponse({ error: `伺服器錯誤: ${err.message}` }, 500, corsHeaders);
    }
  }
};

// --- GitHub 核心邏輯 ---
async function readGitHubFile(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.DATA_PATH}?ref=${env.DATA_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'workout-tracker-worker'
    }
  });

  if (res.status === 404) return { workouts: [], sha: null };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub 讀取失敗 (${res.status}): ${text}`);
  }

  const file = await res.json();
  if (!file.content) return { workouts: [], sha: file.sha };

  const rawBase64 = file.content.replace(/\n/g, '');
  let data;
  
  try {
    if (env.ENCRYPTION_KEY) {
      try {
        const decrypted = await decrypt(rawBase64, env.ENCRYPTION_KEY);
        data = JSON.parse(decrypted);
      } catch (e) {
        // Fallback for migration
        data = JSON.parse(decodeBase64(rawBase64));
      }
    } else {
      data = JSON.parse(decodeBase64(rawBase64));
    }
  } catch (e) {
    throw new Error('資料解析失敗，請確認 ENCRYPTION_KEY');
  }

  return { ...data, sha: file.sha };
}

async function writeGitHubFile(env, data, sha) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`;
  const json = JSON.stringify(data, null, 2);
  const content = env.ENCRYPTION_KEY ? await encrypt(json, env.ENCRYPTION_KEY) : encodeBase64(json);

  const body = {
    message: `Update workouts ${new Date().toISOString()}`,
    content,
    branch: env.DATA_BRANCH
  };
  if (sha) body.sha = sha; // 只有在 sha 存在時才發送

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'workout-tracker-worker',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub 寫入失敗 (${res.status}): ${text}`);
  }
}

// --- 安全與加解密 ---
function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

async function encrypt(text, keyStr) {
  const enc = new TextEncoder();
  const keyBuf = await crypto.subtle.digest('SHA-256', enc.encode(keyStr));
  const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(b64, keyStr) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const keyBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
  const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bin.slice(0, 12) }, key, bin.slice(12));
  return new TextDecoder().decode(decrypted);
}

// --- JWT 處理 (含補位修復) ---
async function createJWT(secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 86400*30 }));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function verifyJWT(token, secret) {
  const [h, p, s] = token.split('.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(padB64(s)), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!valid) throw new Error('Invalid Sig');
  return JSON.parse(decodeBase64(padB64(p)));
}

function b64url(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function padB64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
