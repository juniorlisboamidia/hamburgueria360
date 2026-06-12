import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Hamburgueria 360 API running'
  });
});

// ===== Insumos =====

const TIPOS_INSUMO = [
  'INGREDIENTE',
  'PRODUCAO_PROPRIA',
  'BEBIDA',
  'HORTIFRUTI',
  'EMBALAGEM',
  'ACOMPANHAMENTO',
  'OPERACIONAL'
];

// Unidades padronizadas: Kg (custo por 1 kg; quantidades em ficha/receita lançadas em gramas),
// L (custo por 1 litro; quantidades lançadas em ml) e Und (custo por 1 unidade).
function normalizeUnidade(u) {
  if (typeof u !== 'string') return null;
  const v = u.trim().toLowerCase();
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg';
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L';
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und';
  return null;
}

// Converte a quantidade informada para a base do custo unitário:
// Kg (gramas) e L (ml) dividem por 1000; Und usa direto.
function quantidadeBase(quantidade, unidadeInsumo) {
  const q = Number(quantidade);
  const u = normalizeUnidade(unidadeInsumo);
  return u === 'Kg' || u === 'L' ? q / 1000 : q;
}

// Unidade em que a quantidade deve ser informada/exibida na ficha ou receita
function unidadeQuantidade(unidadeInsumo) {
  const u = normalizeUnidade(unidadeInsumo);
  if (u === 'Kg') return 'g';
  if (u === 'L') return 'ml';
  return 'und';
}

function insumoComUnidadeNormalizada(insumo) {
  if (!insumo) return insumo;
  const norm = normalizeUnidade(insumo.unidade);
  return norm ? { ...insumo, unidade: norm } : insumo;
}

app.get('/api/insumos', async (req, res) => {
  try {
    const insumos = await prisma.insumo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      // Resumo da receita própria: a ficha técnica usa modoRendimento/pesoPorcao
      // para oferecer o uso por unidade/porção
      include: {
        receitaProducao: {
          select: { modoRendimento: true, quantidadePorcoes: true, pesoPorcao: true }
        }
      }
    });
    res.json(insumos.map(insumoComUnidadeNormalizada));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar insumos' });
  }
});

app.post('/api/insumos', async (req, res) => {
  try {
    const { nome, unidade, custoUnitario, fornecedor, tipo } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    const unidadeNormalizada = normalizeUnidade(unidade);
    if (!unidadeNormalizada) {
      return res.status(400).json({ error: 'Unidade inválida. Use Kg, L ou Und.' });
    }
    if (tipo !== undefined && tipo !== null && !TIPOS_INSUMO.includes(tipo)) {
      return res.status(400).json({
        error: `tipo inválido. Tipos permitidos: ${TIPOS_INSUMO.join(', ')}`
      });
    }

    // Produção própria nasce com custo 0 (calculado depois pela receita);
    // demais tipos exigem custo informado e maior que zero.
    const tipoFinal = tipo ?? 'INGREDIENTE';
    let custoUnitarioFinal;
    if (tipoFinal === 'PRODUCAO_PROPRIA') {
      if (custoUnitario === undefined || custoUnitario === null || custoUnitario === '') {
        custoUnitarioFinal = 0;
      } else if (isNaN(Number(custoUnitario)) || Number(custoUnitario) < 0) {
        return res.status(400).json({ error: 'custoUnitario inválido' });
      } else {
        custoUnitarioFinal = Number(custoUnitario);
      }
    } else {
      if (
        custoUnitario === undefined ||
        custoUnitario === null ||
        custoUnitario === '' ||
        isNaN(Number(custoUnitario)) ||
        Number(custoUnitario) <= 0
      ) {
        return res.status(400).json({ error: 'Informe um custo unitário maior que zero.' });
      }
      custoUnitarioFinal = Number(custoUnitario);
    }

    const insumo = await prisma.insumo.create({
      data: {
        nome: nome.trim(),
        tipo: tipoFinal,
        unidade: unidadeNormalizada,
        custoUnitario: custoUnitarioFinal,
        fornecedor: fornecedor ? String(fornecedor).trim() : null,
        ativo: true
      }
    });

    res.status(201).json(insumo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar insumo' });
  }
});

app.put('/api/insumos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.insumo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    const { nome, unidade, custoUnitario, fornecedor, ativo, tipo } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (tipo !== undefined) {
      if (!TIPOS_INSUMO.includes(tipo)) {
        return res.status(400).json({
          error: `tipo inválido. Tipos permitidos: ${TIPOS_INSUMO.join(', ')}`
        });
      }
      data.tipo = tipo;
    }
    if (unidade !== undefined) {
      const unidadeNormalizada = normalizeUnidade(unidade);
      if (!unidadeNormalizada) {
        return res.status(400).json({ error: 'Unidade inválida. Use Kg, L ou Und.' });
      }
      data.unidade = unidadeNormalizada;
    }
    if (custoUnitario !== undefined) {
      // Regra por tipo final: produção própria aceita 0 (custo vem da receita);
      // demais tipos exigem custo maior que zero. Se não enviado, preserva o atual.
      const tipoFinal = data.tipo ?? existing.tipo;
      if (tipoFinal === 'PRODUCAO_PROPRIA') {
        if (custoUnitario === null || custoUnitario === '' || isNaN(Number(custoUnitario))) {
          return res.status(400).json({ error: 'custoUnitario inválido' });
        }
        if (Number(custoUnitario) < 0) {
          return res.status(400).json({ error: 'custoUnitario deve ser maior ou igual a zero' });
        }
      } else {
        if (
          custoUnitario === null ||
          custoUnitario === '' ||
          isNaN(Number(custoUnitario)) ||
          Number(custoUnitario) <= 0
        ) {
          return res.status(400).json({ error: 'Informe um custo unitário maior que zero.' });
        }
      }
      data.custoUnitario = Number(custoUnitario);
    }
    if (fornecedor !== undefined) {
      data.fornecedor =
        fornecedor === null || fornecedor === '' ? null : String(fornecedor).trim();
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }

    const updated = await prisma.insumo.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar insumo' });
  }
});

app.delete('/api/insumos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.insumo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    const desativado = await prisma.insumo.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar insumo' });
  }
});

// ===== Receita de Produção Própria =====

const round4 = (n) => Number(n.toFixed(4));

// Normaliza a unidade do rendimento da receita (inclui g e ml, além das unidades de insumo)
function normalizeUnidadeRendimento(u) {
  const v = String(u ?? '').trim().toLowerCase();
  if (['g', 'gr', 'grama', 'gramas'].includes(v)) return 'g';
  if (['ml', 'mililitro', 'mililitros'].includes(v)) return 'ml';
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg';
  if (['l', 'lt', 'litro', 'litros'].includes(v)) return 'L';
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und';
  if (['porcoes', 'porções', 'porcao', 'porção', 'porc'].includes(v)) return 'Porções';
  return null;
}

// Converte o rendimento informado para a unidade base do insumo produzido.
// Retorna null quando a unidade do rendimento é incompatível com a do insumo.
function rendimentoBaseReceita(rendimento, unidadeRendimento, unidadeInsumoProduzido) {
  const r = Number(rendimento);
  if (!Number.isFinite(r) || r <= 0) return null;
  const ui = normalizeUnidade(unidadeInsumoProduzido);
  const ur = normalizeUnidadeRendimento(unidadeRendimento);
  if (ui === 'Kg') {
    if (ur === 'g') return r / 1000;
    if (ur === 'Kg') return r;
    return null;
  }
  if (ui === 'L') {
    if (ur === 'ml') return r / 1000;
    if (ur === 'L') return r;
    return null;
  }
  if (ui === 'Und') {
    if (ur === 'Und' || ur === 'Porções') return r;
    return null;
  }
  // unidade do insumo desconhecida (legado): usa o rendimento direto
  return r;
}

function computeReceita(receita) {
  // Mesma regra da ficha técnica: ingrediente em Kg tem quantidade informada em gramas
  const itens = receita.itens.map((item) => ({
    ...item,
    insumo: insumoComUnidadeNormalizada(item.insumo),
    unidadeQuantidadeReceita: unidadeQuantidade(item.insumo?.unidade),
    custoItem: round4(
      quantidadeBase(item.quantidade, item.insumo.unidade) * Number(item.insumo.custoUnitario)
    )
  }));
  const custoTotalReceita = round4(itens.reduce((s, i) => s + i.custoItem, 0));
  const rendimento = Number(receita.rendimento);
  // Rendimento convertido para a unidade base do insumo produzido (ex.: 3800 g → 3,8 Kg).
  // null = rendimento não informado ou unidade incompatível com o insumo.
  const rendimentoBase = rendimentoBaseReceita(
    receita.rendimento,
    receita.unidadeRendimento,
    receita.insumo?.unidade
  );
  const custoPorRendimento =
    rendimentoBase !== null && rendimentoBase > 0
      ? round4(custoTotalReceita / rendimentoBase)
      : null;
  const pesoPorcao =
    receita.pesoPorcao === null || receita.pesoPorcao === undefined
      ? null
      : Number(receita.pesoPorcao);
  const custoPorPorcao =
    pesoPorcao && pesoPorcao > 0 && custoPorRendimento !== null
      ? round4(custoPorRendimento * pesoPorcao)
      : null;
  return {
    ...receita,
    insumo: receita.insumo ? insumoComUnidadeNormalizada(receita.insumo) : receita.insumo,
    itens,
    custoTotalReceita,
    rendimentoBase: rendimentoBase === null ? null : round4(rendimentoBase),
    rendimentoIncompativel: rendimento > 0 && rendimentoBase === null,
    custoPorRendimento,
    custoPorPorcao
  };
}

async function getReceitaCompleta(insumoId) {
  const receita = await prisma.receitaProducao.findUnique({
    where: { insumoId },
    include: {
      itens: { include: { insumo: true }, orderBy: { id: 'asc' } },
      insumo: true
    }
  });
  return receita ? computeReceita(receita) : null;
}

function insumoResumo(insumo) {
  return {
    id: insumo.id,
    nome: insumo.nome,
    tipo: insumo.tipo,
    unidade: normalizeUnidade(insumo.unidade) ?? insumo.unidade,
    custoUnitario: insumo.custoUnitario
  };
}

app.get('/api/insumos/:id/receita', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }
    const receita = await getReceitaCompleta(id);
    res.json({ insumo: insumoResumo(insumo), receita });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar receita' });
  }
});

