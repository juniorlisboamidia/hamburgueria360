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
function getCurrentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function formatMesLabel(mes) {
  if (!mes) return ''
  const [ano, m] = mes.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const idx = Number(m) - 1
  return meses[idx] ? `${meses[idx]} · ${ano}` : mes
}

const PE_BADGE = {
  ACIMA_DO_EQUILIBRIO:   { cls: 'badge-green',  label: 'Acima do ponto de equilíbrio' },
  PROXIMO_DO_EQUILIBRIO: { cls: 'badge-yellow', label: 'Próximo do ponto de equilíbrio' },
  ABAIXO_DO_EQUILIBRIO:  { cls: 'badge-orange', label: 'Abaixo do ponto de equilíbrio' },
  MARGEM_INSUFICIENTE:   { cls: 'badge-red',    label: 'Margem insuficiente' }
}

const metricRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  fontSize: 13,
  padding: '5px 0',
  borderBottom: '1px solid #f5f5f5'
}

function MetricRow({ label, children }) {
  return (
    <div style={metricRowStyle}>
      <span style={{ color: '#888', fontSize: 12 }}>{label}</span>
      <span>{children}</span>
    </div>
  )
}

// Classifica o problema principal de um produto a partir da análise já retornada pela API
function problemaPrincipal(analise) {
  if (!analise) return null
  if (analise.statusCmv === 'SEM_FICHA') return 'Sem ficha técnica'
  if (analise.statusCmv === 'SEM_PRECO') return 'Sem preço de venda'
  if (analise.cmvPercentual !== null && Number(analise.cmvPercentual) > 100) {
    return 'Custo acima do preço'
  }
  if (analise.statusCmv === 'CRITICO') return 'CMV do produto crítico'
  if (
    analise.diferencaPrecoSugerido !== null &&
    analise.diferencaPrecoSugerido !== undefined &&
    Number(analise.diferencaPrecoSugerido) < 0
  ) {
    return 'Preço abaixo do sugerido'
  }
  return null
}

