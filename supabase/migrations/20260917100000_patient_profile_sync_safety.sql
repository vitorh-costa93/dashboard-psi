-- Complementa a migração já aplicada do cadastro único: evita falha por data
-- livre no formulário e uniformiza os rótulos derivados sem alterar histórico.
CREATE OR REPLACE FUNCTION public.aplicar_cadastro_primeira_anamnese(
  p_paciente_id uuid,
  p_perfil jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := nullif(btrim(coalesce(p_perfil->>'nome','')), '');
  v_cpf_paciente text := nullif(regexp_replace(coalesce(p_perfil->>'cpf_paciente',''), '[^0-9]', '', 'g'), '');
  v_responsavel text := nullif(btrim(coalesce(p_perfil->>'responsavel_nome','')), '');
  v_cpf_responsavel text := nullif(regexp_replace(coalesce(p_perfil->>'cpf_responsavel',''), '[^0-9]', '', 'g'), '');
  v_nascimento date := CASE WHEN coalesce(p_perfil->>'data_nascimento','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (p_perfil->>'data_nascimento')::date ELSE NULL END;
  v_nome_seguro text;
BEGIN
  PERFORM 1 FROM public.pacientes WHERE id=p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.pacientes WHERE id=p_paciente_id AND cadastro_sincronizado_anamnese_em IS NOT NULL) THEN RETURN; END IF;
  IF v_cpf_paciente IS NOT NULL AND v_cpf_paciente !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'invalid_patient_cpf'; END IF;
  IF v_cpf_responsavel IS NOT NULL AND v_cpf_responsavel !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'invalid_guardian_cpf'; END IF;
  v_nome_seguro := CASE WHEN v_nome IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pacientes WHERE nome=v_nome AND id<>p_paciente_id) THEN v_nome ELSE NULL END;
  UPDATE public.pacientes SET nome=coalesce(v_nome_seguro,nome),cpf_paciente=coalesce(v_cpf_paciente,cpf_paciente),data_nascimento=coalesce(v_nascimento,data_nascimento),responsavel_nome=coalesce(v_responsavel,responsavel_nome),cpf_responsavel=coalesce(v_cpf_responsavel,cpf_responsavel),data_anamnese=CURRENT_DATE,cadastro_sincronizado_anamnese_em=now(),atualizado_em=now() WHERE id=p_paciente_id;
END;
$$;

UPDATE public.pacientes p SET ultimo_label=coalesce((
  SELECT public.nome_exibicao_paciente(p.nome)||' | '||(ARRAY['','Seg','Ter','Qua','Qui','Sex','Sáb','Dom'])[r.dia_semana]||' '||to_char(r.horario::time,'HH24"h"')||CASE WHEN to_char(r.horario::time,'MI')='00' THEN '' ELSE to_char(r.horario::time,'MI') END
  FROM public.recorrencias_atendimento r WHERE r.paciente_id=p.id AND r.ativo=true ORDER BY r.vigencia_inicio DESC LIMIT 1
),public.nome_exibicao_paciente(p.nome)),atualizado_em=now();

REVOKE ALL ON FUNCTION public.aplicar_cadastro_primeira_anamnese(uuid,jsonb) FROM PUBLIC,anon,authenticated;
