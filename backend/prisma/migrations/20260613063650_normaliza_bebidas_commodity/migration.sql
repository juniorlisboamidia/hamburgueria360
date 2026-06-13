-- Normaliza bebidas existentes sem configuração estratégica explícita:
-- refrigerantes/bebidas comuns (tipoBebidaAnalise ainda NULL) ficam COMMODITY
-- e fora da análise estratégica. Bebidas já classificadas (ex.: AUTORAL) são
-- preservadas. Não afeta PRODUTO nem COMBO. Migração apenas de dados.
UPDATE "Produto"
SET
  "incluirAnaliseEstrategica" = false,
  "tipoBebidaAnalise" = 'COMMODITY'
WHERE "tipoProduto" = 'BEBIDA'
  AND "tipoBebidaAnalise" IS NULL;
