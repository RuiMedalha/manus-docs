# DocuFlux — MVP de Gestão Documental e Financeira

## Visão geral

O DocuFlux é um backoffice multi-tenant para centralizar documentos, importações bancárias e conciliação. Cada operação de domínio resolve o membro e o `tenantId` no servidor antes de consultar ou alterar dados, mantendo o isolamento entre organizações.

## Capacidades entregues

| Área | Implementação atual |
| --- | --- |
| Organizações | Criação, seleção, membros, convites, papéis e registo de auditoria base. |
| Documentos | Upload de PDF/JPG/PNG/DOCX para armazenamento de objetos, Inbox, visualização, edição de metadados, regras de pastas e prevenção de duplicados. |
| OCR e classificação | Fila por tenant com estados, tentativas, extração de PDF/JPG/PNG/DOCX, sugestões estruturadas, revisão humana e auditoria. |
| Extratos | Assistente CSV de mapeamento, modelos reutilizáveis, normalização e bloqueio de reimportações. |
| Conciliação | Sugestões por referência, número de ordem e valor/data/texto; revisão e ligação persistente quando aceite. |
| Integrações | Contratos iniciais para WooCommerce, Ifthenpay e Moloni, sem credenciais nem sincronização ativa. |

## Ambiente local

O projeto usa React, Express, tRPC, Drizzle e MySQL compatível. Depois de configurar `DATABASE_URL` e as variáveis de autenticação da plataforma, execute:

```bash
pnpm install
pnpm drizzle-kit generate
pnpm check
pnpm test
pnpm dev
```

As migrações aplicadas estão em `drizzle/`. Os ficheiros de documentos não ficam na base de dados: apenas a chave, hash e metadados são persistidos; o binário é enviado para armazenamento de objetos.

### Variáveis de ambiente

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Ligação MySQL compatível para Drizzle. |
| `JWT_SECRET` | Sim no ambiente gerido | Assinatura da sessão da plataforma. |
| `OAUTH_SERVER_URL` | Sim no ambiente gerido | Serviço de autenticação da plataforma. |
| `VITE_APP_ID` | Sim no ambiente gerido | Identificador da aplicação de autenticação. |
| `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY` | Sim para upload | URLs assinadas e armazenamento de objetos. |

Para iniciar dependências locais compatíveis com esta implementação, execute `docker compose -f docker-compose.dev.yml up -d`. O ficheiro inclui MySQL, Redis e MinIO. A escolha de MySQL substitui PostgreSQL na proposta original por compatibilidade com a infraestrutura gerida atual; Redis e MinIO estão preparados para a evolução para filas e armazenamento S3 local.

## Operação de OCR

Após o upload, cada documento é colocado numa fila da organização. Na Inbox, um utilizador com permissão documental pode usar **Processar pendentes**, processar um documento individualmente ou selecionar até 20 documentos e usar **Processar seleção**. As sugestões resultantes mantêm o documento em revisão e só passam a metadados efetivos depois de **Aplicar sugestão**.

O modo automático usa o mesmo processador e deve ser ativado apenas depois de a versão estar publicada. Depois da publicação, um administrador abre a Inbox e seleciona **Ativar automático**. A aplicação cria um agendamento autenticado que processa pequenos lotes pendentes por organização; o botão também permite desativar o agendamento. Todas as transições relevantes são registadas na auditoria.

## Notas de evolução

Esta implementação utiliza a autenticação de sessão já disponível no ambiente gerido. Para uma instalação independente, a camada de identidade pode ser substituída por email/password com bcrypt, JWT e refresh tokens, preservando os modelos de membros e tenant. Uma evolução futura poderá substituir o processador gerido por uma fila Redis/BullMQ dedicada para throughput mais elevado, e ativar as sincronizações reais de terceiros.
