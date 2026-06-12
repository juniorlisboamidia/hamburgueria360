-- AlterTable
ALTER TABLE "CustoFixo" ADD COLUMN     "calcularEncargos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "salarioBase" DECIMAL(12,2),
ADD COLUMN     "tipoColaborador" TEXT,
ADD COLUMN     "tipoCusto" TEXT DEFAULT 'GERAL';
