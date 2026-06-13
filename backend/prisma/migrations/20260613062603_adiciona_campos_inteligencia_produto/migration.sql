-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "incluirAnaliseEstrategica" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "produtoAncora" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tipoBebidaAnalise" TEXT;
