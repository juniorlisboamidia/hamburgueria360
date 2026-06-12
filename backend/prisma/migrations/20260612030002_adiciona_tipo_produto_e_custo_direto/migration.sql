-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "custoDireto" DECIMAL(12,2),
ADD COLUMN     "tipoProduto" TEXT NOT NULL DEFAULT 'PRODUTO';
