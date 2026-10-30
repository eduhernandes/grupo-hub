export interface Configuracao {
  id: number;
  turma_id: string | null;
  tipo_tema: TipoTema;
  limite_alunos_min: number;
  limite_alunos_max: number;
  permitir_inscricoes: boolean;
  limite_alunos_grupo: number;
  data_inicio_agendamento: string | null;
  data_fim_agendamento: string | null;
  mostrar_Integrantes: boolean;
}

export type TipoTema = "livre" | "pre_definido";

export interface TemaTurma {
  id: string;
  turma_id: string;
  titulo: string;
  limite_grupos: number;
  created_at: string;
}

export interface AlunoPermitido {
  id: string;
  turma_id: string;
  matricula: string;
  nome: string;
}

export interface DataApresentacao {
  id: string;
  turma_id: string;
  data_hora: string;
  data_hora_fim: string | null;
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
  disciplina: string;
  turma_id: string;
  tema_projeto: string;
  tema_turma_id: string | null;
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
export type NovoAlunoPermitido = Omit<AlunoPermitido, "id">;
export type NovaConfiguracao = Omit<Configuracao, "id">;

type TableDefinition<Row, Insert> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      disciplinas: TableDefinition<
        Disciplina,
        Omit<Disciplina, "id"> & { id?: string }
      >;
      turmas: TableDefinition<Turma, Omit<Turma, "id"> & { id?: string }>;
      datas_apresentacao: TableDefinition<
        DataApresentacao,
        Omit<DataApresentacao, "id"> & { id?: string }
      >;
      grupos: TableDefinition<Grupo, Omit<Grupo, "id"> & { id?: string }>;
      alunos: TableDefinition<Aluno, Omit<Aluno, "id"> & { id?: string }>;
      alunos_permitidos: TableDefinition<
        AlunoPermitido,
        Omit<AlunoPermitido, "id"> & { id?: string }
      >;
      configuracoes: TableDefinition<
        Configuracao,
        Omit<Configuracao, "id"> & { id?: number }
      >;
      temas_turma: TableDefinition<
        TemaTurma,
        Omit<TemaTurma, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      listar_temas_turma: {
        Args: { p_turma_id: string };
        Returns: Array<TemaTurma & { grupos_ocupados: number }>;
      };
      criar_grupo_inscricao: {
        Args: {
          p_turma_id: string;
          p_nome_grupo: string;
          p_tema_projeto: string;
          p_tema_turma_id: string | null;
          p_data_apresentacao_id: string;
          p_link_repositorio?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
