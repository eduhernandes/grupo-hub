export interface Configuracao {
  id: number;
  limite_alunos_min: number;
  limite_alunos_max: number;
  permitir_inscricoes: boolean;
}

export interface DataApresentacao {
  id: string;
  turma_id: string;
  data_hora: string;
  vagas_totais: number;
  vagas_ocupadas: number;
}

export interface Disciplina {
  id: string;
  nome: string;
}

export interface Turma {
  id: string;
  disciplina_id: string;
  nome_turma: string;
}

export interface Grupo {
  id: string;
  nome_grupo: string;
  turma_id: string;
  tema_projeto: string;
  link_repositorio: string | null;
  data_apresentacao_id: string | null;
}

export interface Aluno {
  id: string;
  grupo_id: string;
  nome: string;
  matricula: string;
  email?: string | null;
  eh_lider: boolean;
}

export type NovoGrupo = Omit<Grupo, "id">;
export type NovoAluno = Omit<Aluno, "id">;
export type NovaData = Omit<DataApresentacao, "id">;
export type NovaDisciplina = Omit<Disciplina, "id">;
export type NovaTurma = Omit<Turma, "id">;
