


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



CREATE OR REPLACE FUNCTION "public"."atualizar_grupo_completo"("p_grupo_id" "uuid", "p_nome_grupo" character varying, "p_turma_id" "uuid", "p_tema_projeto" character varying, "p_link_repositorio" character varying, "p_nova_data_id" "uuid", "p_antiga_data_id" "uuid", "p_alunos" json) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    aluno RECORD;
BEGIN
    -- 1. Se a data de apresentação mudou, gerenciar as vagas
    IF p_antiga_data_id IS DISTINCT FROM p_nova_data_id THEN
        -- Devolve vaga na data antiga (se houver)
        IF p_antiga_data_id IS NOT NULL THEN
            UPDATE datas_apresentacao 
            SET vagas_ocupadas = GREATEST(0, vagas_ocupadas - 1)
            WHERE id = p_antiga_data_id;
        END IF;

        -- Ocupa vaga na data nova (se houver)
        IF p_nova_data_id IS NOT NULL THEN
            UPDATE datas_apresentacao 
            SET vagas_ocupadas = vagas_ocupadas + 1
            WHERE id = p_nova_data_id;
        END IF;
    END IF;

    -- 2. Atualizar os dados principais do grupo
    UPDATE grupos
    SET nome_grupo = p_nome_grupo,
        turma_id = p_turma_id,
        tema_projeto = p_tema_projeto,
        link_repositorio = p_link_repositorio,
        data_apresentacao_id = p_nova_data_id
    WHERE id = p_grupo_id;

    -- 3. Atualizar ou recriar os alunos do grupo
    -- Abordagem simples e segura: remover os antigos e inserir os novos enviados
    DELETE FROM alunos WHERE grupo_id = p_grupo_id;

    -- Inserir os alunos enviados no JSON
    FOR aluno IN SELECT * FROM json_to_recordset(p_alunos) AS x(nome VARCHAR, matricula VARCHAR, email VARCHAR, eh_lider BOOLEAN)
    LOOP
        INSERT INTO alunos (grupo_id, nome, matricula, email, eh_lider)
        VALUES (p_grupo_id, aluno.nome, aluno.matricula, aluno.email, aluno.eh_lider);
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."atualizar_grupo_completo"("p_grupo_id" "uuid", "p_nome_grupo" character varying, "p_turma_id" "uuid", "p_tema_projeto" character varying, "p_link_repositorio" character varying, "p_nova_data_id" "uuid", "p_antiga_data_id" "uuid", "p_alunos" json) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."criar_configuracao_padrao_turma"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.configuracoes (
    turma_id,
    limite_alunos_min,
    limite_alunos_max,
    permitir_inscricoes,
    limite_alunos_grupo,
    data_inicio_agendamento,
    data_fim_agendamento,
    "mostrar_Integrantes"
  )
  SELECT
    NEW.id,
    COALESCE(configuracao.limite_alunos_min, 2),
    COALESCE(configuracao.limite_alunos_max, 5),
    COALESCE(configuracao.permitir_inscricoes, false),
    COALESCE(configuracao.limite_alunos_grupo, 5),
    configuracao.data_inicio_agendamento,
    configuracao.data_fim_agendamento,
    COALESCE(configuracao."mostrar_Integrantes", true)
  FROM public.configuracoes AS configuracao
  WHERE configuracao.turma_id IS NULL
  ORDER BY configuracao.id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.configuracoes (
      turma_id,
      limite_alunos_min,
      limite_alunos_max,
      permitir_inscricoes,
      limite_alunos_grupo,
      "mostrar_Integrantes"
    )
    VALUES (NEW.id, 2, 5, false, 5, true);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."criar_configuracao_padrao_turma"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."criar_grupo_inscricao"("p_turma_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_link_repositorio" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tipo_tema text;
  v_disciplina text;
  v_turma text;
  v_tema public.temas_turma%ROWTYPE;
  v_grupos_ocupados integer;
  v_tema_projeto text;
  v_grupo_id uuid;
BEGIN
  SELECT disciplina.nome, turma.nome_turma
  INTO v_disciplina, v_turma
  FROM public.turmas AS turma
  JOIN public.disciplinas AS disciplina
    ON disciplina.id = turma.disciplina_id
  WHERE turma.id = p_turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A turma ou disciplina selecionada não foi encontrada.';
  END IF;

  SELECT configuracao.tipo_tema
  INTO v_tipo_tema
  FROM public.configuracoes AS configuracao
  WHERE configuracao.turma_id = p_turma_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'As configurações da turma não foram encontradas.';
  END IF;

  IF v_tipo_tema = 'pre_definido' THEN
    IF p_tema_turma_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um tema pré-definido.';
    END IF;

    SELECT tema.*
    INTO v_tema
    FROM public.temas_turma AS tema
    WHERE tema.id = p_tema_turma_id
      AND tema.turma_id = p_turma_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'O tema selecionado não pertence à turma.';
    END IF;

    SELECT count(*)::integer
    INTO v_grupos_ocupados
    FROM public.grupos AS grupo
    WHERE grupo.tema_turma_id = v_tema.id;

    IF v_grupos_ocupados >= v_tema.limite_grupos THEN
      RAISE EXCEPTION 'Este tema não possui mais vagas disponíveis.';
    END IF;

    v_tema_projeto := v_tema.titulo;
  ELSE
    IF p_tema_turma_id IS NOT NULL THEN
      RAISE EXCEPTION 'A turma está configurada para temas livres.';
    END IF;

    v_tema_projeto := btrim(coalesce(p_tema_projeto, ''));
    IF v_tema_projeto = '' THEN
      RAISE EXCEPTION 'Informe o tema do projeto.';
    END IF;
  END IF;

  INSERT INTO public.grupos (
    nome_grupo,
    disciplina,
    turma,
    turma_id,
    tema_projeto,
    tema_turma_id,
    link_repositorio,
    data_apresentacao_id
  )
  VALUES (
    btrim(p_nome_grupo),
    v_disciplina,
    v_turma,
    p_turma_id,
    v_tema_projeto,
    p_tema_turma_id,
    p_link_repositorio,
    p_data_apresentacao_id
  )
  RETURNING id INTO v_grupo_id;

  RETURN v_grupo_id;
END;
$$;


ALTER FUNCTION "public"."criar_grupo_inscricao"("p_turma_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_link_repositorio" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."editar_grupo_professor"("p_grupo_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_alunos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_grupo public.grupos%ROWTYPE;
  v_tema public.temas_turma%ROWTYPE;
  v_tema_configurado text;
  v_tema_projeto text;
  v_disciplina text;
  v_turma text;
  v_grupos_no_tema integer;
  v_min_alunos integer;
  v_max_alunos integer;
  v_quantidade_alunos integer;
  v_nomes_invalidos boolean;
  v_data_antiga uuid;
  v_vagas_disponiveis integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'email', '') <> 'prof.eduardo.hernandes@gmail.com' THEN
    RAISE EXCEPTION 'Apenas o professor autorizado pode editar grupos.';
  END IF;

  IF btrim(coalesce(p_nome_grupo, '')) = '' THEN
    RAISE EXCEPTION 'Informe o nome do grupo.';
  END IF;

  IF jsonb_typeof(p_alunos) <> 'array' THEN
    RAISE EXCEPTION 'A lista de integrantes é inválida.';
  END IF;

  SELECT grupo.*
  INTO v_grupo
  FROM public.grupos AS grupo
  WHERE grupo.id = p_grupo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O grupo não foi encontrado.';
  END IF;

  SELECT disciplina.nome, turma.nome_turma
  INTO v_disciplina, v_turma
  FROM public.turmas AS turma
  JOIN public.disciplinas AS disciplina
    ON disciplina.id = turma.disciplina_id
  WHERE turma.id = v_grupo.turma_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A turma ou disciplina do grupo não foi encontrada.';
  END IF;

  SELECT configuracao.tipo_tema,
         configuracao.limite_alunos_min,
         configuracao.limite_alunos_grupo
  INTO v_tema_configurado, v_min_alunos, v_max_alunos
  FROM public.configuracoes AS configuracao
  WHERE configuracao.turma_id = v_grupo.turma_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'As configurações da turma não foram encontradas.';
  END IF;

  IF v_tema_configurado = 'pre_definido' THEN
    IF p_tema_turma_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um tema pré-definido.';
    END IF;

    SELECT tema.*
    INTO v_tema
    FROM public.temas_turma AS tema
    WHERE tema.id = p_tema_turma_id
      AND tema.turma_id = v_grupo.turma_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'O tema selecionado não pertence à turma.';
    END IF;

    SELECT count(*)::integer
    INTO v_grupos_no_tema
    FROM public.grupos AS grupo
    WHERE grupo.tema_turma_id = v_tema.id
      AND grupo.id <> p_grupo_id;

    IF v_grupos_no_tema >= v_tema.limite_grupos THEN
      RAISE EXCEPTION 'Este tema não possui vagas disponíveis.';
    END IF;

    v_tema_projeto := v_tema.titulo;
  ELSE
    IF p_tema_turma_id IS NOT NULL THEN
      RAISE EXCEPTION 'A turma está configurada para temas livres.';
    END IF;

    v_tema_projeto := btrim(coalesce(p_tema_projeto, ''));
    IF v_tema_projeto = '' THEN
      RAISE EXCEPTION 'Informe o tema do projeto.';
    END IF;
  END IF;

  SELECT count(*)::integer,
         coalesce(bool_or(
           btrim(coalesce(membro.nome, '')) = ''
           OR btrim(coalesce(membro.matricula, '')) = ''
         ), false)
  INTO v_quantidade_alunos, v_nomes_invalidos
  FROM jsonb_to_recordset(p_alunos) AS membro(
    nome text,
    matricula text,
    email text,
    eh_lider boolean
  );

  IF v_quantidade_alunos < v_min_alunos OR v_quantidade_alunos > v_max_alunos THEN
    RAISE EXCEPTION 'O grupo deve ter entre % e % integrantes.', v_min_alunos, v_max_alunos;
  END IF;

  IF v_nomes_invalidos THEN
    RAISE EXCEPTION 'Todos os integrantes precisam ter nome e matrícula.';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_to_recordset(p_alunos) AS membro(
      nome text,
      matricula text,
      email text,
      eh_lider boolean
    )
    WHERE membro.eh_lider IS TRUE
  ) <> 1 THEN
    RAISE EXCEPTION 'Selecione exatamente um integrante como líder.';
  END IF;

  v_data_antiga := v_grupo.data_apresentacao_id;
  IF v_data_antiga IS DISTINCT FROM p_data_apresentacao_id THEN
    PERFORM 1
    FROM public.datas_apresentacao AS horario
    WHERE (v_data_antiga IS NOT NULL AND horario.id = v_data_antiga)
       OR (p_data_apresentacao_id IS NOT NULL AND horario.id = p_data_apresentacao_id)
    ORDER BY horario.id
    FOR UPDATE;
  END IF;

  IF p_data_apresentacao_id IS NOT NULL THEN
    SELECT horario.vagas_totais - horario.vagas_ocupadas
    INTO v_vagas_disponiveis
    FROM public.datas_apresentacao AS horario
    WHERE horario.id = p_data_apresentacao_id
      AND horario.turma_id = v_grupo.turma_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'O horário selecionado não pertence à turma.';
    END IF;

    IF v_data_antiga IS DISTINCT FROM p_data_apresentacao_id
       AND v_vagas_disponiveis <= 0 THEN
      RAISE EXCEPTION 'O horário selecionado não possui vagas disponíveis.';
    END IF;
  END IF;

  IF v_data_antiga IS DISTINCT FROM p_data_apresentacao_id THEN
    IF v_data_antiga IS NOT NULL THEN
      UPDATE public.datas_apresentacao
      SET vagas_ocupadas = greatest(0, vagas_ocupadas - 1)
      WHERE id = v_data_antiga;
    END IF;

    IF p_data_apresentacao_id IS NOT NULL THEN
      UPDATE public.datas_apresentacao
      SET vagas_ocupadas = vagas_ocupadas + 1
      WHERE id = p_data_apresentacao_id;
    END IF;
  END IF;

  UPDATE public.grupos
  SET nome_grupo = btrim(p_nome_grupo),
      disciplina = v_disciplina,
      turma = v_turma,
      tema_projeto = v_tema_projeto,
      tema_turma_id = p_tema_turma_id,
      data_apresentacao_id = p_data_apresentacao_id
  WHERE id = p_grupo_id;

  DELETE FROM public.alunos
  WHERE grupo_id = p_grupo_id;

  INSERT INTO public.alunos (
    grupo_id,
    nome,
    matricula,
    email,
    eh_lider
  )
  SELECT
    p_grupo_id,
    btrim(membro.nome),
    btrim(membro.matricula),
    nullif(btrim(coalesce(membro.email, '')), ''),
    membro.eh_lider
  FROM jsonb_to_recordset(p_alunos) AS membro(
    nome text,
    matricula text,
    email text,
    eh_lider boolean
  );

  RETURN p_grupo_id;
END;
$$;


ALTER FUNCTION "public"."editar_grupo_professor"("p_grupo_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_alunos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listar_temas_turma"("p_turma_id" "uuid") RETURNS TABLE("id" "uuid", "turma_id" "uuid", "titulo" "text", "limite_grupos" integer, "created_at" timestamp with time zone, "grupos_ocupados" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    tema.id,
    tema.turma_id,
    tema.titulo,
    tema.limite_grupos,
    tema.created_at,
    count(grupo.id)::integer AS grupos_ocupados
  FROM public.temas_turma AS tema
  JOIN public.configuracoes AS configuracao
    ON configuracao.turma_id = tema.turma_id
   AND configuracao.tipo_tema = 'pre_definido'
  LEFT JOIN public.grupos AS grupo
    ON grupo.tema_turma_id = tema.id
  WHERE tema.turma_id = p_turma_id
  GROUP BY tema.id
  ORDER BY tema.titulo;
$$;


ALTER FUNCTION "public"."listar_temas_turma"("p_turma_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."salvar_avaliacao_grupo"("p_grupo_id" "uuid", "p_turma_id" "uuid", "p_observacoes" "text", "p_notas" "jsonb", "p_ajustes" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_grupo public.grupos%ROWTYPE;
  v_avaliacao_id uuid;
  v_total_rubricas integer;
  v_total_alunos integer;
  v_quantidade_payload integer;
  v_quantidade_unica integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'email', '') <> 'prof.eduardo.hernandes@gmail.com' THEN
    RAISE EXCEPTION 'Apenas o professor autorizado pode salvar avaliações.';
  END IF;

  IF jsonb_typeof(p_notas) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_ajustes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'As notas e os ajustes enviados são inválidos.';
  END IF;

  SELECT grupo.*
  INTO v_grupo
  FROM public.grupos AS grupo
  WHERE grupo.id = p_grupo_id
    AND grupo.turma_id = p_turma_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O grupo não pertence à turma selecionada.';
  END IF;

  SELECT count(*)::integer
  INTO v_total_rubricas
  FROM public.rubricas AS rubrica
  WHERE rubrica.turma_id = v_grupo.turma_id;

  IF v_total_rubricas = 0 THEN
    RAISE EXCEPTION 'Cadastre ao menos uma rubrica para esta turma antes de avaliar.';
  END IF;

  SELECT count(*)::integer, count(DISTINCT nota.rubrica_id)::integer
  INTO v_quantidade_payload, v_quantidade_unica
  FROM jsonb_to_recordset(p_notas) AS nota(
    rubrica_id uuid,
    nota_atribuida numeric
  );

  IF v_quantidade_payload <> v_total_rubricas
     OR v_quantidade_unica <> v_total_rubricas THEN
    RAISE EXCEPTION 'Informe exatamente uma nota para cada rubrica da turma.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_notas) AS nota(
      rubrica_id uuid,
      nota_atribuida numeric
    )
    LEFT JOIN public.rubricas AS rubrica
      ON rubrica.id = nota.rubrica_id
     AND rubrica.turma_id = v_grupo.turma_id
    WHERE rubrica.id IS NULL
       OR nota.nota_atribuida IS NULL
       OR nota.nota_atribuida < 0
       OR nota.nota_atribuida > rubrica.valor_maximo
  ) THEN
    RAISE EXCEPTION 'Uma nota informada é inválida ou excede o valor máximo da rubrica.';
  END IF;

  SELECT count(*)::integer
  INTO v_total_alunos
  FROM public.alunos AS aluno
  WHERE aluno.grupo_id = v_grupo.id;

  SELECT count(*)::integer, count(DISTINCT ajuste.matricula_aluno)::integer
  INTO v_quantidade_payload, v_quantidade_unica
  FROM jsonb_to_recordset(p_ajustes) AS ajuste(
    matricula_aluno text,
    pontos numeric,
    motivo text
  );

  IF v_quantidade_payload <> v_total_alunos
     OR v_quantidade_unica <> v_total_alunos THEN
    RAISE EXCEPTION 'Informe um ajuste para cada integrante do grupo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_ajustes) AS ajuste(
      matricula_aluno text,
      pontos numeric,
      motivo text
    )
    LEFT JOIN public.alunos AS aluno
      ON aluno.grupo_id = v_grupo.id
     AND aluno.matricula = ajuste.matricula_aluno
    WHERE aluno.id IS NULL
       OR ajuste.pontos IS NULL
       OR ajuste.motivo IS NULL
  ) THEN
    RAISE EXCEPTION 'Um ajuste informado não corresponde a um integrante válido.';
  END IF;

  INSERT INTO public.avaliacoes_grupos (
    grupo_id,
    turma_id,
    observacoes
  )
  VALUES (
    v_grupo.id,
    v_grupo.turma_id,
    coalesce(p_observacoes, '')
  )
  ON CONFLICT (grupo_id) DO UPDATE
  SET turma_id = EXCLUDED.turma_id,
      observacoes = EXCLUDED.observacoes,
      updated_at = now()
  RETURNING id INTO v_avaliacao_id;

  DELETE FROM public.notas_rubricas
  WHERE avaliacao_grupo_id = v_avaliacao_id;

  INSERT INTO public.notas_rubricas (
    avaliacao_grupo_id,
    rubrica_id,
    nota_atribuida
  )
  SELECT
    v_avaliacao_id,
    nota.rubrica_id,
    nota.nota_atribuida
  FROM jsonb_to_recordset(p_notas) AS nota(
    rubrica_id uuid,
    nota_atribuida numeric
  );

  DELETE FROM public.ajustes_individuais
  WHERE grupo_id = v_grupo.id;

  INSERT INTO public.ajustes_individuais (
    grupo_id,
    matricula_aluno,
    pontos,
    motivo
  )
  SELECT
    v_grupo.id,
    ajuste.matricula_aluno,
    ajuste.pontos,
    btrim(ajuste.motivo)
  FROM jsonb_to_recordset(p_ajustes) AS ajuste(
    matricula_aluno text,
    pontos numeric,
    motivo text
  )
  WHERE ajuste.pontos <> 0
     OR btrim(ajuste.motivo) <> '';

  RETURN v_avaliacao_id;
