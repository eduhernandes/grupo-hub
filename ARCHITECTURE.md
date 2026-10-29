# Arquitetura do Sistema — GrupoHub

## 1. Visão Geral da Arquitetura
O **GrupoHub** é uma aplicação web full-stack construída com **Next.js (App Router)** e **Tailwind CSS**, hospedada na **Vercel** e integrada a um banco de dados relacional **Supabase (PostgreSQL)** com Row Level Security (RLS) habilitado.

A plataforma automatiza a formação de grupos de trabalho acadêmicos e o agendamento de datas de apresentação por turma, fornecendo uma interface pública simples para os alunos e um painel de gestão centralizado para o professor.

### Principais Pilares Arquiteturais
- **Camada de Apresentação (Client & Server Components):** Interface em Next.js com componentes reativos, seleções dinâmicas em cascata e preenchimento automático por consulta em tempo real (`onBlur`).
- **Camada de Regras de Negócio e Persistência:** Regras de validação de vagas, limites por grupo e controle relacional direto via cliente Supabase e chamadas a Stored Procedures.
- **Consistência Atômica (PostgreSQL RPC):** Atualizações complexas de grupos (troca de turma, alteração de datas e reordenação de vagas) são executadas dentro de transações atômicas no banco (`atualizar_grupo_completo`), prevenindo inconsistências e condições de corrida.

---

## 2. Modelo Relacional de Dados (PostgreSQL)

O banco de dados segue um modelo relacional normalizado para suportar múltiplas turmas por disciplina, controle de vagas por banca e auto-preenchimento de alunos.

```text
[disciplinas] 1---N [turmas] 1---N [datas_apresentacao]
                       |                   |
                       +---1---N [grupos] 1---N [alunos]
                       |
                       +---1---N [alunos_permitidos]
```

### Esquema de Tabelas

1. **`disciplinas`**: Mapeia as disciplinas acadêmicas.
   - `id` (UUID, PK)
   - `nome` (VARCHAR, Unique)

2. **`turmas`**: Representa os agrupamentos de alunos vinculados a uma disciplina.
   - `id` (UUID, PK)
   - `disciplina_id` (UUID, FK -> `disciplinas.id`)
   - `nome_turma` (VARCHAR) — *Ex: "6º Período Noturno", "2º Período A"*

3. **`datas_apresentacao`**: Agenda de bancas/apresentações disponíveis por turma.
   - `id` (UUID, PK)
   - `turma_id` (UUID, FK -> `turmas.id`)
   - `data_hora` (TIMESTAMP WITH TIME ZONE, início do slot)
   - `data_hora_fim` (TIMESTAMP WITH TIME ZONE, término do slot)
   - `vagas_totais` (INT)
   - `vagas_ocupadas` (INT)

4. **`grupos`**: Registra as equipes inscritas.
   - `id` (UUID, PK)
   - `nome_grupo` (VARCHAR)
   - `turma_id` (UUID, FK -> `turmas.id`)
   - `tema_projeto` (VARCHAR)
   - `link_repositorio` (VARCHAR, Opcional)
   - `data_apresentacao_id` (UUID, FK -> `datas_apresentacao.id`)
   - `criado_em` (TIMESTAMP)

5. **`alunos`**: Membros pertencentes a cada grupo cadastrado.
   - `id` (UUID, PK)
   - `grupo_id` (UUID, FK -> `grupos.id` ON DELETE CASCADE)
   - `nome` (VARCHAR)
   - `matricula` (VARCHAR)
   - `email` (VARCHAR, Opcional/NULL)
   - `eh_lider` (BOOLEAN)

6. **`alunos_permitidos`**: Lista oficial importada pelo professor para validação de matrícula e auto-preenchimento de nomes.
   - `id` (UUID, PK)
   - `turma_id` (UUID, FK -> `turmas.id`)
   - `matricula` (VARCHAR)
   - `nome` (VARCHAR)
   - *Constraint Unique:* `(turma_id, matricula)`

