-- CreateTable
CREATE TABLE "ConfiguracaoPrecificacao" (
    "id" SERIAL NOT NULL,
    "cmvAlvoPercentual" DECIMAL(10,2) NOT NULL DEFAULT 32.00,
    "taxaIfoodPercentual" DECIMAL(10,2) NOT NULL DEFAULT 23.00,
    "campanhaIfoodPercentual" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "custoFixoIfood" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "produtosPorPedidoIfood" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoPrecificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfiguracaoPrecificacao_ativo_idx" ON "ConfiguracaoPrecificacao"("ativo");
