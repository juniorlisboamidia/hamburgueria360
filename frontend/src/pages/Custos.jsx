import { useEffect, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}

// ===== Custos fixos =====

// Grupos padronizados de custo fixo, na ordem fixa de exibição da grade
const GRUPOS_FIXOS_PADRAO = [
  'Custos de funcionamento',
  'Mão de obra',
  'Motoboys',
  'Marketing',
  'Alimentação',
  'Pró-labore',
  'Custos gerais',
  'Freelancer'
]

// Mapeia categorias antigas/legadas para o grupo padronizado mais próximo.
// Só afeta exibição e o valor pré-selecionado na edição — o dado salvo não
// muda até o usuário editar e salvar (padronização de UI, sem migration).
const MAPA_CATEGORIA_LEGADA = {
  'Funcionamento': 'Custos de funcionamento',
  'Aluguel': 'Custos de funcionamento',
  'Contas': 'Custos de funcionamento',
  'Sistemas': 'Custos de funcionamento',
  'Manutenção': 'Custos de funcionamento',
  'Salários': 'Mão de obra',
  'Freelancers': 'Freelancer',
  'Outros': 'Custos gerais'
}

function categoriaCanonicaFixo(tipo) {
  const t = (tipo ?? '').trim()
  if (t === '') return 'Custos gerais'
  if (GRUPOS_FIXOS_PADRAO.includes(t)) return t
  return MAPA_CATEGORIA_LEGADA[t] ?? 'Custos gerais'
}

const FIXO_BLANK = { nome: '', valorMensal: '', tipo: '', observacao: '' }

function validateFixo({ nome, valorMensal }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  const v = Number(valorMensal)
  if (valorMensal === '' || !Number.isFinite(v)) {
    return 'valor mensal é obrigatório e deve ser numérico'
  }
  if (v < 0) return 'valor mensal deve ser maior ou igual a zero'
  return null
}

function payloadFixo(form) {
  return {
    nome: form.nome.trim(),
    valorMensal: Number(form.valorMensal),
    tipo: form.tipo.trim() === '' ? null : form.tipo.trim(),
    observacao: form.observacao.trim() === '' ? null : form.observacao.trim()
  }
}

// ===== Custos variáveis =====

const CATEGORIAS_VARIAVEL = [
  { value: 'TAXA_CARTAO',  label: 'Taxa de Cartão' },
  { value: 'MARKETPLACE',  label: 'Marketplace' },
  { value: 'EMBALAGEM',    label: 'Embalagem' },
  { value: 'ENTREGA',      label: 'Entrega' },
  { value: 'IMPOSTO',      label: 'Imposto' },
  { value: 'CUPOM',        label: 'Cupom' },
  { value: 'COMISSAO',     label: 'Comissão' },
  { value: 'OUTROS',       label: 'Outros' }
]
const CATEGORIA_VARIAVEL_LABEL = Object.fromEntries(
  CATEGORIAS_VARIAVEL.map((c) => [c.value, c.label])
)

const TIPOS_CALCULO = [
  { value: 'PERCENTUAL_FATURAMENTO',     label: '% do faturamento' },
  { value: 'VALOR_POR_PEDIDO',           label: 'Valor por pedido' },
  { value: 'VALOR_FIXO_MENSAL_VARIAVEL', label: 'Valor fixo mensal' }
]
const TIPO_CALCULO_LABEL = Object.fromEntries(TIPOS_CALCULO.map((t) => [t.value, t.label]))

const GRUPOS_VARIAVEL = [
  {
    tipo: 'PERCENTUAL_FATURAMENTO',
    titulo: 'Percentual do faturamento',
    hint: 'Impostos, taxas de cartão, comissões e royalties.'
  },
  {
    tipo: 'VALOR_POR_PEDIDO',
    titulo: 'Por pedido',
    hint: 'Embalagem média, motoboy e taxas operacionais por pedido.'
  },
  {
    tipo: 'VALOR_FIXO_MENSAL_VARIAVEL',
    titulo: 'Valor fixo mensal',
    hint: 'Custos variáveis lançados como valor fechado no mês.'
  }
]