7. **`configuracoes`**: Parâmetros do sistema por turma.
   - `id` (SERIAL, PK)
   - `turma_id` (UUID, FK -> `turmas.id`, único; `NULL` em registros globais antigos)
   - `limite_alunos_min` (INT, default 2)
   - `limite_alunos_max` (INT, default 5)
   - `permitir_inscricoes` (BOOLEAN)
   - `limite_alunos_grupo` (INT, default 5)
   - `data_inicio_agendamento` / `data_fim_agendamento` (TIMESTAMP WITH TIME ZONE)
   - `mostrar_Integrantes` (BOOLEAN, default true)

---

## 3. Garantia de Consistência e Transações Atômicas (RPC)

Para evitar erros de contagem de vagas quando o professor altera a data de apresentação de um grupo ou redefine seus membros, o sistema utiliza a Stored Procedure PostgreSQL `atualizar_grupo_completo`.

### Função RPC: `atualizar_grupo_completo`
A função encapsula a seguinte sequência transacional (`BEGIN ... COMMIT`):
1. **Ajuste de Vagas:** Se a data do grupo for alterada, decrementa a vaga ocupada da data antiga (`GREATEST(0, vagas_ocupadas - 1)`) e incrementa a vaga ocupada na nova data.
2. **Atualização do Grupo:** Atualiza os metadados do grupo (`nome_grupo`, `turma_id`, `tema_projeto`, `link_repositorio`, `data_apresentacao_id`).
3. **Sincronização dos Membros:** Remove os registros antigos do grupo em `alunos` e reinsere a lista atualizada enviada via JSON.

---

## 4. Fluxos Principais do Sistema

### 4.1. Fluxo de Inscrição do Aluno (`/`)
1. **Seleção Encadeada:** O aluno escolhe a **Disciplina** -> O sistema filtra e carrega as **Turmas** vinculadas -> O aluno escolhe a **Turma** -> O sistema filtra as **Datas de Apresentação** com vagas disponíveis (`vagas_ocupadas < vagas_totais`).
2. **Identificação por Matrícula (`onBlur`):** Ao digitar a matrícula de um membro do grupo, o sistema consulta `alunos_permitidos` (com tolerância a zeros à esquerda no código de busca). Se encontrado, o nome é preenchido automaticamente.
3. **Flexibilidade de E-mail:** O campo de e-mail é opcional.
4. **Submissão:** O grupo e seus integrantes são salvos no banco, incrementando a contagem de vagas ocupadas da data escolhida.

### 4.2. Fluxo do Painel do Professor (`/professor`)
1. **Gestão de Disciplinas e Turmas:** Cadastro centralizado de disciplinas e vinculação de uma ou mais turmas.
2. **Gestão de Datas e Vagas:** Definição de slots com início, término e vagas por turma; ocupação e disponibilidade são atualizadas via Supabase Realtime.
3. **Importação de Alunos via CSV:** Upload de arquivos com cabeçalho `matricula,nome` por turma para upsert na tabela `alunos_permitidos`.
4. **Configurações por Turma:** Limite de alunos, janela de agendamento e visibilidade dos integrantes persistidos por `turma_id`.
5. **CRUD Completo de Grupos:**
   - Visualização expandida de membros.
   - Edição completa do grupo, integrantes e troca de data via RPC atômica.
   - Exclusão de grupo com devolução automática da vaga ocupada.
   - Exportação da listagem completa em formato CSV.

---

## 5. Estrutura do Projeto

```text
/
├── app/                         # App Router do Next.js
│   ├── page.tsx                 # Tela pública de Inscrição (Alunos)
│   ├── professor/
│   │   └── page.tsx             # Painel Administrativo (Professor)
│   └── layout.tsx               # Layout global
├── lib/
│   └── supabase.ts              # Instância do cliente Supabase
├── types/
│   └── database.ts              # Mapeamento de tipos e interfaces TypeScript
├── ARCHITECTURE.md              # Documentação arquitetural
└── README.md                    # Instruções de execução e deploy
```