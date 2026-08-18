# Checklist de lançamento

## Validação técnica

| Verificação | Resultado esperado |
| --- | --- |
| `pnpm check` | Compilação TypeScript sem erros. |
| `pnpm test` | Suite completa de regras, segurança, OCR, CRM e pagamentos aprovada. |
| `GET /healthz` | Resposta HTTP 200 sem expor dados internos. |
| Cabeçalhos HTTP | `nosniff`, política de referência, proteção de frame e política de permissões presentes. |
| Backups | Restauração de teste de base de dados e validação de referências de objetos planeadas ou executadas. |

## Fluxo de aceitação por organização

1. Criar uma organização e um utilizador com cada papel relevante.
2. Configurar conta de débito, categoria e política de aprovação.
3. Carregar uma fatura de teste anonimizada e rever a proposta OCR.
4. Confirmar fornecedor, criar proposta de pagamento e aprová-la com o papel exigido.
5. Importar um extrato CSV de teste, gerar sugestões e aceitar uma conciliação.
6. Pré-visualizar o CRM, validar a ligação e executar primeiro em modo de simulação.
7. Rever a auditoria e confirmar que cada ação pertence apenas ao tenant ativo.

## Ativação externa

Antes de usar utilizadores reais, configure e valide o domínio remetente no Amazon SES, os destinatários permitidos enquanto a conta SES estiver em sandbox, a URL pública da aplicação e, quando aplicável, o registo OAuth Microsoft Entra. Nenhuma credencial deve ser incluída em repositórios, screenshots ou exportações de diagnóstico.

## Decisão de lançamento

O lançamento só deve avançar quando a validação técnica, o percurso de aceitação e a recuperação de acesso por email forem aprovados por um administrador. O resultado da checklist deve ser registado na auditoria operacional da organização.
