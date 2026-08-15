# Fluxo de entidades e aprovação de pagamentos

## Da fatura ao pagamento

Uma fatura recebida passa por quatro etapas controladas. O OCR lê nome, NIF, número, datas, total e IVA; em seguida, o DocuFlux procura um fornecedor no tenant pelo NIF e cria uma proposta quando não o encontra. A entidade mantém o estado **proposto** até um utilizador a confirmar na área **Entidades e contas**.

Depois de aplicar a sugestão OCR, a fatura cria uma proposta de pagamento. A proposta não pode ser liquidada: um utilizador com autorização seleciona primeiro uma **conta bancária** de débito e uma **categoria de despesa**. A ação de aprovação cria um registo de auditoria e passa a proposta para `aprovada`; só então a opção de marcar como paga fica disponível no calendário.

| Estado | Ação permitida | Regras obrigatórias |
| --- | --- | --- |
| Entidade proposta | Confirmar ou corrigir | Nome, NIF quando disponível, tipo fornecedor/cliente |
| Pagamento proposto | Aprovar ou rejeitar | Conta bancária e categoria de despesa |
| Pagamento aprovado | Marcar como pago | Preserva fornecedor, documento e classificações escolhidas |
| Pagamento pago | Consultar e conciliar | Mantém data de liquidação e trilho de auditoria |

## Como configurar

Na área **Entidades e contas**, crie uma conta do tipo **Banco** para cada conta que possa ser debitada e crie as categorias de despesa/receita usadas pela empresa. Na área **Aprovações**, escolha a conta e a categoria para cada proposta. A aplicação impede que pagamentos propostos, sem conta bancária ou sem categoria sejam liquidados.

Clientes seguem o mesmo modelo de identificação por NIF, mas são usados para faturas emitidas, contactos CRM e receitas; não geram automaticamente pagamentos a fornecedores.
