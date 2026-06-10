-- AlterTable
ALTER TABLE "ConfiguracaoPrecificacao" ADD COLUMN     "cupomDesconto" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "maiorTaxaEntrega" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "taxaPagamentoOnlinePercentual" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "taxaRepasseAntecipadoPercentual" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "ticketMedioDelivery" DECIMAL(10,2) NOT NULL DEFAULT 40.00;
