-- AlterTable
ALTER TABLE "ConfiguracaoPrecificacao" ADD COLUMN     "campanhaInteligente" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "lucroDesejadoPercentual" DECIMAL(10,2) NOT NULL DEFAULT 20.00;
