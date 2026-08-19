import {currentUser, getAdminRecord} from '../_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  try {
    const admin = await getAdminRecord();
    if (!admin) return res.status(200).json({configured: false, authenticated: false});
    const user = await currentUser(req, res);
    return res.status(200).json({
      configured: true,
      authenticated: !!user && user.id === admin.user_id,
      email: user?.id === admin.user_id ? user.email : undefined,
    });
  } catch (error) {
    return res.status(503).json({error: 'Não foi possível verificar o acesso'});
  }
}
