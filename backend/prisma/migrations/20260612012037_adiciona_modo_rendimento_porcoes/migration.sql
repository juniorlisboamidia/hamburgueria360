-- AlterTable
ALTER TABLE "ReceitaProducao" ADD COLUMN     "modoRendimento" TEXT DEFAULT 'TOTAL',
ADD COLUMN     "quantidadePorcoes" DECIMAL(10,3);
