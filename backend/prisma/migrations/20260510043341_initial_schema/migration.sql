-- CreateEnum
CREATE TYPE "CategoriaCustoVariavel" AS ENUM ('TAXA_CARTAO', 'MARKETPLACE', 'EMBALAGEM', 'ENTREGA', 'IMPOSTO', 'CUPOM', 'COMISSAO', 'OUTROS');

-- CreateEnum
CREATE TYPE "TipoCalculoCustoVariavel" AS ENUM ('PERCENTUAL_FATURAMENTO', 'VALOR_POR_PEDIDO', 'VALOR_FIXO_MENSAL_VARIAVEL');

-- CreateTable
CREATE TABLE "Insumo" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "custoUnitario" DECIMAL(12,4) NOT NULL,
    "fornecedor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "precoVenda" DECIMAL(12,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaTecnicaItem" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaTecnicaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoFixo" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "valorMensal" DECIMAL(12,2) NOT NULL,
    "tipo" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoFixo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoVariavel" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaCustoVariavel" NOT NULL,
    "tipoCalculo" "TipoCalculoCustoVariavel" NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustoVariavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaturamentoDiario" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "quantidadePedidos" INTEGER NOT NULL,
    "canal" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaturamentoDiario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Insumo_nome_idx" ON "Insumo"("nome");

-- CreateIndex
CREATE INDEX "Insumo_ativo_idx" ON "Insumo"("ativo");

-- CreateIndex
CREATE INDEX "Produto_nome_idx" ON "Produto"("nome");

-- CreateIndex
CREATE INDEX "Produto_ativo_idx" ON "Produto"("ativo");

-- CreateIndex
CREATE INDEX "FichaTecnicaItem_produtoId_idx" ON "FichaTecnicaItem"("produtoId");

-- CreateIndex
CREATE INDEX "FichaTecnicaItem_insumoId_idx" ON "FichaTecnicaItem"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "FichaTecnicaItem_produtoId_insumoId_key" ON "FichaTecnicaItem"("produtoId", "insumoId");

-- CreateIndex
CREATE INDEX "CustoFixo_ativo_idx" ON "CustoFixo"("ativo");

-- CreateIndex
CREATE INDEX "CustoVariavel_ativo_idx" ON "CustoVariavel"("ativo");

-- CreateIndex
CREATE INDEX "CustoVariavel_categoria_idx" ON "CustoVariavel"("categoria");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_data_idx" ON "FaturamentoDiario"("data");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_canal_idx" ON "FaturamentoDiario"("canal");

-- CreateIndex
CREATE INDEX "FaturamentoDiario_ativo_idx" ON "FaturamentoDiario"("ativo");

-- AddForeignKey
ALTER TABLE "FichaTecnicaItem" ADD CONSTRAINT "FichaTecnicaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTecnicaItem" ADD CONSTRAINT "FichaTecnicaItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