app.post('/api/insumos/:id/receita', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }
    if (insumo.tipo !== 'PRODUCAO_PROPRIA') {
      return res.status(400).json({
        error: 'Receita só pode ser cadastrada para insumos do tipo PRODUCAO_PROPRIA'
      });
    }

    const {
      rendimento,
      unidadeRendimento,
      modoRendimento,
      quantidadePorcoes,
      pesoPorcao,
      unidadePorcao,
      observacoes
    } = req.body ?? {};

    // Rendimento agora é opcional: 0 = ainda não informado. Isso permite criar a
    // receita e adicionar ingredientes antes de saber o rendimento final; o custo
    // unitário calculado só existe quando rendimento > 0 (computeReceita já trata).
    let rendimentoFinal = 0;
    if (rendimento !== undefined && rendimento !== null && rendimento !== '') {
      if (isNaN(Number(rendimento)) || Number(rendimento) < 0) {
        return res.status(400).json({ error: 'rendimento deve ser numérico e maior ou igual a zero' });
      }
      rendimentoFinal = Number(rendimento);
    }
    let unidadeRendimentoFinal =
      typeof unidadeRendimento === 'string' ? unidadeRendimento.trim() : '';
    if (pesoPorcao !== undefined && pesoPorcao !== null && pesoPorcao !== '') {
      if (isNaN(Number(pesoPorcao)) || Number(pesoPorcao) <= 0) {
        return res.status(400).json({ error: 'pesoPorcao deve ser numérico e maior que zero' });
      }
    }
    const pesoPorcaoFinal =
      pesoPorcao === undefined || pesoPorcao === null || pesoPorcao === ''
        ? null
        : Number(pesoPorcao);

    // Modo de rendimento: TOTAL (informa o total direto, comportamento original)
    // ou PORCOES (informa quantidade × tamanho e o total é calculado aqui).
    // Receitas antigas não têm o campo e seguem como TOTAL.
    const modoFinal = modoRendimento === 'PORCOES' ? 'PORCOES' : 'TOTAL';
    let quantidadePorcoesFinal = null;
    if (quantidadePorcoes !== undefined && quantidadePorcoes !== null && quantidadePorcoes !== '') {
      if (isNaN(Number(quantidadePorcoes)) || Number(quantidadePorcoes) <= 0) {
        return res.status(400).json({ error: 'quantidadePorcoes deve ser numérica e maior que zero' });
      }
      quantidadePorcoesFinal = Number(quantidadePorcoes);
    }

    let unidadePorcaoFinal =
      unidadePorcao === undefined || unidadePorcao === null || String(unidadePorcao).trim() === ''
        ? null
        : String(unidadePorcao).trim();

    if (modoFinal === 'PORCOES') {
      if (quantidadePorcoesFinal === null) {
        return res.status(400).json({
          error: 'quantidadePorcoes é obrigatória no modo de rendimento por porções'
        });
      }
      const ui = normalizeUnidade(insumo.unidade);
      if (ui === 'Kg' || ui === 'L') {
        if (pesoPorcaoFinal === null) {
          return res.status(400).json({
            error:
              'pesoPorcao (tamanho de cada unidade/porção) é obrigatório no modo por porções para insumo em ' +
              ui
          });
        }
        rendimentoFinal = quantidadePorcoesFinal * pesoPorcaoFinal;
        unidadeRendimentoFinal = ui === 'Kg' ? 'g' : 'ml';
        unidadePorcaoFinal = ui === 'Kg' ? 'g' : 'ml';
      } else {
        // Und (ou legado): cada porção é 1 unidade; tamanho é apenas informativo
        rendimentoFinal = quantidadePorcoesFinal;
        unidadeRendimentoFinal = 'Und';
      }
    }

    if (rendimentoFinal > 0 && unidadeRendimentoFinal === '') {
      return res.status(400).json({
        error: 'unidadeRendimento é obrigatória quando o rendimento é informado'
      });
    }

    const data = {
      rendimento: rendimentoFinal,
      unidadeRendimento: unidadeRendimentoFinal,
      modoRendimento: modoFinal,
      quantidadePorcoes: modoFinal === 'PORCOES' ? quantidadePorcoesFinal : null,
      pesoPorcao: pesoPorcaoFinal,
      unidadePorcao: unidadePorcaoFinal,
      observacoes:
        observacoes === undefined || observacoes === null || String(observacoes).trim() === ''
          ? null
          : String(observacoes).trim()
    };

    await prisma.receitaProducao.upsert({
      where: { insumoId: id },
      create: { insumoId: id, ...data },
      update: data
    });

    const receita = await getReceitaCompleta(id);
    res.json({ insumo: insumoResumo(insumo), receita });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao salvar receita' });
  }
});

app.post('/api/insumos/:id/receita/itens', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const receita = await prisma.receitaProducao.findUnique({ where: { insumoId: id } });
    if (!receita) {
      return res.status(400).json({
        error: 'Cadastre primeiro os dados da receita (rendimento) antes de adicionar ingredientes'
      });
    }

    const { insumoId, quantidade } = req.body ?? {};
    const ingredienteId = Number(insumoId);
    if (!Number.isInteger(ingredienteId) || ingredienteId <= 0) {
      return res.status(400).json({ error: 'insumoId inválido' });
    }
    if (ingredienteId === id) {
      return res.status(400).json({
        error: 'Uma receita não pode usar o próprio insumo como ingrediente'
      });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    const ingrediente = await prisma.insumo.findUnique({ where: { id: ingredienteId } });
    if (!ingrediente || !ingrediente.ativo) {
      return res.status(404).json({ error: 'Insumo ingrediente não encontrado ou inativo' });
    }
    if (ingrediente.tipo === 'PRODUCAO_PROPRIA') {
      return res.status(400).json({
        error:
          'Nesta versão, uma receita não pode usar outro insumo de produção própria como ingrediente'
      });
    }

    const existente = await prisma.receitaProducaoItem.findUnique({
      where: { receitaId_insumoId: { receitaId: receita.id, insumoId: ingredienteId } }
    });
    if (existente) {
      return res.status(409).json({
        error: 'Esse insumo já está na receita. Edite a quantidade do item existente.'
      });
    }

    await prisma.receitaProducaoItem.create({
      data: {
        receitaId: receita.id,
        insumoId: ingredienteId,
        quantidade: Number(quantidade)
      }
    });

    const insumo = await prisma.insumo.findUnique({ where: { id } });
    const receitaCompleta = await getReceitaCompleta(id);
    res.status(201).json({ insumo: insumoResumo(insumo), receita: receitaCompleta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao adicionar ingrediente' });
  }
});

app.put('/api/receitas-producao/itens/:itemId', async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'itemId inválido' });
    }
    const item = await prisma.receitaProducaoItem.findUnique({
      where: { id: itemId },
      include: { receita: true }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item da receita não encontrado' });
    }

    const { quantidade } = req.body ?? {};
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    await prisma.receitaProducaoItem.update({
      where: { id: itemId },
      data: { quantidade: Number(quantidade) }
    });

    const insumo = await prisma.insumo.findUnique({ where: { id: item.receita.insumoId } });
    const receitaCompleta = await getReceitaCompleta(item.receita.insumoId);
    res.json({ insumo: insumoResumo(insumo), receita: receitaCompleta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar ingrediente' });
  }
});

app.delete('/api/receitas-producao/itens/:itemId', async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'itemId inválido' });
    }
    const item = await prisma.receitaProducaoItem.findUnique({
      where: { id: itemId },
      include: { receita: true }
    });
    if (!item) {
      return res.status(404).json({ error: 'Item da receita não encontrado' });
    }

    await prisma.receitaProducaoItem.delete({ where: { id: itemId } });

    const insumo = await prisma.insumo.findUnique({ where: { id: item.receita.insumoId } });
    const receitaCompleta = await getReceitaCompleta(item.receita.insumoId);
    res.json({ insumo: insumoResumo(insumo), receita: receitaCompleta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover ingrediente' });
  }
});

app.post('/api/insumos/:id/receita/atualizar-custo', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }
    const insumo = await prisma.insumo.findUnique({ where: { id } });
    if (!insumo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }
    if (insumo.tipo !== 'PRODUCAO_PROPRIA') {
      return res.status(400).json({
        error: 'Apenas insumos do tipo PRODUCAO_PROPRIA podem ter custo calculado por receita'
      });
    }

    const receita = await getReceitaCompleta(id);
    if (!receita) {
      return res.status(400).json({ error: 'Este insumo ainda não possui receita cadastrada' });
    }
    if (receita.itens.length === 0) {
      return res.status(400).json({
        error: 'A receita não possui ingredientes. Adicione ingredientes antes de atualizar o custo.'
      });
    }
    if (receita.custoPorRendimento === null) {
      return res.status(400).json({
        error: receita.rendimentoIncompativel
          ? 'A unidade do rendimento não é compatível com a unidade cadastrada para este insumo. Ajuste a unidade do rendimento ou edite a unidade do insumo produzido.'
          : 'Informe o rendimento da receita para calcular o custo do insumo.'
      });
    }

    const atualizado = await prisma.insumo.update({
      where: { id },
      data: { custoUnitario: receita.custoPorRendimento }
    });

    const receitaRecalculada = await getReceitaCompleta(id);
    res.json({ insumo: atualizado, receita: receitaRecalculada });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar custo do insumo' });
  }
});

// ===== Produtos =====

app.get('/api/produtos', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(produtos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar produtos' });
  }
});

const TIPOS_PRODUTO = ['PRODUTO', 'BEBIDA', 'COMBO'];

app.post('/api/produtos', async (req, res) => {
  try {
    const { nome, descricao, precoVenda, tipoProduto, custoDireto } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (precoVenda === undefined || precoVenda === null || isNaN(Number(precoVenda))) {
      return res.status(400).json({ error: 'precoVenda é obrigatório e deve ser numérico' });
    }
    if (Number(precoVenda) < 0) {
      return res.status(400).json({ error: 'precoVenda deve ser maior ou igual a zero' });
    }
    const tipoFinal = tipoProduto === undefined || tipoProduto === null ? 'PRODUTO' : tipoProduto;
    if (!TIPOS_PRODUTO.includes(tipoFinal)) {
      return res.status(400).json({ error: 'tipoProduto deve ser PRODUTO, BEBIDA ou COMBO' });
    }
    if (custoDireto !== undefined && custoDireto !== null && custoDireto !== '') {
      if (isNaN(Number(custoDireto)) || Number(custoDireto) < 0) {
        return res.status(400).json({ error: 'custoDireto deve ser numérico e maior ou igual a zero' });
      }
    }

    const produto = await prisma.produto.create({
      data: {
        nome: nome.trim(),
        descricao: descricao ? String(descricao).trim() : null,
        precoVenda: Number(precoVenda),
        tipoProduto: tipoFinal,
        custoDireto:
          custoDireto === undefined || custoDireto === null || custoDireto === ''
            ? null
            : Number(custoDireto),
        ativo: true
      }
    });

    res.status(201).json(produto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar produto' });
  }
});

app.put('/api/produtos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.produto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const { nome, descricao, precoVenda, ativo, tipoProduto, custoDireto } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (tipoProduto !== undefined) {
      if (!TIPOS_PRODUTO.includes(tipoProduto)) {
        return res.status(400).json({ error: 'tipoProduto deve ser PRODUTO, BEBIDA ou COMBO' });
      }
      data.tipoProduto = tipoProduto;
    }
    if (custoDireto !== undefined) {
      if (custoDireto === null || custoDireto === '') {
        data.custoDireto = null;
      } else if (isNaN(Number(custoDireto)) || Number(custoDireto) < 0) {
        return res.status(400).json({ error: 'custoDireto deve ser numérico e maior ou igual a zero' });
      } else {
        data.custoDireto = Number(custoDireto);
      }
    }
    if (descricao !== undefined) {
      data.descricao =
        descricao === null || descricao === '' ? null : String(descricao).trim();
    }
    if (precoVenda !== undefined) {
      if (precoVenda === null || isNaN(Number(precoVenda))) {
        return res.status(400).json({ error: 'precoVenda inválido' });
      }
      if (Number(precoVenda) < 0) {
        return res.status(400).json({ error: 'precoVenda deve ser maior ou igual a zero' });
      }
      data.precoVenda = Number(precoVenda);
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }

    const updated = await prisma.produto.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar produto' });
  }
});

app.delete('/api/produtos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.produto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const desativado = await prisma.produto.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar produto' });
  }
});

// Duplica produto/bebida/combo: novo registro "(cópia)" nascendo ATIVO.
// PRODUTO copia a ficha técnica (ficha independente da original); COMBO copia
// a composição apontando para os mesmos produtos/bebidas (sem duplicá-los).
app.post('/api/produtos/:id/duplicar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const original = await prisma.produto.findUnique({
      where: { id },
      include: { fichaTecnica: true, comboItens: true }
    });
    if (!original || !original.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const tipo = original.tipoProduto ?? 'PRODUTO';

    const novo = await prisma.$transaction(async (tx) => {
      const criado = await tx.produto.create({
        data: {
          nome: `${original.nome} (cópia)`,
          descricao: original.descricao,
          precoVenda: original.precoVenda,
          tipoProduto: tipo,
          custoDireto: original.custoDireto,
          ativo: true
        }
      });

      if (tipo === 'PRODUTO' && original.fichaTecnica.length > 0) {
        await tx.fichaTecnicaItem.createMany({
          data: original.fichaTecnica.map((item) => ({
            produtoId: criado.id,
            insumoId: item.insumoId,
            quantidade: item.quantidade,
            modoUsoQuantidade: item.modoUsoQuantidade,
            tipoUso: item.tipoUso,
            formaRateio: item.formaRateio,
            quantidadeAtendida: item.quantidadeAtendida,
            aplicarMargem: item.aplicarMargem
          }))
        });
      }

      if (tipo === 'COMBO' && original.comboItens.length > 0) {
        await tx.comboItem.createMany({
          data: original.comboItens.map((item) => ({
            comboId: criado.id,
            produtoId: item.produtoId,
            quantidade: item.quantidade
          }))
        });
      }

      return criado;
    });

    res.status(201).json(novo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao duplicar produto' });
  }
});