END;
$$;


ALTER FUNCTION "public"."salvar_avaliacao_grupo"("p_grupo_id" "uuid", "p_turma_id" "uuid", "p_observacoes" "text", "p_notas" "jsonb", "p_ajustes" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ajustes_individuais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "matricula_aluno" "text" NOT NULL,
    "pontos" numeric(8,2) DEFAULT 0 NOT NULL,
    "motivo" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."ajustes_individuais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alunos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid",
    "nome" character varying(150) NOT NULL,
    "matricula" character varying(50) NOT NULL,
    "email" character varying(150),
    "eh_lider" boolean DEFAULT false
);


ALTER TABLE "public"."alunos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."alunos_permitidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turma_id" "uuid",
    "matricula" character varying(50) NOT NULL,
    "nome" character varying(150) NOT NULL
);


ALTER TABLE "public"."alunos_permitidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avaliacoes_grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "observacoes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."avaliacoes_grupos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracoes" (
    "id" integer NOT NULL,
    "limite_alunos_min" integer DEFAULT 2,
    "limite_alunos_max" integer DEFAULT 5,
    "permitir_inscricoes" boolean DEFAULT true,
    "turma_id" "uuid",
    "limite_alunos_grupo" integer DEFAULT 5 NOT NULL,
    "data_inicio_agendamento" timestamp with time zone,
    "data_fim_agendamento" timestamp with time zone,
    "mostrar_Integrantes" boolean DEFAULT true NOT NULL,
    "tipo_tema" "text" DEFAULT 'livre'::"text" NOT NULL,
    CONSTRAINT "configuracoes_tipo_tema_check" CHECK (("tipo_tema" = ANY (ARRAY['livre'::"text", 'pre_definido'::"text"])))
);


