import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const qtyFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function num(value) {
  if (value === null || value === undefined) return '—'
  return qtyFormatter.format(Number(value))
}

// Unidades padronizadas: Kg (custo por kg, quantidades em gramas),
// L (custo por litro, quantidades em ml) e Und (custo por unidade)
function unidadeNormalizada(u) {
  const v = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg'
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L'
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und'
  return null
}
// Sufixo da quantidade em fichas/receitas conforme a unidade do insumo
function sufixoQuantidade(unidadeInsumo) {
  const u = unidadeNormalizada(unidadeInsumo)
  if (u === 'Kg') return 'g'
  if (u === 'L') return 'ml'
  return 'und'
}

const TIPOS = [
  { value: 'INGREDIENTE',      label: 'Ingrediente',      filtro: 'Ingredientes',     badge: 'badge-orange' },
  { value: 'PRODUCAO_PROPRIA', label: 'Produção própria', filtro: 'Produção própria', badge: 'badge-blue' },
  { value: 'BEBIDA',           label: 'Bebida',           filtro: 'Bebidas',          badge: 'badge-yellow' },
  { value: 'HORTIFRUTI',       label: 'Hortifruti',       filtro: 'Hortifruti',       badge: 'badge-green' },
  { value: 'EMBALAGEM',        label: 'Embalagem',        filtro: 'Embalagens',       badge: 'badge-gray' },
  { value: 'ACOMPANHAMENTO',   label: 'Acompanhamento',   filtro: 'Acompanhamentos',  badge: 'badge-red' },
  { value: 'OPERACIONAL',      label: 'Operacional',      filtro: 'Operacional',      badge: 'badge-gray' }
]
const TIPO_BY_VALUE = Object.fromEntries(TIPOS.map((t) => [t.value, t]))

function tipoLabel(value) {
  return TIPO_BY_VALUE[value]?.label ?? value ?? '—'
}
function tipoBadge(value) {
  return TIPO_BY_VALUE[value]?.badge ?? 'badge-gray'
}

const FORM_BLANK = {
  nome: '',
  tipo: 'INGREDIENTE',
  unidade: 'Kg',
  custoUnitario: '',
  fornecedor: '',
  // Modo de custo (apenas para Und): DIRETO informa o custo por unidade;
  // CAIXA calcula custoUnitario = valorCaixa / quantidadeCaixa (não persistidos).
  modoCusto: 'DIRETO',
  valorCaixa: '',
  quantidadeCaixa: ''
}

// Custo por unidade calculado a partir da caixa/pacote (null se inválido)
function custoCaixaCalculado({ valorCaixa, quantidadeCaixa }) {
  const v = Number(valorCaixa)
  const q = Number(quantidadeCaixa)
  if (valorCaixa === '' || quantidadeCaixa === '') return null
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(q) || q <= 0) return null
  return v / q
}

function validateForm(form) {
  const { nome, unidade, custoUnitario, tipo, modoCusto, valorCaixa, quantidadeCaixa } = form
  if (!nome || !nome.trim()) return 'nome é obrigatório'
  if (!tipo) return 'tipo é obrigatório'
  if (unidade !== 'Kg' && unidade !== 'L' && unidade !== 'Und') {
    return 'unidade é obrigatória (Kg, L ou Und)'
  }

  if (unidade === 'Und' && modoCusto === 'CAIXA') {
    const v = Number(valorCaixa)
    if (valorCaixa === '' || !Number.isFinite(v) || v <= 0) {
      return 'valor da caixa/pacote deve ser maior que zero'
    }
    const q = Number(quantidadeCaixa)
    if (quantidadeCaixa === '' || !Number.isFinite(q) || q <= 0) {
      return 'quantidade na caixa/pacote deve ser maior que zero'
    }
    if (!(custoCaixaCalculado(form) > 0)) {
      return 'custo calculado por unidade deve ser maior que zero'
    }
    return null
  }

  const c = Number(custoUnitario)
  if (custoUnitario === '' || !Number.isFinite(c)) {
    return 'custo é obrigatório e deve ser numérico'
  }
  if (c <= 0) {
    return unidade === 'Kg'
      ? 'custo por kg deve ser maior que zero'
      : 'custo por unidade deve ser maior que zero'
  }
  return null
}

