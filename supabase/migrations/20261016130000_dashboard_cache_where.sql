-- pg_safeupdate (Supabase) recusa UPDATE sem WHERE dentro do trigger: toda escrita
-- nas tabelas observadas falhava com 400. Mesma função, agora com WHERE.
CREATE OR REPLACE FUNCTION public.dashboard_cache_invalidar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dashboard_cache_meta SET versao = versao + 1 WHERE singleton;
  RETURN NULL;
END $$;
