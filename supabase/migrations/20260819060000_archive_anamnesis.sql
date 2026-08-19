ALTER TABLE public.anamneses_versoes
  ADD COLUMN excluido_em timestamptz,
  ADD COLUMN excluido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.arquivar_anamnese(p_anamnese_id uuid, p_autor uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.anamneses_versoes
     SET excluido_em = now(), excluido_por = p_autor
   WHERE id = p_anamnese_id AND excluido_em IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.arquivar_anamnese(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arquivar_anamnese(uuid,uuid) TO service_role;
