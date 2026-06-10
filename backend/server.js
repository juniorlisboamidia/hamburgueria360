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

// Unidades padronizadas: Kg (custo por 1 kg; quantidades em ficha/receita lançadas em gramas)
// e Und (custo por 1 unidade; quantidades lançadas em unidades).
function normalizeUnidade(u) {
  if (typeof u !== 'string') return null;
  const v = u.trim().toLowerCase();
  if (['kg', 'kgs', 'kilo', 'quilo', 'quilograma'].includes(v)) return 'Kg';
  if (['und', 'un', 'u', 'unid', 'unidade', 'unidades'].includes(v)) return 'Und';
  return null;
}

// Converte a quantidade informada para a base do custo unitário:
// insumo em Kg → quantidade em gramas → divide por 1000; insumo em Und → direto.
function quantidadeBase(quantidade, unidadeInsumo) {
  const q = Number(quantidade);
  return normalizeUnidade(unidadeInsumo) === 'Kg' ? q / 1000 : q;
}

// Unidade em que a quantidade deve ser informada/exibida na ficha ou receita
function unidadeQuantidade(unidadeInsumo) {
  return normalizeUnidade(unidadeInsumo) === 'Kg' ? 'g' : 'und';
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
      orderBy: { nome: 'asc' }
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
      return res.status(400).json({ error: 'Unidade inválida. Use Kg ou Und.' });
    }
    if (custoUnitario === undefined || custoUnitario === null || isNaN(Number(custoUnitario))) {
      return res.status(400).json({ error: 'custoUnitario é obrigatório e deve ser numérico' });
    }
    if (Number(custoUnitario) < 0) {
      return res.status(400).json({ error: 'custoUnitario deve ser maior ou igual a zero' });
    }
    if (tipo !== undefined && tipo !== null && !TIPOS_INSUMO.includes(tipo)) {
      return res.status(400).json({
        error: `tipo inválido. Tipos permitidos: ${TIPOS_INSUMO.join(', ')}`
      });
    }

    const insumo = await prisma.insumo.create({
      data: {
        nome: nome.trim(),
        tipo: tipo ?? 'INGREDIENTE',
        unidade: unidadeNormalizada,
        custoUnitario: Number(custoUnitario),
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
        return res.status(400).json({ error: 'Unidade inválida. Use Kg ou Und.' });
      }
      data.unidade = unidadeNormalizada;
    }
    if (custoUnitario !== undefined) {
      if (custoUnitario === null || isNaN(Number(custoUnitario))) {
        return res.status(400).json({ error: 'custoUnitario inválido' });
      }
      if (Number(custoUnitario) < 0) {
        return res.status(400).json({ error: 'custoUnitario deve ser maior ou igual a zero' });
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
  const custoPorRendimento =
    rendimento > 0 ? round4(custoTotalReceita / rendimento) : null;
  const pesoPorcao =
    receita.pesoPorcao === null || receita.pesoPorcao === undefined
      ? null
      : Number(receita.pesoPorcao);
  const custoPorPorcao =
    pesoPorcao && pesoPorcao > 0 && rendimento > 0
      ? round4((custoTotalReceita / rendimento) * pesoPorcao)
      : null;
  return { ...receita, itens, custoTotalReceita, custoPorRendimento, custoPorPorcao };
}

async function getReceitaCompleta(insumoId) {
  const receita = await prisma.receitaProducao.findUnique({
    where: { insumoId },
    include: { itens: { include: { insumo: true }, orderBy: { id: 'asc' } } }
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

    const { rendimento, unidadeRendimento, pesoPorcao, unidadePorcao, observacoes } =
      req.body ?? {};

    if (rendimento === undefined || rendimento === null || isNaN(Number(rendimento))) {
      return res.status(400).json({ error: 'rendimento é obrigatório e deve ser numérico' });
    }
    if (Number(rendimento) <= 0) {
      return res.status(400).json({ error: 'rendimento deve ser maior que zero' });
    }
    if (typeof unidadeRendimento !== 'string' || unidadeRendimento.trim() === '') {
      return res.status(400).json({ error: 'unidadeRendimento é obrigatória' });
    }
    if (pesoPorcao !== undefined && pesoPorcao !== null && pesoPorcao !== '') {
      if (isNaN(Number(pesoPorcao)) || Number(pesoPorcao) <= 0) {
        return res.status(400).json({ error: 'pesoPorcao deve ser numérico e maior que zero' });
      }
    }

    const data = {
      rendimento: Number(rendimento),
      unidadeRendimento: unidadeRendimento.trim(),
      pesoPorcao:
        pesoPorcao === undefined || pesoPorcao === null || pesoPorcao === ''
          ? null
          : Number(pesoPorcao),
      unidadePorcao:
        unidadePorcao === undefined || unidadePorcao === null || String(unidadePorcao).trim() === ''
          ? null
          : String(unidadePorcao).trim(),
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
      return res.status(400).json({ error: 'rendimento inválido para cálculo de custo' });
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

app.post('/api/produtos', async (req, res) => {
  try {
    const { nome, descricao, precoVenda } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (precoVenda === undefined || precoVenda === null || isNaN(Number(precoVenda))) {
      return res.status(400).json({ error: 'precoVenda é obrigatório e deve ser numérico' });
    }
    if (Number(precoVenda) < 0) {
      return res.status(400).json({ error: 'precoVenda deve ser maior ou igual a zero' });
    }

    const produto = await prisma.produto.create({
      data: {
        nome: nome.trim(),
        descricao: descricao ? String(descricao).trim() : null,
        precoVenda: Number(precoVenda),
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

    const { nome, descricao, precoVenda, ativo } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
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
function computeItemFicha(item) {
  const custoBruto =
    quantidadeBase(item.quantidade, item.insumo.unidade) * Number(item.insumo.custoUnitario);
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
      unidadeQuantidadeFicha: unidadeQuantidade(item.insumo?.unidade),
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
      include: { insumo: true },
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

    const { insumoId, quantidade, tipoUso, formaRateio, quantidadeAtendida, aplicarMargem } =
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

    const insumo = await prisma.insumo.findUnique({ where: { id: Number(insumoId) } });
    if (!insumo || !insumo.ativo) {
      return res.status(404).json({ error: 'Insumo não encontrado' });
    }

    const defaults = defaultsUsoPorTipoInsumo(insumo.tipo);
    const merged = {
      tipoUso: tipoUso ?? defaults.tipoUso,
      formaRateio: formaRateio ?? 'POR_PRODUTO',
      quantidadeAtendida:
        quantidadeAtendida === undefined || quantidadeAtendida === null || quantidadeAtendida === ''
          ? null
          : Number(quantidadeAtendida),
      aplicarMargem: aplicarMargem === undefined ? defaults.aplicarMargem : aplicarMargem
    };
    if (merged.formaRateio === 'POR_PRODUTO') {
      merged.quantidadeAtendida = null;
    }
    const rateioError = validateRateioFields(merged);
    if (rateioError) {
      return res.status(400).json({ error: rateioError });
    }

    const existente = await prisma.fichaTecnicaItem.findUnique({
      where: { produtoId_insumoId: { produtoId, insumoId: Number(insumoId) } }
    });
    if (existente) {
      return res.status(409).json({
        error: 'Insumo já está na ficha técnica deste produto',
        itemId: existente.id
      });
    }

    const item = await prisma.fichaTecnicaItem.create({
      data: {
        produtoId,
        insumoId: Number(insumoId),
        quantidade: Number(quantidade),
        tipoUso: merged.tipoUso,
        formaRateio: merged.formaRateio,
        quantidadeAtendida: merged.quantidadeAtendida,
        aplicarMargem: merged.aplicarMargem
      },
      include: { insumo: true }
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

    const { quantidade, tipoUso, formaRateio, quantidadeAtendida, aplicarMargem } =
      req.body ?? {};

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
    if (aplicarMargem !== undefined) data.aplicarMargem = aplicarMargem;
    if (quantidadeAtendida !== undefined) {
      data.quantidadeAtendida =
        quantidadeAtendida === null || quantidadeAtendida === ''
          ? null
          : Number(quantidadeAtendida);
    }

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
      aplicarMargem: data.aplicarMargem ?? existing.aplicarMargem
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
      include: { insumo: true }
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
      include: { insumo: true }
    });

    const precoVenda = Number(produto.precoVenda);
    const round2 = (n) => Number(n.toFixed(2));

    const produtoOut = {
      id: produto.id,
      nome: produto.nome,
      precoVenda: round2(precoVenda)
    };

    const config = await getConfigPrecificacao();

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
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_FICHA',
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
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_PRECO',
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

    const lucroBruto = precoVenda - custoFichaTecnica;
    const cmvPercentual = (custoFichaTecnica / precoVenda) * 100;
    const margemBrutaPercentual = (lucroBruto / precoVenda) * 100;

    let statusCmv;
    let mensagemDiagnostico;
    if (cmvPercentual <= 30) {
      statusCmv = 'SAUDAVEL';
      mensagemDiagnostico = 'CMV saudável. Produto com boa margem bruta.';
    } else if (cmvPercentual <= 35) {
      statusCmv = 'ATENCAO';
      mensagemDiagnostico = 'CMV em atenção. Acompanhe variações de custo dos insumos.';
    } else if (cmvPercentual <= 40) {
      statusCmv = 'ALERTA';
      mensagemDiagnostico =
        'CMV acima do ideal. Revise preço de venda, ficha técnica e porcionamento.';
    } else {
      statusCmv = 'CRITICO';
      mensagemDiagnostico =
        'CMV crítico. Produto pode estar comprometendo a margem da operação.';
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
      lucroBruto: round2(lucroBruto),
      cmvPercentual: round2(cmvPercentual),
      margemBrutaPercentual: round2(margemBrutaPercentual),
      statusCmv,
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

app.post('/api/custos-fixos', async (req, res) => {
  try {
    const { nome, valorMensal, tipo, observacao } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (valorMensal === undefined || valorMensal === null || isNaN(Number(valorMensal))) {
      return res.status(400).json({ error: 'valorMensal é obrigatório e deve ser numérico' });
    }
    if (Number(valorMensal) < 0) {
      return res.status(400).json({ error: 'valorMensal deve ser maior ou igual a zero' });
    }

    const custo = await prisma.custoFixo.create({
      data: {
        nome: nome.trim(),
        valorMensal: Number(valorMensal),
        tipo: tipo ? String(tipo).trim() : null,
        observacao: observacao ? String(observacao).trim() : null,
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

    const { nome, valorMensal, tipo, observacao, ativo } = req.body ?? {};
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
        include: { fichaTecnica: { include: { insumo: true } } }
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

    const margemContribuicaoReal =
      100 -
      cmvMedioPercentual -
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
      cmvMedioPercentual: round2(cmvMedioPercentual),
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
        include: { fichaTecnica: { include: { insumo: true } } }
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

    const margemContribuicaoReal =
      100 -
      cmvMedioPercentual -
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
      cmvMedioPercentual: round2(cmvMedioPercentual),
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
