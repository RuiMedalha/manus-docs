# Implantação em VPS e domínio próprio

## Estado de portabilidade

O repositório inclui uma configuração Docker Compose com MySQL e Caddy para uma VPS Ubuntu recente. O Caddy obtém e renova certificados TLS automaticamente depois de o registo DNS do domínio apontar para a VPS.

> A versão atual usa a autenticação e o armazenamento geridos pela plataforma de desenvolvimento. Antes de operar fora desse ambiente, é necessário substituir esses dois adaptadores por um fornecedor próprio: autenticação compatível com as variáveis de OAuth ou a futura autenticação por email/password, e armazenamento S3 compatível. A configuração de VPS está preparada para essa troca, mas não inclui segredos nem replica credenciais geridas.

## Passos na VPS

1. Instale Docker Engine e Docker Compose Plugin numa VPS Ubuntu atualizada.
2. Crie um utilizador sem privilégios de root e permita-lhe usar Docker.
3. Clone o repositório e entre em `deploy/`.
4. Copie `.env.vps.example` para `.env.vps`, defina valores únicos e complete as credenciais dos adaptadores de autenticação e armazenamento.
5. No fornecedor de DNS, crie um registo `A` para o domínio (e `www`, se aplicável) apontado para o IP público da VPS.
6. Na firewall, permita apenas SSH administrado, TCP 80 e TCP 443. Não exponha a porta MySQL.
7. Execute `docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build`.
8. Verifique com `docker compose -f docker-compose.vps.yml ps` e `docker compose -f docker-compose.vps.yml logs -f caddy`.

## Operação

Atualize o código com `git pull`, depois execute novamente o comando Compose com `--build`. Antes de atualizações, efetue uma cópia do volume MySQL e confirme que as migrações Drizzle foram aplicadas. Os segredos permanecem apenas no ficheiro `.env.vps`, com permissões restritas, e nunca devem ser enviados para Git.
