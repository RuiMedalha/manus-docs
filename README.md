# DocuFlux

> Plataforma multi-tenant para gestão documental, aprovação financeira, conciliação bancária e sincronização controlada de contactos com CRM.

O DocuFlux reúne documentos, extratos bancários, pagamentos e contactos de negócio num único backoffice por organização. O produto foi construído para manter uma separação estrita entre tenants: cada consulta, ação, registo de auditoria e relação financeira é limitada ao tenant ativo no servidor.

## O que está incluído

| Área | Capacidades atuais |
| --- | --- |
| Organizações e acesso | Organizações, membros, convites, papéis de Admin, Contabilidade, Operador e Aprovador; autenticação local com bcrypt, sessões renováveis e limitação de tentativas. |
| Documentos | Upload de PDF, JPG, PNG e DOCX para armazenamento de objetos, Inbox, pesquisa, metadados, deduplicação, visualização segura e pastas lógicas. |
| OCR | Fila multi-tenant com tentativas, processamento manual/automático, classificação estruturada, propostas de metadados e revisão humana. |
| Entidades | Fornecedores e clientes deduplicados por NIF, confirmados antes de serem usados em pagamentos ou CRM. |
| Pagamentos | Calendário, propostas criadas a partir de faturas, conta bancária de débito, categorias, aprovação e confirmação de liquidação. |
| Governação | Políticas editáveis por montante e categoria, papel exigido, suspensão/reativação, remoção auditada e bloqueio de aprovações não autorizadas. |
| Extratos e conciliação | Assistente CSV, modelos por tenant, normalização, bloqueio de reimportações e sugestões de conciliação com decisões auditadas. |
| CRM | Adaptador REST agnóstico, mapeamento de campos, simulação, validação de ligação, histórico de sincronizações e estado CRM na Inbox. |
| Operação | Health check, cabeçalhos de segurança, runbook de produção, PWA responsiva, Docker Compose de desenvolvimento e GitHub Actions. |

## Arquitetura

```text
React + TypeScript
        │
        ├── tRPC (procedimentos autenticados)
        │       ├── Documentos, OCR, CRM, pagamentos e conciliação
        │       └── Validação de papéis e tenant ativo
        │
Express + Drizzle ─── MySQL compatível
        │
        ├── Armazenamento de objetos para binários documentais
        └── Integrações REST configuráveis por tenant
```

O binário de um documento nunca é guardado na base de dados; apenas a chave de armazenamento, hash e metadados são persistidos. As pastas da aplicação são **lógicas**: mover um documento altera a sua organização visual, sem criar cópias do ficheiro.

## Arranque local

### Pré-requisitos

É necessário Node.js 22+, pnpm e uma base de dados MySQL compatível. Para dependências locais, o repositório inclui MySQL, Redis e MinIO.

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm drizzle-kit generate
pnpm check
pnpm test
pnpm dev
```

As migrações são mantidas em `drizzle/`. Antes de aplicar uma nova migração, gere o SQL, reveja-o e só depois aplique-o na base de dados de destino.

## Variáveis de ambiente

| Variável | Finalidade | Necessária |
| --- | --- | --- |
| `DATABASE_URL` | Ligação à base de dados MySQL compatível. | Sim |
| `JWT_SECRET` | Assinatura de sessões e tokens locais. | Sim |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Armazenamento seguro de documentos no ambiente gerido. | Sim no alojamento gerido |
| `OAUTH_SERVER_URL` / `VITE_APP_ID` | Compatibilidade com a identidade da plataforma durante a transição. | No ambiente gerido |
| `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL` | Envio transacional de recuperação de acesso através de Amazon SES. | Para ativar email |
| `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Autorização OAuth com Microsoft 365/Dynamics 365, quando aplicável. | Para ativar Microsoft 365 |
| `CRM_*` | Segredo definido por cada ligação REST de CRM. | Para sincronização real |

