CREATE OR REPLACE FUNCTION public.criar_grupo_inscricao(
  p_turma_id uuid,
  p_nome_grupo text,
  p_tema_projeto text,
  p_tema_turma_id uuid,
  p_data_apresentacao_id uuid,
  p_link_repositorio text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
