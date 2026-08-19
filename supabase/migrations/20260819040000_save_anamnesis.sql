CREATE OR REPLACE FUNCTION public.salvar_anamnese(p_paciente_id uuid, p_conteudo jsonb, p_autor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registro uuid;
  v_versao integer;
  v_anamnese uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pacientes WHERE id = p_paciente_id) THEN
    RAISE EXCEPTION 'patient_not_found';
  END IF;

  INSERT INTO public.registros_clinicos(paciente_id)
  VALUES (p_paciente_id)
  ON CONFLICT (paciente_id) DO UPDATE SET paciente_id = excluded.paciente_id
  RETURNING id INTO v_registro;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_registro::text, 0));
  SELECT coalesce(max(versao), 0) + 1
    INTO v_versao
    FROM public.anamneses_versoes
   WHERE registro_clinico_id = v_registro;

  INSERT INTO public.anamneses_versoes(registro_clinico_id, versao, conteudo, criado_por)
  VALUES (v_registro, v_versao, p_conteudo, p_autor)
  RETURNING id INTO v_anamnese;

  RETURN v_anamnese;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_anamnese(uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_anamnese(uuid,jsonb,uuid) TO service_role;