// ===== Itens de Combo =====
// Combo é composto por produtos/bebidas prontos (nunca insumos, nunca outro combo)

const COMBO_ITEM_INCLUDE = {
  produto: { include: { fichaTecnica: { include: { insumo: { include: { receitaProducao: true } } } } } }
};

// Custo real de um item filho do combo: PRODUTO usa o custo total real da
// ficha técnica; BEBIDA usa o custo direto de compra (0 quando não informado)
function custoRealItemCombo(produto) {
  if ((produto.tipoProduto ?? 'PRODUTO') === 'BEBIDA') {
    return produto.custoDireto === null || produto.custoDireto === undefined
      ? 0
      : Number(produto.custoDireto);
  }
  return computeFichaTotals(produto.fichaTecnica ?? []).custoTotalFicha;
}

function comboItemOut(item) {
  const round2 = (n) => Number(n.toFixed(2));
  const qtd = Number(item.quantidade);
  const precoUnit = Number(item.produto.precoVenda);
  const custoUnit = custoRealItemCombo(item.produto);
  return {
    id: item.id,
    comboId: item.comboId,
    produtoId: item.produtoId,
    nome: item.produto.nome,
    tipoProduto: item.produto.tipoProduto ?? 'PRODUTO',
    quantidade: qtd,
    precoVendaUnitario: round2(precoUnit),
    custoRealUnitario: round2(custoUnit),
    totalVenda: round2(precoUnit * qtd),
    totalCusto: round2(custoUnit * qtd)
  };
}

async function findComboAtivo(id) {
  if (!Number.isInteger(id) || id <= 0) return { error: 'id inválido', status: 400 };
  const combo = await prisma.produto.findUnique({ where: { id } });
  if (!combo || !combo.ativo) return { error: 'Combo não encontrado', status: 404 };
  if ((combo.tipoProduto ?? 'PRODUTO') !== 'COMBO') {
    return { error: 'Itens de combo só existem para produtos do tipo COMBO', status: 400 };
  }
  return { combo };
}

app.get('/api/produtos/:id/combo-itens', async (req, res) => {
  try {
    const { error, status } = await findComboAtivo(Number(req.params.id));
    if (error) return res.status(status).json({ error });
    const itens = await prisma.comboItem.findMany({
      where: { comboId: Number(req.params.id) },
      include: COMBO_ITEM_INCLUDE,
      orderBy: { id: 'asc' }
    });
    res.json(itens.map(comboItemOut));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar itens do combo' });
  }
});

app.post('/api/produtos/:id/combo-itens', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });

    const { produtoId, quantidade } = req.body ?? {};
    if (!Number.isInteger(Number(produtoId)) || Number(produtoId) <= 0) {
      return res.status(400).json({ error: 'produtoId inválido' });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser maior que zero' });
    }
    if (Number(produtoId) === comboId) {
      return res.status(400).json({ error: 'O combo não pode conter ele mesmo' });
    }
    const filho = await prisma.produto.findUnique({ where: { id: Number(produtoId) } });
    if (!filho || !filho.ativo) {
      return res.status(404).json({ error: 'Produto/bebida não encontrado ou inativo' });
    }
    if ((filho.tipoProduto ?? 'PRODUTO') === 'COMBO') {
      return res.status(400).json({ error: 'Combo não pode conter outro combo. Adicione produtos e bebidas.' });
    }

    // Mesmo item adicionado de novo: soma a quantidade (consolidado por item)
    const existente = await prisma.comboItem.findUnique({
      where: { comboId_produtoId: { comboId, produtoId: Number(produtoId) } }
    });
    const item = existente
      ? await prisma.comboItem.update({
          where: { id: existente.id },
          data: { quantidade: Number(existente.quantidade) + Number(quantidade) },
          include: COMBO_ITEM_INCLUDE
        })
      : await prisma.comboItem.create({
          data: { comboId, produtoId: Number(produtoId), quantidade: Number(quantidade) },
          include: COMBO_ITEM_INCLUDE
        });

    res.status(201).json(comboItemOut(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao adicionar item ao combo' });
  }
});

app.put('/api/produtos/:id/combo-itens/:itemId', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });

    const existente = await prisma.comboItem.findUnique({ where: { id: itemId } });
    if (!existente || existente.comboId !== comboId) {
      return res.status(404).json({ error: 'Item não encontrado neste combo' });
    }
    const { quantidade } = req.body ?? {};
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }
    const item = await prisma.comboItem.update({
      where: { id: itemId },
      data: { quantidade: Number(quantidade) },
      include: COMBO_ITEM_INCLUDE
    });
    res.json(comboItemOut(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar item do combo' });
  }
});

