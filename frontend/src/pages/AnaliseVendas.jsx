// Análise de Vendas — V1: importação de relatório de itens vendidos (Saipos /
// Excel), associação aos produtos cadastrados e rankings por VOLUME vendido.
// Esta fase trabalha só com quantidades (sem faturamento por item).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import api from '../services/api'
import Card from '../components/Card'
import Toast from '../components/Toast'
import InsumoAutocomplete from '../components/InsumoAutocomplete'

const intFmt = new Intl.NumberFormat('pt-BR')
function int(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return intFmt.format(n)
}

// Normaliza nome para comparação: minúsculo, sem acentos (ç→c), sem pontos
// (B.B.Q → bbq), sem caracteres especiais e espaços colapsados.
function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Converte célula em número. Vazio → 0. Aceita pt-BR (1.051 / 1.051,5).
// Retorna NaN quando há texto não numérico (tratado como 0 a montante).
function parseQtd(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  let s = String(v).trim()
  if (s === '') return 0
  s = s.replace(/\s/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/\.(?=\d{3}(\D|$))/g, '')
  return Number(s)
}

// Cabeçalhos aceitos por campo (comparados já normalizados)
const HEADER_DEFS = [
  { field: 'nome', nomes: ['nome do item', 'nome', 'item', 'produto'] },
  { field: 'principal', nomes: ['qnt principal', 'quantidade principal', 'qtd principal', 'principal'] },
  { field: 'complemento', nomes: ['qnt complemento', 'quantidade complemento', 'qtd complemento', 'complemento'] },
  { field: 'oferta', nomes: ['oferta combo', 'oferta', 'qnt oferta', 'quantidade oferta', 'qtd oferta'] },
  { field: 'total', nomes: ['total qnt', 'total qtd', 'qnt total', 'total'] }
]
const HEADER_NORMS = HEADER_DEFS.map((d) => ({ field: d.field, nomes: d.nomes.map(normalizar) }))

function detectarColunas(row) {
  const colIndex = {}
  ;(row ?? []).forEach((cell, i) => {
    const norm = normalizar(cell)
    if (!norm) return
    for (const def of HEADER_NORMS) {
      if (colIndex[def.field] !== undefined) continue
      if (def.nomes.includes(norm)) { colIndex[def.field] = i; break }
    }
  })
  return colIndex
}

// Lê a matriz (linhas × colunas) da planilha e devolve { linhas } ou { erro }
function processarMatriz(matrix) {
  let colIndex = null
  let headerRow = -1
  for (let r = 0; r < Math.min(matrix.length, 12); r++) {
    const ci = detectarColunas(matrix[r])
    const temQtd =
      ci.principal !== undefined || ci.complemento !== undefined ||
      ci.oferta !== undefined || ci.total !== undefined
    if (ci.nome !== undefined && temQtd) { headerRow = r; colIndex = ci; break }
  }
  if (headerRow === -1) return { erro: 'colunas' }

  const linhas = []
  let negativo = false
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    const nome = String(row[colIndex.nome] ?? '').trim()
    if (nome === '') continue
    const getN = (f) => {
      if (colIndex[f] === undefined) return 0
      const n = parseQtd(row[colIndex[f]])
      return Number.isFinite(n) ? n : 0
    }
    const principal = getN('principal')
    const complemento = getN('complemento')
    const oferta = getN('oferta')
    let total
    const totalCell = colIndex.total !== undefined ? row[colIndex.total] : undefined
    if (totalCell !== undefined && totalCell !== null && String(totalCell).trim() !== '') {
      const t = parseQtd(totalCell)
      total = Number.isFinite(t) ? t : principal + complemento + oferta
    } else {
      total = principal + complemento + oferta
    }
    if (principal < 0 || complemento < 0 || oferta < 0 || total < 0) negativo = true
    linhas.push({ nomeOriginal: nome, principal, complemento, oferta, total })
  }
  if (negativo) return { erro: 'negativo' }
  if (linhas.length === 0) return { erro: 'vazio' }
  return { linhas }
}

