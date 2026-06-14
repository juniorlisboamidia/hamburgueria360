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
          <div className="grid-4">
            <Card title="Total Vendido" value={int(m.totalVendido)} hint="Soma de TOTAL" variant="brand" />
            <Card title="Itens Únicos" value={int(m.itensUnicos)} hint="Linhas com nome válido" variant="info" />
            <Card title="Quantidade Principal" value={int(m.somaPrincipal)} hint="Soma de QNT PRINCIPAL" />
            <Card title="Quantidade Complemento" value={int(m.somaComplemento)} hint="Soma de QNT COMPLEMENTO" />
          </div>
          <div className="grid-3">
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
