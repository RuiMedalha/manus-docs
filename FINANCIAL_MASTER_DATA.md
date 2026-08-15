# Entidades, pagamentos e ligação a CRM

## Fluxo de uma fatura de fornecedor

Quando o OCR classifica um documento como `fatura_recebida`, o sistema propõe uma entidade do tipo **fornecedor** usando o nome e o NIF extraídos. Primeiro procura uma entidade existente no mesmo tenant pelo NIF normalizado; se existir, associa-a ao documento. Caso contrário, cria uma proposta de fornecedor, que um utilizador confirma ou corrige. O mesmo padrão é aplicado a `fatura_emitida`, com uma entidade do tipo **cliente**.

A fatura recebida só gera um pagamento após ter entidade, total e vencimento válidos. A proposta fica em estado `proposta`, com aprovação explícita. O utilizador escolhe a conta bancária a debitar e a categoria/conta de despesa; depois de aprovada, aparece no calendário como `pendente`. A confirmação de pagamento guarda a data de liquidação e mantém a ligação ao documento original.

| Elemento | Finalidade | Exemplo |
| --- | --- | --- |
| Entidade | Fornecedor, cliente ou ambos, identificado preferencialmente por NIF | ACME, Lda. · PT 501234567 |
| Conta bancária | Conta de liquidez a debitar ou creditar | Banco principal · PT50… |
| Categoria/conta | Classificação de despesa ou receita | Serviços externos · 622 |
| Proposta de pagamento | Instrução financeira ainda sujeita a aprovação | Fatura FT 2026/42 · 184,50 € |
| Integração CRM | Mapeamento seguro entre entidades DocuFlux e contactos externos | `externalContactId` + data da última sincronização |

## Integração CRM

O MVP disponibiliza um conector CRM genérico e manual: guarda o fornecedor de CRM, URL base, mapeamento de campos e o identificador externo do contacto. As credenciais nunca ficam na base de dados em texto simples; serão guardadas como segredos do ambiente quando for escolhido o CRM concreto. A sincronização inicial é acionada manualmente para evitar criar ou atualizar contactos inesperadamente. Posteriormente poderá ser acrescentada sincronização agendada e webhooks.

## Regras de segurança

Entidades, contas, propostas de pagamento e vínculos CRM têm `tenantId` obrigatório. A criação automática pelo OCR é sempre uma proposta e nunca aprova um pagamento nem escreve no CRM sem decisão de utilizador autorizado. As ações de associar entidade, aprovar/rejeitar pagamento e sincronizar CRM ficam no histórico de auditoria.
