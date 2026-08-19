import {getAdminRecord, setSessionCookies, supabase} from '../_auth.js';

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function deleteUser(id) {
  if (id) await supabase(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {method: 'DELETE'});
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!validEmail(email)) return res.status(400).json({error: 'Informe um e-mail válido'});
  if (password.length < 12) return res.status(400).json({error: 'A senha deve ter pelo menos 12 caracteres'});

  let createdUser = null;
  try {
    if (await getAdminRecord()) return res.status(409).json({error: 'O acesso administrativo já foi criado'});

    const created = await supabase('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({email, password, email_confirm: true}),
    });
    const createdData = await created.json();
    if (!created.ok) return res.status(created.status).json({error: createdData?.msg || createdData?.message || 'Não foi possível criar o acesso'});
    createdUser = createdData;

    const claimed = await supabase('/rest/v1/app_admin', {
      method: 'POST',
      headers: {Prefer: 'return=minimal'},
      body: JSON.stringify({singleton: true, user_id: createdUser.id}),
    });
    if (!claimed.ok) {
      await deleteUser(createdUser.id);
      return res.status(409).json({error: 'O acesso administrativo já foi criado'});
    }

    const login = await supabase('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({email, password}),
    });
    const session = await login.json();
    if (!login.ok) return res.status(201).json({ok: true, requiresLogin: true});
    setSessionCookies(res, session);
    return res.status(201).json({ok: true, email});
  } catch (error) {
    await deleteUser(createdUser?.id).catch(() => {});
    return res.status(500).json({error: 'Não foi possível criar o acesso'});
  }
}