function ehBebidaCommodity(p) {
  return !!p && (p.tipoProduto ?? 'PRODUTO') === 'BEBIDA' && p.tipoBebidaAnalise === 'COMMODITY'
}

// Badges estratégicas de um produto (reaproveita as classes do sistema)
function BadgesProduto({ p }) {
  if (!p) return null
  return (
    <>
      {p.produtoAncora && <span className="badge-strategic badge-assinatura">Assinatura</span>}
      {p.produtoIsca && <span className="badge-strategic badge-isca">Isca</span>}
      {(p.tipoProduto ?? 'PRODUTO') === 'BEBIDA' && p.tipoBebidaAnalise === 'AUTORAL' && (
        <span className="badge-strategic badge-autoral">Autoral</span>
      )}
    </>
  )
}

const STATUS_META = {
  ASSOCIADO: { label: 'Associado', cls: 'badge-green' },
  NAO_IDENTIFICADO: { label: 'Não identificado', cls: 'badge-gray' },
  PRECISA_REVISAO: { label: 'Precisa revisão', cls: 'badge-yellow' }
}

// ===== Diagnóstico estratégico (V2): leitura gerencial por volume =====

// Percentual formatado com proteção contra valores inválidos (nunca NaN/Infinity)
function pctTxt(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0%'
  return `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')}%`
}

const FAIXA_META = {
  ALTO: { label: 'Alto volume', cls: 'badge-green' },
  MEDIO: { label: 'Volume médio', cls: 'badge-blue' },
  BAIXO: { label: 'Baixo volume', cls: 'badge-orange' },
  ZERADO: { label: 'Sem venda', cls: 'badge-gray' }
}
function FaixaBadge({ faixa }) {
  const f = FAIXA_META[faixa] ?? FAIXA_META.MEDIO
  return <span className={'badge ' + f.cls}>{f.label}</span>
}
function MarcacoesCell({ p }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
      <BadgesProduto p={p} />
    </span>
  )
}

// Leituras gerenciais por seção (texto, sem decisão automática de remoção)
function leituraCampeao(p) {
  if (p.produto.produtoIsca) return 'Produto isca com alto volume. Avaliar se está puxando recompra ou apenas volume promocional.'
  if (p.produto.produtoAncora) return 'Produto assinatura com bom volume. Manter destaque no cardápio.'
  return 'Produto forte em volume. Priorizar disponibilidade, operação e campanhas.'
}
function leituraBaixaSaida(p) {
  if (p.produto.produtoAncora) return 'Produto assinatura com baixo volume. Não remover automaticamente; revisar comunicação, foto, posição no cardápio ou oferta.'
  if (p.produto.produtoIsca) return 'Produto isca com baixo volume. Revisar se ainda cumpre papel de entrada/oferta.'
  return 'Baixa saída. Candidato a revisão de cardápio na próxima análise com margem e ficha técnica.'
}
function leituraOferta(p) {
  const dep = p.pOferta >= 60 ? 'Alta dependência de oferta/combo' : 'Dependência moderada de oferta/combo'
  if (p.produto.produtoIsca) return `${dep}. Produto isca/oferta: a dependência pode ser intencional, mas precisa ser monitorada.`
  return `${dep}. Grande parte do volume vem de oferta/combo; avaliar se o produto vende bem sozinho ou depende de promoção.`
}
function leituraComplemento() {
  return 'Produto aparece muito como complemento. Pode ser item de apoio, upsell ou composição de pedido.'
}
function leituraAssinatura(p) {
  if (p.faixa === 'ALTO') return 'Assinatura forte. Manter destaque.'
  if (p.faixa === 'BAIXO' || p.faixa === 'ZERADO') return 'Assinatura com baixo volume. Proteger, mas revisar comunicação/posição.'
  return 'Assinatura com desempenho intermediário. Monitorar.'
}
function leituraIsca(p) {
  if (p.faixa === 'ALTO') return 'Isca com bom volume. Avaliar se está gerando recompra e venda agregada.'
  if (p.faixa === 'BAIXO' || p.faixa === 'ZERADO') return 'Isca com baixo volume. Revisar atratividade, preço, campanha ou exposição.'
  return 'Isca com volume intermediário. Monitorar recompra e venda agregada.'
}
const LEITURA_ZERADO =
  'Produto com zero venda no período. Conferir se estava ativo, se foi lançado recentemente ou se houve erro na planilha.'

