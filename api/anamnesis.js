import {requireAuth, supabase} from './_auth.js';
import {decryptClinicalData, encryptClinicalData} from './_clinical-crypto.js';

const safeJson = async response => response.json().catch(() => null);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const pacienteId = String(req.query?.paciente_id || req.body?.paciente_id || '');
  if (!uuid.test(pacienteId)) return res.status(400).json({error:'Paciente inválido'});

  try {
    if (req.method === 'GET') {
      const recordResponse = await supabase(`/rest/v1/registros_clinicos?select=id&paciente_id=eq.${pacienteId}&limit=1`);
      const records = await safeJson(recordResponse);
      if (!recordResponse.ok) return res.status(recordResponse.status).json({error:'Falha ao carregar anamnese'});
      if (!records?.length) return res.status(200).json([]);

      const versionsResponse = await supabase(`/rest/v1/anamneses_versoes?select=id,versao,conteudo,criado_em&registro_clinico_id=eq.${records[0].id}&order=versao.desc`);
      const versions = await safeJson(versionsResponse);
      if (!versionsResponse.ok) return res.status(versionsResponse.status).json({error:'Falha ao carregar versões'});
      try {
        return res.status(200).json(versions.map(item => ({...item, conteudo:decryptClinicalData(item.conteudo)})));
      } catch {
        return res.status(500).json({error:'Não foi possível abrir os dados da anamnese'});
      }
    }

    if (req.method === 'POST') {
      const conteudo = req.body?.conteudo;
      if (!conteudo || typeof conteudo !== 'object' || Array.isArray(conteudo)) return res.status(400).json({error:'Conteúdo inválido'});
      const serialized = JSON.stringify(conteudo);
      if (serialized.length > 131072) return res.status(413).json({error:'Anamnese muito extensa'});
      if (!Object.values(conteudo).some(value => String(value || '').trim())) return res.status(400).json({error:'Preencha ao menos um campo'});

      const response = await supabase('/rest/v1/rpc/salvar_anamnese', {
        method:'POST',
        body:JSON.stringify({p_paciente_id:pacienteId,p_conteudo:encryptClinicalData(conteudo),p_autor:user.id}),
      });
      const result = await safeJson(response);
      return res.status(response.ok ? 201 : 409).json(response.ok ? {id:result} : {error:'Não foi possível salvar a anamnese'});
    }

    return res.status(405).json({error:'Method not allowed'});
  } catch {
    return res.status(500).json({error:'Não foi possível processar a anamnese'});
  }
}