ALTER TABLE "public"."configuracoes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."configuracoes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."configuracoes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."configuracoes_id_seq" OWNED BY "public"."configuracoes"."id";



CREATE TABLE IF NOT EXISTS "public"."datas_apresentacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "data_hora" timestamp with time zone NOT NULL,
    "vagas_totais" integer DEFAULT 3 NOT NULL,
    "vagas_ocupadas" integer DEFAULT 0,
    "disciplina" character varying(100),
    "turma" character varying(50),
    "turma_id" "uuid",
    "data_hora_fim" timestamp with time zone
);


ALTER TABLE "public"."datas_apresentacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disciplinas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" character varying(100) NOT NULL
);


ALTER TABLE "public"."disciplinas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome_grupo" character varying(100) NOT NULL,
    "disciplina" character varying(100) NOT NULL,
    "turma" character varying(50) NOT NULL,
    "tema_projeto" character varying(255) NOT NULL,
    "link_repositorio" character varying(255),
    "data_apresentacao_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "turma_id" "uuid",
    "tema_turma_id" "uuid"
);


ALTER TABLE "public"."grupos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notas_rubricas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "avaliacao_grupo_id" "uuid" NOT NULL,
    "rubrica_id" "uuid" NOT NULL,
    "nota_atribuida" numeric(8,2) NOT NULL,
    CONSTRAINT "notas_rubricas_nota_atribuida_check" CHECK (("nota_atribuida" >= (0)::numeric))
);