// Colunas reutilizáveis das tabelas de diagnóstico
const COL = {
  produto: { key: 'prod', label: 'Produto', render: (p) => <span style={{ fontWeight: 500, color: '#111' }}>{p.produto.nome}</span> },
  total: { key: 'total', label: 'Total vendido', right: true, render: (p) => <strong>{int(p.total)}</strong> },
  participacao: { key: 'part', label: 'Participação', right: true, render: (p) => pctTxt(p.participacao) },
  faixa: { key: 'faixa', label: 'Faixa de volume', render: (p) => <FaixaBadge faixa={p.faixa} /> },
  principal: { key: 'pri', label: 'Principal', right: true, render: (p) => int(p.principal) },
  complemento: { key: 'comp', label: 'Complemento', right: true, render: (p) => int(p.complemento) },
  oferta: { key: 'of', label: 'Oferta/Combo', right: true, render: (p) => int(p.oferta) },
  pctOferta: { key: 'pof', label: '% Oferta/Combo', right: true, render: (p) => pctTxt(p.pOferta) },
  pctComplemento: { key: 'pcomp', label: '% Complemento', right: true, render: (p) => pctTxt(p.pComplemento) },
  marcacoes: { key: 'marc', label: 'Marcações', render: (p) => <MarcacoesCell p={p.produto} /> }
}

function DiagTabela({ rows, cols, leitura, vazio = 'Nenhum produto encontrado nesta categoria.' }) {
  if (!rows || rows.length === 0) {
    return <div className="empty-state" style={{ padding: '20px 16px' }}>{vazio}</div>
  }
  return (
    <div className="table-card">
      <table className="hb-table hb-table-compact">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={c.right ? { textAlign: 'right' } : undefined}>{c.label}</th>
            ))}
            {leitura && <th>Leitura</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.produto.id}>
              {cols.map((c) => (
                <td key={c.key} style={c.right ? { textAlign: 'right' } : undefined}>{c.render(p)}</td>
              ))}
              {leitura && (
                <td style={{ fontSize: 11.5, color: '#666', maxWidth: 340, lineHeight: 1.4 }}>{leitura(p)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubSecaoDiag({ title, children }) {
  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '18px 0 8px' }}>{title}</div>
      {children}
    </>
  )
}

