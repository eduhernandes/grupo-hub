'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Save, Trash2, Users, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type {
  Aluno,
  DataApresentacao,
  Database,
  Grupo,
  TemaTurma,
  TipoTema,
} from '@/types/database'

interface GrupoComAlunos extends Grupo {
  alunos: Aluno[]
}

interface MembroEditavel {
  id: string
  nome: string
  matricula: string
  email: string
  eh_lider: boolean
}

interface Props {
  grupo: GrupoComAlunos
  datas: DataApresentacao[]
  temas: TemaTurma[]
  tipoTema: TipoTema
  minimoAlunos: number
  maximoAlunos: number
  onClose: () => void
  onSuccess: () => Promise<void>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export default function ModalEditarGrupo({
  grupo,
  datas,
  temas,
  tipoTema,
  minimoAlunos,
  maximoAlunos,
  onClose,
  onSuccess,
}: Props) {
  const [nomeGrupo, setNomeGrupo] = useState(grupo.nome_grupo)
  const [temaProjeto, setTemaProjeto] = useState(grupo.tema_projeto)
  const [temaTurmaId, setTemaTurmaId] = useState(grupo.tema_turma_id ?? '')
  const [dataApresentacaoId, setDataApresentacaoId] = useState(
    grupo.data_apresentacao_id ?? '',
  )
  const [membros, setMembros] = useState<MembroEditavel[]>(
    grupo.alunos.map((aluno) => ({
      id: aluno.id,
      nome: aluno.nome,
      matricula: aluno.matricula,
      email: aluno.email ?? '',
      eh_lider: aluno.eh_lider,
    })),
  )
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  )

  const horariosDisponiveis = datas.filter(
    (data) =>
      data.id === grupo.data_apresentacao_id ||
      data.vagas_ocupadas < data.vagas_totais,
  )

  const atualizarMembro = (
    id: string,
    campo: 'nome' | 'matricula' | 'email',
    valor: string,
  ) => {
    setMembros((atuais) =>
      atuais.map((membro) =>
        membro.id === id ? { ...membro, [campo]: valor } : membro,
      ),
    )
  }

  const definirLider = (id: string) => {
    setMembros((atuais) =>
      atuais.map((membro) => ({ ...membro, eh_lider: membro.id === id })),
    )
  }

  const adicionarMembro = () => {
    if (membros.length >= maximoAlunos) return
    const id = `novo-${Date.now()}-${Math.random()}`
    setMembros((atuais) => [
      ...atuais,
      { id, nome: '', matricula: '', email: '', eh_lider: atuais.length === 0 },
    ])
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const tema = temas.find((item) => item.id === temaTurmaId)
    if (!nomeGrupo.trim()) {
      setErro('Informe o nome do grupo.')
      return
    }
    if (tipoTema === 'pre_definido' ? !tema : !temaProjeto.trim()) {
      setErro(
        tipoTema === 'pre_definido'
          ? 'Selecione um tema pré-definido.'
          : 'Informe o tema do projeto.',
      )
      return
    }
    if (membros.length < minimoAlunos || membros.length > maximoAlunos) {
      setErro(`O grupo deve ter entre ${minimoAlunos} e ${maximoAlunos} integrantes.`)
      return
    }
    if (membros.some((membro) => !membro.nome.trim() || !membro.matricula.trim())) {
      setErro('Todos os integrantes precisam ter nome e matrícula.')
      return
    }
    if (membros.filter((membro) => membro.eh_lider).length !== 1) {
      setErro('Selecione exatamente um integrante como líder.')
      return
    }

    try {
      setLoading(true)
      setErro(null)
      const { error } = await supabase.rpc('editar_grupo_professor', {
        p_grupo_id: grupo.id,
        p_nome_grupo: nomeGrupo.trim(),
        p_tema_projeto: tipoTema === 'livre' ? temaProjeto.trim() : tema?.titulo ?? '',
        p_tema_turma_id: tipoTema === 'pre_definido' ? temaTurmaId : null,
        p_data_apresentacao_id: dataApresentacaoId || null,
        p_alunos: membros.map(({ nome, matricula, email, eh_lider }) => ({
          nome: nome.trim(),
          matricula: matricula.trim(),
          email: email.trim() || null,
          eh_lider,
        })),
      })

      if (error) throw error
      await onSuccess()
      onClose()
    } catch (error) {
      console.error('Erro ao editar grupo:', error)
      setErro(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        aria-labelledby="modal-editar-grupo-titulo"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold text-slate-900" id="modal-editar-grupo-titulo">
              Editar grupo
            </h2>
          </div>
          <button aria-label="Fechar" className="text-slate-400 hover:text-slate-700" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        {erro && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{erro}</p>}

        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Nome do grupo
              <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5" maxLength={100} onChange={(event) => setNomeGrupo(event.target.value)} required value={nomeGrupo} />
            </label>

            {tipoTema === 'pre_definido' ? (
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Tema
                <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" onChange={(event) => setTemaTurmaId(event.target.value)} required value={temaTurmaId}>
                  <option value="">Selecione um tema</option>
                  {temas.map((tema) => (
                    <option key={tema.id} value={tema.id}>{tema.titulo} (limite: {tema.limite_grupos})</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Tema do projeto
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5" maxLength={500} onChange={(event) => setTemaProjeto(event.target.value)} required value={temaProjeto} />
              </label>
            )}

            <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
              Data e horário da apresentação
              <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" onChange={(event) => setDataApresentacaoId(event.target.value)} value={dataApresentacaoId}>
                <option value="">Sem horário</option>
                {horariosDisponiveis.map((data) => (
                  <option key={data.id} value={data.id}>
                    {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.data_hora))}
                    {data.id !== grupo.data_apresentacao_id ? ` — ${data.vagas_totais - data.vagas_ocupadas} vaga(s)` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Integrantes</h3>
                <p className="text-xs text-slate-500">Selecione o líder do grupo. E-mail é opcional.</p>
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={membros.length >= maximoAlunos} onClick={adicionarMembro} type="button">
                <Plus size={15} /> Adicionar integrante
              </button>
            </div>

            {membros.map((membro, indice) => (
              <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2" key={membro.id}>
                <legend className="px-1 text-xs font-medium text-slate-500">Integrante {indice + 1}</legend>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Nome
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" maxLength={150} onChange={(event) => atualizarMembro(membro.id, 'nome', event.target.value)} required value={membro.nome} />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Matrícula
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" maxLength={50} onChange={(event) => atualizarMembro(membro.id, 'matricula', event.target.value)} required value={membro.matricula} />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  E-mail (opcional)
                  <input className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" maxLength={254} onChange={(event) => atualizarMembro(membro.id, 'email', event.target.value)} type="email" value={membro.email} />
                </label>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input checked={membro.eh_lider} className="h-4 w-4 accent-blue-600" name="lider-grupo" onChange={() => definirLider(membro.id)} type="radio" />
                    Líder do grupo
                  </label>
                  <button aria-label={`Remover integrante ${indice + 1}`} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" disabled={membros.length <= minimoAlunos} onClick={() => setMembros((atuais) => atuais.filter((atual) => atual.id !== membro.id))} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
              </fieldset>
            ))}
          </section>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose} type="button">Cancelar</button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={loading} type="submit">
              <Save size={16} /> {loading ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