app.delete('/api/produtos/:id/combo-itens/:itemId', async (req, res) => {
  try {
    const comboId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { error, status } = await findComboAtivo(comboId);
    if (error) return res.status(status).json({ error });
    const existente = await prisma.comboItem.findUnique({ where: { id: itemId } });
    if (!existente || existente.comboId !== comboId) {
      return res.status(404).json({ error: 'Item não encontrado neste combo' });
    }
    await prisma.comboItem.delete({ where: { id: itemId } });
    res.json({ id: itemId, deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover item do combo' });
  }
});

// ===== Ficha Técnica =====

const TIPOS_USO_FICHA = ['INGREDIENTE', 'EMBALAGEM', 'ACOMPANHAMENTO', 'OPERACIONAL'];
const FORMAS_RATEIO_FICHA = ['POR_PRODUTO', 'POR_EMBALAGEM', 'POR_PEDIDO'];

// tipoUso/aplicarMargem sugeridos a partir do tipo do insumo
function defaultsUsoPorTipoInsumo(tipoInsumo) {
  if (tipoInsumo === 'EMBALAGEM') return { tipoUso: 'EMBALAGEM', aplicarMargem: false };
  if (tipoInsumo === 'ACOMPANHAMENTO') return { tipoUso: 'ACOMPANHAMENTO', aplicarMargem: false };
  if (tipoInsumo === 'OPERACIONAL') return { tipoUso: 'OPERACIONAL', aplicarMargem: false };
  return { tipoUso: 'INGREDIENTE', aplicarMargem: true };
}

// custoBruto = quantidadeBase × custoUnitario
// (insumo em Kg: quantidade informada em gramas, convertida com /1000; em Und: direto)
// custoAplicado = custoBruto / quantidadeAtendida (POR_EMBALAGEM e POR_PEDIDO)
// Include padrão para itens da ficha técnica: o insumo + receita própria
// (a receita é necessária para calcular itens em modo PORCAO)
const FICHA_INSUMO_INCLUDE = { insumo: { include: { receitaProducao: true } } };

// Custo de uma porção/unidade da receita própria, na unidade base do insumo.
// Kg/L: pesoPorcao (g/ml) convertido para a base × custo unitário; Und: 1 porção
// = 1 unidade. Retorna null quando não dá para calcular (sem receita/pesoPorcao).
function custoPorPorcaoInsumo(insumo) {
  const receita = insumo?.receitaProducao;
  if (!receita) return null;
  const ui = normalizeUnidade(insumo.unidade);
  if (ui === 'Kg' || ui === 'L') {
    const peso = Number(receita.pesoPorcao);
    if (!Number.isFinite(peso) || peso <= 0) return null;
    return (peso / 1000) * Number(insumo.custoUnitario);
  }
  return Number(insumo.custoUnitario);
}

function computeItemFicha(item) {
  // PORCAO: quantidade = nº de porções/unidades da receita própria
  // (1 coxinha de 25 g → 0,025 Kg × custo/Kg). BASE: comportamento original.
  const custoBruto =
    item.modoUsoQuantidade === 'PORCAO'
      ? Number(item.quantidade) * (custoPorPorcaoInsumo(item.insumo) ?? 0)
      : quantidadeBase(item.quantidade, item.insumo.unidade) * Number(item.insumo.custoUnitario);
  const qa =
    item.quantidadeAtendida === null || item.quantidadeAtendida === undefined
      ? null
      : Number(item.quantidadeAtendida);
  const rateia = item.formaRateio === 'POR_EMBALAGEM' || item.formaRateio === 'POR_PEDIDO';
  const divisor = rateia && qa && qa > 0 ? qa : 1;
  const custoAplicado = custoBruto / divisor;
  return {
    custoBruto: Number(custoBruto.toFixed(4)),
    custoAplicado: Number(custoAplicado.toFixed(4))
  };
}

function computeFichaTotals(itensRaw) {
  let custoComMargem = 0;
  let custoEmbutido = 0;
  const itens = itensRaw.map((item) => {
    const { custoBruto, custoAplicado } = computeItemFicha(item);
    if (item.aplicarMargem) {
      custoComMargem += custoAplicado;
    } else {
      custoEmbutido += custoAplicado;
    }
    return {
      ...item,
      insumo: insumoComUnidadeNormalizada(item.insumo),
      unidadeQuantidadeFicha:
        item.modoUsoQuantidade === 'PORCAO' ? 'und' : unidadeQuantidade(item.insumo?.unidade),
      custoBruto,
      custoAplicado,
      custoItem: custoAplicado
    };
  });
  return {
    itens,
    custoComMargem: Number(custoComMargem.toFixed(4)),
    custoEmbutido: Number(custoEmbutido.toFixed(4)),
    custoTotalFicha: Number((custoComMargem + custoEmbutido).toFixed(4))
  };
}

// Valida campos de rateio (POST e PUT). Recebe valores já mesclados com o estado atual.
function validateRateioFields({ tipoUso, formaRateio, quantidadeAtendida, aplicarMargem }) {
  if (!TIPOS_USO_FICHA.includes(tipoUso)) {
    return `tipoUso inválido. Valores permitidos: ${TIPOS_USO_FICHA.join(', ')}`;
  }
  if (!FORMAS_RATEIO_FICHA.includes(formaRateio)) {
    return `formaRateio inválida. Valores permitidos: ${FORMAS_RATEIO_FICHA.join(', ')}`;
  }
  if (typeof aplicarMargem !== 'boolean') {
    return 'aplicarMargem deve ser booleano';
  }
  if (formaRateio === 'POR_EMBALAGEM' || formaRateio === 'POR_PEDIDO') {
    if (
      quantidadeAtendida === null ||
      quantidadeAtendida === undefined ||
      isNaN(Number(quantidadeAtendida)) ||
      Number(quantidadeAtendida) <= 0
    ) {
      return 'quantidadeAtendida é obrigatória e deve ser maior que zero para rateio POR_EMBALAGEM ou POR_PEDIDO';
    }
  }
  return null;
}

app.get('/api/produtos/:produtoId/ficha-tecnica', async (req, res) => {
  try {
    const produtoId = Number(req.params.produtoId);
    if (!Number.isInteger(produtoId) || produtoId <= 0) {
      return res.status(400).json({ error: 'produtoId inválido' });
    }

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto || !produto.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const itensRaw = await prisma.fichaTecnicaItem.findMany({
      where: { produtoId },
      include: FICHA_INSUMO_INCLUDE,
      orderBy: { id: 'asc' }
    });

    const totals = computeFichaTotals(itensRaw);

    res.json({
      produto,
      itens: totals.itens,
      custoComMargem: totals.custoComMargem,
      custoEmbutido: totals.custoEmbutido,
      custoTotalFicha: totals.custoTotalFicha
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar ficha técnica' });
  }
});

app.post('/api/produtos/:produtoId/ficha-tecnica/itens', async (req, res) => {
  try {
    const produtoId = Number(req.params.produtoId);
    if (!Number.isInteger(produtoId) || produtoId <= 0) {
      return res.status(400).json({ error: 'produtoId inválido' });
    }

    const { insumoId, quantidade, tipoUso, formaRateio, quantidadeAtendida, modoUsoQuantidade } =
      req.body ?? {};

    if (!Number.isInteger(Number(insumoId)) || Number(insumoId) <= 0) {
      return res.status(400).json({ error: 'insumoId inválido' });
    }
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto || !produto.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const insumo = await prisma.insumo.findUnique({
      where: { id: Number(insumoId) },
      include: { receitaProducao: true }
    });
    if (!insumo || !insumo.ativo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    // Modo de uso da quantidade: PORCAO só vale para produção própria com
    // receita em modo PORCOES (e pesoPorcao definido quando o insumo é Kg/L)
    const modoUsoFinal = modoUsoQuantidade === 'PORCAO' ? 'PORCAO' : 'BASE';
    if (modoUsoFinal === 'PORCAO') {
      if (insumo.tipo !== 'PRODUCAO_PROPRIA') {
        return res.status(400).json({
          error: 'Uso por unidade/porção só está disponível para insumos de produção própria'
        });
      }
      if (insumo.receitaProducao?.modoRendimento !== 'PORCOES') {
        return res.status(400).json({
          error:
            'Uso por unidade/porção exige que a receita do insumo esteja no modo de rendimento por porções'
        });
      }
      if (custoPorPorcaoInsumo(insumo) === null) {
        return res.status(400).json({
          error: 'Receita sem tamanho de porção definido para calcular o custo por unidade'
        });
      }
    }

    const defaults = defaultsUsoPorTipoInsumo(insumo.tipo);
    const tipoUsoFinal = tipoUso ?? defaults.tipoUso;
    const merged = {
      tipoUso: tipoUsoFinal,
      formaRateio: formaRateio ?? 'POR_PRODUTO',
      quantidadeAtendida:
        quantidadeAtendida === undefined || quantidadeAtendida === null || quantidadeAtendida === ''
          ? null
          : Number(quantidadeAtendida),
      // Regra automática: apenas INGREDIENTE entra na base do preço sugerido.
      // O valor enviado no payload é ignorado para evitar inconsistência.
      aplicarMargem: tipoUsoFinal === 'INGREDIENTE'
    };
    if (merged.formaRateio === 'POR_PRODUTO') {
      merged.quantidadeAtendida = null;
    }
    const rateioError = validateRateioFields(merged);
    if (rateioError) {
      return res.status(400).json({ error: rateioError });
    }

    const item = await prisma.fichaTecnicaItem.create({
      data: {
        produtoId,
        insumoId: Number(insumoId),
        quantidade: Number(quantidade),
        modoUsoQuantidade: modoUsoFinal,
        tipoUso: merged.tipoUso,
        formaRateio: merged.formaRateio,
        quantidadeAtendida: merged.quantidadeAtendida,
        aplicarMargem: merged.aplicarMargem
      },
      include: FICHA_INSUMO_INCLUDE
    });

    res.status(201).json({ ...item, ...computeItemFicha(item) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar item da ficha técnica' });
  }
});

app.put('/api/ficha-tecnica/itens/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const { quantidade, tipoUso, formaRateio, quantidadeAtendida } = req.body ?? {};

    const existing = await prisma.fichaTecnicaItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item da ficha técnica não encontrado' });
    }

    const data = {};

    if (quantidade !== undefined) {
      if (quantidade === null || isNaN(Number(quantidade))) {
        return res.status(400).json({ error: 'quantidade deve ser numérica' });
      }
      if (Number(quantidade) <= 0) {
        return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
      }
      data.quantidade = Number(quantidade);
    }
    if (tipoUso !== undefined) data.tipoUso = tipoUso;
    if (formaRateio !== undefined) data.formaRateio = formaRateio;
    if (quantidadeAtendida !== undefined) {
      data.quantidadeAtendida =
        quantidadeAtendida === null || quantidadeAtendida === ''
          ? null
          : Number(quantidadeAtendida);
    }

    // Regra automática: aplicarMargem é derivado do tipoUso final (payload é ignorado).
    // Apenas INGREDIENTE entra na base do preço sugerido; ao salvar, itens antigos
    // fora da regra são corrigidos automaticamente.
    data.aplicarMargem = (data.tipoUso ?? existing.tipoUso) === 'INGREDIENTE';

    // Valida o estado final do item (campos novos mesclados com os atuais)
    const merged = {
      tipoUso: data.tipoUso ?? existing.tipoUso,
      formaRateio: data.formaRateio ?? existing.formaRateio,
      quantidadeAtendida:
        data.quantidadeAtendida !== undefined
          ? data.quantidadeAtendida
          : existing.quantidadeAtendida === null
          ? null
          : Number(existing.quantidadeAtendida),
      aplicarMargem: data.aplicarMargem
    };
    if (merged.formaRateio === 'POR_PRODUTO') {
      merged.quantidadeAtendida = null;
      data.quantidadeAtendida = null;
    }
    const rateioError = validateRateioFields(merged);
    if (rateioError) {
      return res.status(400).json({ error: rateioError });
    }

    const updated = await prisma.fichaTecnicaItem.update({
      where: { id },
      data,
      include: FICHA_INSUMO_INCLUDE
    });

    res.json({ ...updated, ...computeItemFicha(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar item da ficha técnica' });
  }
});

app.delete('/api/ficha-tecnica/itens/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.fichaTecnicaItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item da ficha técnica não encontrado' });
    }

    await prisma.fichaTecnicaItem.delete({ where: { id } });
    res.json({ id, deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao remover item da ficha técnica' });
  }
});

// ===== Configuração de Precificação =====

async function getConfigPrecificacao() {
  let config = await prisma.configuracaoPrecificacao.findFirst({
    where: { ativo: true },
    orderBy: { id: 'asc' }
  });
  if (!config) {
    config = await prisma.configuracaoPrecificacao.create({ data: {} });
  }
  return config;
}

// precoSugerido = custoComMargem / (cmvAlvo/100) + custoEmbutido (venda direta)
// precoIfood = precoVenda / (1 - taxaIfood/100)
//            + ((campanhaInteligente + maiorTaxaEntrega + cupomDesconto) / ticketMedioDelivery) * precoVenda
// O preço iFood usa o preço de venda REAL do produto, não o sugerido — o gestor
// pode praticar preços estratégicos (isca, âncora, promocional) e o iFood
// precisa ser calculado sobre a decisão real.
function computePrecificacao(totals, precoVenda, config) {
  const round2 = (n) => Number(n.toFixed(2));
  const cmvAlvo = Number(config.cmvAlvoPercentual);
  const lucroDesejado = Number(config.lucroDesejadoPercentual);
  const taxa = Number(config.taxaIfoodPercentual);
  const campanhaInteligente = Number(config.campanhaInteligente);
  const maiorTaxaEntrega = Number(config.maiorTaxaEntrega);
  const cupomDesconto = Number(config.cupomDesconto);
  const ticketMedioDelivery = Number(config.ticketMedioDelivery);

  const percentualIfoodTotal = taxa;
  const custosIfoodRateaveis = campanhaInteligente + maiorTaxaEntrega + cupomDesconto;

  let precoSugerido = null;
  if (totals.custoComMargem > 0 && cmvAlvo > 0 && cmvAlvo < 100) {
    precoSugerido = totals.custoComMargem / (cmvAlvo / 100) + totals.custoEmbutido;
  }

  let precoIfoodBaseTaxas = null;
  let valorCustosIfoodRateados = null;
  let precoIfood = null;
  if (precoVenda > 0 && taxa >= 0 && taxa < 100 && ticketMedioDelivery > 0) {
    precoIfoodBaseTaxas = precoVenda / (1 - taxa / 100);
    valorCustosIfoodRateados = (custosIfoodRateaveis / ticketMedioDelivery) * precoVenda;
    precoIfood = precoIfoodBaseTaxas + valorCustosIfoodRateados;
  }

  return {
    cmvAlvoPercentual: round2(cmvAlvo),
    lucroDesejadoPercentual: round2(lucroDesejado),
    taxaIfoodPercentual: round2(taxa),
    campanhaInteligente: round2(campanhaInteligente),
    percentualIfoodTotal: round2(percentualIfoodTotal),
    maiorTaxaEntrega: round2(maiorTaxaEntrega),
    cupomDesconto: round2(cupomDesconto),
    ticketMedioDelivery: round2(ticketMedioDelivery),
    custosIfoodRateaveis: round2(custosIfoodRateaveis),
    precoIfoodBaseTaxas: precoIfoodBaseTaxas === null ? null : round2(precoIfoodBaseTaxas),
    valorCustosIfoodRateados:
      valorCustosIfoodRateados === null ? null : round2(valorCustosIfoodRateados),
    precoSugerido: precoSugerido === null ? null : round2(precoSugerido),
    precoIfood: precoIfood === null ? null : round2(precoIfood)
  };
}

app.get('/api/configuracao-precificacao', async (req, res) => {
  try {
    const config = await getConfigPrecificacao();
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao consultar configuração de precificação' });
  }
});

app.put('/api/configuracao-precificacao', async (req, res) => {
  try {
    const config = await getConfigPrecificacao();
    const {
      cmvAlvoPercentual,
      lucroDesejadoPercentual,
      taxaIfoodPercentual,
      campanhaInteligente,
      maiorTaxaEntrega,
      cupomDesconto,
      ticketMedioDelivery
    } = req.body ?? {};

    const data = {};

    if (cmvAlvoPercentual !== undefined) {
      const v = Number(cmvAlvoPercentual);
      if (isNaN(v) || v <= 0 || v >= 100) {
        return res.status(400).json({ error: 'cmvAlvoPercentual deve ser maior que 0 e menor que 100' });
      }
      data.cmvAlvoPercentual = v;
    }
    if (lucroDesejadoPercentual !== undefined) {
      const v = Number(lucroDesejadoPercentual);
      if (isNaN(v) || v < 0 || v >= 100) {
        return res.status(400).json({
          error: 'lucroDesejadoPercentual deve ser maior ou igual a 0 e menor que 100'
        });
      }
      data.lucroDesejadoPercentual = v;
    }
    if (taxaIfoodPercentual !== undefined) {
      const v = Number(taxaIfoodPercentual);
      if (isNaN(v) || v < 0 || v >= 100) {
        return res.status(400).json({
          error: 'taxaIfoodPercentual deve ser maior ou igual a 0 e menor que 100'
        });
      }
      data.taxaIfoodPercentual = v;
    }
    if (campanhaInteligente !== undefined) {
      const v = Number(campanhaInteligente);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({ error: 'campanhaInteligente deve ser maior ou igual a zero' });
      }
      data.campanhaInteligente = v;
    }
    if (maiorTaxaEntrega !== undefined) {
      const v = Number(maiorTaxaEntrega);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({ error: 'maiorTaxaEntrega deve ser maior ou igual a zero' });
      }
      data.maiorTaxaEntrega = v;
    }
    if (cupomDesconto !== undefined) {
      const v = Number(cupomDesconto);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({ error: 'cupomDesconto deve ser maior ou igual a zero' });
      }
      data.cupomDesconto = v;
    }
    if (ticketMedioDelivery !== undefined) {
      const v = Number(ticketMedioDelivery);
      if (isNaN(v) || v <= 0) {
        return res.status(400).json({ error: 'ticketMedioDelivery deve ser maior que zero' });
      }
      data.ticketMedioDelivery = v;
    }

    const updated = await prisma.configuracaoPrecificacao.update({
      where: { id: config.id },
      data
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar configuração de precificação' });
  }
});

// ===== Análise Financeira do Produto =====

app.get('/api/produtos/:id/analise', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const produto = await prisma.produto.findUnique({ where: { id } });
    if (!produto || !produto.ativo) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const itens = await prisma.fichaTecnicaItem.findMany({
      where: { produtoId: id },
      include: FICHA_INSUMO_INCLUDE
    });

    const precoVenda = Number(produto.precoVenda);
    const round2 = (n) => Number(n.toFixed(2));

    const produtoOut = {
      id: produto.id,
      nome: produto.nome,
      precoVenda: round2(precoVenda),
      tipoProduto: produto.tipoProduto ?? 'PRODUTO',
      custoDireto:
        produto.custoDireto === null || produto.custoDireto === undefined
          ? null
          : round2(Number(produto.custoDireto))
    };

    const config = await getConfigPrecificacao();

    // ===== BEBIDA: revenda simples — análise por lucro/margem, sem régua de
    // CMV de produto próprio e sem exigir ficha técnica =====
    if (produtoOut.tipoProduto === 'BEBIDA') {
      const custoDireto = produtoOut.custoDireto;
      const precificacaoBebida = computePrecificacao(
        { custoComMargem: 0, custoEmbutido: 0 },
        precoVenda,
        config
      );
      let statusGeral;
      let mensagemDiagnostico;
      let lucroBrutoReal = null;
      let margemRealPercentual = null;
      let percentualTotalReal = null;
      if (precoVenda === 0) {
        statusGeral = 'SEM_PRECO';
        mensagemDiagnostico = 'Bebida sem preço de venda.';
      } else if (custoDireto === null) {
        statusGeral = 'ATENCAO';
        mensagemDiagnostico = 'Bebida sem custo de compra.';
      } else {
        lucroBrutoReal = precoVenda - custoDireto;
        margemRealPercentual = (lucroBrutoReal / precoVenda) * 100;
        percentualTotalReal = (custoDireto / precoVenda) * 100;
        if (lucroBrutoReal <= 0) {
          statusGeral = 'CRITICO';
          mensagemDiagnostico = 'Bebida vendida sem lucro. Revise custo de compra e preço.';
        } else if (margemRealPercentual < 20) {
          statusGeral = 'ATENCAO';
          mensagemDiagnostico = 'Margem da bebida abaixo de 20%. Avalie o preço de venda.';
        } else {
          statusGeral = 'SAUDAVEL';
          mensagemDiagnostico = 'Margem de revenda saudável.';
        }
      }
      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        custoFichaTecnica: 0,
        custoComMargem: custoDireto === null ? 0 : round2(custoDireto),
        custoEmbutido: 0,
        custoTotalFicha: custoDireto === null ? 0 : round2(custoDireto),
        custoProduto: custoDireto === null ? 0 : round2(custoDireto),
        custoTotalReal: custoDireto === null ? 0 : round2(custoDireto),
        cmvProdutoPercentual: null,
        percentualTotalReal: percentualTotalReal === null ? null : round2(percentualTotalReal),
        percentualCustoEmbutido: null,
        lucroBrutoReal: lucroBrutoReal === null ? null : round2(lucroBrutoReal),
        margemRealPercentual:
          margemRealPercentual === null ? null : round2(margemRealPercentual),
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: lucroBrutoReal === null ? null : round2(lucroBrutoReal),
        cmvPercentual: percentualTotalReal === null ? null : round2(percentualTotalReal),
        margemBrutaPercentual:
          margemRealPercentual === null ? null : round2(margemRealPercentual),
        statusCmv: statusGeral,
        statusGeral,
        mensagemDiagnostico,
        ...precificacaoBebida,
        precoSugerido: null,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda:
          precificacaoBebida.precoIfood === null
            ? null
            : round2(precificacaoBebida.precoIfood - precoVenda),
        mensagemPrecificacao:
          'Bebida de revenda: análise por lucro bruto e margem, sem preço sugerido por CMV.'
      });
    }

    // ===== COMBO: análise calculada a partir dos itens (produtos/bebidas) =====
    // Combo não usa a régua 30/35 de produto individual: o objetivo é elevar
    // ticket e lucro bruto absoluto, então a leitura é desconto/margem/lucro.
    if (produtoOut.tipoProduto === 'COMBO') {
      const comboItens = await prisma.comboItem.findMany({
        where: { comboId: id },
        include: COMBO_ITEM_INCLUDE,
        orderBy: { id: 'asc' }
      });
      const precificacaoCombo = computePrecificacao(
        { custoComMargem: 0, custoEmbutido: 0 },
        precoVenda,
        config
      );

      const comboItensResumo = comboItens.map(comboItemOut);
      const temItens = comboItensResumo.length > 0;
      const valorItensSeparados = comboItensResumo.reduce((s, i) => s + i.totalVenda, 0);
      const custoTotalCombo = comboItensResumo.reduce((s, i) => s + i.totalCusto, 0);

      const descontoCombo = temItens ? valorItensSeparados - precoVenda : null;
      const percentualDescontoCombo =
        temItens && valorItensSeparados > 0
          ? (descontoCombo / valorItensSeparados) * 100
          : null;
      const cmvComboPercentual =
        temItens && precoVenda > 0 ? (custoTotalCombo / precoVenda) * 100 : null;
      const lucroBrutoCombo = temItens && precoVenda > 0 ? precoVenda - custoTotalCombo : null;
      const margemComboPercentual =
        lucroBrutoCombo === null ? null : (lucroBrutoCombo / precoVenda) * 100;

      const alertasCombo = [];
      let statusCombo;
      let mensagemDiagnostico;
      if (precoVenda === 0) {
        statusCombo = 'SEM_PRECO';
        mensagemDiagnostico = 'Combo sem preço de venda.';
      } else if (!temItens) {
        statusCombo = 'SEM_COMPOSICAO';
        mensagemDiagnostico = 'Monte o combo com produtos e bebidas.';
      } else if (custoTotalCombo >= precoVenda || lucroBrutoCombo <= 0) {
        statusCombo = 'CRITICO';
        mensagemDiagnostico = 'Combo vendido sem lucro. Revise itens e preço.';
      } else {
        if (percentualDescontoCombo !== null && percentualDescontoCombo > 20) {
          alertasCombo.push('Desconto do combo acima de 20% do valor separado.');
        }
        if (descontoCombo !== null && descontoCombo < 0) {
          alertasCombo.push('Combo mais caro que os itens separados.');
        }
        if (margemComboPercentual !== null && margemComboPercentual < 25) {
          alertasCombo.push('Margem do combo abaixo de 25%.');
        }
        if (cmvComboPercentual !== null && cmvComboPercentual > 50) {
          alertasCombo.push('CMV do combo acima de 50%.');
        }
        if (alertasCombo.length > 0) {
          statusCombo = 'ATENCAO';
          mensagemDiagnostico = alertasCombo[0];
        } else {
          statusCombo = 'SAUDAVEL';
          mensagemDiagnostico = 'Combo saudável: lucro e margem dentro do esperado.';
        }
      }

      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        // Campos próprios do combo
        quantidadeItensCombo: comboItensResumo.length,
        comboItensResumo,
        valorItensSeparados: round2(valorItensSeparados),
        custoTotalCombo: round2(custoTotalCombo),
        descontoCombo: descontoCombo === null ? null : round2(descontoCombo),
        percentualDescontoCombo:
          percentualDescontoCombo === null ? null : round2(percentualDescontoCombo),
        cmvComboPercentual: cmvComboPercentual === null ? null : round2(cmvComboPercentual),
        lucroBrutoCombo: lucroBrutoCombo === null ? null : round2(lucroBrutoCombo),
        margemComboPercentual:
          margemComboPercentual === null ? null : round2(margemComboPercentual),
        ticketGerado: round2(precoVenda),
        statusCombo,
        alertasCombo,
        // Compatibilidade com a listagem/Dashboard
        custoFichaTecnica: 0,
        custoComMargem: round2(custoTotalCombo),
        custoEmbutido: 0,
        custoTotalFicha: round2(custoTotalCombo),
        custoProduto: round2(custoTotalCombo),
        custoTotalReal: round2(custoTotalCombo),
        cmvProdutoPercentual: null,
        percentualTotalReal: cmvComboPercentual === null ? null : round2(cmvComboPercentual),
        percentualCustoEmbutido: null,
        lucroBrutoReal: lucroBrutoCombo === null ? null : round2(lucroBrutoCombo),
        margemRealPercentual:
          margemComboPercentual === null ? null : round2(margemComboPercentual),
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: lucroBrutoCombo === null ? null : round2(lucroBrutoCombo),
        cmvPercentual: cmvComboPercentual === null ? null : round2(cmvComboPercentual),
        margemBrutaPercentual:
          margemComboPercentual === null ? null : round2(margemComboPercentual),
        statusCmv: statusCombo,
        statusGeral: statusCombo,
        mensagemDiagnostico,
        ...precificacaoCombo,
        precoSugerido: null,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda:
          precificacaoCombo.precoIfood === null
            ? null
            : round2(precificacaoCombo.precoIfood - precoVenda),
        mensagemPrecificacao:
          'Combo: análise por desconto, lucro bruto e margem sobre os itens que o compõem.'
      });
    }

    if (itens.length === 0) {
      const precificacaoVazia = computePrecificacao(
        { custoComMargem: 0, custoEmbutido: 0 },
        precoVenda,
        config
      );
      let mensagemSemFicha = 'Cadastre a ficha técnica para calcular o preço sugerido.';
      if (precificacaoVazia.precoIfood !== null) {
        mensagemSemFicha +=
          ' Preço iFood usa o preço de venda definido no produto e considera taxa iFood, campanha inteligente, entrega/cupom e ticket médio delivery.';
      } else {
        mensagemSemFicha +=
          ' Defina um preço de venda válido e uma configuração iFood válida para calcular o preço iFood.';
      }
      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        custoFichaTecnica: 0,
        custoComMargem: 0,
        custoEmbutido: 0,
        custoTotalFicha: 0,
        custoProduto: 0,
        custoTotalReal: 0,
        cmvProdutoPercentual: null,
        percentualTotalReal: null,
        percentualCustoEmbutido: null,
        lucroBrutoReal: null,
        margemRealPercentual: null,
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_FICHA',
        statusGeral: 'SEM_FICHA',
        mensagemDiagnostico:
          'Produto sem ficha técnica cadastrada. Cadastre os insumos para calcular CMV e margem real.',
        ...precificacaoVazia,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda:
          precificacaoVazia.precoIfood === null
            ? null
            : round2(precificacaoVazia.precoIfood - precoVenda),
        mensagemPrecificacao: mensagemSemFicha
      });
    }

    // Custo real considera rateio (POR_EMBALAGEM / POR_PEDIDO dividem pelo atendimento)
    const totals = computeFichaTotals(itens);
    const custoFichaTecnica = totals.custoTotalFicha;
    const precificacao = computePrecificacao(totals, precoVenda, config);

    if (precoVenda === 0) {
      return res.json({
        produto: produtoOut,
        precoVenda: 0,
        custoFichaTecnica: round2(custoFichaTecnica),
        custoComMargem: round2(totals.custoComMargem),
        custoEmbutido: round2(totals.custoEmbutido),
        custoTotalFicha: round2(totals.custoTotalFicha),
        custoProduto: round2(totals.custoComMargem),
        custoTotalReal: round2(totals.custoTotalFicha),
        cmvProdutoPercentual: null,
        percentualTotalReal: null,
        percentualCustoEmbutido: null,
        lucroBrutoReal: null,
        margemRealPercentual: null,
        alertaCustoTotal: null,
        alertaCustoEmbutido: null,
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_PRECO',
        statusGeral: 'SEM_PRECO',
        mensagemDiagnostico:
          'Produto sem preço de venda válido para cálculo de CMV e margem.',
        ...precificacao,
        diferencaPrecoSugerido: null,
        diferencaPrecoIfoodVsVenda: null,
        mensagemPrecificacao:
          'Defina o preço de venda para comparar com o preço sugerido. ' +
          'Defina um preço de venda válido e uma configuração iFood válida para calcular o preço iFood.'
      });
    }

    // Leitura separada de custos:
    // - custoProduto: itens com composição "Preço sugerido" (aplicarMargem = true)
    // - custoEmbutido: itens com composição "Custo embutido" (aplicarMargem = false)
    // - custoTotalReal: produto + embutido
    // O status principal usa o CMV DO PRODUTO — embalagem/acompanhamento não deve
    // sozinho jogar o produto para atenção/crítico; o custo total vira alerta à parte.
    const custoProduto = totals.custoComMargem;
    const custoTotalReal = totals.custoTotalFicha;
    const cmvProdutoPercentual = (custoProduto / precoVenda) * 100;
    const percentualCustoEmbutido = (totals.custoEmbutido / precoVenda) * 100;
    const lucroBruto = precoVenda - custoFichaTecnica;
    // Compatibilidade: cmvPercentual segue sendo o percentual do custo TOTAL real
    const cmvPercentual = (custoFichaTecnica / precoVenda) * 100;
    const percentualTotalReal = cmvPercentual;
    const margemBrutaPercentual = (lucroBruto / precoVenda) * 100;
    const lucroBrutoReal = lucroBruto;
    const margemRealPercentual = margemBrutaPercentual;

    let statusCmv;
    let mensagemDiagnostico;
    if (cmvProdutoPercentual <= 30) {
      statusCmv = 'SAUDAVEL';
      mensagemDiagnostico = 'CMV do produto saudável. Ingredientes com boa margem bruta.';
    } else if (cmvProdutoPercentual <= 35) {
      statusCmv = 'ATENCAO';
      mensagemDiagnostico =
        'CMV do produto em atenção. Acompanhe variações de custo dos ingredientes.';
    } else {
      statusCmv = 'CRITICO';
      mensagemDiagnostico =
        'CMV do produto crítico. Revise preço de venda, ficha técnica e porcionamento.';
    }

    const alertaCustoTotal =
      percentualTotalReal > 40 ? 'Custo total real acima de 40% do preço de venda.' : null;
    const alertaCustoEmbutido =
      percentualCustoEmbutido > 10
        ? 'Custo embutido elevado. Avalie compensar no preço, taxa de entrega ou pedido mínimo.'
        : null;

    // Status GERAL da precificação (badge do produto). statusCmv segue medindo só
    // o CMV do produto; aqui entram também preço abaixo do sugerido, custo
    // embutido/total elevados e lucro real negativo. Tolerância de R$ 0,01 no
    // preço sugerido para não marcar atenção por arredondamento de centavos.
    const precoAbaixoSugerido =
      precificacao.precoSugerido !== null && precoVenda < precificacao.precoSugerido - 0.01;
    let statusGeral;
    if (cmvProdutoPercentual > 35 || lucroBrutoReal < 0) {
      statusGeral = 'CRITICO';
    } else if (
      cmvProdutoPercentual > 30 ||
      precoAbaixoSugerido ||
      alertaCustoEmbutido !== null ||
      alertaCustoTotal !== null
    ) {
      statusGeral = 'ATENCAO';
    } else {
      statusGeral = 'SAUDAVEL';
    }

    let mensagemPrecificacao;
    if (precificacao.precoSugerido === null) {
      mensagemPrecificacao =
        'Não foi possível calcular o preço sugerido. Verifique a ficha técnica e a margem alvo.';
    } else if (precoVenda < precificacao.precoSugerido) {
      mensagemPrecificacao =
        'Preço atual abaixo do preço técnico sugerido. Revise preço, ficha ou margem alvo.';
    } else {
      mensagemPrecificacao =
        'Preço atual cobre o preço técnico sugerido para venda direta.';
    }
    if (precificacao.precoIfood !== null) {
      mensagemPrecificacao +=
        ' Preço iFood usa o preço de venda definido no produto e considera taxa iFood, campanha inteligente, entrega/cupom e ticket médio delivery.';
    } else {
      mensagemPrecificacao +=
        ' Defina um preço de venda válido e uma configuração iFood válida para calcular o preço iFood.';
    }

    res.json({
      produto: produtoOut,
      precoVenda: round2(precoVenda),
      custoFichaTecnica: round2(custoFichaTecnica),
      custoComMargem: round2(totals.custoComMargem),
      custoEmbutido: round2(totals.custoEmbutido),
      custoTotalFicha: round2(totals.custoTotalFicha),
      custoProduto: round2(custoProduto),
      custoTotalReal: round2(custoTotalReal),
      cmvProdutoPercentual: round2(cmvProdutoPercentual),
      percentualTotalReal: round2(percentualTotalReal),
      percentualCustoEmbutido: round2(percentualCustoEmbutido),
      lucroBrutoReal: round2(lucroBrutoReal),
      margemRealPercentual: round2(margemRealPercentual),
      alertaCustoTotal,
      alertaCustoEmbutido,
      lucroBruto: round2(lucroBruto),
      cmvPercentual: round2(cmvPercentual),
      margemBrutaPercentual: round2(margemBrutaPercentual),
      statusCmv,
      statusGeral,
      mensagemDiagnostico,
      ...precificacao,
      diferencaPrecoSugerido:
        precificacao.precoSugerido === null
          ? null
          : round2(precoVenda - precificacao.precoSugerido),
      diferencaPrecoIfoodVsVenda:
        precificacao.precoIfood === null
          ? null
          : round2(precificacao.precoIfood - precoVenda),
      mensagemPrecificacao
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao analisar produto' });
  }
});

