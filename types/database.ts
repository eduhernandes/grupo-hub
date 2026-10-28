export interface Configuracao {
  id: number;
  limite_alunos_min: number;
  limite_alunos_max: number;
  permitir_inscricoes: boolean;
}

export interface DataApresentacao {
  id: string;
  data_hora: string;
  disciplina: string;
  turma: string;
  vagas_totais: number;
  vagas_ocupadas: number;
}

export interface Grupo {
  id: string;
  nome_grupo: string;
  disciplina: string;
  turma: string;
  tema_projeto: string;
  link_repositorio: string | null;
  data_apresentacao_id: string | null;
  criado_em: string;
}

export interface Aluno {
  id: string;
  grupo_id: string;
  nome: string;
  matricula: string;
  email?: string | null;
  eh_lider: boolean;
}

export type NovoGrupo = Omit<Grupo, "id" | "criado_em">;
export type NovoAluno = Omit<Aluno, "id">;
export type NovaData = Omit<DataApresentacao, "id">;
