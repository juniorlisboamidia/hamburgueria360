import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Card from '../components/Card'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const numberFormatter = new Intl.NumberFormat('pt-BR')

function brl(value) {
  if (value === null || value === undefined) return '—'
  return brlFormatter.format(Number(value))
}
function pct(value) {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toFixed(2).replace('.', ',')}%`
}
function int(value) {
  if (value === null || value === undefined) return '—'
  return numberFormatter.format(Number(value))
}

const STATUS_BADGE = {
  SAUDAVEL:  'badge-green',
  ATENCAO:   'badge-yellow',
  ALERTA:    'badge-orange',
  CRITICO:   'badge-red',
  SEM_FICHA: 'badge-blue',
  SEM_PRECO: 'badge-gray'
}
const STATUS_LABEL = {
  SAUDAVEL:  'Saudável',
  ATENCAO:   'Atenção',
  ALERTA:    'Alerta',
  CRITICO:   'Crítico',
  SEM_FICHA: 'Sem ficha',
  SEM_PRECO: 'Sem preço'
}
const CMV_COLOR_CLASS = {
  SAUDAVEL:  'clr-green',
  ATENCAO:   'clr-yellow',
  ALERTA:    'clr-orange',
  CRITICO:   'clr-red'
}

const FORM_BLANK = { nome: '', descricao: '', precoVenda: '' }

function validateForm({ nome, precoVenda }) {
  if (!nome || nome.trim() === '') return 'nome é obrigatório'
  if (precoVenda === '' || precoVenda === null || precoVenda === undefined) {
    return 'preço de venda é obrigatório'
  }
  const v = Number(precoVenda)
  if (!Number.isFinite(v)) return 'preço de venda deve ser numérico'
  if (v < 0) return 'preço de venda deve ser maior ou igual a zero'
  return null
}

function payloadFromForm(form) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() === '' ? null : form.descricao.trim(),
    precoVenda: Number(form.precoVenda)
  }
}

const metricRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 13,
  padding: '5px 0',
  borderBottom: '1px solid #f5f5f5'
}
const metricLabelStyle = { color: '#888', fontSize: 12 }

function MetricRow({ label, children }) {
  return (
    <div style={metricRowStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span>{children}</span>
    </div>
  )
}

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(FORM_BLANK)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [deletingId, setDeletingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  function load() {
    setLoading(true)
    setError(null)
    api
      .get('/produtos')
      .then((res) => Promise.all(
        res.data.map((p) =>
          api.get(`/produtos/${p.id}/analise`).then((r) => ({ ...p, analise: r.data }))
        )
      ))
      .then((rows) => {
        setProdutos(rows)
        setLoading(false)
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ??
          (err?.code === 'ERR_NETWORK'
            ? 'Não foi possível conectar ao backend (http://localhost:4000).'
            : err?.message ?? 'Erro inesperado.')
        setError(msg)
        setLoading(false)
      })
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditingId(null)
    setForm(FORM_BLANK)
    setFormError(null)
    setFeedback(null)
    setFormOpen(true)
  }

  function openEdit(p) {
    setEditingId(p.id)
    setForm({
      nome: p.nome ?? '',
      descricao: p.descricao ?? '',
      precoVenda:
        p.precoVenda === null || p.precoVenda === undefined ? '' : String(Number(p.precoVenda))
    })
    setFormError(null)
    setFeedback(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
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
      ? api.post('/produtos', payloadFromForm(form))
      : api.put(`/produtos/${editingId}`, payloadFromForm(form))

    request
      .then(() => {
        setFeedback(editingId === null
          ? 'Produto criado com sucesso.'
          : 'Produto atualizado com sucesso.')
        closeForm()
        load()
      })
      .catch((e) =>
        setFormError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar produto.')
      )
      .finally(() => setSubmitting(false))
  }

  function handleDelete(p) {
    const ok = window.confirm('Tem certeza que deseja inativar este produto?')
    if (!ok) return
    setDeletingId(p.id)
    setFeedback(null)
    api
      .delete(`/produtos/${p.id}`)
      .then(() => {
        setFeedback(`Produto "${p.nome}" inativado.`)
        load()
      })
      .catch((e) =>
        window.alert(e?.response?.data?.error ?? e?.message ?? 'Erro ao inativar produto.')
      )
      .finally(() => setDeletingId(null))
  }

  if (loading) {
    return <div className="loading-state">Carregando produtos…</div>
  }

  if (error) {
    return (
      <div className="alert alert-red">
        <div>
          <div className="alert-title clr-red">Não foi possível carregar os produtos</div>
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

  // Métricas agregadas
  const totalAtivos = produtos.length
  const semFicha = produtos.filter((p) => p.analise?.statusCmv === 'SEM_FICHA').length
  const criticos = produtos.filter((p) => p.analise?.statusCmv === 'CRITICO').length
  const fichasCadastradas = totalAtivos - semFicha

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Produtos</h1>
          <div className="page-header-sub">
            Cadastro de produtos, ficha técnica, CMV e precificação.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          + Novo produto
        </button>
      </div>

      {feedback && (
        <div className="alert alert-green" style={{ marginBottom: 12 }}>
          <div className="alert-msg clr-green">{feedback}</div>
        </div>
      )}

      {formOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">
              {editingId === null ? 'Novo produto' : 'Editar produto'}
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="X-Burger Especial"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Descrição (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Pão, blend 160g, queijo..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Preço de venda (R$)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precoVenda}
                  onChange={(e) => setForm({ ...form, precoVenda: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              {formError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{formError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Salvando…' : 'Salvar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="section-title">Resumo</div>
      <div className="grid-4" style={{ marginBottom: 4 }}>
        <Card
          title="Produtos Cadastrados"
          value={int(totalAtivos)}
          hint="Ativos no cardápio"
          variant="info"
        />
        <Card
          title="Sem Ficha Técnica"
          value={int(semFicha)}
          hint="Sem CMV calculado"
          variant={semFicha > 0 ? 'warn' : 'success'}
        />
        <Card
          title="CMV Crítico"
          value={int(criticos)}
          hint="Acima de 40%"
          variant={criticos > 0 ? 'danger' : 'success'}
        />
        <Card
          title="Fichas Cadastradas"
          value={int(fichasCadastradas)}
          hint="Produtos com composição"
          variant={fichasCadastradas > 0 ? 'success' : 'info'}
        />
      </div>

      <div className="section-title">Produtos e Fichas</div>

      {totalAtivos === 0 ? (
        <div className="empty-state">
          Nenhum produto cadastrado. Use o botão “+ Novo produto” para cadastrar o primeiro e montar a ficha técnica.
        </div>
      ) : (
        <div className="grid-3">
          {produtos.map((p) => {
            const a = p.analise ?? {}
            const semFichaProduto = a.statusCmv === 'SEM_FICHA'
            const cmvClass = CMV_COLOR_CLASS[a.statusCmv] ?? ''
            const lucroPositivo =
              a.lucroBruto !== null && a.lucroBruto !== undefined && Number(a.lucroBruto) > 0

            return (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 10
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#111', fontSize: 14 }}>{p.nome}</div>
                    {p.descricao && (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{p.descricao}</div>
                    )}
                  </div>
                  <span className={'badge ' + (STATUS_BADGE[a.statusCmv] ?? 'badge-gray')}>
                    {STATUS_LABEL[a.statusCmv] ?? a.statusCmv ?? '—'}
                  </span>
                </div>

                <div style={{ flex: 1 }}>
                  <MetricRow label="Preço de venda">
                    <span style={{ fontWeight: 600 }}>{brl(p.precoVenda)}</span>
                  </MetricRow>
                  <MetricRow label="Custo da ficha">
                    {semFichaProduto
                      ? <span className="clr-muted">Não cadastrado</span>
                      : brl(a.custoFichaTecnica)}
                  </MetricRow>
                  <MetricRow label="CMV">
                    {a.cmvPercentual === null || a.cmvPercentual === undefined
                      ? <span className="clr-muted">—</span>
                      : <span className={cmvClass} style={{ fontWeight: 600 }}>{pct(a.cmvPercentual)}</span>}
                  </MetricRow>
                  <MetricRow label="Margem bruta">
                    {pct(a.margemBrutaPercentual)}
                  </MetricRow>
                  <MetricRow label="Lucro bruto estimado">
                    {a.lucroBruto === null || a.lucroBruto === undefined
                      ? <span className="clr-muted">—</span>
                      : <span className={lucroPositivo ? 'clr-green' : 'clr-red'}>{brl(a.lucroBruto)}</span>}
                  </MetricRow>
                  <MetricRow label="Preço sugerido">
                    <span className="badge badge-gray">Em breve</span>
                  </MetricRow>
                  <MetricRow label="Preço iFood">
                    <span className="badge badge-gray">Em breve</span>
                  </MetricRow>
                </div>

                {a.mensagemDiagnostico && (
                  <div style={{ fontSize: 11, color: '#999', margin: '10px 0 0', lineHeight: 1.5 }}>
                    {a.mensagemDiagnostico}
                  </div>
                )}

                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Link to={`/ficha-tecnica/${p.id}`} className="btn btn-primary">
                    Abrir ficha
                  </Link>
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(p)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleDelete(p)}
                    disabled={deletingId === p.id}
                  >
                    {deletingId === p.id ? 'Inativando…' : 'Inativar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
