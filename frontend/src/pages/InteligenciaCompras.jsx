// Inteligência de Compras — V0 (estrutura base). Tela preparatória para a
// Curva ABC, consumo estimado e análise de estoque/compras (próxima fase).

const SECOES = [
  {
    titulo: 'Curva ABC de insumos',
    badge: { label: 'Em breve', cls: 'badge-orange' },
    texto: 'Classifique insumos por impacto financeiro no consumo estimado.'
  },
  {
    titulo: 'Consumo estimado',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Calcule quanto cada produto vendido consumiu de insumos.'
  },
  {
    titulo: 'Insumos sem giro',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Identifique insumos cadastrados que não aparecem nas vendas ou fichas técnicas.'
  },
  {
    titulo: 'Insumos exclusivos',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Veja insumos usados por poucos produtos e possíveis travas de estoque.'
  },
  {
    titulo: 'Sugestões futuras',
    badge: { label: 'Planejado', cls: 'badge-blue' },
    texto: 'Base para negociação, compra e redução de desperdício.'
  }
]

export default function InteligenciaCompras() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inteligência de Compras</h1>
          <div className="page-header-sub">
            Use vendas reais e fichas técnicas para entender consumo de insumos, Curva ABC e
            oportunidades de compra.
          </div>
        </div>
        <span className="badge badge-gray">Em construção</span>
      </div>

      {/* Bloco de destaque: Curva ABC (depende das vendas importadas) */}
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
            Curva ABC de insumos
          </div>
          <div style={{ fontSize: 12.5, color: '#9a3412', lineHeight: 1.5, maxWidth: 640 }}>
            Em breve, a partir das vendas importadas e das fichas técnicas, calcularemos o consumo
            estimado de cada insumo e sua classificação ABC por impacto financeiro.
          </div>
        </div>
        <button type="button" className="btn btn-primary" disabled>
          Calcular Curva ABC (em breve)
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
        Esta é a estrutura base do módulo. O cálculo de Curva ABC e consumo estimado será
        implementado na próxima fase, usando as vendas reais e as fichas técnicas existentes.
      </div>
    </div>
  )
}
