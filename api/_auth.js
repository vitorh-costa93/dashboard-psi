const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ACCESS_COOKIE = 'psi_access';
const REFRESH_COOKIE = 'psi_refresh';

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((out, item) => {
    const index = item.indexOf('=');
    if (index < 0) return out;
    out[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
    return out;
  }, {});
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function setSessionCookies(res, session) {
  const accessAge = Math.max(60, Number(session.expires_in || 3600));
  res.setHeader('Set-Cookie', [
    cookie(ACCESS_COOKIE, session.access_token, accessAge),
    cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30),
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [cookie(ACCESS_COOKIE, '', 0), cookie(REFRESH_COOKIE, '', 0)]);
}

export async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase não configurado');
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

export async function getAdminRecord() {
  const response = await supabase('/rest/v1/app_admin?select=user_id&singleton=eq.true&limit=1');
  if (!response.ok) throw new Error('Não foi possível verificar o administrador');
  const rows = await response.json();
  return rows[0] || null;
}

async function userFromToken(token) {
  if (!token) return null;
  const response = await supabase('/auth/v1/user', {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!response.ok) return null;
  return response.json();
}

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  const response = await supabase('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({refresh_token: refreshToken}),
  });
  if (!response.ok) return null;
  return response.json();
}

export async function currentUser(req, res) {
  const cookies = parseCookies(req);
  let user = await userFromToken(cookies[ACCESS_COOKIE]);
  if (user) return user;

  const session = await refreshSession(cookies[REFRESH_COOKIE]);
  if (!session) return null;
  setSessionCookies(res, session);
  user = await userFromToken(session.access_token);
  return user;
}

export async function requireAuth(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const user = await currentUser(req, res);
    const admin = user && await getAdminRecord();
    if (!user || !admin || admin.user_id !== user.id) {
      clearSessionCookies(res);
      res.status(401).json({error: 'Autenticação necessária'});
      return null;
    }
    return user;
  } catch (error) {
    res.status(503).json({error: 'Não foi possível validar a sessão'});
    return null;
  }
}

export async function requireAuthOrCron(req, res) {
  const secret = process.env.CRON_SECRET;
  const authorization = String(req.headers.authorization || '');
  if (secret && authorization === `Bearer ${secret}`) return {cron: true};
  return requireAuth(req, res);
}
