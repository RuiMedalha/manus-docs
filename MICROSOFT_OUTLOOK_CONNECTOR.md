# Conector Microsoft 365 / Outlook

## Objetivo

O conector permite a um membro autorizado ligar a sua caixa de correio Microsoft 365 à organização ativa e importar, mediante ação explícita, anexos documentais elegíveis para a Inbox. A ligação é por tenant: nunca partilha tokens, mensagens ou anexos entre organizações.

## Permissões delegadas

O primeiro adaptador usa autorização delegada e solicita apenas `openid`, `profile`, `offline_access`, `User.Read` e `Mail.Read`. A aplicação lê as mensagens da conta que autorizou a ligação, mas não envia email, não altera mensagens e não marca mensagens como lidas. O consentimento de administrador pode ser necessário conforme a política do tenant Microsoft 365. O acesso a mensagens e anexos no Microsoft Graph depende de permissões de email adequadas. [1] [2]

| Escopo | Utilização no DocuFlux |
| --- | --- |
| `openid`, `profile` | Identificar a conta que autorizou a ligação. |
| `offline_access` | Renovar a sessão Microsoft sem pedir consentimento em cada importação. |
| `User.Read` | Confirmar a identidade do utilizador que ligou a caixa de correio. |
| `Mail.Read` | Listar mensagens e obter anexos documentais da conta autorizada. |

## Limites de importação

A importação não corre automaticamente na primeira versão. Um administrador abre a área **Outlook**, pré-visualiza até 25 mensagens recentes com anexos e seleciona até 20 anexos numa operação. Apenas PDF, JPG, PNG ou DOCX até 10 MB são elegíveis. São excluídos anexos embutidos, itens sem conteúdo e qualquer ficheiro que já exista no mesmo tenant pelo respetivo hash SHA-256.

> O conector trata a mensagem de origem como metadado de proveniência. O ficheiro importado é guardado no armazenamento de objetos do DocuFlux e depois segue exatamente o mesmo ciclo de OCR, regras de pasta, entidade e aprovação que um upload manual.

## Registo OAuth Microsoft Entra

O administrador cria uma aplicação no Microsoft Entra ID, adiciona o URL de callback HTTPS do DocuFlux e configura as permissões delegadas acima. O `client secret` fica exclusivamente na gestão de segredos do ambiente. Para um tenant único, deve-se restringir o endpoint de autorização ao respetivo identificador de tenant; para uso multi-tenant, a organização confirma o tenant Microsoft antes de autorizar.

| Passo | Configuração necessária |
| --- | --- |
| Tipo de aplicação | Registo de aplicação web no Microsoft Entra ID. |
| URI de redirecionamento de produção | `https://gestaodoc-bqys5ev6.manus.space/api/outlook/callback` |
| URI de redirecionamento local | O domínio HTTPS temporário do ambiente de desenvolvimento seguido de `/api/outlook/callback`. |
| Permissões Microsoft Graph | `User.Read` e `Mail.Read` como permissões **delegadas**, além de `openid`, `profile` e `offline_access`. |
| Consentimento | Conceder consentimento do utilizador ou do administrador, consoante a política Microsoft 365 da organização. |

## Variáveis seguras do ambiente

As credenciais nunca são colocadas no cliente, no repositório ou em documentação com valores reais. Devem ser registadas exclusivamente na área segura de segredos do projeto.

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `MICROSOFT_CLIENT_ID` | Sim | Identificador público do registo Microsoft Entra. |
| `MICROSOFT_CLIENT_SECRET` | Sim | Segredo do cliente usado apenas pelo servidor na troca e renovação de tokens. |
| `MICROSOFT_REDIRECT_URI` | Sim | URI HTTPS registado no Entra; deve coincidir exatamente com o callback configurado. |
| `MICROSOFT_TENANT_ID` | Recomendado | Identificador do tenant Microsoft para restringir a autorização. Quando ausente, o conector usa `common`. |
| `JWT_SECRET` | Já gerida pela plataforma | Deriva a chave AES-256-GCM usada para cifrar tokens renováveis em repouso. |

## Comportamento de segurança e falha

O início de autorização é disponibilizado apenas a administradores da organização. O estado OAuth é assinado, expira em dez minutos e transporta o tenant e utilizador que iniciaram a operação. No callback, o código Microsoft é trocado no servidor; o cliente nunca recebe tokens Microsoft. O token de renovação é cifrado com AES-256-GCM antes de ser persistido para o tenant.

| Situação | Comportamento DocuFlux | Ação operacional |
| --- | --- | --- |
| Credenciais em falta | O botão de ligação fica desativado e mostra os nomes das variáveis em falta. | Configurar as variáveis seguras e reiniciar a aplicação. |
| Consentimento recusado ou callback inválido | O utilizador regressa à página Outlook com estado de erro; não é criada ligação. | Confirmar URI de redirecionamento, segredo e consentimento no Entra. |
| Renovação de token falha | A ligação é marcada com erro e a importação é bloqueada. | Renovar a autorização da caixa de correio. |
| Mensagem ou anexo deixa de ser elegível | A importação é rejeitada antes de escrever no armazenamento. | Atualizar a pré-visualização e selecionar apenas ficheiros suportados. |
| Ficheiro duplicado | O anexo é ignorado, sem criar um segundo documento. | Consultar a Inbox por hash/nome e o histórico de importação. |
| Falha parcial da seleção | A execução fica registada como parcial, com contagem e resultado por ficheiro. | Rever o histórico e repetir apenas os anexos que falharam. |

> A renovação da autorização não altera nem elimina mensagens na caixa de correio. A importação também não marca mensagens como lidas, não as move e não envia qualquer mensagem.

## Referências

[1]: https://learn.microsoft.com/en-us/graph/permissions-reference "Microsoft Graph permissions reference"
[2]: https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview?view=graph-rest-1.0 "Microsoft Graph mail API overview"
[3]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow "Microsoft identity platform authorization code flow"
[4]: https://learn.microsoft.com/en-us/graph/api/message-list-attachments?view=graph-rest-1.0 "Microsoft Graph list attachments"