// ===== Custos Fixos =====

app.get('/api/custos-fixos', async (req, res) => {
  try {
    const custos = await prisma.custoFixo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(custos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar custos fixos' });
  }
});

// Encargos de colaborador CLT (estimativa gerencial, não folha oficial):
// 13º mensal = base/12; férias mensal = (base/12) × 4/3 (provisão + 1/3);
// FGTS = 8% da base. Total mensal = base + 13º + férias + FGTS.
const TIPOS_CUSTO_FIXO = ['GERAL', 'COLABORADOR'];
const TIPOS_COLABORADOR = ['CLT', 'FREELANCER', 'OUTRO', 'PJ', 'DIARISTA'];

function totalMensalColaboradorClt(salarioBase) {
  const s = Number(salarioBase);
  const decimo = s / 12;
  const ferias = (s / 12) * (4 / 3);
  const fgts = s * 0.08;
  return Number((s + decimo + ferias + fgts).toFixed(2));
}

// Valida e resolve os campos de colaborador/motoboy de um payload de custo fixo.
// Quando há cálculo automático (encargos CLT ou diária × quantidade × dias),
// o valorMensal efetivo É o total calculado (fonte única usada por dashboard/PE).
function resolveCamposColaborador(body) {
  const { tipoCusto, tipoColaborador, salarioBase, calcularEncargos, valorDiaria, quantidade, dias } =
    body ?? {};
  const tipoCustoFinal =
    tipoCusto === undefined || tipoCusto === null
      ? 'GERAL'
      : TIPOS_CUSTO_FIXO.includes(tipoCusto)
      ? tipoCusto
      : null;
  if (tipoCustoFinal === null) {
    return { error: 'tipoCusto deve ser GERAL ou COLABORADOR' };
  }
  if (tipoCustoFinal === 'GERAL') {
    return {
      campos: {
        tipoCusto: 'GERAL',
        tipoColaborador: null,
        salarioBase: null,
        calcularEncargos: false,
        valorDiaria: null,
        quantidade: null,
        dias: null
      },
      valorMensalCalculado: null
    };
  }
  const tipoColabFinal =
    tipoColaborador === undefined || tipoColaborador === null
      ? 'OUTRO'
      : TIPOS_COLABORADOR.includes(tipoColaborador)
      ? tipoColaborador
      : null;
  if (tipoColabFinal === null) {
    return { error: 'tipoColaborador deve ser CLT, FREELANCER, OUTRO, PJ ou DIARISTA' };
  }
  const numOpcional = (v, nome) => {
    if (v === undefined || v === null || v === '') return { valor: null };
    if (isNaN(Number(v)) || Number(v) < 0) {
      return { error: `${nome} deve ser numérico e maior ou igual a zero` };
    }
    return { valor: Number(v) };
  };
  const sb = numOpcional(salarioBase, 'salarioBase');
  if (sb.error) return { error: sb.error };
  const vd = numOpcional(valorDiaria, 'valorDiaria');
  if (vd.error) return { error: vd.error };
  const qt = numOpcional(quantidade, 'quantidade');
  if (qt.error) return { error: qt.error };
  const di = numOpcional(dias, 'dias');
  if (di.error) return { error: di.error };

  const encargosAtivos = calcularEncargos === true && tipoColabFinal === 'CLT';
  if (encargosAtivos && !(sb.valor > 0)) {
    return { error: 'salarioBase é obrigatório e deve ser maior que zero para calcular encargos' };
  }

  let valorMensalCalculado = null;
  if (encargosAtivos) {
    valorMensalCalculado = totalMensalColaboradorClt(sb.valor);
  } else if (tipoColabFinal === 'DIARISTA') {
    if (!(vd.valor > 0) || !(qt.valor > 0) || !(di.valor > 0)) {
      return {
        error: 'valorDiaria, quantidade e dias são obrigatórios e maiores que zero para diarista'
      };
    }
    valorMensalCalculado = Number((vd.valor * qt.valor * di.valor).toFixed(2));
  }

  const ehDiarista = tipoColabFinal === 'DIARISTA';
  return {
    campos: {
      tipoCusto: 'COLABORADOR',
      tipoColaborador: tipoColabFinal,
      salarioBase: sb.valor,
      calcularEncargos: encargosAtivos,
      valorDiaria: ehDiarista ? vd.valor : null,
      quantidade: ehDiarista ? qt.valor : null,
      dias: ehDiarista ? di.valor : null
    },
    valorMensalCalculado
  };
}

app.post('/api/custos-fixos', async (req, res) => {
  try {
    const { nome, valorMensal, tipo, observacao } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    const colaborador = resolveCamposColaborador(req.body);
    if (colaborador.error) {
      return res.status(400).json({ error: colaborador.error });
    }
    // Com encargos automáticos o valor mensal vem do cálculo; sem, é obrigatório
    let valorMensalFinal;
    if (colaborador.valorMensalCalculado !== null) {
      valorMensalFinal = colaborador.valorMensalCalculado;
    } else {
      if (valorMensal === undefined || valorMensal === null || isNaN(Number(valorMensal))) {
        return res.status(400).json({ error: 'valorMensal é obrigatório e deve ser numérico' });
      }
      if (Number(valorMensal) < 0) {
        return res.status(400).json({ error: 'valorMensal deve ser maior ou igual a zero' });
      }
      valorMensalFinal = Number(valorMensal);
    }

    const custo = await prisma.custoFixo.create({
      data: {
        nome: nome.trim(),
        valorMensal: valorMensalFinal,
        tipo: tipo ? String(tipo).trim() : null,
        observacao: observacao ? String(observacao).trim() : null,
        ...colaborador.campos,
        ativo: true
      }
    });

    res.status(201).json(custo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar custo fixo' });
  }
});

app.put('/api/custos-fixos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoFixo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo fixo não encontrado' });
    }

    const { nome, valorMensal, tipo, observacao, ativo, tipoCusto } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (valorMensal !== undefined) {
      if (valorMensal === null || isNaN(Number(valorMensal))) {
        return res.status(400).json({ error: 'valorMensal inválido' });
      }
      if (Number(valorMensal) < 0) {
        return res.status(400).json({ error: 'valorMensal deve ser maior ou igual a zero' });
      }
      data.valorMensal = Number(valorMensal);
    }
    if (tipo !== undefined) {
      data.tipo = tipo === null || tipo === '' ? null : String(tipo).trim();
    }
    if (observacao !== undefined) {
      data.observacao =
        observacao === null || observacao === '' ? null : String(observacao).trim();
    }
    // Campos de colaborador: quando o payload traz tipoCusto, resolve o conjunto
    // inteiro (e o valorMensal vira o total calculado se encargos estiverem ativos)
    if (tipoCusto !== undefined) {
      const colaborador = resolveCamposColaborador(req.body);
      if (colaborador.error) {
        return res.status(400).json({ error: colaborador.error });
      }
      Object.assign(data, colaborador.campos);
      if (colaborador.valorMensalCalculado !== null) {
        data.valorMensal = colaborador.valorMensalCalculado;
      }
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }

    const updated = await prisma.custoFixo.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar custo fixo' });
  }
});

