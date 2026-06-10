import { useEffect, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'

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

const CATEGORIAS_FIXO = [
  'Salários',
  'Funcionamento',
  'Marketing',
  'Freelancers',
  'Pró-labore',
  'Aluguel',
  'Contas',
  'Sistemas',
  'Manutenção',
  'Outros'
]

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
const sectionHintStyle = { fontSize: 12.5, color: '#999', margin: '-4px 0 12px' }

// Select de categoria do custo fixo: sugestões + valor atual fora da lista, se houver
function CategoriaFixoSelect({ value, onChange, style }) {
  const options = CATEGORIAS_FIXO.includes(value) || value === ''
    ? CATEGORIAS_FIXO
    : [value, ...CATEGORIAS_FIXO]
  return (
    <select className="form-input" style={style} value={value} onChange={onChange}>
      <option value="">— sem categoria —</option>
      {options.map((c) => (
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

  function openFixoModal() {
    setFixoForm(FIXO_BLANK)
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
      tipo: c.tipo ?? '',
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
    const ok = window.confirm(
      `Desativar o custo fixo "${c.nome}"? Ele não entrará mais nos cálculos mensais, mas o histórico será preservado.`
    )
    if (!ok) return
    setFeedback(null)
    api
      .delete(`/custos-fixos/${c.id}`)
      .then(() => {
        setFeedback(`Custo fixo "${c.nome}" desativado.`)
        return refresh()
      })
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao desativar.')
      )
  }

  // ===== Custos variáveis: criar / editar / desativar =====

  function openVarModal() {
    setVarForm(VARIAVEL_BLANK)
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
    const ok = window.confirm(
      `Desativar o custo variável "${c.nome}"? Ele não entrará mais nos cálculos do dashboard, mas o histórico será preservado.`
    )
    if (!ok) return
    setFeedback(null)
    api
      .delete(`/custos-variaveis/${c.id}`)
      .then(() => {
        setFeedback(`Custo variável "${c.nome}" desativado.`)
        return refresh()
      })
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao desativar.')
      )
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Custos</h1>
          <div className="page-header-sub">
            Gerencie os custos fixos e variáveis usados no cálculo da operação.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={openVarModal}>
            + Novo custo variável
          </button>
          <button type="button" className="btn btn-primary" onClick={openFixoModal}>
            + Novo custo fixo
          </button>
        </div>
      </div>

      {feedback && (
        <div className="alert alert-green" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-green">{feedback}</div>
        </div>
      )}

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
          title="Custos Fixos Mensais"
          value={brl(totalCustosFixos)}
          hint={`${fixos.length} custo${fixos.length === 1 ? '' : 's'} ativo${fixos.length === 1 ? '' : 's'}`}
          variant="brand"
        />
        <Card
          title="Variáveis (% Faturamento)"
          value={pct(totalVariaveisPercentuais)}
          hint="Soma dos percentuais"
          variant="info"
        />
        <Card
          title="Variáveis por Pedido"
          value={brl(totalVariaveisPorPedido)}
          hint="Soma por pedido"
          variant="info"
        />
        <Card
          title="Total Mensal Estimado"
          value={brl(totalGeralEstimado)}
          hint="Fixos + variáveis de valor fixo mensal"
        />
      </div>

      {/* Seção 1 — Custos fixos */}
      <div className="section-title">Custos Fixos</div>
      <div style={sectionHintStyle}>
        Custos que acontecem todos os meses, mesmo que o volume de vendas mude.
      </div>

      {fixos.length === 0 ? (
        <div className="empty-state">
          Nenhum custo fixo cadastrado. Use o botão “+ Novo custo fixo” para cadastrar o primeiro.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Valor mensal</th>
                <th>Observação</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {fixos.map((c) => {
                const isEditing = editFixoId === c.id
                if (isEditing) {
                  return (
                    <tr key={c.id} style={{ background: '#fff7ed' }}>
                      <td>
                        <input className="form-input" style={cellInputStyle}
                          value={editFixoForm.nome}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, nome: e.target.value })}
                          autoFocus />
                      </td>
                      <td>
                        <CategoriaFixoSelect
                          style={{ ...cellInputStyle, width: 150 }}
                          value={editFixoForm.tipo}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, tipo: e.target.value })}
                        />
                      </td>
                      <td>
                        <input className="form-input" style={{ ...cellInputStyle, width: 110 }}
                          type="number" min="0" step="0.01"
                          value={editFixoForm.valorMensal}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, valorMensal: e.target.value })} />
                      </td>
                      <td>
                        <input className="form-input" style={cellInputStyle}
                          value={editFixoForm.observacao}
                          onChange={(e) => setEditFixoForm({ ...editFixoForm, observacao: e.target.value })}
                          placeholder="(opcional)" />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="btn btn-primary" onClick={saveEditFixo} disabled={editFixoSaving}>
                            {editFixoSaving ? 'Salvando…' : 'Salvar'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={cancelEditFixo} disabled={editFixoSaving}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500, color: '#111' }}>{c.nome}</td>
                    <td>
                      {c.tipo ? (
                        <span className="badge badge-blue">{c.tipo}</span>
                      ) : (
                        <span className="clr-muted">—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 500 }}>{brl(c.valorMensal)}</td>
                    <td className={c.observacao ? '' : 'clr-muted'}>
                      {c.observacao || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" className="btn btn-secondary" onClick={() => startEditFixo(c)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-danger" onClick={() => handleDeleteFixo(c)}>
                          Desativar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

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

      {variaveis.length === 0 ? (
        <div className="empty-state">
          Nenhum custo variável cadastrado. Use o botão “+ Novo custo variável” para cadastrar o primeiro.
        </div>
      ) : (
        GRUPOS_VARIAVEL.map((grupo) => {
          const itens = variaveis.filter((c) => c.tipoCalculo === grupo.tipo)
          if (itens.length === 0) return null
          return (
            <div key={grupo.tipo} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  margin: '0 2px 6px'
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#555' }}>
                  {grupo.titulo}
                </span>
                <span style={{ fontSize: 11.5, color: '#aaa' }}>{grupo.hint}</span>
              </div>
              <div className="table-card">
                <table className="hb-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Categoria</th>
                      <th>Tipo de cálculo</th>
                      <th>Valor</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((c) => {
                      const isEditing = editVarId === c.id
                      if (isEditing) {
                        return (
                          <tr key={c.id} style={{ background: '#fff7ed' }}>
                            <td>
                              <input className="form-input" style={cellInputStyle}
                                value={editVarForm.nome}
                                onChange={(e) => setEditVarForm({ ...editVarForm, nome: e.target.value })}
                                autoFocus />
                            </td>
                            <td>
                              <select className="form-input" style={{ ...cellInputStyle, width: 140 }}
                                value={editVarForm.categoria}
                                onChange={(e) => setEditVarForm({ ...editVarForm, categoria: e.target.value })}>
                                <option value="">—</option>
                                {CATEGORIAS_VARIAVEL.map((cat) => (
                                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select className="form-input" style={{ ...cellInputStyle, width: 150 }}
                                value={editVarForm.tipoCalculo}
                                onChange={(e) => setEditVarForm({ ...editVarForm, tipoCalculo: e.target.value })}>
                                <option value="">—</option>
                                {TIPOS_CALCULO.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input className="form-input" style={{ ...cellInputStyle, width: 100 }}
                                type="number" min="0" step="0.0001"
                                value={editVarForm.valor}
                                onChange={(e) => setEditVarForm({ ...editVarForm, valor: e.target.value })} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <button type="button" className="btn btn-primary" onClick={saveEditVar} disabled={editVarSaving}>
                                  {editVarSaving ? 'Salvando…' : 'Salvar'}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={cancelEditVar} disabled={editVarSaving}>
                                  Cancelar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500, color: '#111' }}>{c.nome}</td>
                          <td>
                            <span className="badge badge-blue">
                              {CATEGORIA_VARIAVEL_LABEL[c.categoria] ?? c.categoria}
                            </span>
                          </td>
                          <td>{TIPO_CALCULO_LABEL[c.tipoCalculo] ?? c.tipoCalculo}</td>
                          <td style={{ fontWeight: 500 }}>{formatValorVariavel(c.valor, c.tipoCalculo)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button type="button" className="btn btn-secondary" onClick={() => startEditVar(c)}>
                                Editar
                              </button>
                              <button type="button" className="btn btn-danger" onClick={() => handleDeleteVar(c)}>
                                Desativar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {editVarError && (
        <div className="alert alert-red" style={{ marginTop: 10 }}>
          <div className="alert-msg clr-red">{editVarError}</div>
        </div>
      )}
    </div>
  )
}
