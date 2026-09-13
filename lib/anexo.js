// Extração de texto de arquivos (PDF/DOCX/TXT) anexados nos chats de IA do
// app (documentos clínicos e, a partir de 14/09/2026, também posts/artes de
// Instagram) -- compartilhado pra não duplicar a lógica de extração e os
// limites de tamanho em cada rota que aceita anexo.
import {extractText as extractPdfText, getDocumentProxy} from 'unpdf';
import mammoth from 'mammoth';

const STRIP_INVISIBLE=new RegExp(`[${String.fromCharCode(0x200b,0x200c,0x200d,0xfeff)}]`,'g');
const DASH_LIKE=new RegExp(`[${String.fromCharCode(0x00ad,0x2010,0x2011,0x2012,0x2013)}]`,'g');
const clean=value=>String(value??'').replace(STRIP_INVISIBLE,'').replace(DASH_LIKE,'-').trim();

export class AnexoError extends Error{
  constructor(status,message){super(message);this.status=status;}
}

// Lança AnexoError (com .status pronto pra virar a resposta HTTP) em vez de
// retornar {error} -- assim quem chama só precisa de um try/catch, igual a
// qualquer outra falha inesperada.
export async function extrairTextoAnexo({nome,base64}){
  if(typeof base64!=='string'||!base64||typeof nome!=='string'||!nome)throw new AnexoError(400,'Anexo inválido');
  if(base64.length>6_000_000)throw new AnexoError(413,'Arquivo muito grande. Envie um arquivo de até 4MB.');
  const nomeArquivo=clean(nome).slice(0,200),ext=(nomeArquivo.split('.').pop()||'').toLowerCase();
  let buffer;
  try{buffer=Buffer.from(base64,'base64');}catch{throw new AnexoError(400,'Não foi possível ler o arquivo enviado.');}
  if(buffer.length>4*1024*1024)throw new AnexoError(413,'Arquivo muito grande. Envie um arquivo de até 4MB.');
  let texto='';
  try{
    if(ext==='pdf'){const pdf=await getDocumentProxy(new Uint8Array(buffer));texto=(await extractPdfText(pdf,{mergePages:true})).text;}
    else if(ext==='docx')texto=(await mammoth.extractRawText({buffer})).value;
    else if(ext==='txt')texto=buffer.toString('utf8');
    else throw new AnexoError(400,'Formato não suportado. Envie um arquivo PDF, DOCX ou TXT.');
  }catch(e){
    if(e instanceof AnexoError)throw e;
    console.error('extrairTextoAnexo:',e);
    throw new AnexoError(400,'Não foi possível ler o conteúdo do arquivo enviado.');
  }
  texto=clean(texto);
  if(!texto)throw new AnexoError(400,'Não foi possível extrair texto do arquivo enviado.');
  if(texto.length>8000)texto=texto.slice(0,8000)+'\n[...texto truncado...]';
  return {nome:nomeArquivo,texto};
}

// Valida uma imagem (base64) anexada num chat multimodal -- usada pelo chat
// de posts/artes de Instagram, que (diferente do chat de documentos) aceita
// tanto arquivo de texto quanto imagem de referência.
const MIME_IMAGEM=new Set(['image/png','image/jpeg','image/webp','image/gif']);
export function validarImagemAnexo({base64,tipo}){
  if(typeof base64!=='string'||!base64)throw new AnexoError(400,'Imagem inválida');
  if(!MIME_IMAGEM.has(tipo))throw new AnexoError(400,'Formato de imagem não suportado. Envie PNG, JPEG, WEBP ou GIF.');
  if(base64.length>8_000_000)throw new AnexoError(413,'Imagem muito grande. Envie uma imagem de até 6MB.');
  let buffer;
  try{buffer=Buffer.from(base64,'base64');}catch{throw new AnexoError(400,'Não foi possível ler a imagem enviada.');}
  if(buffer.length>6*1024*1024)throw new AnexoError(413,'Imagem muito grande. Envie uma imagem de até 6MB.');
  return {tipo,base64};
}