export default function Dashboard() {
  const [mes, setMes] = useState(getCurrentMonth())
  const [data, setData] = useState(null)
  const [produtos, setProdutos] = useState([])
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load(mesParam = mes) {
    setLoading(true)
    setError(null)

    const dashboardCall = api.get('/dashboard', { params: { mes: mesParam } })
    const insumosCall = api.get('/insumos')
    const produtosCall = api
      .get('/produtos')
      .then((r) =>
        Promise.all(
          r.data.map((p) =>
            api
              .get(`/produtos/${p.id}/analise`)
              .then((rr) => ({ ...p, analise: rr.data }))
              .catch(() => ({ ...p, analise: null }))
          )
        )
      )

    Promise.all([dashboardCall, produtosCall, insumosCall])
      .then(([dashRes, prodRows, insRes]) => {
        setData(dashRes.data)
        setProdutos(prodRows)
        setInsumos(insRes.data)
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

  useEffect(() => { load(mes) }, [mes])

  // ===== Resumo do mês (lucro estimado calculado no frontend, sem mudar backend) =====
  const faturamento = data?.faturamentoAtual ?? null
  const lucroEstimado =
    data === null ||
    data.faturamentoAtual === undefined ||
    data.totalCustosFixos === undefined ||
    data.totalCustosVariaveis === undefined
      ? null
      : Number(data.faturamentoAtual) - Number(data.totalCustosFixos) - Number(data.totalCustosVariaveis)
  const lucroPositivo = lucroEstimado !== null && lucroEstimado >= 0

  // ===== Saúde financeira =====
  const statusPe = data?.statusOperacao
  const peBadge = PE_BADGE[statusPe] ?? null
  const pontoEquilibrio = data?.pontoEquilibrio ?? null
  // diferencaParaEquilibrio (backend) = ponto de equilíbrio − faturamento
  const faltamParaEquilibrio =
    data?.diferencaParaEquilibrio !== null && data?.diferencaParaEquilibrio !== undefined
      ? Math.max(0, Number(data.diferencaParaEquilibrio))
      : null
  const diferencaFaturamentoPe =
    pontoEquilibrio === null || faturamento === null
      ? null
      : Number(faturamento) - Number(pontoEquilibrio)

  // ===== Saúde dos produtos (classificação com dados já retornados pela análise) =====
  const totalProdutos = produtos.length
  const saudaveis = produtos.filter((p) => p.analise?.statusCmv === 'SAUDAVEL')
  const atencao = produtos.filter((p) => p.analise?.statusCmv === 'ATENCAO')
  const criticos = produtos.filter((p) => p.analise?.statusCmv === 'CRITICO')
  const semFicha = produtos.filter((p) => p.analise?.statusCmv === 'SEM_FICHA')
  const semPreco = produtos.filter((p) => p.analise?.statusCmv === 'SEM_PRECO')
  const cmvAcima100 = produtos.filter(
    (p) => p.analise?.cmvPercentual !== null && Number(p.analise?.cmvPercentual) > 100
  )
  const abaixoSugerido = produtos.filter(
    (p) =>
      p.analise?.diferencaPrecoSugerido !== null &&
      p.analise?.diferencaPrecoSugerido !== undefined &&
      Number(p.analise.diferencaPrecoSugerido) < 0
  )

  // Produtos que exigem atenção, em ordem de gravidade, limitados a 5
  const ORDEM_PROBLEMA = [
    'Sem ficha técnica',
    'Sem preço de venda',
    'Custo acima do preço',
    'CMV do produto crítico',
    'Preço abaixo do sugerido'
  ]
  const produtosAtencao = produtos
    .map((p) => ({ ...p, problema: problemaPrincipal(p.analise) }))
    .filter((p) => p.problema !== null)
    .sort((a, b) => ORDEM_PROBLEMA.indexOf(a.problema) - ORDEM_PROBLEMA.indexOf(b.problema))
  const listaAtencao = produtosAtencao.slice(0, 5)

  // ===== Insumos (produção própria a calcular / insumos sem custo) =====
  const ppACalcular = insumos.filter(
    (i) => i.tipo === 'PRODUCAO_PROPRIA' && Number(i.custoUnitario) === 0
  )
  const insumosSemCusto = insumos.filter(
    (i) => i.tipo !== 'PRODUCAO_PROPRIA' && !(Number(i.custoUnitario) > 0)
  )

  // ===== Alertas operacionais (informativos) =====
  const alertas = []
  if (semFicha.length > 0) {
    alertas.push({
      nivel: 'alert-yellow',
      texto: `${semFicha.length} produto(s) ainda não possuem ficha técnica.`
    })
  }
  if (semPreco.length > 0) {
    alertas.push({
      nivel: 'alert-yellow',
      texto: `${semPreco.length} produto(s) ainda não possuem preço de venda.`
    })
  }
  if (criticos.length > 0) {
    alertas.push({
      nivel: 'alert-red',
      texto: `${criticos.length} produto(s) estão com CMV do produto crítico.`
    })
  }
  if (cmvAcima100.length > 0) {
    alertas.push({
      nivel: 'alert-red',
      texto: `${cmvAcima100.length} produto(s) têm custo maior que o preço de venda.`
    })
  }
  if (ppACalcular.length > 0) {
    alertas.push({
      nivel: 'alert-yellow',
      texto: `${ppACalcular.length} produção(ões) própria(s) ainda estão com custo a calcular.`
    })
  }
  if (insumosSemCusto.length > 0) {
    alertas.push({
      nivel: 'alert-yellow',
      texto: `${insumosSemCusto.length} insumo(s) estão sem custo válido.`
    })
  }
  if (
    pontoEquilibrio !== null &&
    faturamento !== null &&
    Number(faturamento) < Number(pontoEquilibrio)
  ) {
    alertas.push({
      nivel: 'alert-gray',
      texto: 'Faturamento ainda abaixo do ponto de equilíbrio.'
    })
  }

  // ===== Próximas ações recomendadas (fixas, derivadas dos alertas) =====
  const acoes = []
  if (semFicha.length > 0) acoes.push('Completar a ficha técnica dos produtos sem ficha.')
  if (semPreco.length > 0) acoes.push('Definir o preço de venda dos produtos sem preço.')
  if (cmvAcima100.length > 0) acoes.push('Revisar produtos com custo total acima do preço de venda.')
  else if (criticos.length > 0) acoes.push('Revisar preço e ficha dos produtos com CMV do produto crítico.')
  if (ppACalcular.length > 0) acoes.push('Atualizar o custo das produções próprias a calcular.')
  if (insumosSemCusto.length > 0) acoes.push('Informar o custo dos insumos sem custo válido.')
  if (abaixoSugerido.length > 0) acoes.push('Revisar produtos vendidos abaixo do preço sugerido.')
  if (
    pontoEquilibrio !== null &&
    faturamento !== null &&
    Number(faturamento) < Number(pontoEquilibrio)
  ) {
    acoes.push('Acompanhar o faturamento até atingir o ponto de equilíbrio.')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="page-header-sub">Visão geral da operação no mês selecionado.</div>
        </div>
        <input
          type="month"
          className="form-input"
          value={mes}
          onChange={(e) => setMes(e.target.value || getCurrentMonth())}
          style={{ width: 170 }}
        />
      </div>

      {error ? (
        <div className="alert alert-red">
          <div>
            <div className="alert-title clr-red">Não foi possível carregar o dashboard</div>
            <div className="alert-msg">{error}</div>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => load(mes)}>
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading-state">Carregando visão geral…</div>
      ) : !data ? (
        <div className="empty-state">
          Nenhum dado disponível para {formatMesLabel(mes)}.
        </div>
      ) : (
        <>
          {/* 1 — Resumo do mês */}
          <div className="section-title">Resumo do Mês · {formatMesLabel(mes)}</div>
          <div className="grid-4">
            <Card
              title="Faturamento do Mês"
              value={brl(faturamento)}
              hint="Total lançado"
              variant="brand"
            />
            <Card
              title="Pedidos do Mês"
              value={int(data.totalPedidos)}
              hint="Total de pedidos"
              variant="info"
            />
            <Card
              title="Ticket Médio"
              value={brl(data.ticketMedio)}
              hint="Faturamento / pedidos"
            />
            <Card
              title="Lucro Estimado"
              value={brl(lucroEstimado)}
              hint="Após custos fixos e variáveis"
              variant={lucroEstimado === null ? 'info' : lucroPositivo ? 'success' : 'danger'}
            />
          </div>

          {/* 2 — Saúde financeira */}
          <div className="section-title">Saúde Financeira</div>
          <div className="grid-2">
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6
                }}
              >
                <div className="card-label" style={{ marginBottom: 0 }}>Ponto de Equilíbrio</div>
                {peBadge && <span className={'badge ' + peBadge.cls}>{peBadge.label}</span>}
              </div>
              <MetricRow label="Ponto de equilíbrio do mês">
                <span style={{ fontWeight: 600 }}>{brl(pontoEquilibrio)}</span>
              </MetricRow>
              <MetricRow label="Faturamento atual">{brl(faturamento)}</MetricRow>
              <MetricRow label="Diferença">
                {diferencaFaturamentoPe === null ? (
                  <span className="clr-muted">—</span>
                ) : (
                  <span
                    style={{ fontWeight: 600 }}
                    className={diferencaFaturamentoPe >= 0 ? 'clr-green' : 'clr-red'}
                  >
                    {brl(diferencaFaturamentoPe)}
                  </span>
                )}
              </MetricRow>
              <MetricRow label="Percentual atingido">{pct(data.percentualAtingido)}</MetricRow>
              <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                {statusPe === 'MARGEM_INSUFICIENTE' ? (
                  <span className="clr-red">
                    Margem insuficiente para calcular um ponto de equilíbrio saudável. Revise CMV,
                    preços e custos.
                  </span>
                ) : statusPe === 'ACIMA_DO_EQUILIBRIO' ? (
                  <span className="clr-green">
                    Operação acima do ponto de equilíbrio neste mês.
                  </span>
                ) : faltamParaEquilibrio !== null ? (
                  <span className="clr-orange">
                    Faltam {brl(faltamParaEquilibrio)} para atingir o ponto de equilíbrio.
                  </span>
                ) : (
                  <span className="clr-muted">Sem dados suficientes para calcular.</span>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-label">Custos do Mês</div>
              <MetricRow label="Custos fixos">
                {data.totalCustosFixos === null ? '—' : `− ${brl(data.totalCustosFixos)}`}
              </MetricRow>
              <MetricRow label="Custos variáveis estimados">
                {data.totalCustosVariaveis === null ? '—' : `− ${brl(data.totalCustosVariaveis)}`}
              </MetricRow>
              <MetricRow label="Faturamento">{brl(faturamento)}</MetricRow>
              <MetricRow label="Lucro estimado">
                <span
                  style={{ fontWeight: 600 }}
                  className={lucroEstimado === null ? 'clr-muted' : lucroPositivo ? 'clr-green' : 'clr-red'}
                >
                  {brl(lucroEstimado)}
                </span>
              </MetricRow>
              <MetricRow label="Margem de contribuição (CMV alvo)">
                {pct(data.margemContribuicaoReal)}
              </MetricRow>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 10, lineHeight: 1.5 }}>
                O ponto de equilíbrio usa o CMV alvo configurado ({pct(data.cmvAlvoUsado)}) como
                base operacional. CMV real médio dos produtos: {pct(data.cmvMedioRealProdutos)}.
              </div>
            </div>
          </div>

          {/* 3 — Saúde dos produtos */}
          <div className="section-title">
            Saúde dos Produtos
          </div>
          <div className="grid-4">
            <Card
              title="Saudáveis"
              value={int(saudaveis.length)}
              hint={`${int(totalProdutos)} produto(s) ativo(s)`}
              variant="success"
            />
            <Card
              title="Críticos"
              value={int(criticos.length)}
              hint={
                atencao.length > 0
                  ? `${int(atencao.length)} em atenção · por CMV do produto`
                  : 'CMV do produto acima de 35%'
              }
              variant={criticos.length > 0 ? 'danger' : 'success'}
            />
            <Card
              title="Sem Ficha"
              value={int(semFicha.length)}
              hint="Aguardando insumos"
              variant={semFicha.length > 0 ? 'warn' : 'success'}
            />
            <Card
              title="Sem Preço"
              value={int(semPreco.length)}
              hint="Aguardando preço de venda"
              variant={semPreco.length > 0 ? 'warn' : 'success'}
            />
          </div>

          {listaAtencao.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  margin: '12px 2px 6px'
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#555' }}>
                  Produtos que exigem atenção
                </span>
                <Link to="/produtos" style={{ fontSize: 12, color: '#f97316', fontWeight: 500 }}>
                  Ver em Produtos →
                </Link>
              </div>
              <div className="table-card">
                <table className="hb-table hb-table-compact">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Problema principal</th>
                      <th>CMV do produto</th>
                      <th>Preço de venda</th>
                      <th>Preço sugerido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaAtencao.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500, color: '#111' }}>{p.nome}</td>
                        <td>
                          <span
                            className={
                              'badge ' +
                              (p.problema === 'Custo acima do preço' ||
                              p.problema === 'CMV do produto crítico'
                                ? 'badge-red'
                                : 'badge-yellow')
                            }
                          >
                            {p.problema}
                          </span>
                        </td>
                        <td>
                          {p.analise?.cmvProdutoPercentual === null ||
                          p.analise?.cmvProdutoPercentual === undefined
                            ? '—'
                            : pct(p.analise.cmvProdutoPercentual)}
                        </td>
                        <td>{brl(p.precoVenda)}</td>
                        <td>
                          {p.analise?.precoSugerido === null || p.analise?.precoSugerido === undefined
                            ? '—'
                            : brl(p.analise.precoSugerido)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {produtosAtencao.length > 5 && (
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 6 }}>
                  + {produtosAtencao.length - 5} outro(s) produto(s) exigem atenção.
                </div>
              )}
            </>
          )}

          {/* 4 — Alertas operacionais */}
          <div className="section-title">Alertas Operacionais</div>
          {alertas.length === 0 ? (
            <div className="alert alert-green">
              <div className="alert-msg clr-green">
                Nenhum alerta operacional. Operação em dia.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alertas.map((a) => (
                <div key={a.texto} className={'alert ' + a.nivel} style={{ marginBottom: 0 }}>
                  <div className="alert-msg">{a.texto}</div>
                </div>
              ))}
            </div>
          )}

          {/* 5 — Próximas ações recomendadas */}
          <div className="section-title">Próximas Ações</div>
          {acoes.length === 0 ? (
            <div className="alert alert-green">
              <div className="alert-msg clr-green">Nenhuma ação pendente no momento.</div>
            </div>
          ) : (
            <div className="card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {acoes.map((a) => (
                  <div key={a} style={{ fontSize: 13, color: '#444', lineHeight: 1.5 }}>
                    • {a}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
