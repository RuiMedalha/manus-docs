# DocuFlux e Moloni: dados, limites e ativação futura

## Estado atual

O DocuFlux é atualmente o sistema de **captura, leitura, organização, revisão e conferência** documental. Não existe ainda uma ligação autenticada ao Moloni; por isso, não são criadas nem alteradas fichas, artigos, documentos ou movimentos de stock no Moloni. A área de integrações apenas prepara o conector para uma ativação futura.

## Dados que ficam guardados de uma fatura

| Grupo | Dados guardados no DocuFlux |
| --- | --- |
| Ficheiro e origem | Ficheiro no armazenamento privado, chave de ficheiro, nome original, tipo, tamanho, hash SHA-256, origem, remetente de email quando aplicável e data de criação. |
| Identificação fiscal | Tipo de documento, entidade, NIF, número, data, vencimento, total, IVA, moeda e etiquetas. |
| OCR e revisão | Texto extraído, sugestão estruturada, confiança, erros/tentativas e estado de revisão. |
| Organização | Pasta sugerida, pasta final, motivo de arquivo e logs de auditoria. |
| Financeiro local | Registo financeiro local e, para faturas recebidas com valor e vencimento, proposta de pagamento sujeita à política de aprovação. |

## Classificação contabilística atual

O OCR classifica a natureza como **despesa, receita, imposto, tesouraria, suporte operacional, sem relevância contabilística ou requer revisão**. Também produz um resumo contabilístico, a área de arquivo, o motivo da sugestão e a indicação de revisão necessária. Esta informação é uma **proposta assistida**: não é, nem pretende ser, um lançamento oficial em contabilidade sem revisão humana.

Quando o utilizador aplica a sugestão, o DocuFlux pode criar uma ficha local de fornecedor ou cliente em estado `proposto`, associar a fatura, gerar o registo financeiro local e criar uma proposta de pagamento quando a fatura recebida tiver valor e vencimento. A ficha pode ser revista, completada e ativada na área **Entidades & contas**.

## Moloni: capacidades e ativação recomendada

O Moloni disponibiliza API para entidades, artigos, documentos de venda/compra e movimentos de stock.[1] [2] [3] A documentação da fatura de fornecedor confirma que fechar o documento pode movimentar stock dos artigos com gestão de stock, inclusive por armazém; também esclarece que o preço de compra do artigo não é atualizado automaticamente por essa inserção.[1]

| Etapa | Operações permitidas | Operações bloqueadas |
| --- | --- | --- |
| **1. Consulta** | Ler fornecedores, clientes, artigos, stock e documentos Moloni para conferência. | Qualquer criação, alteração ou stock. |
| **2. Propostas** | Comparar NIF/referência, sugerir criar ficha local ou mapear artigo e preparar um rascunho. | Enviar documentos, criar fichas ou movimentar stock automaticamente. |
| **3. Escrita aprovada** | Após aprovação explícita: criar/atualizar ficha no Moloni, criar documento de compra em rascunho e guardar o ID externo. | Fechar documentos ou movimentar stock sem segunda confirmação. |
| **4. Movimento de stock** | Só para linhas de artigo confirmadas, armazém definido e documento fechado por utilizador autorizado. | Inferir artigos, quantidades ou armazéns apenas a partir de OCR. |

> A recomendação é começar em modo de **consulta e conferência**. Só depois de comparar resultados com documentos reais se deve ativar escrita, primeiro em rascunho e depois, se necessário, movimentos de stock controlados.

O Moloni ON indica ainda que o acesso por API requer um cliente OAuth 2.0 ou API key e, para endpoints de empresa, o add-on de acesso à API da empresa.[4]

## Perguntas frequentes

| Pergunta | Resposta atual |
| --- | --- |
| A fatura é descarregada e guardada? | Sim. O original fica guardado no armazenamento privado e os metadados/OCR no tenant. |
| O DocuFlux diz como contabilizar? | Sugere natureza, resumo, arquivo e pagamento; exige revisão humana. |
| Novo fornecedor cria ficha? | Sim, cria uma **ficha local proposta** quando a sugestão OCR é aplicada. Ainda não cria a ficha no Moloni. |
| Fornecedores e clientes abrem ficha? | Sim, têm fichas locais editáveis no DocuFlux. A sincronização atual é apenas pelo conector CRM REST genérico configurado. |
| Os produtos entram no stock Moloni? | Não atualmente. Isso será uma fase transacional posterior, com confirmação de artigo, quantidade, armazém e documento. |
| O Moloni é só leitura? | Hoje não está ligado. Quando for ativado, começará por leitura/conferência; a escrita e o stock ficam desligados até aprovação explícita. |

## Referências

[1]: https://www.moloni.pt/dev/documents/supplier-invoices/insert/ "Moloni API — Inserir fatura de fornecedor"
[2]: https://www.moloni.pt/dev/products/product-stocks/ "Moloni API — Movimentos de stock"
[3]: https://www.moloni.pt/dev/documents/ "Moloni API — Documentos"
[4]: https://docs.molonion.pt/ "Moloni ON API — Acesso e capacidades"
