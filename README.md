# 🎓 GrupoHub

O **GrupoHub** é uma plataforma acadêmica completa desenvolvida para simplificar a gestão de bancas, formação de grupos e agendamento de apresentações de trabalhos acadêmicos. 

A plataforma conecta professores e alunos através de uma interface moderna e intuitiva, eliminando planilhas manuais e garantindo total consistência na contagem de vagas e organização de turmas.

---

## 🚀 Principais Funcionalidades

### 👨‍🎓 Área do Aluno (`/`)
* **Seleção Encadeada Dinâmica:** Escolha da disciplina $\rightarrow$ turma $\rightarrow$ datas com vagas disponíveis em tempo real.
* **Auto-preenchimento por Matrícula:** Integração com a lista oficial importada. Ao digitar a matrícula (com tolerância a zeros à esquerda), o nome do aluno é preenchido automaticamente.
* **Inscrição Validada:** Formação de grupos respeitando os limites mínimo e máximo de integrantes definidos pelo professor.

### 👨‍🏫 Painel do Professor (`/professor`)
* **Gestão de Disciplinas e Turmas:** Organização hierárquica completa para múltiplos períodos ou turmas.
* **Agendamento de Bancas:** Definição de datas/horários por turma com ajuste dinâmico do total de vagas.
* **Importação da Lista de Alunos (CSV):** Cadastro em massa de alunos por turma via upload de arquivo `.csv`.
* **Gerenciamento Completo de Grupos (CRUD):** Visualização de membros, ajuste de tema, troca atômica de data e exclusão com devolução automática de vagas.
* **Exportação de Dados:** Exportação em um clique de todos os grupos e inscritos no formato CSV.

---

## 🛠️ Stack Tecnológica

* **Frontend / Framework:** [Next.js](https://nextjs.org/) (App Router, TypeScript)
* **Estilização:** [Tailwind CSS](https://tailwindcss.com/) & [Lucide Icons](https://lucide.dev/)
* **Backend & Banco de Dados:** [Supabase](https://supabase.com/) (PostgreSQL, Stored Procedures RPC e Row Level Security)
* **Hospedagem:** [Vercel](https://vercel.com/)

---

## ⚙️ Configuração do Ambiente Local

### 1. Pré-requisitos
* Node.js 18.x ou superior
* NPM ou Yarn

### 2. Instalação
Clone o repositório e instale as dependências:

```bash
git clone https://github.com/seu-usuario/grupo-hub.git
cd grupo-hub
npm install
```

### 3. Variáveis de Ambiente
Crie um arquivo `.env.local` na raiz do projeto com as credenciais do seu projeto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
```

### 4. Executando a Aplicação

```bash
# Executa o servidor de desenvolvimento
npm run dev

# Valida a compilação e tipagem do TypeScript
npm run build
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador para visualizar o sistema.

---

## 🗄️ Estrutura do Banco de Dados & Função RPC

O banco de dados PostgreSQL roda no Supabase. Certifique-se de executar as migrations ou os scripts SQL contidos na documentação do projeto para criar as tabelas:
- `disciplinas`
- `turmas`
- `datas_apresentacao`
- `grupos`
- `alunos`
- `alunos_permitidos`
- `configuracoes`

Além disso, o sistema utiliza a função atômica PostgreSQL `atualizar_grupo_completo` para garantir a consistência das vagas durante edições de grupos no painel do professor.

---

## 📁 Estrutura de Pastas

```text
grupo-hub/
├── app/                  # App Router do Next.js
│   ├── page.tsx          # Página pública de inscrição (Aluno)
│   ├── professor/
│   │   └── page.tsx      # Painel administrativo (Professor)
│   └── layout.tsx        # Layout e fontes globais
├── lib/
│   └── supabase.ts       # Cliente de conexão Supabase
├── types/
│   └── database.ts       # Definições de tipos TypeScript
├── ARCHITECTURE.md       # Documentação detalhada da arquitetura
└── README.md             # Guia rápido e instruções
```

---

## 📄 Licença

Este projeto está sob a licença MIT. Sinta-se à vontade para utilizar e contribuir!