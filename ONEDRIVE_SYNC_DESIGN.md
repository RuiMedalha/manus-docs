# OneDrive e DocuFlux: desenho de sincronização documental

## Objetivo

O OneDrive será uma **origem documental externa**. Os ficheiros selecionados nas pastas OneDrive entram na Inbox do DocuFlux, ficam guardados no armazenamento privado do DocuFlux e seguem o mesmo circuito de deduplicação, OCR, classificação, pasta sugerida e auditoria dos uploads manuais.

> A primeira versão não apaga, move, renomeia nem altera ficheiros no OneDrive. Também não transforma automaticamente as pastas lógicas do DocuFlux num espelho físico do OneDrive.

## Escolha de comportamento

Antes de ativar o conector, deve escolher o comportamento pretendido. Os três modelos abaixo são viáveis, mas têm compromissos diferentes.

| Abordagem | Como funciona | Vantagens | Limites | Complexidade |
| --- | --- | --- | --- | --- |
| **Importação manual** | O utilizador escolhe uma pasta, pré-visualiza os ficheiros e confirma os documentos a importar. | Máximo controlo; sem execução em segundo plano; ideal para começar. | Requer uma ação do utilizador. | Baixa |
| **Importação incremental periódica** | A aplicação consulta as alterações desde a última sincronização e apresenta/importa novos ficheiros de acordo com a política definida. | Automatiza sem depender de webhooks; usa `deltaLink`. | Pode haver atraso entre a alteração e a importação. | Média |
| **Notificação imediata** | O OneDrive avisa a aplicação por HTTPS quando há alterações; a aplicação consulta a alteração e enfileira a importação. | Menor atraso e menos consultas. | Requer endpoint público, validação de webhook, fila e renovação de subscrições. | Elevada |

O Microsoft Graph suporta consultas delta para enumerar alterações e guardar um `@odata.deltaLink` para as consultas seguintes.[1] Também suporta notificações por webhook, mas o endpoint deve ser HTTPS público, responder rapidamente e validar a subscrição/`clientState`.[4] [5]

## Modelo recomendado de primeira fase

1. O administrador liga a conta Microsoft 365 da organização e escolhe **uma pasta raiz** do OneDrive.
2. O DocuFlux lista apenas as pastas e ficheiros abaixo dessa raiz, mostrando nome, caminho, extensão, tamanho, data de alteração e origem.
3. O administrador cria regras de mapeamento, por exemplo `OneDrive/Fornecedores/2026` → `/Contabilidade/Compras/2026` no DocuFlux.
4. Seleciona os ficheiros a importar. Cada ficheiro é descarregado pelo servidor e armazenado no bucket privado do DocuFlux.
5. O ficheiro entra na Inbox, onde o OCR pode confirmar fornecedor, total, natureza contabilística e subpasta final.
6. O OneDrive permanece intacto; o documento no DocuFlux guarda o ID e caminho de origem para auditoria e rastreabilidade.

## Mapeamento de pastas

| Pasta OneDrive selecionada | Pasta inicial DocuFlux | Resultado após OCR |
| --- | --- | --- |
| `/Fornecedores/2026` | `/Contabilidade/Compras/2026` | Pode descer para fornecedor e mês, por exemplo `/Contabilidade/Compras/2026/08/BP` |
| `/Despesas/Combustivel` | `/Operacoes/Despesas/Combustivel` | OCR confirma tipo, entidade e data antes de aplicar a pasta final |
| `/Clientes` | `/Comercial/Clientes` | OCR distingue documentos recebidos de emitidos e pede revisão se houver ambiguidade |

O mapeamento de origem nunca substitui a revisão contabilística. Serve para indicar uma área de partida segura; a pasta final só é aplicada pela regra/OCR ou por uma pessoa autorizada.

## Segurança, permissões e dados guardados

