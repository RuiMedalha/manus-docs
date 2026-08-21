# Fluxo assistido: fornecedor, IVA, pagamento, arquivo e TOConline

> **Nota fiscal:** sou uma IA, não um profissional de fiscalidade. O DocuFlux pode aplicar regras e preparar uma proposta, mas o contabilista deve validar qualquer tratamento de IVA e qualquer comunicação ao TOConline antes de produzir efeitos fiscais.

## Princípio de funcionamento

O DocuFlux não deve apagar nem esconder o IVA de uma fatura. Deve guardar o total, o IVA suportado e a decisão sobre a parcela dedutível/não dedutível. A regra decide a **proposta de dedução e de custo**, não altera o original nem comunica uma declaração de IVA.

| Campo | Exemplo de finalidade |
| --- | --- |
| `totalCents` | Total da fatura tal como consta do documento. |
| `vatCents` | IVA suportado identificado no documento. |
| `vatDeductibleCents` | IVA que a regra propõe como dedutível, sujeito a revisão. |
| `vatNonDeductibleCents` | IVA que a regra propõe não deduzir e incorporar no custo. |
| `taxRuleCode` e `taxRuleVersion` | Regra aplicada e versão para auditoria. |
| `taxReviewStatus` | `pendente`, `confirmado_contabilista`, `excecao` ou `rejeitado`. |
| `tocOnlineStatus` | `nao_preparado`, `pronto_para_revisao`, `aprovado_para_envio`, `enviado`, `falhou`. |

## Decisão após entrada da fatura

| Situação lida/confirmação humana | Pagamento | Pasta final proposta | Estado TOConline |
| --- | --- | --- | --- |
| Fatura de fornecedor com vencimento e sem prova de pagamento | Criar proposta em **Faturas a pagar**; requer conta, categoria e aprovação. | `/Contabilidade/Faturas a pagar/AAAA/MM/Fornecedor` | Pronto para revisão depois da conferência fiscal. |
| Fatura já paga por cartão, transferência ou caixa | Não criar pagamento pendente; registar forma/data de liquidação se confirmada. | `/Contabilidade/Despesas/Categoria/AAAA/MM/Fornecedor` | Pronto para revisão. |
| Débito direto (água, luz, telefone, telecomunicações) | Marcar como recorrente/débito direto após confirmação; não duplicar pagamento manual. | `/Contabilidade/Despesas/Utilidades/AAAA/MM/Fornecedor` | Pronto para revisão. |
| Documento sem impacto de pagamento, por exemplo guia/remessa | Não criar proposta de pagamento. | Pasta operacional aplicável. | Não preparado, salvo decisão humana. |

## Regras de IVA propostas, nunca automáticas

O artigo 21.º do CIVA exclui em regra a dedução em alimentação, bebidas, receção e algumas despesas de viaturas; para certos combustíveis existe uma regra de 50%, sujeita a exceções ligadas ao combustível, veículo e utilização.[1]

| Categoria reconhecida | Proposta inicial do DocuFlux | Revisão obrigatória |
| --- | --- | --- |
| Refeições, alimentação, bebidas ou receção | Despesa; `vatDeductibleCents = 0`; IVA suportado fica registado como não dedutível e integra o custo proposto. | Confirmar se existe exceção legal aplicável. |
| Combustível | Despesa de combustível; pedir tipo de combustível, veículo e uso antes de propor percentagem. | Contabilista confirma a percentagem e qualquer exceção. Nunca assumir 100%. |
| Água, eletricidade, telefone e telecomunicações | Despesa/utilidade; conservar IVA e marcar revisão normal. | Confirmar enquadramento da entidade e da atividade. |
| Outro ou ambíguo | `requer revisão fiscal`; não calcular IVA dedutível. | Contabilista escolhe a regra. |

## Fornecedores e TOConline

O DocuFlux cria uma **ficha local proposta** quando identifica um novo fornecedor por NIF/nome. Essa criação local não cria nada no TOConline.

No TOConline, a API de documentos de compra pode criar automaticamente o fornecedor quando recebe um NIF ainda inexistente, e a criação de um documento de compra v1 é finalizada automaticamente.[2] Por este motivo, o DocuFlux deve usar três passos explícitos:

1. **Preparar proposta TOConline:** valida fornecedor, NIF, tipo, linhas/categoria, IVA, vencimento e referência externa, sem enviar.
2. **Revisão contabilista:** mostra diferenças, regra IVA aplicada e o payload. O contabilista confirma fornecedor e valores.
3. **Enviar ao TOConline:** ação irreversível confirmada; guardar ID externo, hash/payload, hora, utilizador e resposta. Em falha, não reenviar cegamente; procurar primeiro pelo `external_reference`/ID de exportação.

O TOConline também disponibiliza criação e consulta de fornecedores pela API.[3] A primeira integração deve começar com **consulta**; a criação de fornecedor e de documento deve ficar atrás da revisão explicitamente aprovada.

## O que o sistema fará

1. Recebe a fatura, lê QR/OCR/Gemini e identifica fornecedor, total, IVA, data, vencimento e natureza.
2. Propõe pagamento pendente ou marca como já pago/débito direto após confirmação.
3. Propõe uma pasta final por estado, categoria, mês e fornecedor.
4. Aplica uma regra fiscal versionada e apresenta IVA suportado, dedutível proposto, não dedutível proposto e custo proposto.
5. Exige revisão humana para regra de IVA, exceção, fornecedor novo, conta/categoria e envio TOConline.
6. Só depois cria uma exportação TOConline auditada. Nunca submete declaração de IVA nem executa pagamentos.

## Regras que o contabilista deve confirmar antes de ativar

1. Categorias internas e contas TOConline para alimentação, combustível, água, eletricidade, telecomunicações e compras.
2. Tratamento de IVA para cada tipo de combustível, veículo e utilização da empresa.
3. Critério que distingue `a pagar`, `pago`, `débito direto`, `cartão` e `transferência`.
4. Estrutura final de pastas e quem pode aprovar/exportar.
5. Série/tipo de documento de compra e credenciais OAuth TOConline.

## Referências

[1]: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva21.aspx "Autoridade Tributária e Aduaneira — Artigo 21.º do CIVA"
[2]: https://api-docs.toconline.pt/apis/compras/documentos-de-compra "TOConline API — Documentos de compra"
[3]: https://api-docs.toconline.pt/apis/empresa/fornecedores "TOConline API — Fornecedores"
