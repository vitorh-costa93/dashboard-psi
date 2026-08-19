import {getAdminRecord, setSessionCookies, supabase} from '../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({error: 'Informe login e senha'});

  try {
    const admin = await getAdminRecord();
    if (!admin) return res.status(409).json({error: 'O acesso inicial ainda não foi criado'});
    const response = await supabase('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({email, password}),
    });
    const session = await response.json();
    if (!response.ok || session.user?.id !== admin.user_id) {
      return res.status(401).json({error: 'Login ou senha incorretos'});
    }
    setSessionCookies(res, session);
    return res.status(200).json({ok: true, email: session.user.email});
  } catch (error) {
    return res.status(500).json({error: 'Não foi possível entrar'});
  }
}