Para listar ficheiros e descarregar conteúdo, o Microsoft Graph disponibiliza `Files.Read` como permissão delegada mínima em vários cenários de OneDrive.[2] [3] A subscrição de alterações em OneDrive for Business tem requisitos mais amplos, incluindo `Files.Read.All` para `driveItem` no contexto delegado, pelo que essa permissão só deve ser adicionada se o modo automático por eventos for aprovado.[5]

| Controlo | Regra DocuFlux |
| --- | --- |
| Acesso | Tokens Microsoft cifrados no servidor e nunca enviados ao browser. |
| Escopo | Cada ligação pertence a um tenant DocuFlux e a uma conta Microsoft autorizada. |
| Pasta raiz | A aplicação só opera abaixo do `driveItemId` raiz escolhido e guardado pelo administrador. |
| Tipos | PDF, JPG, PNG e DOCX até 10 MB na primeira versão, alinhado com a Inbox. |
| Duplicados | SHA-256 no DocuFlux, `driveItemId` e `eTag`/data de alteração do OneDrive. |
| Remoções | Apagar ou mover no OneDrive **não apaga** o documento importado no DocuFlux. |
| Auditoria | Ligação, pré-visualização, seleção, download, duplicado, falha e importação ficam registados. |
| Escrita | Não existe escrita no OneDrive na primeira versão. |

O download de um `driveItem` é feito pelo servidor e não pelo cliente; o Graph devolve um redirecionamento/URL de download pré-autorizado de duração limitada.[3]

## Dados técnicos a acrescentar

| Registo | Campos essenciais |
| --- | --- |
| `oneDriveConnections` | `tenantId`, conta Microsoft, `driveId`, refresh token cifrado, estado e última verificação. |
| `oneDriveFolderMappings` | `tenantId`, `connectionId`, `rootDriveItemId`, caminho de origem, pasta inicial DocuFlux, ativo. |
| `oneDriveImportRuns` | `tenantId`, mapeamento, modo, início/fim, contagens, erro e `deltaLink`. |
| `oneDriveItemImports` | `tenantId`, `driveItemId`, `eTag`, caminho de origem, documento DocuFlux, hash, estado e data. |

## Relação com Outlook

O conector Outlook existente pode partilhar o mesmo registo Microsoft Entra e a mesma ligação cifrada, mas OneDrive precisa de permissões Graph próprias. A primeira autorização deve adicionar apenas os scopes mínimos de leitura aprovados. O administrador vê claramente se está a ligar **Outlook**, **OneDrive** ou ambos; uma permissão não deve ser assumida apenas porque a outra já foi autorizada.

## Ativação faseada

1. **Manual:** pré-visualizar e importar documentos escolhidos numa pasta OneDrive.
2. **Incremental:** guardar `deltaLink` e procurar alterações em frequência configurada, inicialmente sem importação sem confirmação.
3. **Automática:** permitir importar novos ficheiros elegíveis depois de o administrador aprovar a regra e a frequência.
4. **Eventos:** adicionar webhooks apenas se precisar de resposta quase imediata e houver um endpoint Coolify estável para receber/validar notificações.

## Decisões necessárias

1. A importação deve ser apenas **OneDrive → DocuFlux**, ou pretende também criar/mover ficheiros no OneDrive a partir do DocuFlux?
2. Que pasta OneDrive deve ser a primeira raiz de teste?
3. Prefere começar por importação manual ou por uma verificação periódica após a fase manual?
4. O OneDrive é pessoal, Microsoft 365 empresarial, ou SharePoint/Teams?

## Referências

[1]: https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0 "Microsoft Graph — driveItem delta"
[2]: https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0 "Microsoft Graph — List children of a driveItem"
[3]: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0 "Microsoft Graph — Download driveItem content"
[4]: https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks "Microsoft Graph — Receive change notifications through webhooks"
[5]: https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions?view=graph-rest-1.0 "Microsoft Graph — Create subscription"
