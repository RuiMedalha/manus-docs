# DocuFlux no Coolify desde o início

Este guia começa numa VPS vazia e termina com um ambiente de **staging** do DocuFlux. O ambiente de staging recebe um domínio temporário e nunca substitui a aplicação atual sem testes e confirmação.

> Se o Coolify já está instalado, comece na secção **4. Primeiro projeto**. Não execute novamente o instalador numa VPS já configurada.

## 1. Preparar a VPS

Use uma VPS nova, com Ubuntu LTS 22.04 ou 24.04, acesso SSH como administrador e recursos adequados para Coolify, Node, MySQL e armazenamento. A documentação Coolify indica como mínimo 2 vCPU, 2 GB RAM e 30 GB livres; para DocuFlux com MySQL, OCR e documentos, é prudente reservar mais memória e disco.[1]

No firewall do fornecedor da VPS, abra SSH, 80 e 443. Na instalação autoalojada, o Coolify também usa 8000, 6001 e 6002 enquanto o painel for acedido pelo IP; estes podem ser fechados depois de o painel receber domínio próprio.[2]

| Porta | Uso inicial |
| --- | --- |
| 22 ou porta SSH escolhida | Administração da VPS |
| 80 | Desafio TLS e redirecionamento HTTP |
| 443 | Aplicações e painel HTTPS |
| 8000 | Painel Coolify inicial via IP |
| 6001 e 6002 | Comunicação em tempo real e terminal do painel enquanto necessário |

## 2. Instalar Coolify

Numa VPS Ubuntu LTS nova, ligue por SSH e execute o instalador oficial:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

O instalador oficial instala Docker, cria a estrutura em `/data/coolify` e inicia os serviços necessários.[1] No final, abra no navegador `http://IP_DA_VPS:8000` e crie **imediatamente** a primeira conta de administrador; a página de registo inicial não deve ficar exposta.[1]

## 3. Proteger o painel

1. Crie um domínio só para o painel, por exemplo `coolify.seudominio.pt`.
2. No DNS, crie um registo `A` para o IP da VPS.
3. Configure esse domínio no painel Coolify e confirme HTTPS.
4. Quando o painel abrir em HTTPS pelo domínio, restrinja no firewall do fornecedor as portas 8000, 6001 e 6002; mantenha apenas SSH administrativo, 80 e 443 conforme a documentação aplicável.[2]
5. Ative autenticação forte na conta Coolify e guarde as credenciais no seu gestor de palavras-passe.

## 4. Primeiro projeto: staging

1. No painel Coolify, abra **Projects** e crie o projeto `DocuFlux`.
2. Crie o ambiente `staging`. A produção será criada mais tarde; não reutilize os mesmos segredos ou dados.
3. Em DNS, crie o subdomínio temporário `staging.docuflux.seudominio.pt` a apontar para o IP da VPS. Se ainda não quiser usar DNS, use primeiro o domínio temporário fornecido pelo Coolify.
4. Ligue o Coolify ao GitHub e autorize acesso ao repositório `RuiMedalha/manus-docs`.

## 5. Criar MySQL no Coolify

1. Dentro de `DocuFlux / staging`, escolha **Create New Resource → Database → MySQL**.
2. Dê o nome `docuflux-staging-mysql`.
3. Selecione MySQL 8.4 ou a versão estável compatível disponível.
4. Defina base `docuflux` e utilizador `docuflux`; deixe o Coolify gerar palavras-passe únicas.
5. Mantenha a base de dados apenas na rede interna e confirme o volume persistente.
6. Clique **Deploy** e aguarde o estado saudável.

Não crie tabelas nem execute SQL agora. As migrações são aplicadas de forma controlada pela aplicação quando o adaptador de armazenamento e a configuração de produção estiverem prontos.

## 6. Escolher o armazenamento dos documentos

| Opção | Quando usar | Responsabilidade |
| --- | --- | --- |
| MinIO no Coolify | Quer manter tudo na VPS e aceita gerir disco/backup. | Backups, capacidade e recuperação são seus. |
| Cloudflare R2 ou AWS S3 | Quer separar documentos da VPS. | Conta cloud, bucket privado e credenciais. |

Crie um bucket **privado** para staging. Não use a base MySQL para guardar PDFs, fotos ou DOCX; a base guarda metadados e o bucket guarda os bytes dos ficheiros.

## 7. Preparar o repositório antes da aplicação funcional

O Dockerfile já consegue construir a aplicação, mas a versão de produção precisa destas alterações antes de receber documentos reais:

1. Trocar o armazenamento gerido atual por um adaptador S3/MinIO.
2. Usar apenas login local por email/palavra-passe ou um fornecedor de identidade próprio; remover o fallback de autenticação gerida atual.
3. Trocar o agendamento OCR externo por cron/worker da própria VPS se precisar de análise automática.
4. Adicionar variáveis e verificação de arranque para MySQL, S3, `JWT_SECRET` e `APP_BASE_URL`.

## 8. Criar a aplicação DocuFlux

1. Em `staging`, escolha **Create New Resource → Application** e selecione o repositório GitHub.
2. Use a branch `main`, build pack **Dockerfile**, base directory `/` e Dockerfile `deploy/Dockerfile`.[3]
3. Indique porta exposta `3000`.
4. Adicione `https://staging.docuflux.seudominio.pt` ou o domínio temporário do Coolify.
5. Configure health check `/healthz` com resposta esperada `200`. O proxy só encaminha tráfego para recursos saudáveis quando os health checks estão ativos.[4]
6. Não adicione Caddy nem exponha portas 80/443 dentro do contentor; o proxy Coolify já faz esse trabalho.

## 9. Variáveis do ambiente staging

Configure as variáveis como runtime secrets no Coolify. Variáveis de runtime não precisam de ser incluídas na imagem Docker.[5]

| Variável | Exemplo de origem |
| --- | --- |
| `DATABASE_URL` | URL interna do MySQL criado no passo 5 |
| `JWT_SECRET` | Novo segredo aleatório longo |
| `APP_BASE_URL` | Domínio staging HTTPS |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | MinIO/R2/S3 escolhido |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Credenciais limitadas ao bucket |
| `SES_*`, `MICROSOFT_*` | Apenas ao ativar email/Outlook/OneDrive |

Nunca copie segredos internos da publicação atual para a VPS.

## 10. Testar staging antes de migrar dados

Depois do deploy, teste login local, upload, QR, OCR, pastas, entidades, pagamentos, extratos e conciliação. Verifique também que o restart da aplicação não elimina MySQL nem documentos do bucket. Corrija tudo em staging antes de copiar qualquer dado real ou alterar o domínio principal.

## 11. Só depois: produção

Crie um ambiente `production` com base de dados, bucket e segredos próprios. Migre primeiro dados e documentos, teste o domínio final, atualize callbacks Microsoft/SES e faça o corte DNS apenas quando tudo estiver validado. Mantenha a versão atual disponível como contingência durante os primeiros dias.

## Referências

[1]: https://coolify.io/docs/get-started/installation "Coolify — Installation"
[2]: https://coolify.io/docs/knowledge-base/server/firewall "Coolify — Firewall"
[3]: https://coolify.io/docs/applications/build-packs/dockerfile "Coolify — Dockerfile Build Pack"
[4]: https://coolify.io/docs/knowledge-base/health-checks "Coolify — Health Checks"
[5]: https://coolify.io/docs/knowledge-base/environment-variables "Coolify — Environment Variables"
