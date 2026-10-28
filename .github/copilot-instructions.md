# Instruções do Sistema para o GitHub Copilot — GrupoHub

## 1. Stack Tecnológica e Versões
- **Framework Frontend/Backend:** Next.js (App Router, versão 14+) com TypeScript estrito (`strict: true`).
- **Estilização:** Tailwind CSS para design system e componentes responsivos.
- **Ícones:** `lucide-react`.
- **Banco de Dados & Backend as a Service:** Supabase (PostgreSQL), utilizando `@supabase/supabase-js`.
- **Hospedagem / Deploy:** Vercel.

## 2. Padrões de Arquitetura e Organização
- **App Router do Next.js:** Utilize estritamente a pasta `app/` para rotas. Páginas públicas na raiz e painéis administrativos protegidos em `app/professor/`.
- **Componentização:** Prefira componentes reutilizáveis e modulares. Separe lógica de negócio de componentes visuais sempre que possível.
- **Tipagem:** Todas as tabelas do banco de dados e payloads de formulários devem possuir interfaces TypeScript explícitas em `types/`. Evite o uso de `any`.

## 3. Diretrizes de Código e Convenções
- **Nomenclatura:** 
  - Arquivos de componentes em PascalCase (ex: `FormularioGrupo.tsx`).
  - Rotas e utilitários em kebab-case ou camelCase descritivo.
  - Banco de dados em snake_case (padrão PostgreSQL: `tabelas`, `coluna_exemplo`).
- **Tratamento de Erros:** Sempre utilize blocos `try/catch` em chamadas assíncronas ao Supabase e exiba feedbacks claros para o usuário via estados de erro na UI.
- **Gerenciamento de Estado:** Utilize `useState` e `useEffect` do React para formulários e listagens locais. Para fluxos complexos de banco, utilize Server Actions do Next.js.

## 4. O que NUNCA fazer (Restrições Críticas)
- **NÃO** utilize JavaScript puro em arquivos novos; todo código deve ser estritamente em TypeScript.
- **NÃO** misture lógica de banco de dados diretamente nos componentes visuais de forma desorganizada; isole clientes e chamadas.
- **NÃO** altere o esquema do banco de dados (tabelas `configuracoes`, `datas_apresentacao`, `grupos`, `alunos`) sem ajustar os tipos correspondentes em `types/database.ts`.

## 5. Padrão de Resposta Esperado da IA
- Forneça blocos de código completos, limpos e prontos para produção, evitando placeholders do tipo `// adicione o resto aqui`.
- Sempre indique o caminho exato do arquivo onde o código deve ser salvo.