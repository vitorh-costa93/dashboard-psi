BEGIN;
DO $test$
DECLARE p uuid; m uuid; c uuid; r uuid; a uuid; v public.pacientes;
BEGIN
 INSERT INTO public.pacientes(nome,ativo,ultimo_label) VALUES('Teste integração '||gen_random_uuid(),false,'Teste | Ter 18h') RETURNING id INTO p;
 INSERT INTO public.formularios_modelos(nome,finalidade,campos,destino) VALUES('Teste integração','Validação', '[]','cadastro') RETURNING id INTO m;
 INSERT INTO public.formularios_convites(modelo_id,paciente_id,token_hash,expira_em) VALUES(m,p,gen_random_uuid()::text,now()+interval '1 hour') RETURNING id INTO c;
 INSERT INTO public.formularios_respostas(convite_id,conteudo) VALUES(c,'{}') RETURNING id INTO r;
 PERFORM public.revisar_formulario_com_cadastro(r,'approve',null,'{"nome":"Teste Perfil Integração","cpf_paciente":"123.456.789-01","data_nascimento":"2000-01-02"}');
 SELECT * INTO v FROM public.pacientes WHERE id=p;
 IF v.nome<>'Teste Perfil Integração' OR v.cpf_paciente<>'12345678901' OR v.data_nascimento<>'2000-01-02'::date OR v.data_anamnese IS NOT NULL OR v.cadastro_sincronizado_anamnese_em IS NOT NULL THEN RAISE EXCEPTION 'cadastro_sync_failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.anamneses_versoes av JOIN public.registros_clinicos rc ON rc.id=av.registro_clinico_id WHERE rc.paciente_id=p) THEN RAISE EXCEPTION 'unexpected_anamnesis'; END IF;
 IF (SELECT status FROM public.formularios_respostas WHERE id=r)<>'approved' THEN RAISE EXCEPTION 'approval_failed'; END IF;
 BEGIN
   PERFORM public.revisar_formulario_com_cadastro(r,'approve',null,'{"nome":"Não aplicar novamente"}');
   RAISE EXCEPTION 'duplicate_approval_allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'submission_not_pending' THEN RAISE; END IF; END;
 -- Outra resposta atualiza o perfil mesmo após a primeira sincronização de Anamnese.
 UPDATE public.pacientes SET cadastro_sincronizado_anamnese_em=now() WHERE id=p;
 INSERT INTO public.formularios_convites(modelo_id,paciente_id,token_hash,expira_em) VALUES(m,p,gen_random_uuid()::text,now()+interval '1 hour') RETURNING id INTO c;
 INSERT INTO public.formularios_respostas(convite_id,conteudo) VALUES(c,'{}') RETURNING id INTO r;
 PERFORM public.revisar_formulario_com_cadastro(r,'approve',null,'{"nome":"Teste Perfil Atualizado","cpf_paciente":""}');
 IF NOT EXISTS(SELECT 1 FROM public.pacientes WHERE id=p AND nome='Teste Perfil Atualizado' AND cpf_paciente='12345678901') THEN RAISE EXCEPTION 'repeat_sync_failed'; END IF;
 INSERT INTO public.formularios_convites(modelo_id,paciente_id,token_hash,expira_em) VALUES(m,p,gen_random_uuid()::text,now()+interval '1 hour') RETURNING id INTO c;
 INSERT INTO public.formularios_respostas(convite_id,conteudo) VALUES(c,'{}') RETURNING id INTO r;
 BEGIN
 PERFORM public.revisar_formulario_com_cadastro(r,'approve',null,'{"cpf_paciente":"123"}');
 RAISE EXCEPTION 'invalid_cpf_allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'invalid_patient_cpf' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.formularios_respostas WHERE id=r)<>'pending_review' THEN RAISE EXCEPTION 'partial_approval'; END IF;
 PERFORM public.revisar_formulario_com_cadastro(r,'reject',null,'{"nome":"Não aplicar"}');
 IF (SELECT nome FROM public.pacientes WHERE id=p)<>'Teste Perfil Atualizado' THEN RAISE EXCEPTION 'rejection_changed_profile'; END IF;
 IF has_function_privilege('anon','public.aplicar_cadastro_formulario(uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.revisar_formulario_com_cadastro(uuid,text,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public_execution_allowed'; END IF;
END $test$;
ROLLBACK;
