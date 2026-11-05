BEGIN;

INSERT INTO public.disciplinas (id, nome)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Engenharia de Software (TESTE)'),
  ('10000000-0000-4000-8000-000000000002', 'Banco de Dados (TESTE)')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

INSERT INTO public.turmas (id, disciplina_id, nome_turma)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '6º período - Noite (TESTE)'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '6º período - Manhã (TESTE)'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '3º período - Noite (TESTE)')
ON CONFLICT (id) DO UPDATE
SET disciplina_id = EXCLUDED.disciplina_id,
    nome_turma = EXCLUDED.nome_turma;

INSERT INTO public.configuracoes (
  turma_id,
  limite_alunos_min,
  limite_alunos_max,
  permitir_inscricoes,
  limite_alunos_grupo,
  data_inicio_agendamento,
  data_fim_agendamento,
  "mostrar_Integrantes",
  tipo_tema
)
VALUES
  ('20000000-0000-4000-8000-000000000001', 2, 5, true, 5, now() - interval '1 day', now() + interval '30 days', true, 'pre_definido'),
  ('20000000-0000-4000-8000-000000000002', 2, 5, true, 5, now() - interval '1 day', now() + interval '30 days', true, 'livre'),
  ('20000000-0000-4000-8000-000000000003', 2, 4, true, 4, now() - interval '1 day', now() + interval '30 days', false, 'livre')
ON CONFLICT (turma_id) DO UPDATE
SET limite_alunos_min = EXCLUDED.limite_alunos_min,
    limite_alunos_max = EXCLUDED.limite_alunos_max,
    permitir_inscricoes = EXCLUDED.permitir_inscricoes,
    limite_alunos_grupo = EXCLUDED.limite_alunos_grupo,
    data_inicio_agendamento = EXCLUDED.data_inicio_agendamento,
    data_fim_agendamento = EXCLUDED.data_fim_agendamento,
    "mostrar_Integrantes" = EXCLUDED."mostrar_Integrantes",
    tipo_tema = EXCLUDED.tipo_tema;

INSERT INTO public.temas_turma (id, turma_id, titulo, limite_grupos)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Aplicativo de organização de estudos', 2),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Plataforma de apoio à comunidade', 2),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Automação de tarefas acadêmicas', 1)
ON CONFLICT (id) DO UPDATE
SET turma_id = EXCLUDED.turma_id,
    titulo = EXCLUDED.titulo,
    limite_grupos = EXCLUDED.limite_grupos;

INSERT INTO public.datas_apresentacao (
  id, turma_id, data_hora, data_hora_fim, vagas_totais, vagas_ocupadas, disciplina, turma
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', date_trunc('day', now()) + interval '7 days 9 hours', date_trunc('day', now()) + interval '7 days 10 hours', 4, 2, 'Engenharia de Software (TESTE)', '6º período - Noite (TESTE)'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', date_trunc('day', now()) + interval '7 days 10 hours', date_trunc('day', now()) + interval '7 days 11 hours', 3, 0, 'Engenharia de Software (TESTE)', '6º período - Noite (TESTE)'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', date_trunc('day', now()) + interval '8 days 14 hours', date_trunc('day', now()) + interval '8 days 15 hours', 4, 1, 'Engenharia de Software (TESTE)', '6º período - Manhã (TESTE)'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', date_trunc('day', now()) + interval '8 days 19 hours', date_trunc('day', now()) + interval '8 days 20 hours', 3, 0, 'Banco de Dados (TESTE)', '3º período - Noite (TESTE)')
ON CONFLICT (id) DO UPDATE
SET turma_id = EXCLUDED.turma_id,
    data_hora = EXCLUDED.data_hora,
    data_hora_fim = EXCLUDED.data_hora_fim,
    vagas_totais = EXCLUDED.vagas_totais,
    vagas_ocupadas = EXCLUDED.vagas_ocupadas,
    disciplina = EXCLUDED.disciplina,
    turma = EXCLUDED.turma;

