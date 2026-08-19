# Percurso completo de uma fatura de fornecedor

Este guia descreve o fluxo **atualmente ativo** no DocuFlux para uma fatura de compra. O objetivo é que cada decisão seja verificável: o sistema propõe e organiza, mas não lança pagamentos bancários, não altera stock e não escreve num software externo sem uma futura integração aprovada.

> Use sempre a organização correta. A Inbox, os documentos, as entidades, os pagamentos, as regras e a auditoria são isolados por organização.

## 1. Entrada do documento

Abra **Inbox → Adicionar documento** e escolha uma das formas de entrada abaixo.

| Origem | Ação | Resultado imediato |
| --- | --- | --- |
| PDF, JPG, PNG ou DOCX | Escolher o ficheiro ou arrastá-lo para a Inbox. | O ficheiro é validado e preparado para upload. |
| Câmara do telemóvel | Em telemóvel, escolher **Fotografar ou escolher ficheiro**; o browser solicita a câmara traseira. | A fotografia entra no mesmo fluxo documental. |
| QR Code AT | Fotografar/carregar um JPG ou PNG com QR Code AT. | São pré-preenchidos, quando disponíveis, NIF do emitente, número, data e tipo; confirme-os antes de guardar. |
| Scanner físico | Digitalizar para PDF/JPG/PNG e escolher o ficheiro na Inbox. | O scanner é tratado como upload manual. |
| Email/Outlook (quando for ligado) | Selecionar anexos ou links confirmados na área Outlook/Inbox. | O documento entra como origem `email`, com remetente e auditoria. |

O DocuFlux aceita apenas PDF, JPG, PNG ou DOCX até 10 MB. Ao guardar, conserva o original no armazenamento privado, calcula um hash SHA-256 e bloqueia duplicados exatos no mesmo tenant. O documento começa com estado **Novo** e entra na fila de OCR.

## 2. Dados antes do OCR

Antes de clicar em **Guardar na Inbox**, pode preencher ou corrigir manualmente o tipo, fornecedor, número do documento e total. Estes campos ajudam a pesquisa e não impedem a revisão posterior. No caso de QR AT, os dados são apenas pré-preenchidos: não substituem a validação do original.

## 3. Fila e análise OCR

Depois do upload, use **Processar pendentes** na Inbox. Se o processamento automático estiver ativado, os documentos novos também podem ser processados pela rotina configurada. O trabalho passa por `Na fila`, `A processar`, `Sugestão pronta` ou `Falhou`; uma falha mostra o motivo e pode ser reenviada.

O OCR extrai texto e gera uma sugestão estruturada.

| Campo sugerido | Finalidade |
| --- | --- |
| Tipo e papel da entidade | Identificar, por exemplo, **fatura recebida** e **fornecedor**. |
| Entidade e NIF | Reconhecer ou propor o fornecedor. |
| Número, datas, vencimento, total, IVA e moeda | Preparar a conferência financeira e o pagamento. |
| Natureza contabilística | `despesa`, `receita`, `imposto`, `tesouraria`, `suporte operacional`, `sem relevância` ou `requer revisão`. |
| Resumo contabilístico e confiança | Explicar a classificação e indicar se requer revisão. |
| Área, motivo e pasta sugeridos | Propor o arquivo lógico, por exemplo `/Contabilidade/Compras/2026/08/Fornecedor`. |

O OCR não cria um lançamento contabilístico oficial. É uma sugestão assistida e deve ser conferida com o PDF/foto original, sobretudo para IVA, totais, vencimento, fornecedor e linhas de artigo.

## 4. Revisão e aplicação da sugestão

Na linha do documento, abra **Ver resumo OCR** para ler o conteúdo extraído e a classificação sem abrir o ficheiro. Abra o documento original pelo ícone de visualização quando precisar de confirmar os dados. Depois escolha **Rever sugestão**.

Confirme ou corrija tipo, entidade, NIF, número, datas, valores, natureza contabilística e pasta. Pode alterar a pasta sugerida no próprio diálogo ou usar o ícone de **pasta** na Inbox para selecionar uma pasta já usada ou escrever uma nova pasta absoluta. Por fim, clique **Aplicar sugestão**.

Ao aplicar, o documento fica em **Em revisão**, é gravado com os metadados confirmados, a pasta final e a auditoria da decisão.