function formatValorVariavel(valor, tipoCalculo) {
  const v = Number(valor)
  if (!Number.isFinite(v)) return '—'
  if (tipoCalculo === 'PERCENTUAL_FATURAMENTO') return pct(v)
  if (tipoCalculo === 'VALOR_POR_PEDIDO') return `${brl(v)} / pedido`
  if (tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL') return `${brl(v)} / mês`
  return brl(v)
}

const VARIAVEL_BLANK = { nome: '', categoria: '', tipoCalculo: '', valor: '' }

function validateVariavel({ nome, categoria, tipoCalculo, valor }) {
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  if (!categoria || !CATEGORIA_VARIAVEL_LABEL[categoria]) return 'categoria é obrigatória'
  if (!tipoCalculo || !TIPO_CALCULO_LABEL[tipoCalculo]) return 'tipo de cálculo é obrigatório'
  const v = Number(valor)
  if (valor === '' || !Number.isFinite(v)) return 'valor é obrigatório e deve ser numérico'
  if (v < 0) return 'valor deve ser maior ou igual a zero'
  return null
}

function payloadVariavel(form) {
  return {
    nome: form.nome.trim(),
    categoria: form.categoria,
    tipoCalculo: form.tipoCalculo,
    valor: Number(form.valor)
  }
}

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }
const btnCompactStyle = { padding: '5px 10px', fontSize: 12 }
const sectionHintStyle = { fontSize: 12.5, color: '#999', margin: '-4px 0 12px' }

