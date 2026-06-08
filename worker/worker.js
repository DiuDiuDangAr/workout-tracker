/**
 * Cloudflare Worker - Workout Tracker API
 *
 * Environment Variables (set in Cloudflare dashboard):
 *   - USERNAME: login username
 *   - PASSWORD: login password
 *   - JWT_SECRET: secret for signing tokens
 *   - GITHUB_TOKEN: GitHub personal access token (repo scope)
 *   - GITHUB_REPO: format "owner/repo"
 *   - DATA_PATH: path to JSON file in repo (e.g., "data/workouts.json")
 *   - DATA_BRANCH: branch name (e.g., "main")
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (url.pathname === '/api/login' && request.method === 'POST') {
        return handleLogin(request, env, corsHeaders);
      }

      const authResult = await verifyAuth(request, env);
      if (!authResult.valid) {
        return jsonResponse({ error: '未授權' }, 401, corsHeaders);
      }

      if (url.pathname === '/api/workouts' && request.method === 'GET') {
        return handleGetWorkouts(env, corsHeaders);
      }

      if (url.pathname === '/api/workouts' && request.method === 'POST') {
        return handleSaveWorkout(request, env, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500, corsHeaders);
    }
  }
};

async function handleLogin(request, env, corsHeaders) {
  const { username, password } = await request.json();

  if (username !== env.USERNAME || password !== env.PASSWORD) {
    return jsonResponse({ error: '帳號或密碼錯誤' }, 401, corsHeaders);
  }

  const token = await createJWT(env.JWT_SECRET);
  return jsonResponse({ token }, 200, corsHeaders);
}

async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false };
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (payload.exp < Date.now() / 1000) {
      return { valid: false };
    }
    return { valid: true };
  } catch {
    return { valid: false };
  }
}

async function handleGetWorkouts(env, corsHeaders) {
  const data = await readGitHubFile(env);
  return jsonResponse({ workouts: data.workouts || [] }, 200, corsHeaders);
}

async function handleSaveWorkout(request, env, corsHeaders) {
  const workout = await request.json();

  if (!workout.date) {
    return jsonResponse({ error: '缺少日期' }, 400, corsHeaders);
  }

  const data = await readGitHubFile(env);
  const workouts = data.workouts || [];

  const existingIndex = workouts.findIndex(w => w.date === workout.date);
  if (existingIndex >= 0) {
    workouts[existingIndex] = workout;
  } else {
    workouts.push(workout);
  }

  workouts.sort((a, b) => a.date.localeCompare(b.date));

  await writeGitHubFile(env, { workouts }, data.sha);
  return jsonResponse({ success: true }, 200, corsHeaders);
}

// --- GitHub API ---
async function readGitHubFile(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.DATA_PATH}?ref=${env.DATA_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'workout-tracker-worker'
    }
  });

  if (res.status === 404) {
    return { workouts: [], sha: null };
  }

  if (!res.ok) {
    throw new Error(`GitHub read failed: ${res.status}`);
  }

  const file = await res.json();
  const rawContent = file.content.replace(/\n/g, '');
  
  let data;
  try {
    if (env.ENCRYPTION_KEY) {
      try {
        const decrypted = await decrypt(rawContent, env.ENCRYPTION_KEY);
        data = JSON.parse(decrypted);
      } catch (decryptErr) {
        // Fallback: If decryption fails, check if it's plain text (for migration)
        const plainContent = atob(rawContent);
        if (plainContent.trim().startsWith('{')) {
          data = JSON.parse(plainContent);
        } else {
          throw decryptErr;
        }
      }
    } else {
      const content = atob(rawContent);
      data = JSON.parse(content);
    }
  } catch (err) {
    console.error('Data parsing error:', err);
    throw new Error('無法解析訓練資料，可能是金鑰錯誤或資料損毀');
  }

  data.sha = file.sha;
  return data;
}

async function writeGitHubFile(env, data, sha) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${env.DATA_PATH}`;
  const jsonString = JSON.stringify(data, null, 2);
  
  let content;
  if (env.ENCRYPTION_KEY) {
    content = await encrypt(jsonString, env.ENCRYPTION_KEY);
  } else {
    content = btoa(unescape(encodeURIComponent(jsonString)));
  }

  const body = {
    message: `Update workout data ${new Date().toISOString().slice(0, 10)} (encrypted)`,
    content,
    branch: env.DATA_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

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
    const err = await res.text();
    throw new Error(`GitHub write failed: ${res.status} ${err}`);
  }
}

// --- Encryption (AES-GCM) ---
async function encrypt(text, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Use SHA-256 to derive a 256-bit key from the secret string
  const keyBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const key = await crypto.subtle.importKey('raw', keyBuffer, 'AES-GCM', false, ['encrypt']);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Standard btoa might not handle large buffers well, but for this JSON size it's fine
  // Cloudflare Workers support btoa on Uint8Array efficiently
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(base64Data, secret) {
  const encoder = new TextEncoder();
  const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const keyBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const key = await crypto.subtle.importKey('raw', keyBuffer, 'AES-GCM', false, ['decrypt']);
  
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// --- JWT (HMAC-SHA256) ---
async function createJWT(secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 30 };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64url(String.fromCharCode(...new Uint8Array(signature)));

  return `${signingInput}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
  const [header, payload, signature] = token.split('.');
  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(signingInput));

  if (!valid) throw new Error('Invalid signature');

  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}
