


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."atividades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "tipo" "text",
    "faixa" "text",
    "tema" "text",
    "img_b64" "text",
    "prompt" "text",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."atividades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pacientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ultima_chave" "text",
    "ultimo_label" "text",
    "atualizado_em" timestamp with time zone DEFAULT "now"(),
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pacientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."post_artes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "image_b64" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."post_artes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "tema" "text",
    "formato" "text",
    "publico" "text",
    "legenda" "text",
    "hashtags" "text",
    "cta" "text",
    "img_b64" "text",
    "prompt" "text",
    "fonte_tendencia" "text",
    "tendencia" "text",
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "imagens_b64" "jsonb",
    "logo_cor" "text",
    "slides" "jsonb",
    "logo_posicao" "text",
    "logo_contraste" numeric,
    "texto_posicao" "text",
    "texto_cor" "text",
    "texto_contraste" numeric,
    "arte_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prontuarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "paciente_key" "text" NOT NULL,
    "paciente_label" "text" NOT NULL,
    "data_sessao" "date" NOT NULL,
    "relato" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"(),
    "paciente_id" "uuid"
);


ALTER TABLE "public"."prontuarios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trend_radar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titulo" "text" NOT NULL,
    "resumo" "text",
    "por_que" "text",
    "formato" "text",
    "potencial" "text",
    "angulo" "text",
    "fonte_titulo" "text",
    "fonte_url" "text",
    "fonte_publicacao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trend_radar" OWNER TO "postgres";


ALTER TABLE ONLY "public"."atividades"
    ADD CONSTRAINT "atividades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pacientes"
    ADD CONSTRAINT "pacientes_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."pacientes"
    ADD CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_artes"
    ADD CONSTRAINT "post_artes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."post_artes"
    ADD CONSTRAINT "post_artes_post_id_ordem_key" UNIQUE ("post_id", "ordem");



ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prontuarios"
    ADD CONSTRAINT "prontuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trend_radar"
    ADD CONSTRAINT "trend_radar_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_atividades_tipo" ON "public"."atividades" USING "btree" ("tipo");



CREATE INDEX "idx_pacientes_ativo" ON "public"."pacientes" USING "btree" ("ativo");



CREATE INDEX "idx_pacientes_nome" ON "public"."pacientes" USING "btree" ("nome");



CREATE UNIQUE INDEX "idx_pacientes_nome_unique" ON "public"."pacientes" USING "btree" ("nome");



CREATE INDEX "idx_post_artes_post_id" ON "public"."post_artes" USING "btree" ("post_id");



CREATE INDEX "idx_posts_criado_em" ON "public"."posts" USING "btree" ("criado_em" DESC);



CREATE INDEX "idx_posts_status" ON "public"."posts" USING "btree" ("status");



CREATE INDEX "idx_prontuarios_paciente" ON "public"."prontuarios" USING "btree" ("paciente_key");



CREATE INDEX "idx_prontuarios_paciente_id" ON "public"."prontuarios" USING "btree" ("paciente_id");



CREATE INDEX "idx_trend_radar_criado_em" ON "public"."trend_radar" USING "btree" ("criado_em" DESC);



ALTER TABLE ONLY "public"."post_artes"
    ADD CONSTRAINT "post_artes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prontuarios"
    ADD CONSTRAINT "prontuarios_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "public"."pacientes"("id") ON DELETE SET NULL;



CREATE POLICY "Permitir tudo via service role" ON "public"."atividades" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir tudo via service role" ON "public"."pacientes" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir tudo via service role" ON "public"."posts" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir tudo via service role" ON "public"."prontuarios" USING (true) WITH CHECK (true);



CREATE POLICY "Permitir tudo via service role" ON "public"."trend_radar" USING (true) WITH CHECK (true);



ALTER TABLE "public"."atividades" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pacientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."post_artes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prontuarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trend_radar" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."atividades" TO "anon";
GRANT ALL ON TABLE "public"."atividades" TO "authenticated";
GRANT ALL ON TABLE "public"."atividades" TO "service_role";



GRANT ALL ON TABLE "public"."pacientes" TO "anon";
GRANT ALL ON TABLE "public"."pacientes" TO "authenticated";
GRANT ALL ON TABLE "public"."pacientes" TO "service_role";



GRANT ALL ON TABLE "public"."post_artes" TO "anon";
GRANT ALL ON TABLE "public"."post_artes" TO "authenticated";
GRANT ALL ON TABLE "public"."post_artes" TO "service_role";



GRANT ALL ON TABLE "public"."posts" TO "anon";
GRANT ALL ON TABLE "public"."posts" TO "authenticated";
GRANT ALL ON TABLE "public"."posts" TO "service_role";



GRANT ALL ON TABLE "public"."prontuarios" TO "anon";
GRANT ALL ON TABLE "public"."prontuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."prontuarios" TO "service_role";



GRANT ALL ON TABLE "public"."trend_radar" TO "anon";
GRANT ALL ON TABLE "public"."trend_radar" TO "authenticated";
GRANT ALL ON TABLE "public"."trend_radar" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