> **Segurança:** nunca coloque valores reais num ficheiro versionado, no mapeamento CRM ou no cliente. Os segredos devem ser adicionados pela gestão segura de ambiente e só são lidos no servidor.

## Fluxos operacionais

### Documentos, OCR e pastas

1. Carregue um documento na **Inbox**.
2. O documento recebe uma pasta sugerida e entra na fila OCR.
3. Reveja e aplique a proposta de entidade, NIF, valor, IVA, vencimento e metadados.
4. Confirme ou altere a pasta lógica; o ficheiro mantém a mesma referência segura no armazenamento de objetos.

O processamento pode ser iniciado por documento, por lote de até 20 ficheiros ou automaticamente através de um agendamento autenticado depois da publicação.

### Pagamentos e aprovação

1. Uma fatura de fornecedor com valor e vencimento cria uma **proposta de pagamento**.
2. Confirme o fornecedor, escolha a conta bancária de débito e a categoria de despesa.
3. A política de aprovação avalia montante, categoria e papel exigido.
4. Depois de aprovada, a proposta aparece no calendário como pendente e pode ser marcada como paga.
5. O movimento importado do banco é conciliado com o registo financeiro correspondente.

### CRM genérico

O **Estúdio CRM** aceita qualquer API REST JSON que exponha contactos. Configure URL base, caminho de contactos, método HTTP, autenticação, nome do segredo, mapeamento de campos e caminho do identificador externo. Valide a ligação, faça uma simulação, pré-visualize os payloads e só então execute uma sincronização manual. Cada entidade mostra na Inbox se está sincronizada, pendente ou sem associação CRM.

## Onboarding

A rota **Começar** calcula o progresso com base nos dados reais da organização: conta de débito, categoria, primeiro documento, equipa e preparação CRM. É o percurso recomendado para chegar ao primeiro fluxo completo de documento, aprovação e conciliação.

## Qualidade e testes

```bash
pnpm check   # TypeScript
pnpm test    # Vitest
```

Os testes cobrem regras de pastas, OCR, importação CSV, conciliação, políticas de aprovação, autenticação, CRM e cenários de integração dos routers financeiros.

## Produção, domínio e VPS

O alojamento gerido suporta domínio próprio. Para uma instalação numa VPS, consulte [`deploy/README-VPS.md`](deploy/README-VPS.md), que inclui Docker Compose, Caddy e exemplos de configuração. Antes de migrar, substitua os componentes geridos de identidade e armazenamento por equivalentes externos e valide backups da base de dados e do armazenamento de objetos.

O serviço expõe `GET /healthz` para monitorização. O procedimento de backup, recuperação, retenção e checklist de lançamento está em [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md).

## Documentação complementar

| Documento | Conteúdo |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Decisões da arquitetura multi-tenant. |
| [`OCR_PIPELINE.md`](OCR_PIPELINE.md) | Fila OCR, classificação e revisão humana. |
| [`FINANCIAL_MASTER_DATA.md`](FINANCIAL_MASTER_DATA.md) | Fornecedores, clientes, contas, categorias e CRM. |
| [`FINANCIAL_APPROVAL_FLOW.md`](FINANCIAL_APPROVAL_FLOW.md) | Fluxo de proposta, aprovação e liquidação. |
| [`CRM_UNIVERSAL_CONTRACT.md`](CRM_UNIVERSAL_CONTRACT.md) | Contrato REST genérico para CRM. |
| [`PREMIUM_PRODUCTION_ROADMAP.md`](PREMIUM_PRODUCTION_ROADMAP.md) | Evolução para produção independente. |
| [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) | Operação, backups e recuperação. |

## Estado de integrações externas

Amazon SES e Microsoft 365 estão preparados como opções de ativação. A ligação efetiva requer domínio/verificação e credenciais SES, além do registo OAuth no Microsoft Entra quando for usado Microsoft 365 ou Dynamics 365. As credenciais são adicionadas apenas após confirmação do fornecedor e nunca são persistidas no repositório.