app.delete('/api/custos-fixos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoFixo.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo fixo não encontrado' });
    }

    const desativado = await prisma.custoFixo.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar custo fixo' });
  }
});

// ===== Custos Variáveis =====

const CATEGORIAS_CUSTO_VARIAVEL = new Set([
  'TAXA_CARTAO',
  'MARKETPLACE',
  'EMBALAGEM',
  'ENTREGA',
  'IMPOSTO',
  'CUPOM',
  'COMISSAO',
  'OUTROS'
]);

const TIPOS_CALCULO_CUSTO_VARIAVEL = new Set([
  'PERCENTUAL_FATURAMENTO',
  'VALOR_POR_PEDIDO',
  'VALOR_FIXO_MENSAL_VARIAVEL'
]);

app.get('/api/custos-variaveis', async (req, res) => {
  try {
    const custos = await prisma.custoVariavel.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(custos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar custos variáveis' });
  }
});

app.post('/api/custos-variaveis', async (req, res) => {
  try {
    const { nome, categoria, tipoCalculo, valor } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (typeof categoria !== 'string' || !CATEGORIAS_CUSTO_VARIAVEL.has(categoria)) {
      return res.status(400).json({
        error: 'categoria inválida',
        valoresPermitidos: [...CATEGORIAS_CUSTO_VARIAVEL]
      });
    }
    if (typeof tipoCalculo !== 'string' || !TIPOS_CALCULO_CUSTO_VARIAVEL.has(tipoCalculo)) {
      return res.status(400).json({
        error: 'tipoCalculo inválido',
        valoresPermitidos: [...TIPOS_CALCULO_CUSTO_VARIAVEL]
      });
    }
    if (valor === undefined || valor === null || isNaN(Number(valor))) {
      return res.status(400).json({ error: 'valor é obrigatório e deve ser numérico' });
    }
    if (Number(valor) < 0) {
      return res.status(400).json({ error: 'valor deve ser maior ou igual a zero' });
    }

    const custo = await prisma.custoVariavel.create({
      data: {
        nome: nome.trim(),
        categoria,
        tipoCalculo,
        valor: Number(valor),
        ativo: true
      }
    });

    res.status(201).json(custo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar custo variável' });
  }
});

app.put('/api/custos-variaveis/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoVariavel.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo variável não encontrado' });
    }

    const { nome, categoria, tipoCalculo, valor, ativo } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (categoria !== undefined) {
      if (typeof categoria !== 'string' || !CATEGORIAS_CUSTO_VARIAVEL.has(categoria)) {
        return res.status(400).json({
          error: 'categoria inválida',
          valoresPermitidos: [...CATEGORIAS_CUSTO_VARIAVEL]
        });
      }
      data.categoria = categoria;
    }
    if (tipoCalculo !== undefined) {
      if (typeof tipoCalculo !== 'string' || !TIPOS_CALCULO_CUSTO_VARIAVEL.has(tipoCalculo)) {
        return res.status(400).json({
          error: 'tipoCalculo inválido',
          valoresPermitidos: [...TIPOS_CALCULO_CUSTO_VARIAVEL]
        });
      }
      data.tipoCalculo = tipoCalculo;
    }
    if (valor !== undefined) {
      if (valor === null || isNaN(Number(valor))) {
        return res.status(400).json({ error: 'valor inválido' });
      }
      if (Number(valor) < 0) {
        return res.status(400).json({ error: 'valor deve ser maior ou igual a zero' });
      }
      data.valor = Number(valor);
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      data.ativo = ativo;
    }

    const updated = await prisma.custoVariavel.update({ where: { id }, data });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar custo variável' });
  }
});

