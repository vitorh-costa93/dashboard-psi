ALTER TABLE public.formularios_respostas
  ADD COLUMN arquivado_em timestamptz,
  ADD COLUMN arquivado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.arquivar_resposta_formulario(p_resposta_id uuid, p_autor uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.formularios_respostas
     SET arquivado_em = now(), arquivado_por = p_autor
   WHERE id = p_resposta_id AND status = 'approved' AND arquivado_em IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.arquivar_resposta_formulario(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arquivar_resposta_formulario(uuid,uuid) TO service_role;
