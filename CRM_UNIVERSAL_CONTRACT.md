# Contrato universal de CRM

## Princípio de compatibilidade

O DocuFlux não fica associado a uma marca de CRM. Cada ligação declara um URL base, o caminho de contactos, a estratégia de autenticação, os nomes dos campos remotos e o identificador externo devolvido pelo CRM. O adaptador converte fornecedores e clientes DocuFlux para um pedido HTTP REST sem assumir nomes como `email`, `tax_id` ou `company`.

| Configuração | Exemplo | Função |
| --- | --- | --- |
| URL base | `https://crm.exemplo.pt/api/v1` | Origem da API externa |
| Caminho de contacto | `/contacts` | Recurso de criação/atualização |
| Método | `POST`, `PUT` ou `PATCH` | Semântica de sincronização do CRM |
| Autenticação | Bearer, API key, Basic ou nenhuma | Cabeçalho gerado no servidor com um segredo de ambiente |
| Mapeamento | `name → company_name`, `nif → vat_number` | Traduz os campos DocuFlux para a API remota |
| ID externo | `id`, `contactId`, `data.uuid` | Chave persistida em cada entidade para evitar duplicados |

## Fluxo seguro

Primeiro o utilizador configura e valida o formato da ligação. Depois pré-visualiza os contactos e os payloads que serão enviados. A sincronização é manual e registra um resultado por lote. O adaptador atualiza uma entidade por vez, usando `externalCrmId` quando existir e criando-a apenas quando não houver ligação externa.

Os tokens e palavras-passe **não são introduzidos nem persistidos na interface**. O nome da variável secreta é guardado na configuração e o valor é disponibilizado exclusivamente ao servidor. Para um CRM específico, o administrador adiciona o segredo correspondente ao ambiente, por exemplo `CRM_API_TOKEN` ou `CRM_HUBSPOT_TOKEN`.

## Limites e evolução

Esta camada cobre APIs REST JSON. Um CRM apenas com SOAP, GraphQL, OAuth interativo ou um SDK proprietário requer um adaptador de autenticação específico, mas pode reutilizar o mesmo mapeamento, histórico e sincronização de entidades. Webhooks e execuções automáticas são adicionados depois da validação manual bem-sucedida.
