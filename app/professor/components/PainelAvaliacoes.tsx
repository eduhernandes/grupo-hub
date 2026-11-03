'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Award, FileUp, Plus, Save, Trash2 } from 'lucide-react'
import type { Aluno, Database, Grupo, Rubrica } from '@/types/database'
import ModalAdicionarRubrica from './ModalAdicionarRubrica'
import ModalImportarRubricasCSV from './ModalImportarRubricasCSV'

interface GrupoComAlunos extends Grupo {
  alunos: Aluno[]
}

interface AjusteForm {
  pontos: string
  motivo: string
}

interface PainelAvaliacoesProps {
  grupos: GrupoComAlunos[]
  turmaId: string
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
}

export default function PainelAvaliacoes({
  grupos,
  turmaId,
}: PainelAvaliacoesProps) {
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  )

  const [grupoId, setGrupoId] = useState('')
  const [rubricas, setRubricas] = useState<Rubrica[]>([])
  const [observacoes, setObservacoes] = useState('')
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [ajustes, setAjustes] = useState<Record<string, AjusteForm>>({})
  const [loadingRubricas, setLoadingRubricas] = useState(true)
  const [grupoAvaliacaoCarregadaId, setGrupoAvaliacaoCarregadaId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [rubricaRemovendoId, setRubricaRemovendoId] = useState<string | null>(null)
  const [modalAdicionarAberto, setModalAdicionarAberto] = useState(false)
  const [modalImportarAberto, setModalImportarAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  const grupoSelecionado =
    grupos.find((grupo) => grupo.id === grupoId) ?? grupos[0]
  const loadingAvaliacao =
    Boolean(grupoSelecionado) && grupoAvaliacaoCarregadaId !== grupoSelecionado?.id
  const notaBase = rubricas.reduce(
    (total, rubrica) => total + Number(notas[rubrica.id] ?? 0),
    0
  )

  const atualizarRubricas = async (): Promise<void> => {
    const { data, error: queryError } = await supabase
      .from('rubricas')
      .select('id, turma_id, titulo, valor_maximo, created_at')
      .eq('turma_id', turmaId)
      .order('titulo')

    if (queryError) throw queryError
    setRubricas(data ?? [])
  }

  useEffect(() => {
    let active = true

    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('rubricas')
          .select('id, turma_id, titulo, valor_maximo, created_at')
          .eq('turma_id', turmaId)
          .order('titulo')
        if (queryError) throw queryError
        if (active) setRubricas(data ?? [])
      } catch (error) {
        console.error('Erro ao carregar rubricas da turma:', error)
        if (active) {
          setRubricas([])
          setErro(`Não foi possível carregar as rubricas: ${getErrorMessage(error)}`)
        }
      } finally {
        if (active) setLoadingRubricas(false)
      }
    })()

    return () => {
      active = false
    }
  }, [supabase, turmaId])

  const handleExcluirRubrica = async (rubrica: Rubrica) => {
    if (
      !window.confirm(
        `Deseja excluir o critério "${rubrica.titulo}"? Critérios já usados em avaliações não podem ser excluídos.`
      )
    ) {
      return
    }

    try {
      setRubricaRemovendoId(rubrica.id)
      setErro(null)
      setSucesso(null)

      const { error: deleteError } = await supabase
        .from('rubricas')
        .delete()
        .eq('id', rubrica.id)
        .eq('turma_id', turmaId)

      if (deleteError) {
        if ('code' in deleteError && deleteError.code === '23503') {
          throw new Error('Este critério já foi usado em uma avaliação e não pode ser excluído.')
        }
        throw deleteError
      }

      await atualizarRubricas()
      setSucesso(`Critério "${rubrica.titulo}" excluído.`)
    } catch (error) {
      console.error('Erro ao excluir rubrica:', error)
      setErro(`Não foi possível excluir o critério: ${getErrorMessage(error)}`)
    } finally {
      setRubricaRemovendoId(null)
    }
  }

  useEffect(() => {
    if (!grupoSelecionado) return

    let active = true

    void (async () => {
      const { data: avaliacao, error: avaliacaoError } = await supabase
        .from('avaliacoes_grupos')
        .select('id, observacoes')
        .eq('grupo_id', grupoSelecionado.id)
        .maybeSingle()

      if (avaliacaoError) throw avaliacaoError

      const [notasResult, ajustesResult] = avaliacao
        ? await Promise.all([
            supabase
              .from('notas_rubricas')
              .select('rubrica_id, nota_atribuida')
              .eq('avaliacao_grupo_id', avaliacao.id),
            supabase
              .from('ajustes_individuais')
              .select('matricula_aluno, pontos, motivo')
              .eq('grupo_id', grupoSelecionado.id),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ]

      if (notasResult.error) throw notasResult.error
      if (ajustesResult.error) throw ajustesResult.error

      if (!active) return

      const notasSalvas = new Map(
        (notasResult.data ?? []).map((nota) => [
          nota.rubrica_id,
          String(nota.nota_atribuida),
        ])
      )
      setObservacoes(avaliacao?.observacoes ?? '')
      setNotas(Object.fromEntries(notasSalvas))
      setAjustes(
        Object.fromEntries(
          grupoSelecionado.alunos.map((aluno) => {
            const salvo = (ajustesResult.data ?? []).find(
              (ajuste) => ajuste.matricula_aluno === aluno.matricula
            )
            return [
              aluno.matricula,
              {
                pontos: salvo ? String(salvo.pontos) : '0',
                motivo: salvo?.motivo ?? '',
              },
            ]
          })
        )
      )
    })()
      .catch((error: unknown) => {
        console.error('Erro ao carregar avaliação do grupo:', error)
        if (active) {
          setObservacoes('')
          setNotas({})
          setAjustes({})
          setErro(`Não foi possível carregar a avaliação: ${getErrorMessage(error)}`)
        }
      })
      .finally(() => {
        if (active) setGrupoAvaliacaoCarregadaId(grupoSelecionado.id)
      })

    return () => {
      active = false
    }
  }, [grupoSelecionado, supabase])

  const handleSalvar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!grupoSelecionado) return

    try {
      setSalvando(true)
      setErro(null)
      setSucesso(null)
      const notasPayload = rubricas.map((rubrica) => {
        const valor = Number(notas[rubrica.id] ?? '0')
        if (!Number.isFinite(valor) || valor < 0 || valor > rubrica.valor_maximo) {
          throw new Error(
            `A nota de "${rubrica.titulo}" deve estar entre 0 e ${rubrica.valor_maximo}.`
          )
        }

        return { rubrica_id: rubrica.id, nota_atribuida: valor }
      })

      const ajustesPayload = grupoSelecionado.alunos.map((aluno) => {
        const form = ajustes[aluno.matricula] ?? { pontos: '0', motivo: '' }
        const pontos = form.pontos.trim() === '' ? 0 : Number(form.pontos)
        if (!Number.isFinite(pontos)) {
          throw new Error(`O ajuste de pontos de ${aluno.nome} precisa ser numérico.`)
        }
        return {
          matricula_aluno: aluno.matricula,
          pontos,
          motivo: form.motivo.trim(),
        }
      })

      const { error: saveError } = await supabase.rpc('salvar_avaliacao_grupo', {
        p_grupo_id: grupoSelecionado.id,
        p_turma_id: turmaId,
        p_observacoes: observacoes,
        p_notas: notasPayload,
        p_ajustes: ajustesPayload,
      })

      if (saveError) throw saveError
      setSucesso('Avaliação salva com sucesso.')
    } catch (error) {
      console.error('Erro ao salvar avaliação do grupo:', error)
      setErro(`Não foi possível salvar a avaliação: ${getErrorMessage(error)}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-slate-900">Avaliações de projetos</h2>
        <p className="mt-1 text-sm text-slate-500">
          Registre o feedback, as notas por critério e os ajustes individuais do grupo.
        </p>
      </header>

      {erro && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {sucesso}
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold text-slate-900">Critérios da turma</h3>
            <p className="text-sm text-slate-500">
              Gerencie as rubricas e seus valores máximos para esta turma.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setModalImportarAberto(true)}
              type="button"
            >
              <FileUp size={16} /> Importar Rubricas via CSV
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={() => setModalAdicionarAberto(true)}
              type="button"
            >
              <Plus size={16} /> Adicionar Critério
            </button>
          </div>
        </div>

        {loadingRubricas ? (
          <p className="text-sm text-slate-500" role="status">Carregando critérios...</p>
        ) : rubricas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Nenhum critério cadastrado para esta turma.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {rubricas.map((rubrica) => (
              <li
                className="flex items-center justify-between gap-3 px-4 py-3"
                key={rubrica.id}
              >
                <span className="text-sm font-medium text-slate-800">{rubrica.titulo}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">
                    Máximo: {rubrica.valor_maximo}
                  </span>
                  <button
                    aria-label={`Excluir critério ${rubrica.titulo}`}
                    className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={rubricaRemovendoId === rubrica.id}
                    onClick={() => void handleExcluirRubrica(rubrica)}
                    title="Excluir critério"
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="block max-w-xl space-y-1 text-sm font-medium text-slate-700">
        Grupo da turma
        <select
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          onChange={(event) => {
            setGrupoId(event.target.value)
            setObservacoes('')
            setNotas({})
            setAjustes({})
            setErro(null)
            setSucesso(null)
          }}
          value={grupoSelecionado?.id ?? ''}
        >
          <option value="">Selecione um grupo</option>
          {grupos.map((grupo) => (
            <option key={grupo.id} value={grupo.id}>
              {grupo.nome_grupo}
            </option>
          ))}
        </select>
      </label>

      {!grupoSelecionado ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {grupos.length === 0
            ? 'Não há grupos cadastrados nesta turma para avaliar.'
            : 'Selecione um grupo para iniciar a avaliação.'}
        </div>
      ) : loadingRubricas || loadingAvaliacao ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">
          Carregando dados da avaliação...
        </div>
      ) : rubricas.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Não há rubricas cadastradas para esta turma. Cadastre critérios na tabela{' '}
          <code>rubricas</code> antes de avaliar um grupo.
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(event) => void handleSalvar(event)}>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Award className="text-blue-600" size={19} />
              <div>
                <h3 className="font-semibold text-slate-900">{grupoSelecionado.nome_grupo}</h3>
                <p className="text-sm text-slate-500">{grupoSelecionado.tema_projeto}</p>
              </div>
            </div>

            <label className="block space-y-1 text-sm font-medium text-slate-700">
              Observações sobre a apresentação e o projeto
              <textarea
                className="min-h-36 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal"
                maxLength={10000}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Registre o feedback geral para este grupo..."
                value={observacoes}
              />
            </label>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Critérios de avaliação</h3>
                <p className="text-sm text-slate-500">A nota base do grupo é a soma dos critérios.</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-800">
                Nota base: {notaBase.toFixed(2)}
              </p>
            </div>
            <div className="space-y-3">
              {rubricas.map((rubrica) => (
                <label
                  className="grid items-center gap-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
                  key={rubrica.id}
                >
                  <span className="text-sm font-medium text-slate-700">{rubrica.titulo}</span>
                  <span className="flex items-center gap-2 text-sm text-slate-500">
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-right text-slate-900"
                      max={rubrica.valor_maximo}
                      min={0}
                      onChange={(event) =>
                        setNotas((atuais) => ({
                          ...atuais,
                          [rubrica.id]: event.target.value,
                        }))
                      }
                      required
                      step="0.01"
                      type="number"
                      value={notas[rubrica.id] ?? '0'}
                    />
                    <span className="whitespace-nowrap">/ {rubrica.valor_maximo}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-slate-900">Ajustes individuais</h3>
              <p className="text-sm text-slate-500">
                A nota final é a nota base do grupo somada ao ajuste individual.
              </p>
            </div>
            <div className="space-y-3">
              {grupoSelecionado.alunos.map((aluno) => {
                const ajuste = ajustes[aluno.matricula] ?? { pontos: '0', motivo: '' }
                const pontos = ajuste.pontos.trim() === '' ? 0 : Number(ajuste.pontos)
                return (
                  <div
                    className="grid gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.5fr)_9rem]"
                    key={aluno.id}
                  >
                    <div className="self-center">
                      <p className="text-sm font-medium text-slate-800">{aluno.nome}</p>
                      <p className="text-xs text-slate-500">Matrícula: {aluno.matricula}</p>
                    </div>
                    <label className="space-y-1 text-xs font-medium text-slate-600">
                      Ajuste de pontos
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                        onChange={(event) =>
                          setAjustes((atuais) => ({
                            ...atuais,
                            [aluno.matricula]: { ...ajuste, pontos: event.target.value },
                          }))
                        }
                        step="0.1"
                        type="number"
                        value={ajuste.pontos}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-slate-600">
                      Motivo do ajuste
                      <input
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                        maxLength={500}
                        onChange={(event) =>
                          setAjustes((atuais) => ({
                            ...atuais,
                            [aluno.matricula]: { ...ajuste, motivo: event.target.value },
                          }))
                        }
                        placeholder="Ex.: falta, liderança extra"
                        value={ajuste.motivo}
                      />
                    </label>
                    <div className="self-center text-sm sm:text-right">
                      <span className="block text-xs text-slate-500">Nota final</span>
                      <span className="font-semibold text-slate-900">
                        {Number.isFinite(pontos) ? (notaBase + pontos).toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="flex justify-end">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={salvando || loadingRubricas || loadingAvaliacao}
              type="submit"
            >
              <Save size={16} /> {salvando ? 'Salvando...' : 'Salvar avaliação'}
            </button>
          </div>
        </form>
      )}

      <ModalAdicionarRubrica
        isOpen={modalAdicionarAberto}
        onClose={() => setModalAdicionarAberto(false)}
        onSuccess={atualizarRubricas}
        turmaId={turmaId}
      />
      <ModalImportarRubricasCSV
        isOpen={modalImportarAberto}
        onClose={() => setModalImportarAberto(false)}
        onSuccess={atualizarRubricas}
        turmaId={turmaId}
      />
    </section>
  )
}