INSERT INTO public.grupos (
  id, nome_grupo, disciplina, turma, turma_id, tema_projeto, tema_turma_id,
  link_repositorio, data_apresentacao_id
)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'Grupo Aurora (TESTE)', 'Engenharia de Software (TESTE)', '6º período - Noite (TESTE)', '20000000-0000-4000-8000-000000000001', 'Aplicativo de organização de estudos', '30000000-0000-4000-8000-000000000001', 'https://example.invalid/aurora', '40000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', 'Grupo Ipê (TESTE)', 'Engenharia de Software (TESTE)', '6º período - Noite (TESTE)', '20000000-0000-4000-8000-000000000001', 'Plataforma de apoio à comunidade', '30000000-0000-4000-8000-000000000002', NULL, '40000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000003', 'Grupo Horizonte (TESTE)', 'Engenharia de Software (TESTE)', '6º período - Manhã (TESTE)', '20000000-0000-4000-8000-000000000002', 'Painel de acompanhamento de projetos', NULL, 'https://example.invalid/horizonte', '40000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO UPDATE
SET nome_grupo = EXCLUDED.nome_grupo,
    disciplina = EXCLUDED.disciplina,
    turma = EXCLUDED.turma,
    turma_id = EXCLUDED.turma_id,
    tema_projeto = EXCLUDED.tema_projeto,
    tema_turma_id = EXCLUDED.tema_turma_id,
    link_repositorio = EXCLUDED.link_repositorio,
    data_apresentacao_id = EXCLUDED.data_apresentacao_id;

INSERT INTO public.alunos_permitidos (id, turma_id, matricula, nome)
VALUES
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '900001', 'Ana Exemplo'),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '900002', 'Bruno Fictício'),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '900003', 'Caio Demonstração'),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '900004', 'Diana Inventada'),
  ('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '900005', 'Enzo Amostra'),
  ('60000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '910001', 'Fernanda Modelo'),
  ('60000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', '910002', 'Gabriel Simulado'),
  ('60000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', '910003', 'Helena Teste'),
  ('60000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000003', '920001', 'Igor Fictício'),
  ('60000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000003', '920002', 'Joana Exemplo')
ON CONFLICT (turma_id, matricula) DO UPDATE SET nome = EXCLUDED.nome;

INSERT INTO public.alunos (id, grupo_id, nome, matricula, email, eh_lider)
VALUES
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Ana Exemplo', '900001', 'ana@example.invalid', true),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Bruno Fictício', '900002', 'bruno@example.invalid', false),
  ('70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000002', 'Caio Demonstração', '900003', 'caio@example.invalid', true),
  ('70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000002', 'Diana Inventada', '900004', NULL, false),
  ('70000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000003', 'Fernanda Modelo', '910001', 'fernanda@example.invalid', true),
  ('70000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000003', 'Gabriel Simulado', '910002', 'gabriel@example.invalid', false),
  ('70000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000003', 'Helena Teste', '910003', NULL, false)
ON CONFLICT (id) DO UPDATE
SET grupo_id = EXCLUDED.grupo_id,
    nome = EXCLUDED.nome,
    matricula = EXCLUDED.matricula,
    email = EXCLUDED.email,
    eh_lider = EXCLUDED.eh_lider;

INSERT INTO public.rubricas (id, turma_id, titulo, valor_maximo)
VALUES
  ('80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Clareza da apresentação', 10),
  ('80000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Qualidade da solução', 10),
  ('80000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Colaboração da equipe', 10)
ON CONFLICT (id) DO UPDATE
SET turma_id = EXCLUDED.turma_id,
    titulo = EXCLUDED.titulo,
    valor_maximo = EXCLUDED.valor_maximo;

INSERT INTO public.avaliacoes_grupos (id, grupo_id, turma_id, observacoes)
VALUES (
  '90000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Avaliação fictícia para testar o painel.'
)
ON CONFLICT (grupo_id) DO UPDATE
SET turma_id = EXCLUDED.turma_id,
    observacoes = EXCLUDED.observacoes,
    updated_at = now();

INSERT INTO public.notas_rubricas (id, avaliacao_grupo_id, rubrica_id, nota_atribuida)
VALUES
  ('a0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 8.5),
  ('a0000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 9),
  ('a0000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000003', 8)
ON CONFLICT (avaliacao_grupo_id, rubrica_id) DO UPDATE
SET nota_atribuida = EXCLUDED.nota_atribuida;

INSERT INTO public.ajustes_individuais (id, grupo_id, matricula_aluno, pontos, motivo)
VALUES
  ('b0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '900001', 0.5, 'Contribuição fictícia destacada'),
  ('b0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', '900002', -0.5, 'Participação fictícia reduzida')
ON CONFLICT (grupo_id, matricula_aluno) DO UPDATE
SET pontos = EXCLUDED.pontos,
    motivo = EXCLUDED.motivo;

COMMIT;
