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

app.get('/api/insumos', async (req, res) => {
  try {
    const insumos = await prisma.insumo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });
    res.json(insumos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao listar insumos' });
  }
});

app.post('/api/insumos', async (req, res) => {
  try {
    const { nome, unidade, custoUnitario, fornecedor } = req.body ?? {};

    if (typeof nome !== 'string' || nome.trim() === '') {
      return res.status(400).json({ error: 'nome é obrigatório' });
    }
    if (typeof unidade !== 'string' || unidade.trim() === '') {
      return res.status(400).json({ error: 'unidade é obrigatória' });
    }
    if (custoUnitario === undefined || custoUnitario === null || isNaN(Number(custoUnitario))) {
      return res.status(400).json({ error: 'custoUnitario é obrigatório e deve ser numérico' });
    }
    if (Number(custoUnitario) < 0) {
      return res.status(400).json({ error: 'custoUnitario deve ser maior ou igual a zero' });
    }

    const insumo = await prisma.insumo.create({
      data: {
        nome: nome.trim(),
        unidade: unidade.trim(),
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

    const { nome, unidade, custoUnitario, fornecedor, ativo } = req.body ?? {};
    const data = {};

    if (nome !== undefined) {
      if (typeof nome !== 'string' || nome.trim() === '') {
        return res.status(400).json({ error: 'nome inválido' });
      }
      data.nome = nome.trim();
    }
    if (unidade !== undefined) {
      if (typeof unidade !== 'string' || unidade.trim() === '') {
        return res.status(400).json({ error: 'unidade inválida' });
      }
      data.unidade = unidade.trim();
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

    let custoTotalFicha = 0;
    const itens = itensRaw.map((item) => {
      const qtd = Number(item.quantidade);
      const custoUnit = Number(item.insumo.custoUnitario);
      const custoItem = qtd * custoUnit;
      custoTotalFicha += custoItem;
      return {
        ...item,
        custoItem: Number(custoItem.toFixed(4))
      };
    });

    res.json({
      produto,
      itens,
      custoTotalFicha: Number(custoTotalFicha.toFixed(4))
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

    const { insumoId, quantidade } = req.body ?? {};

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
        quantidade: Number(quantidade)
      },
      include: { insumo: true }
    });

    res.status(201).json(item);
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

    const { quantidade } = req.body ?? {};
    if (quantidade === undefined || quantidade === null || isNaN(Number(quantidade))) {
      return res.status(400).json({ error: 'quantidade é obrigatória e deve ser numérica' });
    }
    if (Number(quantidade) <= 0) {
      return res.status(400).json({ error: 'quantidade deve ser maior que zero' });
    }

    const existing = await prisma.fichaTecnicaItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Item da ficha técnica não encontrado' });
    }

    const updated = await prisma.fichaTecnicaItem.update({
      where: { id },
      data: { quantidade: Number(quantidade) },
      include: { insumo: true }
    });

    res.json(updated);
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

    if (itens.length === 0) {
      return res.json({
        produto: produtoOut,
        precoVenda: round2(precoVenda),
        custoFichaTecnica: 0,
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_FICHA',
        mensagemDiagnostico:
          'Produto sem ficha técnica cadastrada. Cadastre os insumos para calcular CMV e margem real.'
      });
    }

    const custoFichaTecnica = itens.reduce((acc, item) => {
      return acc + Number(item.quantidade) * Number(item.insumo.custoUnitario);
    }, 0);

    if (precoVenda === 0) {
      return res.json({
        produto: produtoOut,
        precoVenda: 0,
        custoFichaTecnica: round2(custoFichaTecnica),
        lucroBruto: null,
        cmvPercentual: null,
        margemBrutaPercentual: null,
        statusCmv: 'SEM_PRECO',
        mensagemDiagnostico:
          'Produto sem preço de venda válido para cálculo de CMV e margem.'
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

    res.json({
      produto: produtoOut,
      precoVenda: round2(precoVenda),
      custoFichaTecnica: round2(custoFichaTecnica),
      lucroBruto: round2(lucroBruto),
      cmvPercentual: round2(cmvPercentual),
      margemBrutaPercentual: round2(margemBrutaPercentual),
      statusCmv,
      mensagemDiagnostico
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
      const custoFicha = p.fichaTecnica.reduce(
        (acc, item) => acc + Number(item.quantidade) * Number(item.insumo.custoUnitario),
        0
      );
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
      const custoFicha = p.fichaTecnica.reduce(
        (acc, item) => acc + Number(item.quantidade) * Number(item.insumo.custoUnitario),
        0
      );
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