ALTER TABLE "public"."notas_rubricas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rubricas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "valor_maximo" numeric(8,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rubricas_titulo_check" CHECK (("length"("btrim"("titulo")) > 0)),
    CONSTRAINT "rubricas_valor_maximo_check" CHECK (("valor_maximo" > (0)::numeric))
);


ALTER TABLE "public"."rubricas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."temas_turma" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turma_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "limite_grupos" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "temas_turma_limite_grupos_check" CHECK (("limite_grupos" > 0)),
    CONSTRAINT "temas_turma_titulo_check" CHECK (("length"("btrim"("titulo")) > 0))
);


ALTER TABLE "public"."temas_turma" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turmas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "disciplina_id" "uuid",
    "nome_turma" character varying(100) NOT NULL
);


ALTER TABLE "public"."turmas" OWNER TO "postgres";


ALTER TABLE ONLY "public"."configuracoes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."configuracoes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ajustes_individuais"
    ADD CONSTRAINT "ajustes_individuais_grupo_id_matricula_aluno_key" UNIQUE ("grupo_id", "matricula_aluno");



ALTER TABLE ONLY "public"."ajustes_individuais"
    ADD CONSTRAINT "ajustes_individuais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alunos_permitidos"
    ADD CONSTRAINT "alunos_permitidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alunos_permitidos"
    ADD CONSTRAINT "alunos_permitidos_turma_id_matricula_key" UNIQUE ("turma_id", "matricula");



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avaliacoes_grupos"
    ADD CONSTRAINT "avaliacoes_grupos_grupo_id_key" UNIQUE ("grupo_id");



