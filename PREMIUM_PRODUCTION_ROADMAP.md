# Roteiro de produção independente

## Autenticação

O DocuFlux preservará a sessão atual da plataforma durante a transição, mas adicionará uma camada local de credenciais por email. As palavras-passe nunca são persistidas em texto simples: são armazenadas com hash bcrypt; a sessão é um token de acesso curto, renovado por token de refresh revogável e guardado apenas em cookie `httpOnly` e `secure`.

O pedido de recuperação de acesso aceita sempre o email sem revelar se existe uma conta. O token de reposição será de uso único, com validade curta e hash persistido. O envio real de email exige uma ligação a um fornecedor transacional; até essa credencial existir, o fluxo fica disponível em modo seguro de desenvolvimento, sem apresentar tokens no cliente.

## Produção e operação

| Área | Base do MVP premium | Ativação posterior |
| --- | --- | --- |
| Segurança | Cookies seguros, limites de tentativas, logs de auditoria e isolamento por tenant | MFA, SSO e listas de IP conforme necessidade |
| Disponibilidade | Health check, checklist de backups de BD e objetos, configuração de domínio e TLS | Monitorização externa e alertas com um fornecedor escolhido |
| Dados | Retenção documentada e eliminação orientada por tenant | Políticas de retenção legais específicas por setor |
| Integrações | CRM REST genérico validado e modo sandbox | Credenciais reais guardadas como segredos e sincronização ativada explicitamente |

## Decisões pendentes do utilizador

Para concluir a recuperação de palavra-passe e a sincronização real, será necessário escolher um fornecedor de email transacional e fornecer as respetivas credenciais; a aplicação pedirá esses segredos somente quando o conector estiver pronto. A operação pode continuar no alojamento gerido atual; uma VPS só é necessária se for exigido controlo de sistema operativo, Docker fora do projeto ou recursos acima dos limites do alojamento atual.
