# DocuFlux no Coolify: roteiro de staging e produção

Este roteiro permite migrar o DocuFlux para uma VPS com Coolify **sem interromper** a aplicação atual. A regra é simples: primeiro uma cópia de testes em `staging`, depois a migração de dados e, apenas no final, o domínio de produção.

> **Não faça ainda o corte de DNS.** O código atual pode ser construído por Docker, mas o armazenamento de documentos usa a camada gerida atual. Antes de aceitar documentos em produção no Coolify, é obrigatório trocar essa camada por armazenamento S3 compatível e confirmar o login local como único método de acesso.

## 0. O que vai ficar instalado

| Recurso | Onde fica | Finalidade |
| --- | --- | --- |
| Aplicação DocuFlux | Aplicação Docker do Coolify | Interface React, API Express/tRPC e OCR. |
| MySQL 8.4 | Serviço de base de dados do Coolify | Dados multi-tenant, utilizadores, documentos, entidades e auditoria. |
| S3 compatível | MinIO no Coolify, Cloudflare R2 ou AWS S3 | Ficheiros originais, fotografias e PDFs. |
| Proxy/TLS | Proxy do Coolify | Domínio, HTTPS e encaminhamento para a porta 3000. |
| Backups | Fora da VPS | Recuperação de MySQL e documentos. |

Não suba o `caddy` existente em `deploy/docker-compose.vps.yml` dentro do Coolify. O Coolify usa o seu próprio proxy para os domínios e health checks; dois proxies a escutar 80/443 na mesma VPS entram em conflito.

## 1. Preparar a VPS e o Coolify

1. Instale e atualize o Coolify na VPS seguindo o procedimento oficial do projeto.
2. Confirme que a VPS tem acesso público a TCP **80** e **443** e que o acesso SSH é restrito à sua administração.
3. Crie uma conta DNS e escolha dois nomes: por exemplo, `staging.docuflux.seudominio.pt` e `app.seudominio.pt`.
4. Crie inicialmente apenas o registo `A` de `staging.docuflux.seudominio.pt` para o IP da VPS. Não altere o domínio que está a utilizar hoje.
5. No Coolify, crie o projeto **DocuFlux** e os ambientes **staging** e **production**. O Coolify suporta variáveis distintas por ambiente, o que é adequado para separar credenciais e dados de teste.[2]

## 2. Criar os serviços persistentes no ambiente staging

### 2.1 MySQL

1. Em **staging**, crie um novo recurso de base de dados MySQL 8.4.
2. Defina uma palavra-passe longa e única para o utilizador da aplicação e outra para root.
3. Atribua-lhe um volume persistente. A base de dados não deve ser exposta por um domínio público.
4. Guarde a string interna, no formato:

```text
mysql://docuflux:<PASSWORD>@<NOME_INTERNO_MYSQL>:3306/docuflux
```

### 2.2 Armazenamento documental

Escolha uma destas opções:

| Opção | Quando escolher |
| --- | --- |
| **MinIO no Coolify** | Quer manter documentos e armazenamento dentro da sua VPS, aceitando a responsabilidade de backups. |
| **Cloudflare R2 / AWS S3** | Prefere armazenamento externo, escalável e separado da VPS. |

Crie um bucket privado, por exemplo `docuflux-staging`, e uma credencial limitada a esse bucket. **Não torne o bucket público**: o DocuFlux deve fornecer URLs assinadas de curta duração para ver os documentos.

## 3. Preparar o código antes do primeiro deploy funcional

Esta é a única etapa que ainda requer adaptação no repositório antes de a aplicação poder funcionar completamente fora da plataforma atual.

1. Substituir `server/storage.ts` e o proxy `/manus-storage/*` por um adaptador S3 compatível. Ele deve fazer upload privado e gerar URLs assinadas para download.
2. Desativar/remover o botão e fallback de autenticação Manus OAuth. O login por **email e palavra-passe** já existe e deve ser o método usado no Coolify.
3. Substituir o agendamento OCR dependente do serviço atual por um cron/worker próprio do Coolify, se quiser processamento automático. O botão manual continuará a funcionar.
4. Criar migrações Drizzle para a base de dados vazia e adicionar uma verificação de arranque que confirme base de dados, armazenamento e segredos obrigatórios.

> Até estes quatro pontos estarem concluídos, pode fazer um deploy técnico da imagem, mas não deve usá-lo para receber documentos reais.

## 4. Criar a aplicação no Coolify

1. No ambiente **staging**, escolha **Create New Resource → Application**.
2. Ligue o GitHub e escolha `RuiMedalha/manus-docs`, branch `main`. Para um repositório privado, use a GitHub App ou uma deploy key.[1]
3. No selector de build, escolha **Dockerfile**, não Nixpacks.
4. Defina **Base Directory** como `/` e Dockerfile como `deploy/Dockerfile`.
5. Em **Network**, indique porta exposta `3000` e domínio `https://staging.docuflux.seudominio.pt`.
6. Ative health check com caminho `/healthz`, código esperado `200` e intervalo adequado. Health checks permitem que o proxy encaminhe tráfego apenas para instâncias saudáveis.[3]
7. Não adicione Caddy, portas 80/443 nem o Compose VPS à aplicação do Coolify.