ALTER TABLE ONLY "public"."avaliacoes_grupos"
    ADD CONSTRAINT "avaliacoes_grupos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracoes"
    ADD CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."datas_apresentacao"
    ADD CONSTRAINT "datas_apresentacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disciplinas"
    ADD CONSTRAINT "disciplinas_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."disciplinas"
    ADD CONSTRAINT "disciplinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notas_rubricas"
    ADD CONSTRAINT "notas_rubricas_avaliacao_grupo_id_rubrica_id_key" UNIQUE ("avaliacao_grupo_id", "rubrica_id");



ALTER TABLE ONLY "public"."notas_rubricas"
    ADD CONSTRAINT "notas_rubricas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rubricas"
    ADD CONSTRAINT "rubricas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."temas_turma"
    ADD CONSTRAINT "temas_turma_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_pkey" PRIMARY KEY ("id");



CREATE INDEX "ajustes_individuais_grupo_id_idx" ON "public"."ajustes_individuais" USING "btree" ("grupo_id");



CREATE INDEX "avaliacoes_grupos_turma_id_idx" ON "public"."avaliacoes_grupos" USING "btree" ("turma_id");



CREATE UNIQUE INDEX "configuracoes_turma_id_unique" ON "public"."configuracoes" USING "btree" ("turma_id");



