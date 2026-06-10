-- CreateTable
CREATE TABLE "ReceitaProducao" (
    "id" SERIAL NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "rendimento" DECIMAL(10,3) NOT NULL,
    "unidadeRendimento" TEXT NOT NULL,
    "pesoPorcao" DECIMAL(10,3),
    "unidadePorcao" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceitaProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaProducaoItem" (
    "id" SERIAL NOT NULL,
    "receitaId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceitaProducaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaProducao_insumoId_key" ON "ReceitaProducao"("insumoId");

-- CreateIndex
CREATE INDEX "ReceitaProducaoItem_receitaId_idx" ON "ReceitaProducaoItem"("receitaId");

-- CreateIndex
CREATE INDEX "ReceitaProducaoItem_insumoId_idx" ON "ReceitaProducaoItem"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaProducaoItem_receitaId_insumoId_key" ON "ReceitaProducaoItem"("receitaId", "insumoId");

-- AddForeignKey
ALTER TABLE "ReceitaProducao" ADD CONSTRAINT "ReceitaProducao_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaProducaoItem" ADD CONSTRAINT "ReceitaProducaoItem_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "ReceitaProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceitaProducaoItem" ADD CONSTRAINT "ReceitaProducaoItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
