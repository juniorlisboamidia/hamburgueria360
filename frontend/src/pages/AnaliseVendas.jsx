// Análise de Vendas — V0 (estrutura base). Tela preparatória e explicativa:
// a importação real de relatórios da Saipos chega em uma próxima fase.

const SECOES = [
  {
    titulo: 'Importação Saipos',
    badge: { label: 'Em breve', cls: 'badge-orange' },
    texto: 'Envie um relatório Excel/CSV da Saipos para cruzar vendas com fichas técnicas.'
  },
  {
    titulo: 'Associação de produtos',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Produtos vendidos serão associados aos produtos cadastrados no sistema por nome ou associação manual.'
  },
  {
    titulo: 'Ranking estratégico',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Bebidas commodity ficam fora do ranking principal por padrão.'
  },
  {
    titulo: 'Produtos candidatos a sair',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Produtos com baixa venda, baixa margem e insumos exclusivos serão sinalizados para revisão.'
  },
  {
    titulo: 'Produtos âncora',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Produtos marcados como assinatura da marca não serão recomendados automaticamente para remoção.'
  }
]

export default function AnaliseVendas() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Análise de Vendas</h1>
          <div className="page-header-sub">
            Importe relatórios de itens vendidos para entender performance do cardápio, margem,
            produtos mais vendidos e candidatos a sair.
          </div>
        </div>
        <span className="badge badge-gray">Em construção</span>
      </div>

      {/* Bloco de destaque: importação Saipos (estado aguardando modelo) */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          background: '#fff7ed',
          border: '1px solid #fed7aa'
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#c2410b', marginBottom: 4 }}>
            Importação de vendas (Saipos)
          </div>
          <div style={{ fontSize: 12.5, color: '#9a3412', lineHeight: 1.5, maxWidth: 640 }}>
            Em breve você poderá enviar um relatório Excel/CSV da Saipos para cruzar vendas reais
            com as fichas técnicas e a precificação já cadastradas.
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled>
          Importar relatório (em breve)
        </button>
      </div>

      <div className="section-title">O que esta área vai oferecer</div>
      <div className="grid-3" style={{ alignItems: 'start' }}>
        {SECOES.map((s) => (
          <div key={s.titulo} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 8
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#111' }}>{s.titulo}</span>
              <span className={'badge ' + s.badge.cls}>{s.badge.label}</span>
            </div>
            <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.55 }}>{s.texto}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: '#999', marginTop: 14, lineHeight: 1.5 }}>
        Esta é a estrutura base do módulo. As marcações de “Inteligência do cardápio” feitas em
        Produtos (produto âncora, inclusão no ranking e tipo de bebida) alimentarão estas análises.
      </div>
    </div>
  )
}