function payloadFromForm(form) {
  const custoUnitario =
    form.unidade === 'Und' && form.modoCusto === 'CAIXA'
      ? custoCaixaCalculado(form)
      : Number(form.custoUnitario)
  return {
    nome: form.nome.trim(),
    tipo: form.tipo,
    unidade: form.unidade,
    custoUnitario,
    fornecedor: form.fornecedor.trim() === '' ? null : form.fornecedor.trim()
  }
}

export default function Insumos() {
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('TODOS')
  const [toast, setToast] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(FORM_BLANK)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [deletingId, setDeletingId] = useState(null)
  const [receitaInsumoId, setReceitaInsumoId] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/insumos')
      .then((r) => { setInsumos(r.data); setLoading(false) })
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

  // Recarrega a lista sem o loading de página inteira
  // (usado pelo modal de receita para atualizar a tabela atrás dele)
  function refresh() {
    return api
      .get('/insumos')
      .then((r) => setInsumos(r.data))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(insumo) {
    setEditingId(insumo.id)
    setForm({
      nome: insumo.nome ?? '',
      tipo: insumo.tipo ?? 'INGREDIENTE',
      unidade: unidadeNormalizada(insumo.unidade) ?? '',
      custoUnitario:
        insumo.custoUnitario === null || insumo.custoUnitario === undefined
          ? ''
          : String(Number(insumo.custoUnitario)),
      fornecedor: insumo.fornecedor ?? '',
      // V1 não persiste valorCaixa/quantidadeCaixa: edição abre sempre em custo direto
      modoCusto: 'DIRETO',
      valorCaixa: '',
      quantidadeCaixa: ''
    })
    setFormError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const err = validateForm(form)
    if (err) { setFormError(err); return }
    setFormError(null)
    setSubmitting(true)

    const request = editingId === null
      ? api.post('/insumos', payloadFromForm(form))
      : api.put(`/insumos/${editingId}`, payloadFromForm(form))

    request
      .then(() => {
        setToast({
          message: editingId === null
            ? 'Insumo criado com sucesso.'
            : 'Insumo atualizado com sucesso.',
          type: 'success'
        })
        closeModal()
        load()
      })
      .catch((e) =>
        setFormError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar insumo.')
      )
      .finally(() => setSubmitting(false))
  }

  function handleDelete(insumo) {
    const ok = window.confirm(
      `Inativar o insumo "${insumo.nome}"? Ele não aparecerá mais nas fichas técnicas, mas o histórico será preservado.`
    )
    if (!ok) return
    setDeletingId(insumo.id)
    api
      .delete(`/insumos/${insumo.id}`)
      .then(() => {
        setToast({ message: `Insumo "${insumo.nome}" inativado.`, type: 'success' })
        load()
      })
      .catch((e) =>
        setToast({
          message: e?.response?.data?.error ?? e?.message ?? 'Erro ao inativar insumo.',
          type: 'error'
        })
      )
      .finally(() => setDeletingId(null))
  }

  const filtered = useMemo(() => {
    let rows = insumos
    if (filtroTipo !== 'TODOS') {
      rows = rows.filter((i) => i.tipo === filtroTipo)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (i) =>
          i.nome.toLowerCase().includes(q) ||
          (i.fornecedor && i.fornecedor.toLowerCase().includes(q))
      )
    }
    return rows
  }, [insumos, search, filtroTipo])

  const total = insumos.length
  const countTipo = (t) => insumos.filter((i) => i.tipo === t).length
  const totalIngredientes = countTipo('INGREDIENTE')
  const totalProducaoPropria = countTipo('PRODUCAO_PROPRIA')
  const totalEmbAcomp = countTipo('EMBALAGEM') + countTipo('ACOMPANHAMENTO')

  if (loading) return <div className="loading-state">Carregando insumos…</div>
  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os insumos</div>
          <div className="alert-msg">{error}</div>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={load}>Tentar novamente</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Insumos</h1>
          <div className="page-header-sub">
            Cadastre ingredientes, embalagens, acompanhamentos, bebidas, hortifruti e produções próprias.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Novo insumo
        </button>
      </div>

      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {editingId === null ? 'Novo insumo' : 'Editar insumo'}
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex.: Pão Brioche"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Tipo</label>
                <select
                  className="form-input"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                  <label className="form-label">Unidade</label>
                  <select
                    className="form-input"
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                  >
                    {form.unidade !== 'Kg' && form.unidade !== 'L' && form.unidade !== 'Und' && (
                      <option value="">— selecione —</option>
                    )}
                    <option value="Kg">Kg</option>
                    <option value="L">L</option>
                    <option value="Und">Und</option>
                  </select>
                </div>
                {form.unidade !== 'Und' && (
                  <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                    <label className="form-label">
                      {form.unidade === 'Kg'
                        ? 'Custo por kg (R$)'
                        : form.unidade === 'L'
                        ? 'Custo por litro (R$)'
                        : 'Custo unitário (R$)'}
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.custoUnitario}
                      onChange={(e) => setForm({ ...form, custoUnitario: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>
              {form.unidade === 'Kg' && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                  Informe o custo de 1 kg. Na ficha técnica e nas receitas, as quantidades serão
                  lançadas em gramas.
                </div>
              )}
              {form.unidade === 'L' && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                  Informe o custo de 1 litro. Na ficha técnica e nas receitas, as quantidades serão
                  lançadas em ml.
                </div>
              )}

              {form.unidade === 'Und' && (
                <>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label">Como deseja informar o custo?</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className={'btn btn-sm ' + (form.modoCusto === 'DIRETO' ? 'btn-primary' : 'btn-secondary')}
                        onClick={() => setForm({ ...form, modoCusto: 'DIRETO' })}
                      >
                        Custo por unidade
                      </button>
                      <button
                        type="button"
                        className={'btn btn-sm ' + (form.modoCusto === 'CAIXA' ? 'btn-primary' : 'btn-secondary')}
                        onClick={() => setForm({ ...form, modoCusto: 'CAIXA' })}
                      >
                        Caixa / pacote
                      </button>
                    </div>
                  </div>

                  {form.modoCusto === 'DIRETO' ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 12 }}>
                        <label className="form-label">Custo por unidade (R$)</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={form.custoUnitario}
                          onChange={(e) => setForm({ ...form, custoUnitario: e.target.value })}
                          placeholder="0,00"
                        />
                      </div>
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                        Informe o custo de 1 unidade. Na ficha técnica e nas receitas, as quantidades
                        serão lançadas em unidades.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                          <label className="form-label">Valor da caixa/pacote (R$)</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.valorCaixa}
                            onChange={(e) => setForm({ ...form, valorCaixa: e.target.value })}
                            placeholder="Ex.: 31,90"
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                          <label className="form-label">Quantidade na caixa/pacote</label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="1"
                            value={form.quantidadeCaixa}
                            onChange={(e) => setForm({ ...form, quantidadeCaixa: e.target.value })}
                            placeholder="Ex.: 168"
                          />
                        </div>
                      </div>
                      <div
                        className="alert alert-gray"
                        style={{ marginTop: -2, marginBottom: 12, padding: '8px 12px' }}
                      >
                        <div className="alert-msg">
                          Custo calculado por unidade:{' '}
                          <strong className="clr-orange">
                            {custoCaixaCalculado(form) === null ? '—' : brl(custoCaixaCalculado(form))}
                          </strong>
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: -6, marginBottom: 12 }}>
                        Use para sachês, embalagens, guardanapos, potes ou itens comprados em pacote
                        e usados por unidade.
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Fornecedor (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                  placeholder="Padaria Central"
                />
              </div>
              {formError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{formError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando…' : 'Salvar insumo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receitaInsumoId !== null && (
        <ReceitaModal
          insumoId={receitaInsumoId}
          insumosLista={insumos}
          onClose={() => setReceitaInsumoId(null)}
          onChanged={refresh}
        />
      )}

      <div className="section-title">Resumo</div>
      <div className="grid-4">
        <Card title="Total de Insumos" value={total} hint="Ativos na base" variant="info" />
        <Card title="Ingredientes" value={totalIngredientes} hint="Base das fichas técnicas" variant="brand" />
        <Card title="Produção Própria" value={totalProducaoPropria} hint="Receita completa em breve" variant="info" />
        <Card
          title="Embalagens / Acompanhamentos"
          value={totalEmbAcomp}
          hint="Custos por pedido"
        />
      </div>

      <div className="section-title">Insumos Cadastrados</div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          type="button"
          className={'btn ' + (filtroTipo === 'TODOS' ? 'btn-primary' : 'btn-secondary')}
          onClick={() => setFiltroTipo('TODOS')}
        >
          Todos
        </button>
        {TIPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={'btn ' + (filtroTipo === t.value ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setFiltroTipo(t.value)}
          >
            {t.filtro}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          className="form-input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo... (nome ou fornecedor)"
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
          {filtered.length === total
            ? `${total} insumo${total === 1 ? '' : 's'}`
            : `${filtered.length} de ${total}`}
        </span>
      </div>

      {total === 0 ? (
        <div className="empty-state">
          Nenhum insumo cadastrado. Use o botão “+ Novo insumo” para cadastrar o primeiro.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          Nenhum insumo encontrado
          {filtroTipo !== 'TODOS' ? ` no tipo "${TIPO_BY_VALUE[filtroTipo]?.filtro ?? filtroTipo}"` : ''}
          {search.trim() !== '' ? ` para "${search}"` : ''}.
          Ajuste os filtros ou a busca.
        </div>
      ) : (
        <div className="table-card">
          <table className="hb-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Unidade</th>
                <th>Custo unitário</th>
                <th>Fornecedor</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500, color: '#111' }}>{i.nome}</td>
                  <td>
                    <span className={'badge ' + tipoBadge(i.tipo)}>{tipoLabel(i.tipo)}</span>
                  </td>
                  <td>{i.unidade}</td>
                  <td>{brl(i.custoUnitario)}</td>
                  <td className={i.fornecedor ? '' : 'clr-muted'}>
                    {i.fornecedor || 'Sem fornecedor'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      {i.tipo === 'PRODUCAO_PROPRIA' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setReceitaInsumoId(i.id)}
                        >
                          Abrir receita
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary" onClick={() => openEdit(i)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(i)}
                        disabled={deletingId === i.id}
                      >
                        {deletingId === i.id ? 'Inativando…' : 'Inativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============ Modal grande: receita de produção própria ============

const RECEITA_FORM_BLANK = {
  rendimento: '',
  unidadeRendimento: '',
  pesoPorcao: '',
  unidadePorcao: '',
  observacoes: ''
}

function ReceitaModal({ insumoId, insumosLista, onClose, onChanged }) {
  const [insumo, setInsumo] = useState(null)
  const [receita, setReceita] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const [dadosForm, setDadosForm] = useState(RECEITA_FORM_BLANK)
  const [dadosError, setDadosError] = useState(null)
  const [dadosSaving, setDadosSaving] = useState(false)

  const [showAddIngForm, setShowAddIngForm] = useState(false)
  const [ingId, setIngId] = useState('')
  const [ingQty, setIngQty] = useState('')
  const [ingError, setIngError] = useState(null)
  const [ingSubmitting, setIngSubmitting] = useState(false)

  const [ingParaRemover, setIngParaRemover] = useState(null)
  const [removendoIng, setRemovendoIng] = useState(false)

  const [editingItemId, setEditingItemId] = useState(null)
  const [editingQty, setEditingQty] = useState('')
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [custoSaving, setCustoSaving] = useState(false)

  function applyResponse(data) {
    setInsumo(data.insumo)
    setReceita(data.receita)
    if (data.receita) {
      setDadosForm({
        rendimento: String(Number(data.receita.rendimento)),
        unidadeRendimento: data.receita.unidadeRendimento ?? '',
        pesoPorcao:
          data.receita.pesoPorcao === null || data.receita.pesoPorcao === undefined
            ? ''
            : String(Number(data.receita.pesoPorcao)),
        unidadePorcao: data.receita.unidadePorcao ?? '',
        observacoes: data.receita.observacoes ?? ''
      })
    }
  }

  function loadAll() {
    setLoading(true)
    setError(null)
    api
      .get(`/insumos/${insumoId}/receita`)
      .then((r) => {
        applyResponse(r.data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err?.response?.data?.error ?? err?.message ?? 'Erro inesperado.')
        setLoading(false)
      })
  }

  useEffect(() => { loadAll() }, [insumoId])

  function handleSaveDados(e) {
    e.preventDefault()
    setDadosError(null)
    const r = Number(dadosForm.rendimento)
    if (dadosForm.rendimento === '' || !Number.isFinite(r) || r <= 0) {
      setDadosError('rendimento é obrigatório e deve ser maior que zero')
      return
    }
    if (!dadosForm.unidadeRendimento.trim()) {
      setDadosError('unidade do rendimento é obrigatória')
      return
    }
    if (dadosForm.pesoPorcao !== '' && (!Number.isFinite(Number(dadosForm.pesoPorcao)) || Number(dadosForm.pesoPorcao) <= 0)) {
      setDadosError('peso da porção deve ser maior que zero')
      return
    }
    setDadosSaving(true)
    api
      .post(`/insumos/${insumoId}/receita`, {
        rendimento: r,
        unidadeRendimento: dadosForm.unidadeRendimento.trim(),
        pesoPorcao: dadosForm.pesoPorcao === '' ? null : Number(dadosForm.pesoPorcao),
        unidadePorcao: dadosForm.unidadePorcao.trim() === '' ? null : dadosForm.unidadePorcao.trim(),
        observacoes: dadosForm.observacoes.trim() === '' ? null : dadosForm.observacoes.trim()
      })
      .then((res) => {
        applyResponse(res.data)
        setToast({ message: 'Dados da receita salvos.', type: 'success' })
      })
      .catch((e) =>
        setDadosError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar receita.')
      )
      .finally(() => setDadosSaving(false))
  }

  function openAddIngForm() {
    setIngError(null)
    setShowAddIngForm(true)
  }

  function cancelAddIng() {
    setIngId('')
    setIngQty('')
    setIngError(null)
    setShowAddIngForm(false)
  }

  function handleAddIngrediente(e) {
    e.preventDefault()
    setIngError(null)
    if (!ingId) {
      setIngError('Selecione um insumo.')
      return
    }
    const q = Number(ingQty)
    if (!Number.isFinite(q) || q <= 0) {
      setIngError('Quantidade deve ser maior que zero.')
      return
    }
    setIngSubmitting(true)
    api
      .post(`/insumos/${insumoId}/receita/itens`, {
        insumoId: Number(ingId),
        quantidade: q
      })
      .then((res) => {
        applyResponse(res.data)
        setIngId('')
        setIngQty('')
        setShowAddIngForm(false)
        setToast({ message: 'Ingrediente adicionado à receita.', type: 'success' })
      })
      .catch((err) =>
        setIngError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar ingrediente.')
      )
      .finally(() => setIngSubmitting(false))
  }

  function startEditItem(item) {
    setEditingItemId(item.id)
    setEditingQty(String(Number(item.quantidade)))
    setEditError(null)
  }
  function cancelEditItem() {
    setEditingItemId(null)
    setEditingQty('')
    setEditError(null)
  }
  function saveEditItem() {
    setEditError(null)
    const q = Number(editingQty)
    if (!Number.isFinite(q) || q <= 0) {
      setEditError('Quantidade deve ser maior que zero.')
      return
    }
    setEditSubmitting(true)
    api
      .put(`/receitas-producao/itens/${editingItemId}`, { quantidade: q })
      .then((res) => {
        applyResponse(res.data)
        cancelEditItem()
      })
      .catch((err) =>
        setEditError(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDeleteItem(item) {
    setIngParaRemover(item)
  }

  function confirmRemoveIngrediente() {
    const item = ingParaRemover
    if (!item) return
    setRemovendoIng(true)
    api
      .delete(`/receitas-producao/itens/${item.id}`)
      .then((res) => {
        applyResponse(res.data)
        setToast({ message: 'Ingrediente removido da receita.', type: 'success' })
      })
      .catch((err) =>
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao remover.',
          type: 'error'
        })
      )
      .finally(() => {
        setRemovendoIng(false)
        setIngParaRemover(null)
      })
  }

  function handleAtualizarCusto() {
    setCustoSaving(true)
    api
      .post(`/insumos/${insumoId}/receita/atualizar-custo`)
      .then((res) => {
        applyResponse(res.data)
        setToast({ message: 'Custo do insumo atualizado com base na receita.', type: 'success' })
        return onChanged()
      })
      .catch((err) =>
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao atualizar custo.',
          type: 'error'
        })
      )
      .finally(() => setCustoSaving(false))
  }

  // Ingredientes disponíveis: ativos, sem o próprio insumo e sem produção própria
  const opcoesIngrediente = insumosLista.filter(
    (i) => i.id !== insumoId && i.tipo !== 'PRODUCAO_PROPRIA'
  )

  const itens = receita?.itens ?? []

  const ingSelecionado = opcoesIngrediente.find((i) => String(i.id) === ingId)
  const ingUnidade = ingSelecionado ? unidadeNormalizada(ingSelecionado.unidade) : null

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large">
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#111' }}>
              Receita de produção própria
            </div>
            <div style={{ fontSize: 12.5, color: '#999', marginTop: 2 }}>
              {insumo?.nome ?? '…'}
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Carregando receita…</div>
        ) : error ? (
          <div className="alert alert-red">
            <div>
              <div className="alert-title clr-red">Não foi possível carregar a receita</div>
              <div className="alert-msg">{error}</div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={loadAll}>
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Seção 1 — Dados da receita */}
            <div className="section-title" style={{ marginTop: 0 }}>Dados da Receita</div>
            <div className="card">
              <form onSubmit={handleSaveDados}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                    <label className="form-label">Rendimento</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.001"
                      value={dadosForm.rendimento}
                      onChange={(e) => setDadosForm({ ...dadosForm, rendimento: e.target.value })}
                      placeholder="Ex.: 2"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                    <label className="form-label">Unidade do rendimento</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.unidadeRendimento}
                      onChange={(e) => setDadosForm({ ...dadosForm, unidadeRendimento: e.target.value })}
                      placeholder="kg, l, porções..."
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                    <label className="form-label">Peso da porção (opcional)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.001"
                      value={dadosForm.pesoPorcao}
                      onChange={(e) => setDadosForm({ ...dadosForm, pesoPorcao: e.target.value })}
                      placeholder="Ex.: 0,030"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                    <label className="form-label">Unidade da porção</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.unidadePorcao}
                      onChange={(e) => setDadosForm({ ...dadosForm, unidadePorcao: e.target.value })}
                      placeholder="kg, g..."
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1.5, minWidth: 150 }}>
                    <label className="form-label">Observações (opcional)</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.observacoes}
                      onChange={(e) => setDadosForm({ ...dadosForm, observacoes: e.target.value })}
                      placeholder="Modo de preparo, validade..."
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={dadosSaving}>
                    {dadosSaving ? 'Salvando…' : 'Salvar dados da receita'}
                  </button>
                </div>
                {dadosError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{dadosError}</div>
                  </div>
                )}
              </form>
            </div>

            {receita === null ? (
              <div className="alert alert-gray" style={{ marginTop: 12 }}>
                <div className="alert-msg">
                  Este insumo ainda não possui receita. Salve os dados da receita acima
                  (pelo menos rendimento e unidade) para liberar o cadastro de ingredientes.
                </div>
              </div>
            ) : (
              <>
                {/* Seção 2 — Resumo do custo */}
                <div className="section-title">Resumo do Custo</div>
                <div className="grid-4">
                  <Card
                    title="Custo Total da Receita"
                    value={brl(receita.custoTotalReceita)}
                    hint="Soma dos ingredientes"
                    variant="brand"
                  />
                  <Card
                    title="Rendimento"
                    value={`${num(receita.rendimento)} ${receita.unidadeRendimento}`}
                    hint={
                      receita.pesoPorcao
                        ? `Porção: ${num(receita.pesoPorcao)} ${receita.unidadePorcao ?? ''}`
                        : 'Sem porção definida'
                    }
                  />
                  <Card
                    title="Custo Unitário Calculado"
                    value={brl(receita.custoPorRendimento)}
                    hint={
                      receita.custoPorPorcao !== null
                        ? `Por ${receita.unidadeRendimento} · porção: ${brl(receita.custoPorPorcao)}`
                        : `Por ${receita.unidadeRendimento}`
                    }
                    variant="success"
                  />
                  <Card
                    title="Custo Atual do Insumo"
                    value={brl(insumo?.custoUnitario)}
                    hint={`Por ${insumo?.unidade ?? '—'} (em uso nas fichas)`}
                    variant="info"
                  />
                </div>
                <div
                  className="card"
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap'
                  }}
                >
                  <span style={{ fontSize: 12.5, color: '#888', flex: 1, minWidth: 240 }}>
                    Atualizar custo do insumo substitui o custo unitário deste item pelo custo
                    calculado da receita.
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAtualizarCusto}
                    disabled={custoSaving || itens.length === 0}
                  >
                    {custoSaving ? 'Atualizando…' : 'Atualizar custo do insumo'}
                  </button>
                </div>

                {/* Seção — Ingredientes da receita (com adição integrada) */}
                <div className="section-title">Ingredientes da Receita</div>

                <div className="table-card">
                  {itens.length === 0 ? (
                    <div className="empty-state" style={{ padding: '28px 16px' }}>
                      Nenhum ingrediente na receita. Adicione o primeiro ingrediente abaixo para
                      calcular o custo da produção própria.
                    </div>
                  ) : (
                    <table className="hb-table">
                      <thead>
                        <tr>
                          <th>Insumo</th>
                          <th>Tipo</th>
                          <th>Unidade</th>
                          <th>Custo unitário</th>
                          <th>Quantidade usada</th>
                          <th>Custo aplicado</th>
                          <th style={{ textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item) => {
                          const isEditing = editingItemId === item.id
                          const custoUnit = Number(item.insumo.custoUnitario)
                          const unidadeItem = unidadeNormalizada(item.insumo.unidade)
                          const divideMil = unidadeItem === 'Kg' || unidadeItem === 'L'
                          const qty = isEditing ? Number(editingQty) : Number(item.quantidade)
                          const qtyBase = divideMil ? qty / 1000 : qty
                          const custoAplicado = isEditing
                            ? (qty > 0 ? qtyBase * custoUnit : 0)
                            : Number(item.custoItem ?? (qty > 0 ? qtyBase * custoUnit : 0))

                          return (
                            <tr key={item.id} style={isEditing ? { background: '#fff7ed' } : undefined}>
                              <td style={{ fontWeight: 500, color: '#111' }}>{item.insumo.nome}</td>
                              <td>
                                <span className={'badge ' + tipoBadge(item.insumo.tipo)}>
                                  {tipoLabel(item.insumo.tipo)}
                                </span>
                              </td>
                              <td style={{ color: '#888' }}>{item.insumo.unidade}</td>
                              <td>{brl(custoUnit)}</td>
                              <td>
                                {isEditing ? (
                                  <input
                                    className="form-input"
                                    style={{ padding: '6px 10px', fontSize: 13, width: 110 }}
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={editingQty}
                                    onChange={(e) => setEditingQty(e.target.value)}
                                    autoFocus
                                  />
                                ) : (
                                  <strong>
                                    {num(item.quantidade)} {item.unidadeQuantidadeReceita ?? sufixoQuantidade(item.insumo.unidade)}
                                  </strong>
                                )}
                              </td>
                              <td className="clr-orange" style={{ fontWeight: 600 }}>
                                {brl(custoAplicado)}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: 6 }}>
                                  {isEditing ? (
                                    <>
                                      <button type="button" className="btn btn-primary" onClick={saveEditItem} disabled={editSubmitting}>
                                        {editSubmitting ? 'Salvando…' : 'Salvar'}
                                      </button>
                                      <button type="button" className="btn btn-secondary" onClick={cancelEditItem} disabled={editSubmitting}>
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button type="button" className="btn btn-secondary" onClick={() => startEditItem(item)}>
                                        Editar
                                      </button>
                                      <button type="button" className="btn btn-danger" onClick={() => handleDeleteItem(item)}>
                                        Remover
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* Adição integrada à receita (continuação do card) */}
                  <div className="ficha-add-area">
                    {!showAddIngForm ? (
                      <button type="button" className="ficha-add-trigger" onClick={openAddIngForm}>
                        + Adicionar ingrediente
                      </button>
                    ) : (
                    <>
                    <div className="ficha-add-title">Adicionar ingrediente</div>
                    <form onSubmit={handleAddIngrediente}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
                          <label className="form-label">Insumo</label>
                          <select
                            className="form-input"
                            value={ingId}
                            onChange={(e) => setIngId(e.target.value)}
                          >
                            <option value="">— selecione —</option>
                            {opcoesIngrediente.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nome} ({brl(i.custoUnitario)} / {i.unidade})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 110 }}>
                          <label className="form-label">
                            {ingUnidade === 'Kg'
                              ? 'Quantidade usada (g)'
                              : ingUnidade === 'L'
                              ? 'Quantidade usada (ml)'
                              : ingUnidade === 'Und'
                              ? 'Quantidade usada (und)'
                              : 'Quantidade usada'}
                          </label>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            step="0.001"
                            value={ingQty}
                            onChange={(e) => setIngQty(e.target.value)}
                            placeholder={ingUnidade === 'Kg' || ingUnidade === 'L' ? 'Ex.: 300' : 'Ex.: 1'}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={cancelAddIng}
                            disabled={ingSubmitting}
                          >
                            Cancelar
                          </button>
                          <button type="submit" className="btn btn-primary" disabled={ingSubmitting}>
                            {ingSubmitting ? 'Adicionando…' : 'Adicionar'}
                          </button>
                        </div>
                      </div>
                      {ingUnidade === 'Kg' && (
                        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                          Este insumo é cadastrado por kg. Informe aqui a quantidade em gramas.
                        </div>
                      )}
                      {ingUnidade === 'L' && (
                        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                          Este insumo é cadastrado por litro. Informe aqui a quantidade em ml.
                        </div>
                      )}
                      {ingUnidade === 'Und' && (
                        <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                          Este insumo é cadastrado por unidade. Informe aqui a quantidade de unidades.
                        </div>
                      )}
                      {ingError && (
                        <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                          <div className="alert-msg clr-red">{ingError}</div>
                        </div>
                      )}
                      {opcoesIngrediente.length === 0 && (
                        <div className="alert alert-yellow" style={{ marginTop: 12, marginBottom: 0 }}>
                          <div className="alert-msg clr-yellow">
                            Nenhum insumo disponível como ingrediente. Cadastre insumos comuns primeiro.
                          </div>
                        </div>
                      )}
                    </form>
                    </>
                    )}
                  </div>
                </div>

                {editError && (
                  <div className="alert alert-red" style={{ marginTop: 10 }}>
                    <div className="alert-msg clr-red">{editError}</div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <ConfirmDialog
          open={ingParaRemover !== null}
          title="Remover ingrediente da receita?"
          message={
            ingParaRemover
              ? `Você está prestes a remover "${ingParaRemover.insumo?.nome}" desta receita.`
              : ''
          }
          description="Essa ação recalcula o custo da receita e pode alterar o custo unitário calculado."
          confirmLabel="Remover ingrediente"
          cancelLabel="Cancelar"
          variant="danger"
          loading={removendoIng}
          onConfirm={confirmRemoveIngrediente}
          onCancel={() => setIngParaRemover(null)}
        />

        <Toast
          message={toast?.message}
          type={toast?.type}
          onClose={() => setToast(null)}
        />
      </div>
    </div>
  )
}