O Dockerfile atual constrói a aplicação com Node 22 e expõe a porta 3000, compatível com este tipo de recurso Dockerfile.[1]

## 5. Configurar variáveis no Coolify

Adicione variáveis como **runtime variables**, não build variables, quando forem segredos. O Coolify permite gerir separadamente variáveis de build e de execução; segredos de runtime não precisam de entrar na imagem.[2]

| Variável | Valor no staging | Observação |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runtime. |
| `PORT` | `3000` | Runtime. |
| `DATABASE_URL` | String interna do MySQL | Segredo. |
| `JWT_SECRET` | Novo segredo aleatório de 64+ caracteres | Nunca reutilizar o valor gerido atual. |
| `APP_BASE_URL` | `https://staging.docuflux.seudominio.pt` | Necessário para links de recuperação e OAuth. |
| `S3_ENDPOINT` | Endpoint MinIO/R2/S3 | Após a adaptação S3. |
| `S3_REGION` | Região aplicável | Após a adaptação S3. |
| `S3_BUCKET` | `docuflux-staging` | Bucket privado. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciais do bucket | Segredos de runtime. |
| `SES_*` | Credenciais Amazon SES | Só quando ativar recuperação de acesso. |
| `MICROSOFT_*` | Credenciais Microsoft Entra | Só quando ativar Outlook. |

Não copie para o Coolify `BUILT_IN_FORGE_API_KEY`, `BUILT_IN_FORGE_API_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL` ou segredos internos atuais. Esses valores não são o contrato de produção na sua VPS.

## 6. Primeiro deploy e verificação de staging

1. Clique **Deploy** no Coolify.
2. Confirme que o build termina, o container fica saudável e `https://staging.docuflux.seudominio.pt/healthz` devolve `200`.
3. Abra o domínio staging e execute estes testes manuais: criar conta local, login, upload de fotografia/PDF, OCR, pasta, entidade, pagamento, extrato CSV e conciliação.
4. Confirme que documentos ficam no bucket privado e que a visualização usa URL assinada.
5. Confirme que o reinício do container não apaga MySQL nem documentos.

Registe as falhas no ambiente staging; não corrija diretamente em produção.

## 7. Migrar dados quando staging estiver aprovado

1. Pare entradas novas no ambiente atual durante uma janela curta de migração.
2. Exporte a base MySQL atual para um dump cifrado e importe-o para o MySQL de produção.
3. Copie todos os objetos documentais para o bucket de produção, preservando a chave de cada ficheiro; valide contagem, hashes e alguns downloads assinados.
4. Aplique migrações pendentes antes de abrir a produção.
5. Faça um backup do MySQL de produção e do bucket antes da troca DNS.

## 8. Criar produção e fazer o corte de domínio

1. Duplique a aplicação staging para **production**, mas use MySQL, bucket e segredos **próprios de produção**.
2. Defina `APP_BASE_URL=https://app.seudominio.pt`.
3. Em Microsoft Entra, acrescente `https://app.seudominio.pt/api/outlook/callback` como URI de redirecionamento antes de ligar Outlook.
4. Em SES, valide o domínio/remetente final antes de ativar recuperação de palavra-passe.
5. Faça os testes de smoke em produção com um utilizador de teste.
6. Só então altere o DNS do domínio principal para a VPS e aguarde a emissão do certificado TLS.
7. Mantenha a versão atual ativa durante pelo menos alguns dias, em modo de contingência e leitura, até validar logs, backups e uploads na nova produção.

## 9. Operação contínua

| Rotina | Frequência |
| --- | --- |
| Backup MySQL cifrado, testado por restauro | Diário |
| Backup/replicação do bucket documental | Diário |
| Atualizações de SO, Coolify e imagens | Mensal, após testar em staging |
| Verificação de `/healthz`, logs e espaço de disco | Diária ou monitorizada |
| Teste de restauro completo | Trimestral |

## Decisão antes de começar

Para executar este roteiro, escolha primeiro:

1. O domínio/subdomínio de staging e produção.
2. **MinIO na VPS** ou **R2/S3 externo** para os documentos.
3. MySQL gerido pelo Coolify ou MySQL externo gerido.
4. Se quer que eu prepare já a alteração do código para S3 e a remoção do fallback Manus OAuth.

## Referências

[1]: https://coolify.io/docs/applications/build-packs/dockerfile "Coolify — Dockerfile Build Pack"
[2]: https://coolify.io/docs/knowledge-base/environment-variables "Coolify — Environment Variables"
[3]: https://coolify.io/docs/knowledge-base/health-checks "Coolify — Health Checks"
