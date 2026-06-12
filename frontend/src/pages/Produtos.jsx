import { useEffect, useState } from 'react'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import InsumoAutocomplete from '../components/InsumoAutocomplete'

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})
const numberFormatter = new Intl.NumberFormat('pt-BR')
const qtyFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

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
function num(value) {
  if (value === null || value === undefined) return '—'
  return qtyFormatter.format(Number(value))
}

// Unidades padronizadas: Kg (custo por kg, quantidades da ficha em gramas),
// L (custo por litro, quantidades em ml) e Und (por unidade)
function unidadeNormalizada(u) {
  const v = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg'
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L'
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und'
  return null
}
function sufixoQuantidade(unidadeInsumo) {
  const u = unidadeNormalizada(unidadeInsumo)
  if (u === 'Kg') return 'g'
  if (u === 'L') return 'ml'
  return 'und'
}

// Cor informativa do "CMV + custo embutido" (percentual total real). Não altera
// o badge Saudável/Atenção/Crítico, que segue baseado só no CMV do produto.
function classePercentualTotal(p) {
  if (p === null || p === undefined) return ''
  const v = Number(p)
  if (v > 40) return 'clr-red'
  if (v > 35) return 'clr-orange'
  return 'clr-green'
}

// Alertas informativos da ficha técnica (heurísticas de revisão — não bloqueiam nada)
function buildAlertasFicha(analise, itens) {
  const alertas = []
  const semFicha = !itens || itens.length === 0
  if (semFicha) alertas.push('Este produto está sem ficha técnica.')
  if (analise?.statusCmv === 'SEM_PRECO') alertas.push('Preço de venda pendente.')
  if (
    analise?.cmvPercentual !== null &&
    analise?.cmvPercentual !== undefined &&
    Number(analise.cmvPercentual) > 100
  ) {
    alertas.push('Custo total acima de 100% do preço. Revise preço, ficha ou quantidades.')
  }
  // Alertas separados do status: custo total/embutido altos não rebaixam o
  // status do produto (que olha só o CMV do produto), mas merecem revisão
  if (analise?.alertaCustoTotal) alertas.push(analise.alertaCustoTotal)
  if (analise?.alertaCustoEmbutido) alertas.push(analise.alertaCustoEmbutido)
  if (
    analise?.diferencaPrecoSugerido !== null &&
    analise?.diferencaPrecoSugerido !== undefined &&
    Number(analise.diferencaPrecoSugerido) < 0
  ) {
    alertas.push('Preço atual abaixo do preço sugerido.')
  }

  const precoVenda = Number(analise?.precoVenda)
  for (const item of itens ?? []) {
    const nome = item.insumo?.nome ?? 'Insumo'
    const qtd = Number(item.quantidade)
    const unidadeItem = unidadeNormalizada(item.insumo?.unidade)
    if (unidadeItem === 'Kg') {
      if (qtd < 1) {
        alertas.push(`Quantidade muito baixa para insumo em Kg: ${nome} — ${num(qtd)} g.`)
      } else if (qtd >= 1000) {
        alertas.push(`Quantidade alta para insumo em Kg: ${nome} — ${num(qtd)} g.`)
      }
    } else if (unidadeItem === 'L') {
      if (qtd < 1) {
        alertas.push(`Quantidade muito baixa para insumo em L: ${nome} — ${num(qtd)} ml.`)
      } else if (qtd >= 1000) {
        alertas.push(`Quantidade alta para insumo em L: ${nome} — ${num(qtd)} ml.`)
      }
    } else {
      if (qtd > 10) {
        alertas.push(`Quantidade alta para insumo unitário: ${nome} — ${num(qtd)} und.`)
      }
      if (Number.isFinite(qtd) && !Number.isInteger(qtd)) {
        alertas.push(`Quantidade fracionada em insumo unitário: ${nome} — ${num(qtd)} und.`)
      }
    }

    const custoApl = Number(item.custoAplicado)
    if (Number.isFinite(custoApl)) {
      if (custoApl === 0) {
        alertas.push(`Item com custo aplicado zerado: ${nome}.`)
      } else if (precoVenda > 0 && custoApl > precoVenda * 0.5) {
        alertas.push(
          `${nome} custa ${brl(custoApl)} — ${pct((custoApl / precoVenda) * 100)} do preço de venda.`
        )
      }
    }

    if (item.formaRateio && item.formaRateio !== 'POR_PRODUTO') {
      const qa = Number(item.quantidadeAtendida)
      if (!Number.isFinite(qa) || qa <= 0) {
        alertas.push(`Rateio de ${nome} sem quantidade atendida válida.`)
      }
    }
  }
  return alertas
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

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }

const metricRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 13,
  padding: '5px 0',
  borderBottom: '1px solid #f5f5f5'
}
const metricLabelStyle = { color: '#888', fontSize: 12 }