export default function AnaliseVendas() {
  const [produtos, setProdutos] = useState([])
  const [produtosErro, setProdutosErro] = useState(null)
  const [linhas, setLinhas] = useState([])
  const [manualAssoc, setManualAssoc] = useState({})
  const [colarTexto, setColarTexto] = useState('')
  const [colarAberto, setColarAberto] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    api
      .get('/produtos')
      .then((r) => setProdutos(r.data))
      .catch((err) =>
        setProdutosErro(
          err?.response?.data?.error ??
            (err?.code === 'ERR_NETWORK'
              ? 'Não foi possível conectar ao backend (http://localhost:4000).'
              : err?.message ?? 'Erro ao carregar produtos.')
        )
      )
  }, [])

  function aplicarMatriz(matrix) {
    const res = processarMatriz(matrix)
    if (res.erro === 'colunas') {
      setToast({ message: 'A planilha precisa conter NOME DO ITEM e pelo menos uma coluna de quantidade.', type: 'error' })
      return
    }
    if (res.erro === 'negativo') {
      setToast({ message: 'A planilha contém quantidade negativa. Corrija o arquivo e tente novamente.', type: 'error' })
      return
    }
    if (res.erro === 'vazio') {
      setToast({ message: 'Nenhum item válido encontrado na planilha.', type: 'error' })
      return
    }
    const comId = res.linhas.map((l, i) => ({ id: i + 1, ...l }))
    setLinhas(comId)
    setManualAssoc({})
    const totalGeral = comId.reduce((s, l) => s + l.total, 0)
    setToast({ message: `Planilha importada: ${int(comId.length)} itens, ${int(totalGeral)} vendidos.`, type: 'success' })
  }

  function handleFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        aplicarMatriz(XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }))
      } catch {
        setToast({ message: 'Não foi possível ler a planilha. Verifique o formato.', type: 'error' })
      }
    }
    reader.onerror = () =>
      setToast({ message: 'Não foi possível ler a planilha. Verifique o formato.', type: 'error' })
    reader.readAsArrayBuffer(file)
  }

  function handleColar() {
    const texto = colarTexto.trim()
    if (texto === '') {
      setToast({ message: 'Cole o conteúdo da planilha (com cabeçalho) para analisar.', type: 'info' })
      return
    }
    try {
      const wb = XLSX.read(texto, { type: 'string', raw: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      aplicarMatriz(XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }))
    } catch {
      setToast({ message: 'Não foi possível ler a planilha. Verifique o formato.', type: 'error' })
    }
  }

  function limpar() {
    setLinhas([])
    setManualAssoc({})
    setColarTexto('')
    setColarAberto(false)
  }

  // Produtos por nome normalizado (para associação automática)
  const prodPorNorm = useMemo(() => {
    const map = new Map()
    for (const p of produtos) {
      const k = normalizar(p.nome)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(p)
    }
    return map
  }, [produtos])

  // Cada linha resolvida com produto associado e status
  const linhasResolvidas = useMemo(
    () =>
      linhas.map((l) => {
        const manualId = manualAssoc[l.id]
        let produto = null
        let status = 'NAO_IDENTIFICADO'
        if (manualId) {
          produto = produtos.find((p) => p.id === manualId) ?? null
          status = produto ? 'ASSOCIADO' : 'NAO_IDENTIFICADO'
        } else {
          const matches = prodPorNorm.get(normalizar(l.nomeOriginal)) ?? []
          if (matches.length === 1) { produto = matches[0]; status = 'ASSOCIADO' }
          else if (matches.length > 1) { status = 'PRECISA_REVISAO' }
        }
        return { ...l, produto, status }
      }),
    [linhas, produtos, manualAssoc, prodPorNorm]
  )

  // ===== Métricas da importação =====
  const m = useMemo(() => {
    const totalVendido = linhasResolvidas.reduce((s, l) => s + l.total, 0)
    const somaPrincipal = linhasResolvidas.reduce((s, l) => s + l.principal, 0)
    const somaComplemento = linhasResolvidas.reduce((s, l) => s + l.complemento, 0)
    const somaOferta = linhasResolvidas.reduce((s, l) => s + l.oferta, 0)
    const associados = linhasResolvidas.filter((l) => l.status === 'ASSOCIADO').length
    const naoIdentificados = linhasResolvidas.filter((l) => l.status !== 'ASSOCIADO').length
    return {
      totalVendido,
      itensUnicos: linhasResolvidas.length,
      somaPrincipal,
      somaComplemento,
      somaOferta,
      associados,
      naoIdentificados
    }
  }, [linhasResolvidas])

  // ===== Ranking geral: todas as linhas, por total desc =====
  const rankingGeral = useMemo(
    () => [...linhasResolvidas].sort((a, b) => b.total - a.total),
    [linhasResolvidas]
  )

  // ===== Ranking estratégico: agrega por produto, exclui commodity e fora da análise =====
  const rankingEstrategico = useMemo(() => {
    const porProduto = new Map()
    for (const l of linhasResolvidas) {
      if (l.status !== 'ASSOCIADO' || !l.produto) continue
      if (!l.produto.incluirAnaliseEstrategica) continue
      if (ehBebidaCommodity(l.produto)) continue
      const key = l.produto.id
      const acc = porProduto.get(key) ?? {
        produto: l.produto,
        total: 0,
        principal: 0,
        complemento: 0,
        oferta: 0
      }
      acc.total += l.total
      acc.principal += l.principal
      acc.complemento += l.complemento
      acc.oferta += l.oferta
      porProduto.set(key, acc)
    }
    return [...porProduto.values()].sort((a, b) => b.total - a.total)
  }, [linhasResolvidas])

  const naoIdentificadosLista = linhasResolvidas.filter((l) => l.status !== 'ASSOCIADO')

  // ===== Diagnóstico estratégico (V2): métricas derivadas + faixas de volume =====
  const diag = useMemo(() => {
    // Base: produtos do ranking estratégico (já exclui commodity e fora da análise)
    const prods = rankingEstrategico.map((r) => {
      const total = r.total
      return {
        produto: r.produto,
        total,
        principal: r.principal,
        complemento: r.complemento,
        oferta: r.oferta,
        pPrincipal: total > 0 ? (r.principal / total) * 100 : 0,
        pComplemento: total > 0 ? (r.complemento / total) * 100 : 0,
        pOferta: total > 0 ? (r.oferta / total) * 100 : 0,
        participacao: 0,
        faixa: 'MEDIO'
      }
    })
    const totalEstrategico = prods.reduce((s, p) => s + p.total, 0)
    prods.forEach((p) => {
      p.participacao = totalEstrategico > 0 ? (p.total / totalEstrategico) * 100 : 0
    })

    // Faixas por volume, calculadas só entre produtos com venda > 0
    const comVolume = prods.filter((p) => p.total > 0).sort((a, b) => b.total - a.total)
    const n = comVolume.length
    let altoCount = 0
    let baixoCount = 0
    if (n > 0) {
      altoCount = Math.max(1, Math.ceil(n * 0.2))
      baixoCount = n >= 5 ? Math.max(1, Math.ceil(n * 0.2)) : 0
      if (altoCount + baixoCount > n) baixoCount = Math.max(0, n - altoCount)
    }
    comVolume.forEach((p, i) => {
      if (i < altoCount) p.faixa = 'ALTO'
      else if (i >= n - baixoCount) p.faixa = 'BAIXO'
      else p.faixa = 'MEDIO'
    })
    prods.forEach((p) => { if (p.total === 0) p.faixa = 'ZERADO' })

    const campeoes = prods.filter((p) => p.faixa === 'ALTO').sort((a, b) => b.total - a.total)
    const baixaSaida = prods.filter((p) => p.faixa === 'BAIXO').sort((a, b) => a.total - b.total)
    const puxadosOferta = prods.filter((p) => p.total > 0 && p.pOferta >= 40).sort((a, b) => b.pOferta - a.pOferta)
    const puxadosComplemento = prods.filter((p) => p.total > 0 && p.pComplemento >= 30).sort((a, b) => b.pComplemento - a.pComplemento)
    const assinatura = prods.filter((p) => p.produto.produtoAncora).sort((a, b) => b.total - a.total)
    const isca = prods.filter((p) => p.produto.produtoIsca).sort((a, b) => b.total - a.total)
    const zerados = prods.filter((p) => p.total === 0)

    return {
      prods,
      totalEstrategico,
      campeoes,
      baixaSaida,
      puxadosOferta,
      puxadosComplemento,
      assinatura,
      isca,
      zerados
    }
  }, [rankingEstrategico])

  const temImportacao = linhas.length > 0

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Análise de Vendas</h1>
          <div className="page-header-sub">
            Importe o relatório de itens vendidos (Saipos/Excel) para gerar rankings por volume e
            associar aos produtos cadastrados. Esta versão trabalha só com quantidades.
          </div>
        </div>
        {temImportacao && (
          <button type="button" className="btn btn-secondary" onClick={limpar}>
            Limpar importação
          </button>
        )}
      </div>

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {produtosErro && (
        <div className="alert alert-red">
          <div className="alert-msg clr-red">{produtosErro}</div>
        </div>
      )}

      {/* ===== Área de importação ===== */}
      <div className="card" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#c2410b', marginBottom: 4 }}>
              Importar relatório de itens vendidos
            </div>
            <div style={{ fontSize: 12.5, color: '#9a3412', lineHeight: 1.5, maxWidth: 680 }}>
              Aceita .xlsx e .csv. Colunas: <strong>NOME DO ITEM</strong>, QNT PRINCIPAL, QNT
              COMPLEMENTO, OFERTA/COMBO e TOTAL (ou TOTAL QNT). Se o total não vier, é calculado pela
              soma das três quantidades.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              Importar planilha
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setColarAberto((v) => !v)}>
              {colarAberto ? 'Fechar colar' : 'Colar tabela'}
            </button>
          </div>
        </div>

        {colarAberto && (
          <div style={{ marginTop: 12 }}>
            <textarea
              className="form-input"
              rows={6}
              value={colarTexto}
              onChange={(e) => setColarTexto(e.target.value)}
              placeholder={'Cole aqui (com cabeçalho). Ex.:\nNOME DO ITEM\tQNT PRINCIPAL\tQNT COMPLEMENTO\tOFERTA/COMBO\tTOTAL\nX BACON\t500\t251\t300\t1051'}
              style={{ fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }}
            />
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-primary" onClick={handleColar}>
                Analisar texto colado
              </button>
            </div>
          </div>
        )}
      </div>

      {!temImportacao ? (
        <div className="empty-state" style={{ padding: '40px 16px', marginTop: 14 }}>
          Importe uma planilha de itens vendidos para iniciar a análise.
        </div>
      ) : (
        <>
          {/* ===== Métricas ===== */}
          <div className="section-title">Resumo da Importação</div>
          <div className="kpi-grid">
            <Card title="Total Vendido" value={int(m.totalVendido)} hint="Soma de TOTAL" variant="brand" />
            <Card title="Itens Únicos" value={int(m.itensUnicos)} hint="Linhas com nome válido" variant="info" />
            <Card title="Quantidade Principal" value={int(m.somaPrincipal)} hint="Soma de QNT PRINCIPAL" />
            <Card title="Quantidade Complemento" value={int(m.somaComplemento)} hint="Soma de QNT COMPLEMENTO" />
          </div>
          <div className="kpi-grid kpi-grid-3">
            <Card title="Oferta / Combo" value={int(m.somaOferta)} hint="Soma de OFERTA/COMBO" />
            <Card title="Itens Associados" value={int(m.associados)} hint="Linhas ligadas a um produto" variant="success" />
            <Card
              title="Itens Não Identificados"
              value={int(m.naoIdentificados)}
              hint="Sem associação automática"
              variant={m.naoIdentificados > 0 ? 'warn' : 'success'}
            />
          </div>

          {/* ===== Ranking geral ===== */}
          <div className="section-title">Ranking Geral (por volume)</div>
          <div className="table-card">
            <table className="hb-table hb-table-compact">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>Item do relatório</th>
                  <th>Produto associado</th>
                  <th style={{ textAlign: 'right' }}>Principal</th>
                  <th style={{ textAlign: 'right' }}>Complemento</th>
                  <th style={{ textAlign: 'right' }}>Oferta/Combo</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rankingGeral.map((l, i) => {
                  const sm = STATUS_META[l.status] ?? STATUS_META.NAO_IDENTIFICADO
                  return (
                    <tr key={l.id}>
                      <td style={{ color: '#aaa' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500, color: '#111' }}>{l.nomeOriginal}</td>
                      <td>
                        {l.produto ? (
                          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {l.produto.nome}
                            <BadgesProduto p={l.produto} />
                            {ehBebidaCommodity(l.produto) && (
                              <span className="clr-muted" style={{ fontSize: 11 }}>· Bebida commodity</span>
                            )}
                          </span>
                        ) : (
                          <span className="clr-muted">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{int(l.principal)}</td>
                      <td style={{ textAlign: 'right' }}>{int(l.complemento)}</td>
                      <td style={{ textAlign: 'right' }}>{int(l.oferta)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{int(l.total)}</td>
                      <td><span className={'badge ' + sm.cls}>{sm.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Ranking estratégico ===== */}
          <div className="section-title">Ranking Estratégico (por volume)</div>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            Apenas produtos associados, dentro da análise estratégica. Bebidas commodity ficam de fora.
          </div>
          {rankingEstrategico.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              Nenhum produto estratégico associado ainda.
            </div>
          ) : (
            <div className="table-card">
              <table className="hb-table hb-table-compact">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>Principal</th>
                    <th style={{ textAlign: 'right' }}>Complemento</th>
                    <th style={{ textAlign: 'right' }}>Oferta/Combo</th>
                    <th style={{ textAlign: 'right' }}>Total vendido</th>
                    <th>Marcações</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingEstrategico.map((r, i) => (
                    <tr key={r.produto.id}>
                      <td style={{ color: '#aaa' }}>{i + 1}</td>
                      <td style={{ fontWeight: 500, color: '#111' }}>{r.produto.nome}</td>
                      <td style={{ textAlign: 'right' }}>{int(r.principal)}</td>
                      <td style={{ textAlign: 'right' }}>{int(r.complemento)}</td>
                      <td style={{ textAlign: 'right' }}>{int(r.oferta)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{int(r.total)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                          <BadgesProduto p={r.produto} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== Diagnóstico estratégico (V2) ===== */}
          <div className="section-title">Diagnóstico Estratégico</div>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            Leitura gerencial por volume. Considera apenas produtos associados e dentro da análise
            estratégica; bebidas commodity ficam de fora. Não é decisão automática de remoção.
          </div>
          {m.associados === 0 ? (
            <div className="empty-state" style={{ padding: '28px 16px' }}>
              Associe os itens importados aos produtos para gerar o diagnóstico estratégico.
            </div>
          ) : diag.prods.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 16px' }}>
              Nenhum produto elegível para análise estratégica. Verifique se os produtos estão
              marcados para entrar na análise.
            </div>
          ) : (
            <>
              {/* Resumo textual dinâmico */}
              <div className="alert alert-gray" style={{ marginTop: 0, marginBottom: 14 }}>
                <div className="alert-msg" style={{ color: '#555', lineHeight: 1.6 }}>
                  Neste período, <strong>{int(diag.campeoes.length)}</strong> produto(s) concentraram
                  alto volume de vendas. <strong>{int(diag.baixaSaida.length)}</strong> produto(s)
                  tiveram baixa saída. <strong>{int(diag.puxadosOferta.length)}</strong> produto(s)
                  dependem fortemente de oferta/combo, e <strong>{int(diag.puxadosComplemento.length)}</strong>{' '}
                  produto(s) aparecem com alta participação como complemento. Produtos assinatura e
                  isca foram destacados separadamente para evitar decisões erradas de remoção.
                </div>
              </div>

              {/* Cards-resumo do diagnóstico */}
              <div className="kpi-grid">
                <Card title="Alto Volume" value={int(diag.campeoes.length)} hint="Campeões de venda" variant="success" />
                <Card title="Baixo Volume" value={int(diag.baixaSaida.length)} hint="Produtos de baixa saída" variant={diag.baixaSaida.length > 0 ? 'warn' : 'info'} />
                <Card title="Puxados por Oferta/Combo" value={int(diag.puxadosOferta.length)} hint="≥ 40% via oferta/combo" />
                <Card title="Puxados por Complemento" value={int(diag.puxadosComplemento.length)} hint="≥ 30% como complemento" />
              </div>
              <div className="kpi-grid kpi-grid-3">
                <Card title="Assinatura Monitorados" value={int(diag.assinatura.length)} hint="Produtos âncora na análise" />
                <Card title="Isca Monitorados" value={int(diag.isca.length)} hint="Produtos isca na análise" />
                <Card title="Produtos Zerados" value={int(diag.zerados.length)} hint="Sem venda no período" variant={diag.zerados.length > 0 ? 'warn' : 'success'} />
              </div>

              <SubSecaoDiag title="1. Campeões de venda">
                <DiagTabela
                  rows={diag.campeoes}
                  cols={[COL.produto, COL.total, COL.participacao, COL.principal, COL.complemento, COL.oferta, COL.marcacoes]}
                  leitura={leituraCampeao}
                />
              </SubSecaoDiag>

              <SubSecaoDiag title="2. Produtos de baixa saída">
                <DiagTabela
                  rows={diag.baixaSaida}
                  cols={[COL.produto, COL.total, COL.participacao, COL.principal, COL.complemento, COL.oferta, COL.marcacoes]}
                  leitura={leituraBaixaSaida}
                />
              </SubSecaoDiag>

              <SubSecaoDiag title="3. Produtos puxados por oferta/combo">
                <DiagTabela
                  rows={diag.puxadosOferta}
                  cols={[COL.produto, COL.total, COL.oferta, COL.pctOferta, COL.principal, COL.complemento]}
                  leitura={leituraOferta}
                />
              </SubSecaoDiag>

              <SubSecaoDiag title="4. Produtos puxados por complemento">
                <DiagTabela
                  rows={diag.puxadosComplemento}
                  cols={[COL.produto, COL.total, COL.complemento, COL.pctComplemento, COL.principal, COL.oferta]}
                  leitura={leituraComplemento}
                />
              </SubSecaoDiag>

              <SubSecaoDiag title="5. Produtos assinatura">
                <DiagTabela
                  rows={diag.assinatura}
                  cols={[COL.produto, COL.total, COL.faixa, COL.participacao, COL.principal, COL.complemento, COL.oferta]}
                  leitura={leituraAssinatura}
                  vazio="Nenhum produto assinatura na análise."
                />
              </SubSecaoDiag>

              <SubSecaoDiag title="6. Produtos isca">
                <DiagTabela
                  rows={diag.isca}
                  cols={[COL.produto, COL.total, COL.faixa, COL.pctOferta, COL.principal, COL.complemento]}
                  leitura={leituraIsca}
                  vazio="Nenhum produto isca na análise."
                />
              </SubSecaoDiag>

              <SubSecaoDiag title="7. Produtos sem venda">
                <DiagTabela
                  rows={diag.zerados}
                  cols={[
                    COL.produto,
                    {
                      key: 'st',
                      label: 'Status estratégico',
                      render: (p) => (
                        <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          <BadgesProduto p={p.produto} />
                          <span className="clr-muted" style={{ fontSize: 11 }}>Na análise estratégica</span>
                        </span>
                      )
                    }
                  ]}
                  leitura={() => LEITURA_ZERADO}
                  vazio="Nenhum produto sem venda no período."
                />
              </SubSecaoDiag>
            </>
          )}

          {/* ===== Itens não identificados ===== */}
          {naoIdentificadosLista.length > 0 && (
            <>
              <div className="section-title">Itens Não Identificados</div>
              <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
                Associe manualmente a um produto cadastrado. A associação recalcula os rankings na hora.
              </div>
              <div className="table-card">
                <table className="hb-table hb-table-compact">
                  <thead>
                    <tr>
                      <th>Item do relatório</th>
                      <th style={{ textAlign: 'right' }}>Principal</th>
                      <th style={{ textAlign: 'right' }}>Complemento</th>
                      <th style={{ textAlign: 'right' }}>Oferta/Combo</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ minWidth: 240 }}>Associar a produto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {naoIdentificadosLista.map((l) => (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 500, color: '#111' }}>
                          {l.nomeOriginal}
                          {l.status === 'PRECISA_REVISAO' && (
                            <span className="clr-muted" style={{ fontSize: 11 }}> · vários produtos possíveis</span>
                          )}
                          {l.total === 0 && (
                            <span className="clr-muted" style={{ fontSize: 11 }}> · sem volume</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>{int(l.principal)}</td>
                        <td style={{ textAlign: 'right' }}>{int(l.complemento)}</td>
                        <td style={{ textAlign: 'right' }}>{int(l.oferta)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{int(l.total)}</td>
                        <td>
                          <InsumoAutocomplete
                            insumos={produtos}
                            value={manualAssoc[l.id] ? String(manualAssoc[l.id]) : ''}
                            onChange={(v) =>
                              setManualAssoc((prev) => ({ ...prev, [l.id]: v ? Number(v) : undefined }))
                            }
                            placeholder="Buscar produto para associar..."
                            getOptionLabel={(p) =>
                              `${p.nome} · ${(p.tipoProduto ?? 'PRODUTO') === 'BEBIDA' ? 'Bebida' : (p.tipoProduto ?? 'PRODUTO') === 'COMBO' ? 'Combo' : 'Produto'}`
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
