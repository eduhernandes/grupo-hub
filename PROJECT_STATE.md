# Estado do Projeto — GrupoHub

## 1. Status Atual
- **Fase Atual:** Setup Inicial e Configuração da Base de Conhecimento.
- **Status:** 🟡 **Em Progresso / A Iniciar o Desenvolvimento de Código**

---

## 2. Roadmap e Próximas Tarefas (Atômicas)

### Etapa 1: Fundação do Projeto
- [ ] **Tarefa 1.1:** Inicializar o projeto Next.js com Tailwind CSS e TypeScript (`npx create-next-app@latest .`).
- [ ] **Tarefa 1.2:** Instalar dependências essenciais (`@supabase/supabase-js`, `lucide-react`).
- [ ] **Tarefa 1.3:** Criar o arquivo `lib/supabase.ts` e configurar as variáveis de ambiente (`.env.local`).
- [ ] **Tarefa 1.4:** Criar o arquivo de tipagens em `types/database.ts`.

### Etapa 2: Banco de Dados (Supabase)
- [ ] **Tarefa 2.1:** Executar o script SQL de criação das tabelas (`configuracoes`, `datas_apresentacao`, `grupos`, `alunos`) no painel do Supabase.
- [ ] **Tarefa 2.2:** Inserir os registros iniciais de configuração e datas de teste.

### Etapa 3: Interface do Aluno (Inscrição)
- [ ] **Tarefa 3.1:** Desenvolver o formulário principal em `app/page.tsx` com gerenciamento de membros dinâmicos.
- [ ] **Tarefa 3.2:** Implementar a busca dinâmica de datas com vagas disponíveis.
- [ ] **Tarefa 3.3:** Implementar a lógica de envio (insert no Supabase + atualização de vagas).

### Etapa 4: Consulta e Painel do Professor
- [ ] **Tarefa 4.1:** Criar a página pública de listagem em `app/grupos/page.tsx`.
- [ ] **Tarefa 4.2:** Desenvolver o painel administrativo do professor em `app/professor/page.tsx`.
- [ ] **Tarefa 4.3:** Implementar as telas de gestão de datas e edição detalhada de grupos.

---

## 3. Convenções de Git e Commits
Utilize o padrão de **Conventional Commits**:
- `feat: adiciona formulário de inscrição de grupos`
- `fix: corrige contagem de vagas ao excluir grupo`
- `style: ajusta responsividade da listagem de grupos com Tailwind`
- `docs: atualiza documentação de arquitetura`