const priceLabelStyle = {
  fontSize: 10,
  fontWeight: 600,
  color: '#aaa',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 2
}
const pricePendingStyle = { fontSize: 12, fontWeight: 500, color: '#aaa' }

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

  // Modal simples: apenas criação de produto
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(FORM_BLANK)
  const [createError, setCreateError] = useState(null)
  const [creating, setCreating] = useState(false)

  const [deletingId, setDeletingId] = useState(null)
  const [produtoParaInativar, setProdutoParaInativar] = useState(null)
  const [toast, setToast] = useState(null)

  const [fichaProdutoId, setFichaProdutoId] = useState(null)
  const [configOpen, setConfigOpen] = useState(false)

  function fetchProdutos() {
    return api
      .get('/produtos')
      .then((res) => Promise.all(
        res.data.map((p) =>
          api.get(`/produtos/${p.id}/analise`).then((r) => ({ ...p, analise: r.data }))
        )
      ))
  }

  function load() {
    setLoading(true)
    setError(null)
    fetchProdutos()
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

  // Recarrega a lista sem acionar o loading de página inteira
  // (usado pelo modal de ficha para atualizar os cards atrás dele)
  function refresh() {
    return fetchProdutos()
      .then((rows) => setProdutos(rows))
      .catch(() => {})
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setCreateForm(FORM_BLANK)
    setCreateError(null)
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setCreateForm(FORM_BLANK)
    setCreateError(null)
  }

  function handleCreate(e) {
    e.preventDefault()
    const err = validateForm(createForm)
    if (err) { setCreateError(err); return }
    setCreateError(null)
    setCreating(true)
    api
      .post('/produtos', payloadFromForm(createForm))
      .then(() => {
        setToast({ message: 'Produto criado com sucesso.', type: 'success' })
        closeCreate()
        load()
      })
      .catch((e) =>
        setCreateError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar produto.')
      )
      .finally(() => setCreating(false))
  }

  function handleDelete(p) {
    setProdutoParaInativar(p)
  }

  function confirmInativarProduto() {
    const p = produtoParaInativar
    if (!p) return
    setDeletingId(p.id)
    api
      .delete(`/produtos/${p.id}`)
      .then(() => {
        setToast({ message: `Produto "${p.nome}" inativado.`, type: 'success' })
        load()
      })
      .catch((e) =>
        setToast({
          message: e?.response?.data?.error ?? e?.message ?? 'Erro ao inativar produto.',
          type: 'error'
        })
      )
      .finally(() => {
        setDeletingId(null)
        setProdutoParaInativar(null)
      })
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setConfigOpen(true)}>
            Configurar precificação
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Novo produto
          </button>
        </div>
      </div>

      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      <ConfirmDialog
        open={produtoParaInativar !== null}
        title="Inativar produto?"
        message={
          produtoParaInativar
            ? `Você está prestes a inativar "${produtoParaInativar.nome}".`
            : ''
        }
        description="O produto sai do cardápio e dos cálculos, mas o histórico é preservado."
        confirmLabel="Inativar produto"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deletingId !== null}
        onConfirm={confirmInativarProduto}
        onCancel={() => setProdutoParaInativar(null)}
      />

      {createOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-title">Novo produto</div>
            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Nome</label>
                <input
                  className="form-input"
                  type="text"
                  value={createForm.nome}
                  onChange={(e) => setCreateForm({ ...createForm, nome: e.target.value })}
                  placeholder="X-Burger Especial"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Descrição (opcional)</label>
                <input
                  className="form-input"
                  type="text"
                  value={createForm.descricao}
                  onChange={(e) => setCreateForm({ ...createForm, descricao: e.target.value })}
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
                  value={createForm.precoVenda}
                  onChange={(e) => setCreateForm({ ...createForm, precoVenda: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              {createError && (
                <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                  <div className="alert-msg clr-red">{createError}</div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCreate} disabled={creating}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Salvando…' : 'Salvar produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fichaProdutoId !== null && (
        <FichaModal
          produtoId={fichaProdutoId}
          onClose={() => setFichaProdutoId(null)}
          onChanged={refresh}
        />
      )}

      {configOpen && (
        <ConfigPrecificacaoModal
          onClose={() => setConfigOpen(false)}
          onSaved={() => {
            setConfigOpen(false)
            setToast({
              message: 'Configuração de precificação salva. Preços recalculados.',
              type: 'success'
            })
            load()
          }}
        />
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
          hint="CMV do produto acima de 35%"
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
            // Badge = saúde GERAL da precificação (statusGeral); a linha "CMV do
            // produto" continua colorida pelo statusCmv (leitura isolada do CMV)
            const statusGeralProduto = a.statusGeral ?? a.statusCmv
            const semFichaProduto = a.statusCmv === 'SEM_FICHA'
            const semPrecoProduto = a.statusCmv === 'SEM_PRECO'
            const cmvClass = CMV_COLOR_CLASS[a.statusCmv] ?? ''
            const lucroPositivo =
              a.lucroBruto !== null && a.lucroBruto !== undefined && Number(a.lucroBruto) > 0
            const abaixoDoSugerido =
              a.diferencaPrecoSugerido !== null &&
              a.diferencaPrecoSugerido !== undefined &&
              Number(a.diferencaPrecoSugerido) < 0

            const diagnosticos = []
            if (semFichaProduto) {
              diagnosticos.push({ texto: 'Ficha técnica pendente', cls: 'clr-muted' })
            } else if (semPrecoProduto) {
              diagnosticos.push({ texto: 'Preço de venda pendente', cls: 'clr-muted' })
            } else {
              if (a.statusCmv === 'ATENCAO') diagnosticos.push({ texto: 'CMV em atenção', cls: 'clr-yellow' })
              if (a.statusCmv === 'ALERTA') diagnosticos.push({ texto: 'CMV em alerta', cls: 'clr-orange' })
              if (a.statusCmv === 'CRITICO') diagnosticos.push({ texto: 'CMV crítico', cls: 'clr-red' })
              if (abaixoDoSugerido) diagnosticos.push({ texto: 'Preço abaixo do sugerido', cls: 'clr-orange' })
              if (a.alertaCustoEmbutido) diagnosticos.push({ texto: 'Custo embutido elevado', cls: 'clr-orange' })
              if (a.alertaCustoTotal) diagnosticos.push({ texto: 'Custo total acima de 40%', cls: 'clr-red' })
              if (diagnosticos.length === 0) diagnosticos.push({ texto: 'Precificação saudável', cls: 'clr-green' })
            }

            return (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Bloco 1 — Identidade */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 12
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#111', fontSize: 14 }}>{p.nome}</div>
                    {p.descricao && (
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{p.descricao}</div>
                    )}
                  </div>
                  <span className={'badge ' + (STATUS_BADGE[statusGeralProduto] ?? 'badge-gray')}>
                    {STATUS_LABEL[statusGeralProduto] ?? statusGeralProduto ?? '—'}
                  </span>
                </div>

                {/* Bloco 2 — Preços principais */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    background: '#fafafa',
                    border: '1px solid #f0f0f0',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 12
                  }}
                >
                  <div style={{ flex: 1, minWidth: 86 }}>
                    <div style={priceLabelStyle}>Venda</div>
                    <div style={{ fontSize: 17, fontWeight: 600, color: '#111', letterSpacing: '-0.3px' }}>
                      {p.precoVenda === null || p.precoVenda === undefined
                        ? <span style={pricePendingStyle}>Pendente</span>
                        : brl(p.precoVenda)}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 86 }}>
                    <div style={priceLabelStyle}>Sugerido</div>
                    <div className="clr-blue" style={{ fontSize: 15, fontWeight: 600 }}>
                      {a.precoSugerido === null || a.precoSugerido === undefined
                        ? <span style={pricePendingStyle}>{semFichaProduto ? 'Sem ficha' : 'Pendente'}</span>
                        : brl(a.precoSugerido)}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 86 }}>
                    <div style={priceLabelStyle}>iFood</div>
                    <div className="clr-orange" style={{ fontSize: 15, fontWeight: 600 }}>
                      {a.precoIfood === null || a.precoIfood === undefined
                        ? <span style={pricePendingStyle}>{semFichaProduto ? 'Sem ficha' : 'Pendente'}</span>
                        : brl(a.precoIfood)}
                    </div>
                  </div>
                </div>

                {/* Bloco 3 — Indicadores técnicos */}
                <div style={{ flex: 1 }}>
                  <MetricRow label="CMV do produto">
                    {a.cmvProdutoPercentual === null || a.cmvProdutoPercentual === undefined
                      ? <span className="clr-muted">—</span>
                      : <span className={cmvClass} style={{ fontWeight: 600 }}>{pct(a.cmvProdutoPercentual)}</span>}
                  </MetricRow>
                  <MetricRow label="CMV + custo embutido">
                    {a.percentualTotalReal === null || a.percentualTotalReal === undefined
                      ? <span className="clr-muted">—</span>
                      : (
                        <span className={classePercentualTotal(a.percentualTotalReal)} style={{ fontWeight: 600 }}>
                          {pct(a.percentualTotalReal)}
                        </span>
                      )}
                  </MetricRow>
                  <MetricRow label="Custo total real">
                    {semFichaProduto
                      ? <span className="clr-muted">Não cadastrado</span>
                      : brl(a.custoTotalReal ?? a.custoFichaTecnica)}
                  </MetricRow>
                  <MetricRow label="Lucro bruto real">
                    {a.lucroBruto === null || a.lucroBruto === undefined
                      ? <span className="clr-muted">—</span>
                      : <span className={lucroPositivo ? 'clr-green' : 'clr-red'}>{brl(a.lucroBrutoReal ?? a.lucroBruto)}</span>}
                  </MetricRow>
                </div>

                {/* Bloco 4 — Diagnóstico */}
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid #f5f5f5',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3
                  }}
                >
                  {diagnosticos.map((d) => (
                    <div key={d.texto} className={d.cls} style={{ fontSize: 11.5, fontWeight: 500 }}>
                      {d.texto}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setFichaProdutoId(p.id)}
                  >
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

// ============ Modal: configuração de precificação ============

const CONFIG_FIELDS = [
  'cmvAlvoPercentual',
  'lucroDesejadoPercentual',
  'taxaIfoodPercentual',
  'campanhaInteligente',
  'maiorTaxaEntrega',
  'cupomDesconto',
  'ticketMedioDelivery'
]

function validateConfigForm(form) {
  for (const f of CONFIG_FIELDS) {
    if (form[f] === '' || !Number.isFinite(Number(form[f]))) {
      return 'Todos os campos são obrigatórios e devem ser numéricos.'
    }
  }
  const cmv = Number(form.cmvAlvoPercentual)
  if (cmv <= 0 || cmv >= 100) return 'CMV alvo deve ser maior que 0 e menor que 100.'
  const lucro = Number(form.lucroDesejadoPercentual)
  if (lucro < 0 || lucro >= 100) return 'Lucro desejado deve ser maior ou igual a 0 e menor que 100.'
  const taxa = Number(form.taxaIfoodPercentual)
  if (taxa < 0 || taxa >= 100) return 'Taxa iFood deve ser maior ou igual a 0 e menor que 100.'
  if (Number(form.campanhaInteligente) < 0) return 'Campanha Inteligente deve ser maior ou igual a zero.'
  if (Number(form.maiorTaxaEntrega) < 0) return 'Maior taxa de entrega deve ser maior ou igual a zero.'
  if (Number(form.cupomDesconto) < 0) return 'Cupom de desconto deve ser maior ou igual a zero.'
  if (Number(form.ticketMedioDelivery) <= 0) return 'Ticket médio delivery deve ser maior que zero.'
  return null
}

function ConfigPrecificacaoModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  function loadConfig() {
    setLoading(true)
    setError(null)
    api
      .get('/configuracao-precificacao')
      .then((r) => {
        const c = r.data
        const toStr = (v) => (v === null || v === undefined ? '' : String(Number(v)))
        setForm({
          cmvAlvoPercentual: toStr(c.cmvAlvoPercentual),
          lucroDesejadoPercentual: toStr(c.lucroDesejadoPercentual),
          taxaIfoodPercentual: toStr(c.taxaIfoodPercentual),
          campanhaInteligente: toStr(c.campanhaInteligente),
          maiorTaxaEntrega: toStr(c.maiorTaxaEntrega),
          cupomDesconto: toStr(c.cupomDesconto),
          ticketMedioDelivery: toStr(c.ticketMedioDelivery)
        })
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

  useEffect(() => { loadConfig() }, [])

  function handleSave(e) {
    e.preventDefault()
    const err = validateConfigForm(form)
    if (err) { setFormError(err); return }
    setFormError(null)
    setSaving(true)
    const payload = Object.fromEntries(CONFIG_FIELDS.map((f) => [f, Number(form[f])]))
    api
      .put('/configuracao-precificacao', payload)
      .then(() => onSaved())
      .catch((e) =>
        setFormError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar configuração.')
      )
      .finally(() => setSaving(false))
  }

  const numOrZero = (v) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : 0)
  const taxaIfoodTotal = form ? numOrZero(form.taxaIfoodPercentual) : 0
  const custosRateaveis = form
    ? numOrZero(form.campanhaInteligente) +
      numOrZero(form.maiorTaxaEntrega) +
      numOrZero(form.cupomDesconto)
    : 0

  const fieldDef = [
    ['taxaIfoodPercentual', 'Taxa iFood (%)'],
    ['campanhaInteligente', 'Campanha Inteligente (R$)'],
    ['maiorTaxaEntrega', 'Maior taxa de entrega (R$)'],
    ['cupomDesconto', 'Cupom (R$)'],
    ['ticketMedioDelivery', 'Ticket médio delivery (R$)']
  ]

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-title">Configuração de precificação</div>
        <div style={{ fontSize: 12.5, color: '#999', marginTop: -10, marginBottom: 14 }}>
          Defina os parâmetros usados para calcular preço sugerido e preço iFood.
        </div>

        {loading ? (
          <div className="loading-state">Carregando configuração…</div>
        ) : error ? (
          <div className="alert alert-red">
            <div>
              <div className="alert-title clr-red">Não foi possível carregar a configuração</div>
              <div className="alert-msg">{error}</div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={loadConfig}>
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="section-title" style={{ marginTop: 0 }}>Venda Direta</div>
            <div className="form-grid-2" style={{ marginBottom: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">CMV alvo (%)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cmvAlvoPercentual}
                  onChange={(e) => setForm({ ...form, cmvAlvoPercentual: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Lucro desejado (%)</label>
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.lucroDesejadoPercentual}
                  onChange={(e) => setForm({ ...form, lucroDesejadoPercentual: e.target.value })}
                />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#999', marginBottom: 12 }}>
              CMV alvo e lucro desejado ajudam a avaliar se o produto está saudável e a formar o
              preço sugerido.
            </div>

            <div className="section-title">iFood</div>
            <div className="form-grid-2">
              {fieldDef.map(([campo, label]) => (
                <div key={campo} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form[campo]}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 10 }}>
              Preço iFood parte do preço de venda e soma o impacto de taxa, campanha, entrega,
              cupom e ticket médio.
            </div>

            <div className="section-title">Resumo</div>
            <div
              className="alert alert-gray"
              style={{ marginTop: 0, marginBottom: 0, display: 'flex', gap: 20, flexWrap: 'wrap' }}
            >
              <div className="alert-msg">
                Taxa iFood total:{' '}
                <strong className={taxaIfoodTotal >= 100 ? 'clr-red' : 'clr-orange'}>
                  {pct(taxaIfoodTotal)}
                </strong>
              </div>
              <div className="alert-msg">
                Custos iFood rateáveis: <strong className="clr-orange">{brl(custosRateaveis)}</strong>
              </div>
            </div>

            {formError && (
              <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="alert-msg clr-red">{formError}</div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ============ Modal grande: ficha do produto ============

const TIPO_USO_OPTIONS = [
  { value: 'INGREDIENTE',    label: 'Ingrediente' },
  { value: 'EMBALAGEM',      label: 'Embalagem' },
  { value: 'ACOMPANHAMENTO', label: 'Acompanhamento' },
  { value: 'OPERACIONAL',    label: 'Operacional' }
]
const TIPO_USO_LABEL = Object.fromEntries(TIPO_USO_OPTIONS.map((o) => [o.value, o.label]))

const RATEIO_OPTIONS = [
  { value: 'POR_PRODUTO',   label: 'Por produto' },
  { value: 'POR_EMBALAGEM', label: 'Por embalagem' },
  { value: 'POR_PEDIDO',    label: 'Por pedido' }
]
const RATEIO_LABEL = Object.fromEntries(RATEIO_OPTIONS.map((o) => [o.value, o.label]))

const ATENDIDA_LABEL = {
  POR_EMBALAGEM: 'Produtos atendidos por embalagem',
  POR_PEDIDO: 'Produtos médios por pedido'
}

// Sugestão de uso a partir do tipo do insumo (mesma regra do backend)
function sugestaoUso(tipoInsumo) {
  if (tipoInsumo === 'EMBALAGEM') return 'EMBALAGEM'
  if (tipoInsumo === 'ACOMPANHAMENTO') return 'ACOMPANHAMENTO'
  if (tipoInsumo === 'OPERACIONAL') return 'OPERACIONAL'
  return 'INGREDIENTE'
}

// Regra automática (mesma do backend): só ingrediente entra na base do preço sugerido
function aplicaMargemPorTipoUso(tipoUso) {
  return tipoUso === 'INGREDIENTE'
}

function ComposicaoBadge({ aplicarMargem }) {
  return aplicarMargem
    ? <span className="badge badge-green">Preço sugerido</span>
    : <span className="badge badge-gray">Custo embutido</span>
}

function FichaModal({ produtoId, onClose, onChanged }) {
  const [produto, setProduto] = useState(null)
  const [analise, setAnalise] = useState(null)
  const [itens, setItens] = useState([])
  const [insumos, setInsumos] = useState([])
  const [fichaTotais, setFichaTotais] = useState({
    custoComMargem: 0,
    custoEmbutido: 0,
    custoTotalFicha: 0
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [activeTab, setActiveTab] = useState('PRECIFICACAO')
  const [toast, setToast] = useState(null)

  const [dadosForm, setDadosForm] = useState(FORM_BLANK)
  const [dadosError, setDadosError] = useState(null)
  const [dadosSaving, setDadosSaving] = useState(false)

  const [showAddItemForm, setShowAddItemForm] = useState(false)
  const [formInsumoId, setFormInsumoId] = useState('')
  const [formQty, setFormQty] = useState('')
  const [formTipoUso, setFormTipoUso] = useState('INGREDIENTE')
  const [formRateio, setFormRateio] = useState('POR_PRODUTO')
  const [formAtendida, setFormAtendida] = useState('')
  const [itemError, setItemError] = useState(null)
  const [itemSubmitting, setItemSubmitting] = useState(false)

  const [editingItemId, setEditingItemId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editError, setEditError] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [itemParaRemover, setItemParaRemover] = useState(null)
  const [removendoItem, setRemovendoItem] = useState(false)

  function applyFicha(fichaData) {
    setProduto(fichaData.produto)
    setItens(fichaData.itens)
    setFichaTotais({
      custoComMargem: fichaData.custoComMargem ?? 0,
      custoEmbutido: fichaData.custoEmbutido ?? 0,
      custoTotalFicha: fichaData.custoTotalFicha ?? 0
    })
  }

  const custoTotal = fichaTotais.custoTotalFicha

  function loadAll() {
    setLoading(true)
    setError(null)
    Promise.all([
      api.get(`/produtos/${produtoId}/ficha-tecnica`),
      api.get(`/produtos/${produtoId}/analise`),
      api.get('/insumos')
    ])
      .then(([fichaRes, analiseRes, insumosRes]) => {
        const prod = fichaRes.data.produto
        applyFicha(fichaRes.data)
        setAnalise(analiseRes.data)
        setInsumos(insumosRes.data)
        setDadosForm({
          nome: prod.nome ?? '',
          descricao: prod.descricao ?? '',
          precoVenda:
            prod.precoVenda === null || prod.precoVenda === undefined
              ? ''
              : String(Number(prod.precoVenda))
        })
        setLoading(false)
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status === 404) {
          setError('Produto não encontrado ou inativo.')
        } else {
          setError(err?.response?.data?.error ?? err?.message ?? 'Erro inesperado.')
        }
        setLoading(false)
      })
  }

  function reload() {
    return Promise.all([
      api.get(`/produtos/${produtoId}/ficha-tecnica`),
      api.get(`/produtos/${produtoId}/analise`)
    ]).then(([fichaRes, analiseRes]) => {
      applyFicha(fichaRes.data)
      setAnalise(analiseRes.data)
      return onChanged()
    })
  }

  useEffect(() => { loadAll() }, [produtoId])

  function handleSaveDados(e) {
    e.preventDefault()
    const err = validateForm(dadosForm)
    if (err) { setDadosError(err); return }
    setDadosError(null)
    setDadosSaving(true)
    api
      .put(`/produtos/${produtoId}`, payloadFromForm(dadosForm))
      .then(() => {
        setToast({ message: 'Dados do produto salvos. CMV e margem recalculados.', type: 'success' })
        return reload()
      })
      .catch((e) =>
        setDadosError(e?.response?.data?.error ?? e?.message ?? 'Erro ao salvar produto.')
      )
      .finally(() => setDadosSaving(false))
  }

  function handleSelectInsumo(value) {
    setFormInsumoId(value)
    const ins = insumos.find((x) => String(x.id) === value)
    if (ins) {
      setFormTipoUso(sugestaoUso(ins.tipo))
    }
  }

  function resetItemForm() {
    setFormInsumoId('')
    setFormQty('')
    setFormTipoUso('INGREDIENTE')
    setFormRateio('POR_PRODUTO')
    setFormAtendida('')
  }

  function openAddItemForm() {
    setItemError(null)
    setShowAddItemForm(true)
  }

  function cancelAddItem() {
    resetItemForm()
    setItemError(null)
    setShowAddItemForm(false)
  }

  // Troca de aba fecha e limpa o formulário de novo item
  function switchTab(tab) {
    setActiveTab(tab)
    if (showAddItemForm) cancelAddItem()
  }

  function handleAddItem(e) {
    e.preventDefault()
    setItemError(null)
    if (!formInsumoId) {
      setItemError('Selecione um insumo válido.')
      return
    }
    const q = Number(formQty)
    if (!Number.isFinite(q) || q <= 0) {
      setItemError('Quantidade deve ser maior que zero.')
      return
    }
    if (formRateio !== 'POR_PRODUTO') {
      const qa = Number(formAtendida)
      if (formAtendida === '' || !Number.isFinite(qa) || qa <= 0) {
        setItemError(`${ATENDIDA_LABEL[formRateio]} é obrigatório e deve ser maior que zero.`)
        return
      }
    }
    setItemSubmitting(true)
    api
      .post(`/produtos/${produtoId}/ficha-tecnica/itens`, {
        insumoId: Number(formInsumoId),
        quantidade: q,
        tipoUso: formTipoUso,
        formaRateio: formRateio,
        quantidadeAtendida: formRateio === 'POR_PRODUTO' ? null : Number(formAtendida),
        aplicarMargem: aplicaMargemPorTipoUso(formTipoUso)
      })
      .then(() => {
        resetItemForm()
        setShowAddItemForm(false)
        setToast({ message: 'Item adicionado à ficha.', type: 'success' })
        return reload()
      })
      .catch((err) => {
        setItemError(err?.response?.data?.error ?? err?.message ?? 'Erro ao adicionar item.')
      })
      .finally(() => setItemSubmitting(false))
  }

  function startEditItem(item) {
    setEditingItemId(item.id)
    setEditForm({
      quantidade: String(Number(item.quantidade)),
      tipoUso: item.tipoUso ?? 'INGREDIENTE',
      formaRateio: item.formaRateio ?? 'POR_PRODUTO',
      quantidadeAtendida:
        item.quantidadeAtendida === null || item.quantidadeAtendida === undefined
          ? ''
          : String(Number(item.quantidadeAtendida))
    })
    setEditError(null)
  }
  function cancelEditItem() {
    setEditingItemId(null)
    setEditForm(null)
    setEditError(null)
  }
  function saveEditItem() {
    setEditError(null)
    const q = Number(editForm.quantidade)
    if (!Number.isFinite(q) || q <= 0) {
      setEditError('Quantidade deve ser maior que zero.')
      return
    }
    if (editForm.formaRateio !== 'POR_PRODUTO') {
      const qa = Number(editForm.quantidadeAtendida)
      if (editForm.quantidadeAtendida === '' || !Number.isFinite(qa) || qa <= 0) {
        setEditError(`${ATENDIDA_LABEL[editForm.formaRateio]} é obrigatório e deve ser maior que zero.`)
        return
      }
    }
    setEditSubmitting(true)
    api
      .put(`/ficha-tecnica/itens/${editingItemId}`, {
        quantidade: q,
        tipoUso: editForm.tipoUso,
        formaRateio: editForm.formaRateio,
        quantidadeAtendida:
          editForm.formaRateio === 'POR_PRODUTO' ? null : Number(editForm.quantidadeAtendida),
        aplicarMargem: aplicaMargemPorTipoUso(editForm.tipoUso)
      })
      .then(() => {
        cancelEditItem()
        setToast({ message: 'Item da ficha atualizado.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setEditError(err?.response?.data?.error ?? err?.message ?? 'Erro ao salvar.')
      )
      .finally(() => setEditSubmitting(false))
  }

  function handleDeleteItem(item) {
    setItemParaRemover(item)
  }

  function confirmRemoveItem() {
    const item = itemParaRemover
    if (!item) return
    setRemovendoItem(true)
    api
      .delete(`/ficha-tecnica/itens/${item.id}`)
      .then(() => {
        setToast({ message: 'Item removido da ficha.', type: 'success' })
        return reload()
      })
      .catch((err) =>
        setToast({
          message: err?.response?.data?.error ?? err?.message ?? 'Erro ao remover.',
          type: 'error'
        })
      )
      .finally(() => {
        setRemovendoItem(false)
        setItemParaRemover(null)
      })
  }

  const status = analise?.statusCmv
  // Badge do cabeçalho do modal segue a saúde geral; o card "CMV do Produto"
  // continua colorido pelo statusCmv
  const statusGeralModal = analise?.statusGeral ?? status
  const semFicha = status === 'SEM_FICHA'

  const insumoSelecionado = insumos.find((x) => String(x.id) === formInsumoId)
  const insumoSelUnidade = insumoSelecionado
    ? unidadeNormalizada(insumoSelecionado.unidade)
    : null

  const alertasFicha = loading || error ? [] : buildAlertasFicha(analise, itens)

  const alertasBlock = alertasFicha.length > 0 && (
    <>
      <div className="section-title">Alertas da Ficha Técnica</div>
      <div className="alert alert-yellow" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alertasFicha.map((a) => (
            <div key={a} className="alert-msg">• {a}</div>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className="modal-overlay">
      <div className="modal modal-card-large">
        <div className="modal-header">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: '#111' }}>
              {produto?.nome ?? 'Ficha do produto'}
            </span>
            {statusGeralModal && (
              <span className={'badge ' + (STATUS_BADGE[statusGeralModal] ?? 'badge-gray')}>
                {STATUS_LABEL[statusGeralModal] ?? statusGeralModal}
              </span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fechar
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Carregando ficha do produto…</div>
        ) : error ? (
          <div className="alert alert-red">
            <div>
              <div className="alert-title clr-red">Não foi possível carregar a ficha</div>
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
            <div className="modal-tabs">
              <button
                type="button"
                className={'modal-tab' + (activeTab === 'PRECIFICACAO' ? ' active' : '')}
                onClick={() => switchTab('PRECIFICACAO')}
              >
                Precificação
              </button>
              <button
                type="button"
                className={'modal-tab' + (activeTab === 'FICHA' ? ' active' : '')}
                onClick={() => switchTab('FICHA')}
              >
                Ficha Técnica
              </button>
            </div>

            {/* Wrapper comum: as duas abas vivem no MESMO painel com altura padronizada */}
            <div className="product-tab-panel">
            {activeTab === 'PRECIFICACAO' && (
            <>
            {/* Seção 1 — Dados do produto */}
            <div className="section-title" style={{ marginTop: 0 }}>Dados do Produto</div>
            <div className="card">
              <form onSubmit={handleSaveDados}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1.2, minWidth: 170 }}>
                    <label className="form-label">Nome</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.nome}
                      onChange={(e) => setDadosForm({ ...dadosForm, nome: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1.6, minWidth: 200 }}>
                    <label className="form-label">Descrição (opcional)</label>
                    <input
                      className="form-input"
                      type="text"
                      value={dadosForm.descricao}
                      onChange={(e) => setDadosForm({ ...dadosForm, descricao: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 0.8, minWidth: 130 }}>
                    <label className="form-label">Preço de venda (R$)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={dadosForm.precoVenda}
                      onChange={(e) => setDadosForm({ ...dadosForm, precoVenda: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={dadosSaving}>
                    {dadosSaving ? 'Salvando…' : 'Salvar dados do produto'}
                  </button>
                </div>
                {dadosError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{dadosError}</div>
                  </div>
                )}
              </form>
            </div>

            {/* Seção 2 — Resumo financeiro: CMV do produto separado do custo embutido */}
            <div className="section-title">Resumo Financeiro</div>
            <div className="grid-3">
              <Card title="Preço de Venda" value={brl(analise?.precoVenda)} hint="Cadastrado no produto" variant="brand" />
              <Card
                title="Custo do Produto"
                value={brl(analise?.custoProduto)}
                hint={semFicha ? 'Sem itens na ficha' : 'Ingredientes com preço sugerido'}
              />
              <Card
                title="CMV do Produto"
                value={pct(analise?.cmvProdutoPercentual)}
                hint={semFicha ? 'Adicione insumos' : 'Custo do produto / preço de venda'}
                variant={
                  status === 'SAUDAVEL' ? 'success'
                  : status === 'ATENCAO' ? 'warn'
                  : status === 'ALERTA' ? 'brand'
                  : status === 'CRITICO' ? 'danger'
                  : 'info'
                }
              />
            </div>
            <div className="grid-3">
              <Card
                title="Custo Embutido"
                value={brl(analise?.custoEmbutido)}
                hint="Embalagem, acompanhamento e operacional"
              />
              <Card
                title="Custo Total Real"
                value={brl(custoTotal)}
                hint={`Produto + embutido${
                  analise?.percentualTotalReal === null || analise?.percentualTotalReal === undefined
                    ? ''
                    : ` · ${pct(analise.percentualTotalReal)} do preço`
                }`}
              />
              <Card
                title="Lucro Bruto Real"
                value={analise?.lucroBrutoReal === null || analise?.lucroBrutoReal === undefined
                  ? '—'
                  : brl(analise.lucroBrutoReal)}
                hint={`Preço − custo total real${
                  analise?.margemRealPercentual === null || analise?.margemRealPercentual === undefined
                    ? ''
                    : ` · margem ${pct(analise.margemRealPercentual)}`
                }`}
                variant={analise?.lucroBrutoReal !== null && Number(analise?.lucroBrutoReal) > 0 ? 'success' : 'info'}
              />
            </div>

            {/* Alertas informativos da ficha técnica */}
            {alertasBlock}

            {/* Seção 3 — Precificação técnica */}
            <div className="section-title">Precificação Técnica</div>
            <div className="grid-2">
              <div className="card">
                <div className="card-label">Venda Direta</div>
                <MetricRow label="CMV alvo">{pct(analise?.cmvAlvoPercentual)}</MetricRow>
                <MetricRow label="Lucro desejado">{pct(analise?.lucroDesejadoPercentual)}</MetricRow>
                <MetricRow label="Custo do produto">{brl(analise?.custoProduto)}</MetricRow>
                <MetricRow label="Custo embutido">{brl(analise?.custoEmbutido)}</MetricRow>
                <MetricRow label="Preço sugerido">
                  <span style={{ fontWeight: 600 }} className="clr-blue">
                    {analise?.precoSugerido === null || analise?.precoSugerido === undefined
                      ? 'Pendente'
                      : brl(analise.precoSugerido)}
                  </span>
                </MetricRow>
                <MetricRow label="Preço atual">{brl(analise?.precoVenda)}</MetricRow>
                <MetricRow label="Diferença para preço atual">
                  {analise?.diferencaPrecoSugerido === null || analise?.diferencaPrecoSugerido === undefined
                    ? <span className="clr-muted">—</span>
                    : (
                      <span
                        style={{ fontWeight: 600 }}
                        className={Number(analise.diferencaPrecoSugerido) >= 0 ? 'clr-green' : 'clr-red'}
                      >
                        {brl(analise.diferencaPrecoSugerido)}
                      </span>
                    )}
                </MetricRow>
              </div>
              <div className="card">
                <div className="card-label">iFood</div>
                <MetricRow label="Preço de venda (base)">
                  <span style={{ fontWeight: 600 }}>{brl(analise?.precoVenda)}</span>
                </MetricRow>
                <MetricRow label="Taxa iFood">{pct(analise?.taxaIfoodPercentual)}</MetricRow>
                <MetricRow label="Campanha Inteligente">{brl(analise?.campanhaInteligente)}</MetricRow>
                <MetricRow label="Maior taxa de entrega">{brl(analise?.maiorTaxaEntrega)}</MetricRow>
                <MetricRow label="Cupom">{brl(analise?.cupomDesconto)}</MetricRow>
                <MetricRow label="Ticket médio delivery">{brl(analise?.ticketMedioDelivery)}</MetricRow>
                <MetricRow label="Custos iFood rateáveis">{brl(analise?.custosIfoodRateaveis)}</MetricRow>
                <MetricRow label="Valor rateado no produto">{brl(analise?.valorCustosIfoodRateados)}</MetricRow>
                <MetricRow label="Preço base com taxa">{brl(analise?.precoIfoodBaseTaxas)}</MetricRow>
                <MetricRow label="Preço iFood final">
                  <span style={{ fontWeight: 600 }} className="clr-orange">
                    {analise?.precoIfood === null || analise?.precoIfood === undefined
                      ? 'Pendente'
                      : brl(analise.precoIfood)}
                  </span>
                </MetricRow>
              </div>
            </div>
            </>
            )}

            {activeTab === 'FICHA' && (
            <>
            {alertasBlock}

            {/* Seção 4 — Ficha técnica */}
            <div className="section-title">Ficha Técnica</div>

            <div className="table-card table-card-form">
              {itens.length === 0 ? (
                <div className="empty-state" style={{ padding: '28px 16px' }}>
                  Ficha técnica vazia. Adicione o primeiro insumo no formulário abaixo — assim que
                  houver pelo menos um item, o CMV e a margem serão recalculados.
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="hb-table hb-table-compact">
                    <thead>
                      <tr>
                        <th>Insumo</th>
                        <th>Uso</th>
                        <th>Custo unit.</th>
                        <th>Qtd.</th>
                        <th>Rateio</th>
                        <th>Qtd. atendida</th>
                        <th>Composição</th>
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

                        let custoAplicadoExibido
                        if (isEditing && editForm) {
                          const q = Number(editForm.quantidade)
                          const qBase = divideMil ? q / 1000 : q
                          const qa = Number(editForm.quantidadeAtendida)
                          const divisor =
                            editForm.formaRateio !== 'POR_PRODUTO' && qa > 0 ? qa : 1
                          custoAplicadoExibido = q > 0 ? (qBase * custoUnit) / divisor : 0
                        } else {
                          custoAplicadoExibido = item.custoAplicado
                        }

                        return (
                          <tr key={item.id} style={isEditing ? { background: '#fff7ed' } : undefined}>
                            <td style={{ fontWeight: 500, color: '#111' }}>{item.insumo.nome}</td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="form-input"
                                  style={{ ...cellInputStyle, width: 118 }}
                                  value={editForm.tipoUso}
                                  onChange={(e) => setEditForm({ ...editForm, tipoUso: e.target.value })}
                                >
                                  {TIPO_USO_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="badge badge-gray">
                                  {TIPO_USO_LABEL[item.tipoUso] ?? item.tipoUso}
                                </span>
                              )}
                            </td>
                            <td>{brl(custoUnit)}</td>
                            <td>
                              {isEditing ? (
                                <input
                                  className="form-input"
                                  style={{ ...cellInputStyle, width: 76 }}
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  value={editForm.quantidade}
                                  onChange={(e) => setEditForm({ ...editForm, quantidade: e.target.value })}
                                  autoFocus
                                />
                              ) : (
                                <strong>
                                  {num(item.quantidade)} {item.unidadeQuantidadeFicha ?? sufixoQuantidade(item.insumo.unidade)}
                                </strong>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  className="form-input"
                                  style={{ ...cellInputStyle, width: 126 }}
                                  value={editForm.formaRateio}
                                  onChange={(e) => setEditForm({ ...editForm, formaRateio: e.target.value })}
                                >
                                  {RATEIO_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ fontSize: 12, color: '#666' }}>
                                  {RATEIO_LABEL[item.formaRateio] ?? item.formaRateio}
                                </span>
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                editForm.formaRateio === 'POR_PRODUTO' ? (
                                  <span className="clr-muted">—</span>
                                ) : (
                                  <input
                                    className="form-input"
                                    style={{ ...cellInputStyle, width: 70 }}
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={editForm.quantidadeAtendida}
                                    onChange={(e) =>
                                      setEditForm({ ...editForm, quantidadeAtendida: e.target.value })
                                    }
                                    placeholder="Ex.: 2"
                                  />
                                )
                              ) : item.quantidadeAtendida === null || item.quantidadeAtendida === undefined ? (
                                <span className="clr-muted">—</span>
                              ) : (
                                num(item.quantidadeAtendida)
                              )}
                            </td>
                            <td>
                              <ComposicaoBadge
                                aplicarMargem={
                                  isEditing
                                    ? aplicaMargemPorTipoUso(editForm.tipoUso)
                                    : item.aplicarMargem
                                }
                              />
                            </td>
                            <td className="clr-orange" style={{ fontWeight: 600 }}>
                              {brl(custoAplicadoExibido)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {isEditing ? (
                                  <>
                                    <button type="button" className="btn btn-primary btn-sm" onClick={saveEditItem} disabled={editSubmitting}>
                                      {editSubmitting ? 'Salvando…' : 'Salvar'}
                                    </button>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEditItem} disabled={editSubmitting}>
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEditItem(item)}>
                                      Editar
                                    </button>
                                    <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteItem(item)}>
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
                </div>
              )}

              {/* Adição integrada à ficha (continuação do card) */}
              <div className="ficha-add-area">
                {!showAddItemForm ? (
                  <button type="button" className="ficha-add-trigger" onClick={openAddItemForm}>
                    + Adicionar novo item
                  </button>
                ) : (
                <>
                <div className="ficha-add-title">Adicionar novo item</div>
                <form onSubmit={handleAddItem}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: 2, minWidth: 200 }}>
                    <label className="form-label">Insumo</label>
                    <InsumoAutocomplete
                      insumos={insumos}
                      value={formInsumoId}
                      onChange={handleSelectInsumo}
                      placeholder="Digite para buscar o insumo..."
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 0.8, minWidth: 100 }}>
                    <label className="form-label">
                      {insumoSelUnidade === 'Kg'
                        ? 'Quantidade (g)'
                        : insumoSelUnidade === 'L'
                        ? 'Quantidade (ml)'
                        : insumoSelUnidade === 'Und'
                        ? 'Quantidade (und)'
                        : 'Quantidade'}
                    </label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      placeholder={
                        insumoSelUnidade === 'Kg'
                          ? 'Ex.: 120'
                          : insumoSelUnidade === 'L'
                          ? 'Ex.: 300'
                          : 'Ex.: 1'
                      }
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                    <label className="form-label">Tipo de uso</label>
                    <select
                      className="form-input"
                      value={formTipoUso}
                      onChange={(e) => setFormTipoUso(e.target.value)}
                    >
                      {TIPO_USO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 130 }}>
                    <label className="form-label">Forma de rateio</label>
                    <select
                      className="form-input"
                      value={formRateio}
                      onChange={(e) => setFormRateio(e.target.value)}
                    >
                      {RATEIO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {formRateio !== 'POR_PRODUTO' && (
                    <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                      <label className="form-label">{ATENDIDA_LABEL[formRateio]}</label>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.001"
                        value={formAtendida}
                        onChange={(e) => setFormAtendida(e.target.value)}
                        placeholder="Ex.: 2"
                      />
                    </div>
                  )}
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
                    <label className="form-label">Composição</label>
                    <div style={{ display: 'flex', alignItems: 'center', minHeight: 37 }}>
                      <ComposicaoBadge aplicarMargem={aplicaMargemPorTipoUso(formTipoUso)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={cancelAddItem}
                      disabled={itemSubmitting}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={itemSubmitting}>
                      {itemSubmitting ? 'Adicionando…' : 'Adicionar item'}
                    </button>
                  </div>
                </div>
                {insumoSelUnidade === 'Kg' && (
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                    Este insumo é cadastrado por kg. Informe aqui a quantidade em gramas.
                  </div>
                )}
                {insumoSelUnidade === 'L' && (
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                    Este insumo é cadastrado por litro. Informe aqui a quantidade em ml.
                  </div>
                )}
                {insumoSelUnidade === 'Und' && (
                  <div style={{ fontSize: 11.5, color: '#999', marginTop: 8 }}>
                    Este insumo é cadastrado por unidade. Informe aqui a quantidade de unidades.
                  </div>
                )}
                {itemError && (
                  <div className="alert alert-red" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-red">{itemError}</div>
                  </div>
                )}
                {insumos.length === 0 && (
                  <div className="alert alert-yellow" style={{ marginTop: 12, marginBottom: 0 }}>
                    <div className="alert-msg clr-yellow">
                      Nenhum insumo ativo cadastrado. Cadastre insumos antes de montar a ficha.
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

            {itens.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: '14px 18px',
                  background: '#fff',
                  border: '0.5px solid #e8e8e8',
                  borderRadius: 12,
                  fontSize: 13,
                  color: '#555'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                  <span>Custo do produto (preço sugerido)</span>
                  <strong style={{ fontSize: 14, color: '#111' }}>{brl(fichaTotais.custoComMargem)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                  <span>Custo embutido (embalagem/acompanhamento)</span>
                  <strong style={{ fontSize: 14, color: '#111' }}>{brl(fichaTotais.custoEmbutido)}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 6,
                    paddingTop: 8,
                    borderTop: '1px solid #f0f0f0'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Custo total real</span>
                  <strong className="clr-orange" style={{ fontSize: 18 }}>{brl(custoTotal)}</strong>
                </div>
              </div>
            )}
            </>
            )}
            </div>
          </>
        )}

        <ConfirmDialog
          open={itemParaRemover !== null}
          title="Remover item da ficha?"
          message={
            itemParaRemover
              ? `Você está prestes a remover "${itemParaRemover.insumo?.nome}" da ficha técnica deste produto.`
              : ''
          }
          description="Essa ação recalcula o custo da ficha e os preços sugeridos."
          confirmLabel="Remover item"
          cancelLabel="Cancelar"
          variant="danger"
          loading={removendoItem}
          onConfirm={confirmRemoveItem}
          onCancel={() => setItemParaRemover(null)}
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
