# Arquitetura do Sistema — GrupoHub

## 1. Visão Geral da Arquitetura
O **GrupoHub** é uma aplicação monolítica full-stack construída em **Next.js (App Router)** hospedada na **Vercel**, conectada diretamente a um banco de dados relacional **Supabase (PostgreSQL)**. 

- **Camada de Apresentação (Client & Server Components):** Renderiza as telas de inscrição para os alunos e o painel administrativo para o professor.
- **Camada de Regra de Negócio / API:** Utiliza Server Actions do Next.js para processar regras críticas (como validação de limites de alunos e controle transacional de vagas).
- **Camada de Persistência:** Supabase gerencia o banco relacional, garantindo integridade referencial via chaves estrangeiras (`FOREIGN KEY`) e exclusões em cascata (`ON DELETE CASCADE`).

---

## 2. Mapa Estrutural de Pastas (`src/` ou Raiz)

```text
/
├── .github/
│   └── copilot-instructions.md  # Diretrizes fixas para o Copilot
├── app/                         # App Router do Next.js
│   ├── page.tsx                 # Página Inicial (Inscrição do Grupo + Escolha de Data)
│   ├── grupos/
│   │   └── page.tsx             # Consulta pública de grupos inscritos
│   └── professor/
│       ├── page.tsx             # Dashboard principal do professor
│       ├── datas/
│       │   └── page.tsx         # Gestão de datas e limite de vagas por banca
│       └── grupos/
│           └── [id]/
│               └── page.tsx     # Edição detalhada e gerenciamento de um grupo específico
├── lib/
│   └── supabase.ts              # Cliente unificado do Supabase
├── types/
│   └── database.ts              # Interfaces e tipos TypeScript das tabelas
├── ARCHITECTURE.md              # Este documento de arquitetura
└── PROJECT_STATE.md             # Estado atual e roadmap do projeto

## 3. Fluxo de Dados e Regras de Negócio
1. Inscrição de Grupos:
- O aluno preenche os dados do grupo e adiciona os membros dinamicamente.
- O sistema valida a quantidade de membros com base na tabela configuracoes (limite_alunos_min e limite_alunos_max).
-O sistema filtra as opções de datas_apresentacao onde vagas_ocupadas < vagas_totais.
- Ao confirmar, o grupo é inserido, os membros são salvos na tabela alunos, e o contador vagas_ocupadas é incrementado na tabela de datas.

2. Gestão Administrativa (Professor):
- O professor pode atualizar parâmetros globais, cadastrar novas datas/bancas, editar dados de grupos existentes ou excluir grupos (o que automaticamente devolve a vaga para a data correspondente).