app.delete('/api/custos-variaveis/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.custoVariavel.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Custo variável não encontrado' });
    }

    const desativado = await prisma.custoVariavel.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(desativado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar custo variável' });
  }
});

// ===== Faturamento Diário =====

function parseDataFaturamento(input) {
  if (typeof input !== 'string') return null;
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(mo) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

function comTicketMedio(registro) {
  const valor = Number(registro.valorTotal);
  const qtd = Number(registro.quantidadePedidos);
  const ticketMedio = qtd === 0 ? 0 : Number((valor / qtd).toFixed(2));
  return { ...registro, ticketMedio };
}

app.get('/api/faturamento', async (req, res) => {
  try {
    const where = { ativo: true };

    const { mes } = req.query;
    if (mes !== undefined) {
      const m = String(mes).match(/^(\d{4})-(\d{2})$/);
      if (!m) {
        return res.status(400).json({ error: 'mes deve estar no formato YYYY-MM' });
      }
      const ano = Number(m[1]);
      const mesNum = Number(m[2]);
      if (mesNum < 1 || mesNum > 12) {
        return res.status(400).json({ error: 'mes inválido' });
      }
      const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
      const fim = new Date(Date.UTC(ano, mesNum, 1));
      where.data = { gte: inicio, lt: fim };
    }

    const registros = await prisma.faturamentoDiario.findMany({
      where,
      orderBy: { data: 'desc' }
    });

    res.json(registros.map(comTicketMedio));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar faturamento' });
  }
});

app.post('/api/faturamento', async (req, res) => {
  try {
    const { data, valorTotal, quantidadePedidos, canal, observacoes } = req.body ?? {};

    if (data === undefined || data === null || data === '') {
      return res.status(400).json({ error: 'data é obrigatória' });
    }
    const dataParsed = parseDataFaturamento(data);
    if (!dataParsed) {
      return res.status(400).json({ error: 'data inválida (use formato YYYY-MM-DD)' });
    }
    if (valorTotal === undefined || valorTotal === null || isNaN(Number(valorTotal))) {
      return res.status(400).json({ error: 'valorTotal é obrigatório e deve ser numérico' });
    }
    if (Number(valorTotal) < 0) {
      return res.status(400).json({ error: 'valorTotal deve ser maior ou igual a zero' });
    }
    if (
      quantidadePedidos === undefined ||
      quantidadePedidos === null ||
      !Number.isInteger(Number(quantidadePedidos))
    ) {
      return res
        .status(400)
        .json({ error: 'quantidadePedidos é obrigatória e deve ser inteira' });
    }
    if (Number(quantidadePedidos) < 0) {
      return res
        .status(400)
        .json({ error: 'quantidadePedidos deve ser maior ou igual a zero' });
    }

    const registro = await prisma.faturamentoDiario.create({
      data: {
        data: dataParsed,
        valorTotal: Number(valorTotal),
        quantidadePedidos: Number(quantidadePedidos),
        canal: canal ? String(canal).trim() : null,
        observacoes: observacoes ? String(observacoes).trim() : null,
        ativo: true
      }
    });

    res.status(201).json(comTicketMedio(registro));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar faturamento' });
  }
});

app.put('/api/faturamento/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.faturamentoDiario.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Faturamento não encontrado' });
    }

    const { data, valorTotal, quantidadePedidos, canal, observacoes, ativo } = req.body ?? {};
    const update = {};

    if (data !== undefined) {
      const dataParsed = parseDataFaturamento(data);
      if (!dataParsed) {
        return res.status(400).json({ error: 'data inválida (use formato YYYY-MM-DD)' });
      }
      update.data = dataParsed;
    }
    if (valorTotal !== undefined) {
      if (valorTotal === null || isNaN(Number(valorTotal))) {
        return res.status(400).json({ error: 'valorTotal inválido' });
      }
      if (Number(valorTotal) < 0) {
        return res.status(400).json({ error: 'valorTotal deve ser maior ou igual a zero' });
      }
      update.valorTotal = Number(valorTotal);
    }
    if (quantidadePedidos !== undefined) {
      if (quantidadePedidos === null || !Number.isInteger(Number(quantidadePedidos))) {
        return res.status(400).json({ error: 'quantidadePedidos inválida' });
      }
      if (Number(quantidadePedidos) < 0) {
        return res
          .status(400)
          .json({ error: 'quantidadePedidos deve ser maior ou igual a zero' });
      }
      update.quantidadePedidos = Number(quantidadePedidos);
    }
    if (canal !== undefined) {
      update.canal = canal === null || canal === '' ? null : String(canal).trim();
    }
    if (observacoes !== undefined) {
      update.observacoes =
        observacoes === null || observacoes === '' ? null : String(observacoes).trim();
    }
    if (ativo !== undefined) {
      if (typeof ativo !== 'boolean') {
        return res.status(400).json({ error: 'ativo inválido' });
      }
      update.ativo = ativo;
    }

    const updated = await prisma.faturamentoDiario.update({ where: { id }, data: update });
    res.json(comTicketMedio(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao atualizar faturamento' });
  }
});

app.delete('/api/faturamento/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const existing = await prisma.faturamentoDiario.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Faturamento não encontrado' });
    }

    const desativado = await prisma.faturamentoDiario.update({
      where: { id },
      data: { ativo: false }
    });

    res.json(comTicketMedio(desativado));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao desativar faturamento' });
  }
});

// ===== Ponto de Equilíbrio =====

