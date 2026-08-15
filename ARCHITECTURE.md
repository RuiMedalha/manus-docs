# Arquitetura do MVP

## Objetivo

O MVP é uma aplicação web de backoffice para organizações que centraliza documentos, movimentos bancários e conciliação. A segurança de isolamento entre organizações é a regra principal: **toda a leitura e escrita de dados de domínio recebe e valida um `tenantId`** no servidor.

## Adaptação de stack

O projeto usa a infraestrutura full-stack já disponível: React, TypeScript, Express, tRPC, Drizzle e base de dados MySQL compatível. Esta escolha substitui o monorepo Next.js/NestJS/PostgreSQL inicialmente sugerido, sem alterar as fronteiras funcionais do domínio. A API tipada tRPC cumpre a função da camada REST planeada; a migração futura para REST/OpenAPI pode preservar os modelos e serviços de domínio.

| Área | Implementação no MVP | Evolução prevista |
| --- | --- | --- |
| Autenticação | Sessão da plataforma e associação a membros de tenant | Credenciais locais por email, hash bcrypt e refresh tokens quando for ligado um fornecedor de email e login próprio |
| Dados | MySQL com Drizzle e migrações | PostgreSQL/Prisma através de mapeamento direto do modelo de domínio |
| Ficheiros | Armazenamento de objetos integrado, com URLs temporárias | S3/R2/MinIO compatível sem alterar a entidade `Document` |
| Processamento | Ações explícitas e serviços puros no servidor | Fila Redis/BullMQ ou alojamento persistente para OCR, extração e conciliação assíncrona |
| Integrações | Adaptadores isolados e credenciais por tenant | Implementações autenticadas depois de fornecidas as credenciais de cada serviço |

## Isolamento de tenant

As entidades de negócio incluem `tenantId` não nulo. Os procedimentos autenticados resolvem primeiro o membro ativo e só depois chamam funções de dados com esse identificador. Operações que recebem um identificador externo fazem a pesquisa por `id` **e** `tenantId`; nunca pelo identificador isoladamente. Os registos de auditoria capturam o tenant, o ator, a ação, o tipo de recurso e metadados sem conteúdo sensível.

## Processamento e integrações

O MVP disponibiliza a estrutura dos adaptadores e ações acionadas pelo utilizador. OCR, classificação e sincronizações automáticas não são executados em segundo plano nesta primeira versão, porque o ambiente de alojamento padrão não mantém um worker de fila continuamente ativo. Quando houver necessidade de execução contínua, os serviços já separados podem ser ligados a uma fila gerida ou a uma instância persistente sem alterar a interface do utilizador.

## Convenções do domínio

Os valores monetários são armazenados em cêntimos inteiros; datas de negócio são gravadas como datas ISO (`YYYY-MM-DD`) e marcas temporais são mantidas em UTC. O conteúdo binário dos ficheiros permanece no armazenamento de objetos; a base de dados conserva apenas a chave, URL, hash e metadados necessários.