CREATE INDEX "grupos_tema_turma_id_idx" ON "public"."grupos" USING "btree" ("tema_turma_id") WHERE ("tema_turma_id" IS NOT NULL);



CREATE INDEX "rubricas_turma_id_idx" ON "public"."rubricas" USING "btree" ("turma_id");



CREATE INDEX "temas_turma_turma_id_idx" ON "public"."temas_turma" USING "btree" ("turma_id");



CREATE OR REPLACE TRIGGER "criar_configuracao_padrao_apos_turma" AFTER INSERT ON "public"."turmas" FOR EACH ROW EXECUTE FUNCTION "public"."criar_configuracao_padrao_turma"();



ALTER TABLE ONLY "public"."ajustes_individuais"
    ADD CONSTRAINT "ajustes_individuais_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alunos"
    ADD CONSTRAINT "alunos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alunos_permitidos"
    ADD CONSTRAINT "alunos_permitidos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."avaliacoes_grupos"
    ADD CONSTRAINT "avaliacoes_grupos_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."avaliacoes_grupos"
    ADD CONSTRAINT "avaliacoes_grupos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."configuracoes"
    ADD CONSTRAINT "configuracoes_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."datas_apresentacao"
    ADD CONSTRAINT "datas_apresentacao_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_data_apresentacao_id_fkey" FOREIGN KEY ("data_apresentacao_id") REFERENCES "public"."datas_apresentacao"("id");



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_tema_turma_id_fkey" FOREIGN KEY ("tema_turma_id") REFERENCES "public"."temas_turma"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."grupos"
    ADD CONSTRAINT "grupos_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notas_rubricas"
    ADD CONSTRAINT "notas_rubricas_avaliacao_grupo_id_fkey" FOREIGN KEY ("avaliacao_grupo_id") REFERENCES "public"."avaliacoes_grupos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notas_rubricas"
    ADD CONSTRAINT "notas_rubricas_rubrica_id_fkey" FOREIGN KEY ("rubrica_id") REFERENCES "public"."rubricas"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rubricas"
    ADD CONSTRAINT "rubricas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."temas_turma"
    ADD CONSTRAINT "temas_turma_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "public"."turmas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turmas"
    ADD CONSTRAINT "turmas_disciplina_id_fkey" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE CASCADE;



