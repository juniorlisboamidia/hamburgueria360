-- CreateEnum
CREATE TYPE "TipoUsoFicha" AS ENUM ('INGREDIENTE', 'EMBALAGEM', 'ACOMPANHAMENTO', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "FormaRateioFicha" AS ENUM ('POR_PRODUTO', 'POR_EMBALAGEM', 'POR_PEDIDO');

-- AlterTable
ALTER TABLE "FichaTecnicaItem" ADD COLUMN     "aplicarMargem" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "formaRateio" "FormaRateioFicha" NOT NULL DEFAULT 'POR_PRODUTO',
ADD COLUMN     "quantidadeAtendida" DECIMAL(10,3),
ADD COLUMN     "tipoUso" "TipoUsoFicha" NOT NULL DEFAULT 'INGREDIENTE';
