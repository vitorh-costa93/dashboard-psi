import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('cadastro único é aditivo e a Anamnese o sincroniza somente na primeira conclusão', async () => {
  const sql = await read('supabase/migrations/20260917090000_patient_single_profile_from_anamnesis.sql');
  for (const field of ['cpf_paciente','cpf_responsavel','inicio_atendimentos','data_anamnese','cadastro_sincronizado_anamnese_em']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`));
  assert.match(sql, /aplicar_cadastro_primeira_anamnese/);
  assert.match(sql, /cadastro_sincronizado_anamnese_em IS NOT NULL\) THEN RETURN/);
  assert.match(sql, /CURRENT_DATE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.salvar_anamnese_com_cadastro/);
});

test('API usa a sincronização protegida e extrai identificadores do formulário', async () => {
  const api = await read('api/forms.js');
  assert.match(api, /salvar_anamnese_com_cadastro/);
  assert.match(api, /revisar_formulario_com_cadastro/);
  assert.match(api, /cpf_paciente:texto/);
  assert.match(api, /responsavel_nome:texto/);
});

test('agenda e documentos expõem e reutilizam o perfil administrativo', async () => {
  const html = await read('index.html');
  for (const id of ['perfil-cpf-paciente','perfil-cpf-responsavel','perfil-inicio-atendimentos','perfil-data-anamnese','agenda-cpf-paciente','agenda-cpf-responsavel','agenda-inicio-atendimentos']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /function preencherDocumentoDoCadastro/);
  assert.match(html, /doc-anamnese-coleta-data/);
  assert.match(html, /function rotuloPaciente/);
});
