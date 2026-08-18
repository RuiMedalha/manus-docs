# Runbook de produção

## Verificação operacional

O serviço expõe `GET /healthz`, que deve responder `200` com o estado da aplicação. O endpoint é adequado para monitorização externa e para sondas da plataforma; não inclui informação de utilizadores, documentos, integrações ou segredos.

## Backups e recuperação

| Componente | Salvaguarda | Cadência mínima | Validação |
| --- | --- | --- | --- |
| Base de dados | Backup lógico/encriptado da base de dados | Diário | Restaurar mensalmente num ambiente isolado |
| Documentos | Versionamento/replicação no armazenamento de objetos | Contínuo | Abrir uma amostra de documentos por tenant |
| Configuração | Segredos fora do repositório e cópia da configuração não sensível | A cada alteração | Rever permissões e expiração de tokens |
| Auditoria | Retenção conforme política da organização | Mensal | Confirmar consulta por tenant e exportação autorizada |

Uma recuperação deve restaurar primeiro a base de dados, depois validar referências do armazenamento de objetos e apenas então abrir o tráfego ao utilizador. Nunca se devem incluir palavras-passe, tokens de reset ou tokens de CRM em cópias de diagnóstico ou ficheiros de suporte.

## Privacidade e retenção

Cada organização define o prazo legal e operacional de retenção dos seus documentos. O operador deve configurar uma política de eliminação por tenant apenas depois de confirmar as obrigações contabilísticas aplicáveis; o MVP mantém a trilha de auditoria de ações sem reter o binário do ficheiro no registo de auditoria.

## Checklist de lançamento

1. Configurar domínio e TLS, testar `/healthz` e rever os cabeçalhos de segurança.
2. Confirmar backup de base de dados e armazenamento de objetos.
3. Adicionar segredos de email e CRM através da gestão segura de ambiente.
4. Criar uma organização de teste, importar documentos de teste anonimizados e validar OCR, pagamento, conciliação e CRM.
5. Rever a política de retenção e o procedimento de resposta a incidente com o responsável de dados.
