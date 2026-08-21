import {fetchSheetSummary, applySheetImport} from '../lib/sheet-import.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SHEET_URL = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1rxeRgbqkaX6usYd8iSJYkNSqIlAeyJnDNxrIJJ7mPsI/gviz/tq?tqx=out:csv&gid=0';
const APPLY = process.argv.includes('--apply');

if (APPLY && (!SUPABASE_URL || !SUPABASE_KEY)) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias');

if (!APPLY) {
  const {summary} = await fetchSheetSummary(SHEET_URL);
  console.log(JSON.stringify({...summary, mode: 'dry-run'}));
  process.exit(0);
}

const result = await applySheetImport({supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, sheetUrl: SHEET_URL});
console.log(JSON.stringify(result));