app.get('/api/ponto-equilibrio', async (req, res) => {
  try {
    const { mes } = req.query;
    if (mes === undefined || mes === '') {
      return res.status(400).json({ error: 'mes é obrigatório (formato YYYY-MM)' });
    }
    const m = String(mes).match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return res.status(400).json({ error: 'mes deve estar no formato YYYY-MM' });
    }
    const ano = Number(m[1]);
    const mesNum = Number(m[2]);
    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'mes inválido' });
    }
    const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
    const fim = new Date(Date.UTC(ano, mesNum, 1));

    const round2 = (n) => Number(n.toFixed(2));

    const [custosFixos, faturamentos, produtos, custosVariaveis] = await Promise.all([
      prisma.custoFixo.findMany({ where: { ativo: true } }),
      prisma.faturamentoDiario.findMany({
        where: { ativo: true, data: { gte: inicio, lt: fim } }
      }),
      prisma.produto.findMany({
        where: { ativo: true },
        include: { fichaTecnica: { include: FICHA_INSUMO_INCLUDE } }
      }),
      prisma.custoVariavel.findMany({ where: { ativo: true } })
    ]);

    const totalCustosFixos = custosFixos.reduce(
      (acc, c) => acc + Number(c.valorMensal),
      0
    );

    const faturamentoAtual = faturamentos.reduce(
      (acc, f) => acc + Number(f.valorTotal),
      0
    );
    const totalPedidos = faturamentos.reduce(
      (acc, f) => acc + Number(f.quantidadePedidos),
      0
    );

    let somaCmv = 0;
    let qtdProdutosValidos = 0;
    for (const p of produtos) {
      const preco = Number(p.precoVenda);
      if (preco <= 0) continue;
      if (!p.fichaTecnica || p.fichaTecnica.length === 0) continue;
      const custoFicha = computeFichaTotals(p.fichaTecnica).custoTotalFicha;
      somaCmv += (custoFicha / preco) * 100;
      qtdProdutosValidos += 1;
    }
    const cmvMedioPercentual = qtdProdutosValidos === 0 ? 0 : somaCmv / qtdProdutosValidos;

    let custosVariaveisPercentuais = 0;
    let somaCustosPorPedido = 0;
    let custosVariaveisFixosMensais = 0;
    for (const cv of custosVariaveis) {
      const v = Number(cv.valor);
      if (cv.tipoCalculo === 'PERCENTUAL_FATURAMENTO') {
        custosVariaveisPercentuais += v;
      } else if (cv.tipoCalculo === 'VALOR_POR_PEDIDO') {
        somaCustosPorPedido += v;
      } else if (cv.tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL') {
        custosVariaveisFixosMensais += v;
      }
    }

    const custoVariavelPedidosTotal = totalPedidos * somaCustosPorPedido;

    const percentualCustosPorPedido =
      faturamentoAtual === 0 ? 0 : (custoVariavelPedidosTotal / faturamentoAtual) * 100;

    const percentualCustosFixosMensaisVariaveis =
      faturamentoAtual === 0 ? 0 : (custosVariaveisFixosMensais / faturamentoAtual) * 100;

    // Base operacional do ponto de equilíbrio: CMV ALVO configurado.
    // O CMV real médio dos produtos (média simples) era distorcido por produtos
    // com CMV > 100% e segue sendo retornado apenas como diagnóstico.
    const config = await getConfigPrecificacao();
    const cmvAlvoUsado = Number(config.cmvAlvoPercentual);

    const margemContribuicaoReal =
      100 -
      cmvAlvoUsado -
      custosVariaveisPercentuais -
      percentualCustosPorPedido -
      percentualCustosFixosMensaisVariaveis;

    let pontoEquilibrio = null;
    let diferencaParaEquilibrio = null;
    let percentualAtingido = null;
    let status;
    let mensagem;

    if (margemContribuicaoReal <= 0) {
      status = 'MARGEM_INSUFICIENTE';
      mensagem =
        'A margem de contribuição está zerada ou negativa. Revise CMV, custos variáveis e preços.';
    } else {
      pontoEquilibrio = totalCustosFixos / (margemContribuicaoReal / 100);
      diferencaParaEquilibrio = pontoEquilibrio - faturamentoAtual;
      percentualAtingido =
        pontoEquilibrio > 0 ? (faturamentoAtual / pontoEquilibrio) * 100 : null;

      if (faturamentoAtual >= pontoEquilibrio) {
        status = 'ACIMA_DO_EQUILIBRIO';
        mensagem = 'A operação já ultrapassou o ponto de equilíbrio no mês.';
      } else if (percentualAtingido !== null && percentualAtingido >= 80) {
        status = 'PROXIMO_DO_EQUILIBRIO';
        mensagem = 'A operação está próxima do ponto de equilíbrio.';
      } else {
        status = 'ABAIXO_DO_EQUILIBRIO';
        mensagem = 'A operação ainda está abaixo do ponto de equilíbrio.';
      }
    }

    res.json({
      mes,
      totalCustosFixos: round2(totalCustosFixos),
      faturamentoAtual: round2(faturamentoAtual),
      totalPedidos,
      // Diagnóstico: CMV real médio dos produtos (não é mais a base do PE)
      cmvMedioPercentual: round2(cmvMedioPercentual),
      cmvMedioRealProdutos: round2(cmvMedioPercentual),
      // Base operacional usada no cálculo do ponto de equilíbrio
      cmvAlvoUsado: round2(cmvAlvoUsado),
      cmvBasePontoEquilibrio: round2(cmvAlvoUsado),
      fonteCmvPontoEquilibrio: 'CMV_ALVO',
      mensagemBaseCalculo:
        'O ponto de equilíbrio usa o CMV alvo configurado como base operacional.',
      avisoCmvReal:
        qtdProdutosValidos > 0 && cmvMedioPercentual > cmvAlvoUsado
          ? 'Existem produtos com CMV acima do alvo. Eles não foram usados como base do ponto de equilíbrio, mas devem ser revisados.'
          : null,
      custosVariaveisPercentuais: round2(custosVariaveisPercentuais),
      somaCustosPorPedido: round2(somaCustosPorPedido),
      custoVariavelPedidosTotal: round2(custoVariavelPedidosTotal),
      percentualCustosPorPedido: round2(percentualCustosPorPedido),
      custosVariaveisFixosMensais: round2(custosVariaveisFixosMensais),
      percentualCustosFixosMensaisVariaveis: round2(percentualCustosFixosMensaisVariaveis),
      margemContribuicaoReal: round2(margemContribuicaoReal),
      pontoEquilibrio: pontoEquilibrio === null ? null : round2(pontoEquilibrio),
      diferencaParaEquilibrio:
        diferencaParaEquilibrio === null ? null : round2(diferencaParaEquilibrio),
      percentualAtingido: percentualAtingido === null ? null : round2(percentualAtingido),
      status,
      mensagem
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao calcular ponto de equilíbrio' });
  }
});

// ===== Dashboard Consolidado =====

app.get('/api/dashboard', async (req, res) => {
  try {
    const { mes } = req.query;
    if (mes === undefined || mes === '') {
      return res.status(400).json({ error: 'mes é obrigatório (formato YYYY-MM)' });
    }
    const m = String(mes).match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return res.status(400).json({ error: 'mes deve estar no formato YYYY-MM' });
    }
    const ano = Number(m[1]);
    const mesNum = Number(m[2]);
    if (mesNum < 1 || mesNum > 12) {
      return res.status(400).json({ error: 'mes inválido' });
    }
    const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
    const fim = new Date(Date.UTC(ano, mesNum, 1));

    const round2 = (n) => Number(n.toFixed(2));

    const [
      custosFixos,
      faturamentos,
      produtos,
      custosVariaveis,
      quantidadeProdutosAtivos,
      quantidadeInsumosAtivos
    ] = await Promise.all([
      prisma.custoFixo.findMany({ where: { ativo: true } }),
      prisma.faturamentoDiario.findMany({
        where: { ativo: true, data: { gte: inicio, lt: fim } }
      }),
      prisma.produto.findMany({
        where: { ativo: true },
        include: { fichaTecnica: { include: FICHA_INSUMO_INCLUDE } }
      }),
      prisma.custoVariavel.findMany({ where: { ativo: true } }),
      prisma.produto.count({ where: { ativo: true } }),
      prisma.insumo.count({ where: { ativo: true } })
    ]);

    const totalCustosFixos = custosFixos.reduce(
      (acc, c) => acc + Number(c.valorMensal),
      0
    );
    const faturamentoAtual = faturamentos.reduce(
      (acc, f) => acc + Number(f.valorTotal),
      0
    );
    const totalPedidos = faturamentos.reduce(
      (acc, f) => acc + Number(f.quantidadePedidos),
      0
    );
    const ticketMedio = totalPedidos === 0 ? 0 : faturamentoAtual / totalPedidos;

    let custosVariaveisPercentuais = 0;
    let somaCustosPorPedido = 0;
    let custosVariaveisFixosMensais = 0;
    for (const cv of custosVariaveis) {
      const v = Number(cv.valor);
      if (cv.tipoCalculo === 'PERCENTUAL_FATURAMENTO') custosVariaveisPercentuais += v;
      else if (cv.tipoCalculo === 'VALOR_POR_PEDIDO') somaCustosPorPedido += v;
      else if (cv.tipoCalculo === 'VALOR_FIXO_MENSAL_VARIAVEL') custosVariaveisFixosMensais += v;
    }

    const totalCustosVariaveis =
      faturamentoAtual * (custosVariaveisPercentuais / 100) +
      totalPedidos * somaCustosPorPedido +
      custosVariaveisFixosMensais;

    let somaCmv = 0;
    let qtdProdutosValidos = 0;
    const produtosComCmvCritico = [];
    for (const p of produtos) {
      const preco = Number(p.precoVenda);
      if (preco <= 0) continue;
      if (!p.fichaTecnica || p.fichaTecnica.length === 0) continue;
      const custoFicha = computeFichaTotals(p.fichaTecnica).custoTotalFicha;
      const cmvProduto = (custoFicha / preco) * 100;
      somaCmv += cmvProduto;
      qtdProdutosValidos += 1;
      if (cmvProduto > 40) {
        const lucroBruto = preco - custoFicha;
        produtosComCmvCritico.push({
          id: p.id,
          nome: p.nome,
          precoVenda: round2(preco),
          custoFichaTecnica: round2(custoFicha),
          cmvPercentual: round2(cmvProduto),
          margemBrutaPercentual: round2((lucroBruto / preco) * 100),
          mensagemDiagnostico:
            'CMV crítico. Produto pode estar comprometendo a margem da operação.'
        });
      }
    }
    const cmvMedioPercentual = qtdProdutosValidos === 0 ? 0 : somaCmv / qtdProdutosValidos;

    const percentualCustosPorPedido =
      faturamentoAtual === 0
        ? 0
        : ((totalPedidos * somaCustosPorPedido) / faturamentoAtual) * 100;
    const percentualCustosFixosMensaisVariaveis =
      faturamentoAtual === 0
        ? 0
        : (custosVariaveisFixosMensais / faturamentoAtual) * 100;

    // Base operacional do ponto de equilíbrio: CMV ALVO configurado (mesma regra
    // do endpoint /ponto-equilibrio). CMV real médio permanece como diagnóstico.
    const config = await getConfigPrecificacao();
    const cmvAlvoUsado = Number(config.cmvAlvoPercentual);

    const margemContribuicaoReal =
      100 -
      cmvAlvoUsado -
      custosVariaveisPercentuais -
      percentualCustosPorPedido -
      percentualCustosFixosMensaisVariaveis;

    let pontoEquilibrio = null;
    let diferencaParaEquilibrio = null;
    let percentualAtingido = null;
    let statusOperacao;
    let mensagemOperacao;

    if (margemContribuicaoReal <= 0) {
      statusOperacao = 'MARGEM_INSUFICIENTE';
      mensagemOperacao =
        'A margem de contribuição está zerada ou negativa. Revise CMV, custos variáveis e preços.';
    } else {
      pontoEquilibrio = totalCustosFixos / (margemContribuicaoReal / 100);
      diferencaParaEquilibrio = pontoEquilibrio - faturamentoAtual;
      percentualAtingido =
        pontoEquilibrio > 0 ? (faturamentoAtual / pontoEquilibrio) * 100 : null;

      if (faturamentoAtual >= pontoEquilibrio) {
        statusOperacao = 'ACIMA_DO_EQUILIBRIO';
        mensagemOperacao = 'A operação já ultrapassou o ponto de equilíbrio no mês.';
      } else if (percentualAtingido !== null && percentualAtingido >= 80) {
        statusOperacao = 'PROXIMO_DO_EQUILIBRIO';
        mensagemOperacao = 'A operação está próxima do ponto de equilíbrio.';
      } else {
        statusOperacao = 'ABAIXO_DO_EQUILIBRIO';
        mensagemOperacao = 'A operação ainda está abaixo do ponto de equilíbrio.';
      }
    }

    res.json({
      mes,
      faturamentoAtual: round2(faturamentoAtual),
      totalPedidos,
      ticketMedio: round2(ticketMedio),
      totalCustosFixos: round2(totalCustosFixos),
      totalCustosVariaveis: round2(totalCustosVariaveis),
      // Diagnóstico: CMV real médio dos produtos (não é mais a base do PE)
      cmvMedioPercentual: round2(cmvMedioPercentual),
      cmvMedioRealProdutos: round2(cmvMedioPercentual),
      // Base operacional usada no cálculo do ponto de equilíbrio
      cmvAlvoUsado: round2(cmvAlvoUsado),
      cmvBasePontoEquilibrio: round2(cmvAlvoUsado),
      fonteCmvPontoEquilibrio: 'CMV_ALVO',
      mensagemBaseCalculo:
        'O ponto de equilíbrio usa o CMV alvo configurado como base operacional.',
      margemContribuicaoReal: round2(margemContribuicaoReal),
      pontoEquilibrio: pontoEquilibrio === null ? null : round2(pontoEquilibrio),
      diferencaParaEquilibrio:
        diferencaParaEquilibrio === null ? null : round2(diferencaParaEquilibrio),
      percentualAtingido: percentualAtingido === null ? null : round2(percentualAtingido),
      statusOperacao,
      mensagemOperacao,
      quantidadeProdutosAtivos,
      quantidadeInsumosAtivos,
      quantidadeProdutosCriticos: produtosComCmvCritico.length,
      produtosComCmvCritico
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao calcular dashboard' });
  }
});

app.listen(PORT, () => {
  console.log(`Hamburgueria 360 API running on http://localhost:${PORT}`);
});
