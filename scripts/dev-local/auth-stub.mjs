// Stub LOCAL de api/_auth.js: sem autenticação e sem Supabase. Só para testes locais.
export const IDLE_TIMEOUT_MS = 3600000;
const USER = { id: 'dev-local', email: 'dev@local' };
export const hasActiveIdleSession = () => true;
export const touchIdleSession = () => {};
export const setSessionCookies = () => {};
export const clearSessionCookies = () => {};
export const getAdminRecord = async () => ({ user_id: USER.id });
export const currentUser = async () => USER;
export const requireAuth = async () => USER;
export const requireAuthOrCron = async () => USER;
export async function supabase(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = method === 'GET' ? '[]' : (options.body || '[]');
  return new Response(body, { status: method === 'GET' ? 200 : 201, headers: { 'Content-Type': 'application/json' } });
}
