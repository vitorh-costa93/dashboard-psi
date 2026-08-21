// Hourly sync of the operational spreadsheet into Supabase (patients,
// sessions, insurance, packages). Triggered by Vercel Cron (see
// vercel.json); requireAuthOrCron accepts either a logged-in session or
// the Authorization: Bearer $CRON_SECRET header Vercel Cron sends.
import {requireAuthOrCron} from './_auth.js';
import {applySheetImport} from '../lib/sheet-import.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SHEET_URL = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1rxeRgbqkaX6usYd8iSJYkNSqIlAeyJnDNxrIJJ7mPsI/gviz/tq?tqx=out:csv&gid=0';

export default async function handler(req, res) {
  if (!await requireAuthOrCron(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({error: 'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas no Vercel'});
  try {
    const result = await applySheetImport({supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, sheetUrl: SHEET_URL});
    return res.status(200).json(result);
  } catch (error) {
    console.error('import-sheet error:', error);
    return res.status(500).json({error: 'Não foi possível importar a planilha'});
  }
}