CREATE POLICY "Permitir alteração pública de alunos" ON "public"."alunos" USING (true);



CREATE POLICY "Permitir alteração pública de configurações" ON "public"."configuracoes" USING (true);



CREATE POLICY "Permitir alteração pública de grupos" ON "public"."grupos" FOR UPDATE USING (true);



CREATE POLICY "Permitir atualização de vagas em datas" ON "public"."datas_apresentacao" FOR UPDATE USING (true);



CREATE POLICY "Permitir exclusão pública de grupos" ON "public"."grupos" FOR DELETE USING (true);



CREATE POLICY "Permitir inserção pública de alunos" ON "public"."alunos" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir inserção pública de grupos" ON "public"."grupos" FOR INSERT WITH CHECK (true);



CREATE POLICY "Permitir leitura pública de alunos" ON "public"."alunos" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de configuracoes" ON "public"."configuracoes" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de datas" ON "public"."datas_apresentacao" FOR SELECT USING (true);



CREATE POLICY "Permitir leitura pública de grupos" ON "public"."grupos" FOR SELECT USING (true);



CREATE POLICY "Professor autorizado consulta ajustes individuais" ON "public"."ajustes_individuais" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text"));



CREATE POLICY "Professor autorizado consulta avaliacoes" ON "public"."avaliacoes_grupos" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text"));



CREATE POLICY "Professor autorizado consulta notas de rubricas" ON "public"."notas_rubricas" FOR SELECT TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text"));



CREATE POLICY "Professor autorizado gerencia rubricas" ON "public"."rubricas" TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text"));



CREATE POLICY "Professor autorizado gerencia temas de turma" ON "public"."temas_turma" TO "authenticated" USING ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'email'::"text") = 'prof.eduardo.hernandes@gmail.com'::"text"));



CREATE POLICY "Publico alunos" ON "public"."alunos" USING (true);



CREATE POLICY "Publico alunos permitidos" ON "public"."alunos_permitidos" USING (true);



CREATE POLICY "Publico config" ON "public"."configuracoes" USING (true);



CREATE POLICY "Publico datas" ON "public"."datas_apresentacao" USING (true);



CREATE POLICY "Publico disciplinas" ON "public"."disciplinas" USING (true);



CREATE POLICY "Publico grupos" ON "public"."grupos" USING (true);



CREATE POLICY "Publico turmas" ON "public"."turmas" USING (true);