## 5. Ficha do fornecedor

Quando a sugestão identifica uma entidade, o DocuFlux procura primeiro uma ficha da organização pelo NIF ou nome normalizado. Se não existir, cria uma ficha local com tipo **fornecedor** e estado **Proposto**. Aceda a **Entidades & contas** para completar email, telefone, morada, categoria, estado ou corrigir uma associação.

| Situação | Ação recomendada |
| --- | --- |
| Fornecedor encontrado pelo NIF | Confirmar que nome e NIF correspondem ao documento. |
| Fornecedor novo | Rever a ficha proposta; completar dados antes de a usar operacionalmente. |
| OCR associa fornecedor errado | Corrigir na revisão da fatura e rever/arquivar a ficha proposta indevida. |
| Cliente num documento de compra | Corrigir o papel da entidade antes de aplicar a sugestão. |

Atualmente, esta ficha é **local ao DocuFlux**. Não é criada nem aberta automaticamente no Moloni; isso só será possível depois de ativar uma integração Moloni com permissão explícita de escrita.

## 6. Registo financeiro e proposta de pagamento

Ao aplicar a sugestão, o DocuFlux cria um registo financeiro local quando existe valor. Para uma **fatura recebida** que tenha total e vencimento, cria ou atualiza uma proposta no calendário de pagamentos.

Abra **Pagamentos** e confirme contraparte, valor, data de vencimento e moeda. Associe a **conta de débito** e a **categoria financeira** adequadas. A proposta só fica pronta para aprovação quando estiver aprovada e tiver ambas as associações.

| Estado | Significado |
| --- | --- |
| Proposta | Criada pela revisão OCR ou manualmente; ainda não é uma ordem de pagamento. |
| Aprovada | Passou as políticas configuradas por montante, categoria e papel. |
| Rejeitada | Não deve ser paga; mantenha a decisão auditada. |
| Pendente | Preparada para pagamento, mas ainda não liquidada. |
| Pago | Foi marcada manualmente como liquidada, com data de pagamento. |

O DocuFlux não envia dinheiro nem debita a conta bancária. A marcação de pago é uma confirmação operacional, não uma instrução bancária.

## 7. Conciliação bancária

Depois de pagar, importe o extrato CSV em **Extratos**. Escolha/crie um modelo de colunas, confirme o período e importe. O sistema normaliza os movimentos, bloqueia reimportações do mesmo ficheiro e apresenta movimentos em **Conciliação**.

As sugestões de conciliação comparam referência, entidade, data e valor entre movimento bancário e registo financeiro. Reveja a força da sugestão e escolha **Aceitar** ou **Rejeitar**. Ao aceitar, a conciliação fica registada com o utilizador e a data.

## 8. Resultado final esperado

No fim do percurso, deve conseguir localizar a fatura pela Inbox e pela pasta final, abrir o original por URL segura, ver o resumo OCR, consultar a ficha do fornecedor, encontrar a proposta/estado de pagamento e, após a importação do extrato, ver a respetiva conciliação. Cada passo crítico fica registado na área **Auditoria**.

## Checklist de teste manual

| Verificação | Resultado esperado |
| --- | --- |
| Upload de ficheiro válido | Documento novo, hash e fila OCR. |
| QR AT numa foto | Dados fiscais pré-preenchidos para confirmação. |
| OCR | Sugestão com fornecedor, valores, natureza, confiança e pasta. |
| Aplicar sugestão | Metadados, ficha local proposta, pasta e estado em revisão. |
| Pagamento | Proposta com valor/vencimento; conta e categoria selecionáveis. |
| Aprovação | Bloqueada sem conta/categoria e sujeita à política aplicável. |
| Extrato CSV | Movimento importado e sugestão de conciliação auditável. |

## Limites atuais deliberados

1. Não há escrita no Moloni, criação de produtos, movimento de stock ou lançamento contabilístico oficial.
2. A classificação OCR, a categoria e a pasta são sempre revisáveis por uma pessoa autorizada.
3. O pagamento é acompanhado e confirmado no DocuFlux, mas não executado pelo sistema.
4. A leitura de emails e links de fornecedor só fica disponível quando a caixa Microsoft 365 for ligada e autorizada.
