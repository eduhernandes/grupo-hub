CREATE OR REPLACE FUNCTION public.editar_grupo_professor(
  p_grupo_id uuid,
  p_nome_grupo text,
  p_tema_projeto text,
  p_tema_turma_id uuid,
  p_data_apresentacao_id uuid,
  p_alunos jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.editar_grupo_professor(
  uuid, text, text, uuid, uuid, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.editar_grupo_professor(
  uuid, text, text, uuid, uuid, jsonb
) TO authenticated;