CREATE POLICY "Temas de turma podem ser consultados publicamente" ON "public"."temas_turma" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."ajustes_individuais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alunos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alunos_permitidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."avaliacoes_grupos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuracoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."datas_apresentacao" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."disciplinas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grupos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notas_rubricas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rubricas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."temas_turma" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."turmas" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."atualizar_grupo_completo"("p_grupo_id" "uuid", "p_nome_grupo" character varying, "p_turma_id" "uuid", "p_tema_projeto" character varying, "p_link_repositorio" character varying, "p_nova_data_id" "uuid", "p_antiga_data_id" "uuid", "p_alunos" json) TO "anon";
GRANT ALL ON FUNCTION "public"."atualizar_grupo_completo"("p_grupo_id" "uuid", "p_nome_grupo" character varying, "p_turma_id" "uuid", "p_tema_projeto" character varying, "p_link_repositorio" character varying, "p_nova_data_id" "uuid", "p_antiga_data_id" "uuid", "p_alunos" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."atualizar_grupo_completo"("p_grupo_id" "uuid", "p_nome_grupo" character varying, "p_turma_id" "uuid", "p_tema_projeto" character varying, "p_link_repositorio" character varying, "p_nova_data_id" "uuid", "p_antiga_data_id" "uuid", "p_alunos" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."criar_configuracao_padrao_turma"() TO "anon";
GRANT ALL ON FUNCTION "public"."criar_configuracao_padrao_turma"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."criar_configuracao_padrao_turma"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."criar_grupo_inscricao"("p_turma_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_link_repositorio" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."criar_grupo_inscricao"("p_turma_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_link_repositorio" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."criar_grupo_inscricao"("p_turma_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_link_repositorio" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."criar_grupo_inscricao"("p_turma_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_link_repositorio" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."editar_grupo_professor"("p_grupo_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_alunos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."editar_grupo_professor"("p_grupo_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_alunos" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."editar_grupo_professor"("p_grupo_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_alunos" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."editar_grupo_professor"("p_grupo_id" "uuid", "p_nome_grupo" "text", "p_tema_projeto" "text", "p_tema_turma_id" "uuid", "p_data_apresentacao_id" "uuid", "p_alunos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."listar_temas_turma"("p_turma_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listar_temas_turma"("p_turma_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."listar_temas_turma"("p_turma_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."listar_temas_turma"("p_turma_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."salvar_avaliacao_grupo"("p_grupo_id" "uuid", "p_turma_id" "uuid", "p_observacoes" "text", "p_notas" "jsonb", "p_ajustes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."salvar_avaliacao_grupo"("p_grupo_id" "uuid", "p_turma_id" "uuid", "p_observacoes" "text", "p_notas" "jsonb", "p_ajustes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."salvar_avaliacao_grupo"("p_grupo_id" "uuid", "p_turma_id" "uuid", "p_observacoes" "text", "p_notas" "jsonb", "p_ajustes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."salvar_avaliacao_grupo"("p_grupo_id" "uuid", "p_turma_id" "uuid", "p_observacoes" "text", "p_notas" "jsonb", "p_ajustes" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."ajustes_individuais" TO "anon";
GRANT ALL ON TABLE "public"."ajustes_individuais" TO "authenticated";
GRANT ALL ON TABLE "public"."ajustes_individuais" TO "service_role";



GRANT ALL ON TABLE "public"."alunos" TO "anon";
GRANT ALL ON TABLE "public"."alunos" TO "authenticated";
GRANT ALL ON TABLE "public"."alunos" TO "service_role";



GRANT ALL ON TABLE "public"."alunos_permitidos" TO "anon";
GRANT ALL ON TABLE "public"."alunos_permitidos" TO "authenticated";
GRANT ALL ON TABLE "public"."alunos_permitidos" TO "service_role";



GRANT ALL ON TABLE "public"."avaliacoes_grupos" TO "anon";
GRANT ALL ON TABLE "public"."avaliacoes_grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacoes_grupos" TO "service_role";



GRANT ALL ON TABLE "public"."configuracoes" TO "anon";
GRANT ALL ON TABLE "public"."configuracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracoes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."configuracoes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."configuracoes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."configuracoes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."datas_apresentacao" TO "anon";
GRANT ALL ON TABLE "public"."datas_apresentacao" TO "authenticated";
GRANT ALL ON TABLE "public"."datas_apresentacao" TO "service_role";



GRANT ALL ON TABLE "public"."disciplinas" TO "anon";
GRANT ALL ON TABLE "public"."disciplinas" TO "authenticated";
GRANT ALL ON TABLE "public"."disciplinas" TO "service_role";



GRANT ALL ON TABLE "public"."grupos" TO "anon";
GRANT ALL ON TABLE "public"."grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."grupos" TO "service_role";



GRANT ALL ON TABLE "public"."notas_rubricas" TO "anon";
GRANT ALL ON TABLE "public"."notas_rubricas" TO "authenticated";
GRANT ALL ON TABLE "public"."notas_rubricas" TO "service_role";



GRANT ALL ON TABLE "public"."rubricas" TO "anon";
GRANT ALL ON TABLE "public"."rubricas" TO "authenticated";
GRANT ALL ON TABLE "public"."rubricas" TO "service_role";



GRANT ALL ON TABLE "public"."temas_turma" TO "anon";
GRANT ALL ON TABLE "public"."temas_turma" TO "authenticated";
GRANT ALL ON TABLE "public"."temas_turma" TO "service_role";



GRANT ALL ON TABLE "public"."turmas" TO "anon";
GRANT ALL ON TABLE "public"."turmas" TO "authenticated";
GRANT ALL ON TABLE "public"."turmas" TO "service_role";



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







