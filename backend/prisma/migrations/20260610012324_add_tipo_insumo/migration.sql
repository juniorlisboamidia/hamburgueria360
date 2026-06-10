-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('INGREDIENTE', 'PRODUCAO_PROPRIA', 'BEBIDA', 'HORTIFRUTI', 'EMBALAGEM', 'ACOMPANHAMENTO', 'OPERACIONAL');

-- AlterTable
ALTER TABLE "Insumo" ADD COLUMN     "tipo" "TipoInsumo" NOT NULL DEFAULT 'INGREDIENTE';

-- CreateIndex
CREATE INDEX "Insumo_tipo_idx" ON "Insumo"("tipo");
