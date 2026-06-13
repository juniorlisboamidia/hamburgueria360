-- AlterTable
ALTER TABLE "ComboItem" ADD COLUMN     "incluirEmbalagemIndividual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComboInsumo" (
    "id" SERIAL NOT NULL,
    "comboId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "modoUsoQuantidade" TEXT DEFAULT 'BASE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComboInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboInsumo_comboId_idx" ON "ComboInsumo"("comboId");

-- CreateIndex
CREATE INDEX "ComboInsumo_insumoId_idx" ON "ComboInsumo"("insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboInsumo_comboId_insumoId_key" ON "ComboInsumo"("comboId", "insumoId");

-- AddForeignKey
ALTER TABLE "ComboInsumo" ADD CONSTRAINT "ComboInsumo_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboInsumo" ADD CONSTRAINT "ComboInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