// Select padronizado de categoria do custo fixo: exatamente os grupos da grade
// (valores legados são pré-mapeados em startEditFixo, então nunca chegam aqui)
function CategoriaFixoSelect({ value, onChange, style }) {
  return (
    <select className="form-input" style={style} value={value} onChange={onChange}>
      <option value="">— selecione —</option>
      {GRUPOS_FIXOS_PADRAO.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )
}

export default function Custos() {
  const [fixos, setFixos] = useState([])
  const [variaveis, setVariaveis] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Criação (modais)
  const [fixoModalOpen, setFixoModalOpen] = useState(false)
  const [fixoForm, setFixoForm] = useState(FIXO_BLANK)
  const [fixoError, setFixoError] = useState(null)
  const [fixoSaving, setFixoSaving] = useState(false)

  const [varModalOpen, setVarModalOpen] = useState(false)
  const [varForm, setVarForm] = useState(VARIAVEL_BLANK)
  const [varError, setVarError] = useState(null)
  const [varSaving, setVarSaving] = useState(false)

  // Edição inline
  const [editFixoId, setEditFixoId] = useState(null)
  const [editFixoForm, setEditFixoForm] = useState(FIXO_BLANK)
  const [editFixoError, setEditFixoError] = useState(null)
  const [editFixoSaving, setEditFixoSaving] = useState(false)

  const [editVarId, setEditVarId] = useState(null)
  const [editVarForm, setEditVarForm] = useState(VARIAVEL_BLANK)
  const [editVarError, setEditVarError] = useState(null)
  const [editVarSaving, setEditVarSaving] = useState(false)

  // Exclusão (lógica) com ConfirmDialog padrão — sem window.confirm/alert
  const [fixoParaExcluir, setFixoParaExcluir] = useState(null)
  const [excluindoFixo, setExcluindoFixo] = useState(false)
  const [varParaExcluir, setVarParaExcluir] = useState(null)
  const [excluindoVar, setExcluindoVar] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    Promise.all([api.get('/custos-fixos'), api.get('/custos-variaveis')])
      .then(([fixosRes, variaveisRes]) => {
        setFixos(fixosRes.data)
        setVariaveis(variaveisRes.data)
        setLoading(false)
      })
      .catch((err) => {
        setError(
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro inesperado.')
        )
        setLoading(false)
      })
  }

  // Recarrega as listas sem o loading de página inteira
  function refresh() {
    return Promise.all([api.get('/custos-fixos'), api.get('/custos-variaveis')])
      .then(([fixosRes, variaveisRes]) => {
        setFixos(fixosRes.data)
        setVariaveis(variaveisRes.data)
      })
  }

  useEffect(() => { load() }, [])

  // ===== Custos fixos: criar / editar / desativar =====

  // Criação contextual: o "+ Novo custo" de cada bloco abre o modal com a
  // categoria do grupo já pré-selecionada (o botão do topo abre em branco)
  function openFixoModal(categoria = '') {
    setFixoForm({ ...FIXO_BLANK, tipo: categoria })
    setFixoError(null)
    setFeedback(null)
    setFixoModalOpen(true)
  }

  function handleCreateFixo(e) {
    e.preventDefault()
    const err = validateFixo(fixoForm)
    if (err) { setFixoError(err); return }
    setFixoError(null)
    setFixoSaving(true)
    api
      .post('/custos-fixos', payloadFixo(fixoForm))
      .then(() => {
        setFixoModalOpen(false)
        setFeedback('Custo fixo criado com sucesso.')
        return refresh()
      })
      .catch((e) =>
        setFixoError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setFixoSaving(false))
  }

  function startEditFixo(c) {
    setEditFixoId(c.id)
    setEditFixoForm({
      nome: c.nome,
      valorMensal: String(Number(c.valorMensal)),
      // Categoria legada vem pré-mapeada para o grupo padronizado: salvar a
      // edição normaliza o dado sem migration
      tipo: (c.tipo ?? '').trim() === '' ? '' : categoriaCanonicaFixo(c.tipo),
      observacao: c.observacao ?? ''
    })
    setEditFixoError(null)
  }
  function cancelEditFixo() {
    setEditFixoId(null)
    setEditFixoForm(FIXO_BLANK)
    setEditFixoError(null)
  }
  function saveEditFixo() {
    const err = validateFixo(editFixoForm)
    if (err) { setEditFixoError(err); return }
    setEditFixoError(null)
    setEditFixoSaving(true)
    api
      .put(`/custos-fixos/${editFixoId}`, payloadFixo(editFixoForm))
      .then(() => {
        cancelEditFixo()
        return refresh()
      })
      .catch((e) =>
        setEditFixoError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditFixoSaving(false))
  }

  function handleDeleteFixo(c) {
    setDeleteError(null)
    setFixoParaExcluir(c)
  }

  function confirmExcluirFixo() {
    const c = fixoParaExcluir
    if (!c) return
    setFeedback(null)
    setDeleteError(null)
    setExcluindoFixo(true)
    api
      .delete(`/custos-fixos/${c.id}`)
      .then(() => {
        setFeedback('Custo fixo excluído com sucesso.')
        return refresh()
      })
      .catch((e) =>
        setDeleteError(e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir custo fixo.')
      )
      .finally(() => {
        setExcluindoFixo(false)
        setFixoParaExcluir(null)
      })
  }

  // ===== Custos variáveis: criar / editar / desativar =====

  // Idem para variáveis: o bloco pré-preenche o tipo de cálculo do grupo
  function openVarModal(tipoCalculo = '') {
    setVarForm({ ...VARIAVEL_BLANK, tipoCalculo })
    setVarError(null)
    setFeedback(null)
    setVarModalOpen(true)
  }

  function handleCreateVar(e) {
    e.preventDefault()
    const err = validateVariavel(varForm)
    if (err) { setVarError(err); return }
    setVarError(null)
    setVarSaving(true)
    api
      .post('/custos-variaveis', payloadVariavel(varForm))
      .then(() => {
        setVarModalOpen(false)
        setFeedback('Custo variável criado com sucesso.')
        return refresh()
      })
      .catch((e) =>
        setVarError(e?.response?.data?.error ?? e?.message ?? 'Erro ao cadastrar.')
      )
      .finally(() => setVarSaving(false))
  }

  function startEditVar(c) {
    setEditVarId(c.id)
    setEditVarForm({
      nome: c.nome,
      categoria: c.categoria,
      tipoCalculo: c.tipoCalculo,
      valor: String(Number(c.valor))
    })
    setEditVarError(null)
  }
  function cancelEditVar() {
    setEditVarId(null)
    setEditVarForm(VARIAVEL_BLANK)
    setEditVarError(null)
  }
  function saveEditVar() {
    const err = validateVariavel(editVarForm)
    if (err) { setEditVarError(err); return }
    setEditVarError(null)
    setEditVarSaving(true)
    api
      .put(`/custos-variaveis/${editVarId}`, payloadVariavel(editVarForm))
      .then(() => {
        cancelEditVar()
        return refresh()
      })
      .catch((e) =>
        setEditVarError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditVarSaving(false))
  }

  function handleDeleteVar(c) {
    setDeleteError(null)
    setVarParaExcluir(c)
  }

  function confirmExcluirVar() {
    const c = varParaExcluir
    if (!c) return
    setFeedback(null)
    setDeleteError(null)
    setExcluindoVar(true)
    api
      .delete(`/custos-variaveis/${c.id}`)
      .then(() => {
        setFeedback('Custo variável excluído com sucesso.')
        return refresh()
      })
      .catch((e) =>
        setDeleteError(e?.response?.data?.error ?? e?.message ?? 'Erro ao excluir custo variável.')
      )
      .finally(() => {
        setExcluindoVar(false)
        setVarParaExcluir(null)
      })
  }

  if (loading) return <div className="loading-state">Carregando custos…</div>

  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os custos</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={load}>
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Resumo (somas simples das listas já carregadas)
  const totalCustosFixos = fixos.reduce((s, c) => s + Number(c.valorMensal), 0)
  const totalVariaveisPercentuais = variaveis
    .filter((c) => c.tipoCalculo === 'PERCENTUAL_FATURAMENTO')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalVariaveisPorPedido = variaveis
    .filter((c) => c.tipoCalculo === 'VALOR_POR_PEDIDO')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalVariaveisFixoMensal = variaveis
    .filter((c) => c.tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL')
    .reduce((s, c) => s + Number(c.valor), 0)
  const totalGeralEstimado = totalCustosFixos + totalVariaveisFixoMensal

  // ===== Custos fixos agrupados pelos grupos padronizados (ordem fixa) =====
  // Sem regra nova no backend: categorias legadas e itens sem categoria são
  // mapeados via categoriaCanonicaFixo; todos os 8 grupos aparecem na grade,
  // mesmo vazios
  const gruposFixos = GRUPOS_FIXOS_PADRAO.map((categoria) => {
    const itens = fixos.filter((c) => categoriaCanonicaFixo(c.tipo) === categoria)
    return {
      categoria,
      itens,
      subtotal: itens.reduce((s, c) => s + Number(c.valorMensal), 0)
    }
  })
  const gruposComItens = gruposFixos.filter((g) => g.itens.length > 0)
  const maiorGrupoFixo = gruposComItens.reduce(
    (m, g) => (m === null || g.subtotal > m.subtotal ? g : m),
    null
  )

  // Subtotal de um grupo de custos variáveis, na unidade do grupo
  function subtotalGrupoVariavel(tipo, itens) {
    const s = itens.reduce((x, c) => x + Number(c.valor), 0)
    if (tipo === 'PERCENTUAL_FATURAMENTO') return pct(s)
    if (tipo === 'VALOR_POR_PEDIDO') return `${brl(s)} / pedido`
    return `${brl(s)} / mês`
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Custos</h1>
          <div className="page-header-sub">
            Organize os custos fixos por categoria e os variáveis por tipo de cálculo.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => openVarModal()}>
            + Novo custo variável
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openFixoModal()}>
            + Novo custo fixo
          </button>
        </div>
      </div>

      {feedback && (
        <div className="alert alert-green" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-green">{feedback}</div>
        </div>
      )}
      {deleteError && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-red">{deleteError}</div>
        </div>
      )}

      {/* Confirmação de exclusão (lógica): mesmo endpoint, histórico preservado */}
      <ConfirmDialog
        open={fixoParaExcluir !== null}
        title="Excluir custo fixo?"
        message={fixoParaExcluir ? `Você está prestes a excluir “${fixoParaExcluir.nome}”.` : ''}
        description="Este custo não entrará mais nos cálculos mensais, mas o histórico será preservado."
        confirmLabel="Excluir custo fixo"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindoFixo}
        onConfirm={confirmExcluirFixo}
        onCancel={() => setFixoParaExcluir(null)}
      />
      <ConfirmDialog
        open={varParaExcluir !== null}
        title="Excluir custo variável?"
        message={varParaExcluir ? `Você está prestes a excluir “${varParaExcluir.nome}”.` : ''}
        description="Este custo não entrará mais nos cálculos ativos, mas o histórico será preservado."
        confirmLabel="Excluir custo variável"
        cancelLabel="Cancelar"
        variant="danger"
        loading={excluindoVar}
        onConfirm={confirmExcluirVar}
        onCancel={() => setVarParaExcluir(null)}
      />

      {/* Modal: novo custo fixo */}
      {fixoModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Novo custo fixo</div>
            <form onSubmit={handleCreateFixo}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={fixoForm.nome}
                  onChange={(e) => setFixoForm({ ...fixoForm, nome: e.target.value })}
                  placeholder="Ex.: Aluguel da loja"
                  autoFocus
                />
              </div>
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valor mensal (R$)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={fixoForm.valorMensal}
                    onChange={(e) => setFixoForm({ ...fixoForm, valorMensal: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoria (opcional)</label>
                  <CategoriaFixoSelect
                    value={fixoForm.tipo}
                    onChange={(e) => setFixoForm({ ...fixoForm, tipo: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Observação (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={fixoForm.observacao}
                  onChange={(e) => setFixoForm({ ...fixoForm, observacao: e.target.value })}
                  placeholder="Loja matriz, contrato 12 meses..."
                />
              </div>
              {fixoError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{fixoError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setFixoModalOpen(false)}
                  disabled={fixoSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={fixoSaving}>
                  {fixoSaving ? 'Salvando…' : 'Salvar custo fixo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: novo custo variável */}
      {varModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Novo custo variável</div>
            <form onSubmit={handleCreateVar}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={varForm.nome}
                  onChange={(e) => setVarForm({ ...varForm, nome: e.target.value })}
                  placeholder="Ex.: Taxa de cartão crédito"
                  autoFocus
                />
              </div>
              <div className="form-grid-2" style={{ marginBottom: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoria</label>
                  <select
                    className="form-input"
                    value={varForm.categoria}
                    onChange={(e) => setVarForm({ ...varForm, categoria: e.target.value })}
                  >
                    <option value="">— selecione —</option>
                    {CATEGORIAS_VARIAVEL.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo de cálculo</label>
                  <select
                    className="form-input"
                    value={varForm.tipoCalculo}
                    onChange={(e) => setVarForm({ ...varForm, tipoCalculo: e.target.value })}
                  >
                    <option value="">— selecione —</option>
                    {TIPOS_CALCULO.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Valor {varForm.tipoCalculo === 'PERCENTUAL_FATURAMENTO' ? '(%)' : '(R$)'}
                </label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={varForm.valor}
                  onChange={(e) => setVarForm({ ...varForm, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              {varError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{varError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVarModalOpen(false)}
                  disabled={varSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={varSaving}>
                  {varSaving ? 'Salvando…' : 'Salvar custo variável'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resumo */}
      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card
          title="Custos Fixos Totais"
          value={brl(totalCustosFixos)}
          hint={`${fixos.length} custo${fixos.length === 1 ? '' : 's'} em ${gruposComItens.length} grupo${gruposComItens.length === 1 ? '' : 's'}`}
          variant="brand"
        />
        <Card
          title="Custos Variáveis Totais"
          value={brl(totalVariaveisFixoMensal)}
          hint={`Fixo mensal variável · + ${pct(totalVariaveisPercentuais)} do faturamento e ${brl(totalVariaveisPorPedido)} por pedido`}
          variant="info"
        />
        <Card
          title="Total Geral Mensal Estimado"
          value={brl(totalGeralEstimado)}
          hint="Fixos + variáveis de valor fixo mensal (não inclui % do faturamento nem por pedido)"
        />
        <Card
          title="Maior Grupo de Custo Fixo"
          value={maiorGrupoFixo ? maiorGrupoFixo.categoria : '—'}
          hint={
            maiorGrupoFixo
              ? `${brl(maiorGrupoFixo.subtotal)} · ${maiorGrupoFixo.itens.length} ${maiorGrupoFixo.itens.length === 1 ? 'item' : 'itens'}`
              : 'Nenhum custo fixo cadastrado'
          }
          variant="info"
        />
      </div>

      {/* Seção 1 — Custos fixos */}
      <div className="section-title">Custos Fixos</div>
      <div style={sectionHintStyle}>
        Custos que acontecem todos os meses, mesmo que o volume de vendas mude.
      </div>

      {/* Grade de grupos: 2 blocos por linha no desktop, 1 no mobile (grid-2).
          Todos os grupos padronizados aparecem, mesmo vazios. */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {gruposFixos.map((grupo) => (
          <div key={grupo.categoria} className="card" style={{ padding: '14px 16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 6
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>
                  {grupo.categoria}
                </span>
                <span style={{ fontSize: 11, color: '#aaa' }}>
                  {grupo.itens.length} {grupo.itens.length === 1 ? 'item' : 'itens'}
                </span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }} className="clr-orange">
                {brl(grupo.subtotal)}
              </span>
            </div>

            {grupo.itens.length === 0 ? (
              <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0 4px' }}>
                Nenhum custo neste grupo ainda.
              </div>
            ) : (
              grupo.itens.map((c) => {
                const isEditing = editFixoId === c.id
                if (isEditing) {
                  return (
                    <div
                      key={c.id}
                      style={{ background: '#fff7ed', borderRadius: 8, padding: 10, margin: '6px 0' }}
                    >
                      <div className="form-grid-2" style={{ marginBottom: 8 }}>
                        <input className="form-input" style={cellInputStyle}
                          value={editFixoForm.nome}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, nome: e.target.value })}
                          placeholder="Nome"
                          autoFocus />
                        <input className="form-input" style={cellInputStyle}
                          type="number" min="0" step="0.01"
                          value={editFixoForm.valorMensal}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, valorMensal: e.target.value })}
                          placeholder="Valor mensal" />
                      </div>
                      <div className="form-grid-2" style={{ marginBottom: 8 }}>
                        <CategoriaFixoSelect
                          style={cellInputStyle}
                          value={editFixoForm.tipo}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, tipo: e.target.value })}
                        />
                        <input className="form-input" style={cellInputStyle}
                          value={editFixoForm.observacao}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, observacao: e.target.value })}
                          placeholder="Observação (opcional)" />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                          onClick={cancelEditFixo} disabled={editFixoSaving}>
                          Cancelar
                        </button>
                        <button type="button" className="btn btn-primary" style={btnCompactStyle}
                          onClick={saveEditFixo} disabled={editFixoSaving}>
                          {editFixoSaving ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 0',
                      borderBottom: '1px solid #f5f5f5'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                      {c.observacao && (
                        <div style={{ fontSize: 11, color: '#aaa' }}>{c.observacao}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{brl(c.valorMensal)}</span>
                      <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                        onClick={() => startEditFixo(c)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-danger" style={btnCompactStyle}
                        onClick={() => handleDeleteFixo(c)}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            {/* Ação contextual: cria já com a categoria do grupo selecionada */}
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={btnCompactStyle}
                onClick={() => openFixoModal(grupo.categoria)}
              >
                + Novo custo
              </button>
            </div>
          </div>
        ))}
      </div>

      {editFixoError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editFixoError}</div>
        </div>
      )}

      {/* Seção 2 — Custos variáveis */}
      <div className="section-title">Custos Variáveis</div>
      <div style={sectionHintStyle}>
        Custos que variam conforme vendas, pedidos ou faturamento.
      </div>

      {/* Grade de grupos de variáveis: mesmo padrão visual dos custos fixos,
          agrupados por tipo de cálculo; todos os blocos aparecem, mesmo vazios */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {GRUPOS_VARIAVEL.map((grupo) => {
          const itens = variaveis.filter((c) => c.tipoCalculo === grupo.tipo)
          return (
            <div key={grupo.tipo} className="card" style={{ padding: '14px 16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 2
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>
                    {grupo.titulo}
                  </span>
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700 }} className="clr-orange">
                  {subtotalGrupoVariavel(grupo.tipo, itens)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#bbb', marginBottom: 6 }}>{grupo.hint}</div>

              {itens.length === 0 ? (
                <div style={{ fontSize: 12, color: '#bbb', padding: '10px 0 4px' }}>
                  Nenhum custo neste grupo ainda.
                </div>
              ) : (
                itens.map((c) => {
                  const isEditing = editVarId === c.id
                  if (isEditing) {
                    return (
                      <div
                        key={c.id}
                        style={{ background: '#fff7ed', borderRadius: 8, padding: 10, margin: '6px 0' }}
                      >
                        <div className="form-grid-2" style={{ marginBottom: 8 }}>
                          <input className="form-input" style={cellInputStyle}
                            value={editVarForm.nome}
                            onChange={(e) => setEditVarForm({ ...editVarForm, nome: e.target.value })}
                            placeholder="Nome"
                            autoFocus />
                          <input className="form-input" style={cellInputStyle}
                            type="number" min="0" step="0.0001"
                            value={editVarForm.valor}
                            onChange={(e) => setEditVarForm({ ...editVarForm, valor: e.target.value })}
                            placeholder="Valor" />
                        </div>
                        <div className="form-grid-2" style={{ marginBottom: 8 }}>
                          <select className="form-input" style={cellInputStyle}
                            value={editVarForm.categoria}
                            onChange={(e) => setEditVarForm({ ...editVarForm, categoria: e.target.value })}>
                            <option value="">— categoria —</option>
                            {CATEGORIAS_VARIAVEL.map((cat) => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                          <select className="form-input" style={cellInputStyle}
                            value={editVarForm.tipoCalculo}
                            onChange={(e) => setEditVarForm({ ...editVarForm, tipoCalculo: e.target.value })}>
                            <option value="">— tipo de cálculo —</option>
                            {TIPOS_CALCULO.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                            onClick={cancelEditVar} disabled={editVarSaving}>
                            Cancelar
                          </button>
                          <button type="button" className="btn btn-primary" style={btnCompactStyle}
                            onClick={saveEditVar} disabled={editVarSaving}>
                            {editVarSaving ? 'Salvando…' : 'Salvar'}
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 0',
                        borderBottom: '1px solid #f5f5f5'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{c.nome}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {CATEGORIA_VARIAVEL_LABEL[c.categoria] ?? c.categoria}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {formatValorVariavel(c.valor, c.tipoCalculo)}
                        </span>
                        <button type="button" className="btn btn-secondary" style={btnCompactStyle}
                          onClick={() => startEditVar(c)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-danger" style={btnCompactStyle}
                          onClick={() => handleDeleteVar(c)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  )
                })
              )}

              {/* Ação contextual: cria já com o tipo de cálculo do grupo */}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={btnCompactStyle}
                  onClick={() => openVarModal(grupo.tipo)}
                >
                  + Novo custo
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editVarError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editVarError}</div>
        </div>
      )}
    </div>
  )
}
