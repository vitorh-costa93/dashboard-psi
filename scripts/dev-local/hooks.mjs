import { pathToFileURL } from 'node:url';
const STUB = pathToFileURL(process.env.AUTH_STUB).href;
const CHR = pathToFileURL(process.env.CHROMIUM_STUB).href;
export async function resolve(specifier, context, next) {
  if (/(^|\/)_auth\.js$/.test(specifier)) return { url: STUB, shortCircuit: true };
  if (specifier === '@sparticuz/chromium') return { url: CHR, shortCircuit: true };
  return next(specifier, context);
}
