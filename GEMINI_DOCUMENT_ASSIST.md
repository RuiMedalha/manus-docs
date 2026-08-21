# Gemini como apoio à leitura documental

## Decisão de produto

O Gemini pode ser usado como uma **segunda camada opcional de análise**, especialmente útil para fotografias de recibos, PDFs com layout complexo, documentos pouco nítidos e classificação contabilística contextual. Não substitui o QR Code AT, a validação determinística, o OCR existente ou a revisão humana.

> O DocuFlux continua a ser a fonte de verdade: o original fica no MinIO, os metadados confirmados ficam na base de dados e nenhuma resposta Gemini cria pagamento, entidade externa, stock ou lançamento contabilístico oficial.

## Onde entra no fluxo

| Etapa | Comportamento |
| --- | --- |
| 1. Upload | O original entra no MinIO privado e recebe hash SHA-256. |
| 2. QR/extração local | O sistema lê QR AT e executa a extração/OCR atual. |
| 3. Regra de qualidade | Se houver campos críticos em falta, baixa confiança ou revisão pedida, a UI apresenta **“Analisar com IA”**; não envia automaticamente documentos sensíveis na primeira versão. |
| 4. Gemini opcional | O servidor envia apenas o ficheiro selecionado e um pedido de extração estruturada para Gemini. |
| 5. Validação | O resultado é validado contra o schema, os dados QR e regras de consistência: NIF, datas, total, IVA e moeda. |
| 6. Revisão | A Inbox mostra proposta, confiança, evidência e diferenças; um utilizador confirma/corrige antes de aplicar. |

Gemini pode processar PDFs com visão nativa e extrair informação estruturada; documentos não PDF podem ser processados, mas a interpretação visual é mais forte para PDF e imagens bem orientadas.[1] A API suporta respostas contra JSON Schema, adequadas para campos previsíveis de faturas e recibos.[2]

## Dados que a IA pode propor

| Grupo | Campos propostos |
| --- | --- |
| Documento | Tipo, número, data, vencimento, moeda, resumo e confiança. |
| Entidade | Nome, NIF, papel fornecedor/cliente e sinais para nova ficha local proposta. |
| Fiscal | Total, base tributável, IVA, taxa(s), ATCUD/referência quando visível. |
| Contabilístico | Natureza, categoria sugerida, conta de débito sugerida e justificação. |
| Arquivo | Área, pasta sugerida e motivo da classificação. |
| Qualidade | Campos em falta, inconsistências, evidência textual e necessidade de revisão. |

O schema deve obrigar campos nulos quando a evidência não é suficiente. O modelo nunca deve inventar NIF, total, taxa de IVA, entidade ou data; um campo não legível é devolvido como `null` com uma razão.

## Modelo e modo de chamada

No ambiente Coolify, o DocuFlux usa uma chave Google própria em `GEMINI_API_KEY`, guardada apenas como segredo de runtime. A chamada ocorre exclusivamente no servidor; a chave nunca chega ao browser. Para a primeira fase, deve usar uma chamada multimodal por documento e resposta JSON estruturada, sem ferramentas de pesquisa, URL ou execução de código.

| Decisão | Primeira fase recomendada |
| --- | --- |
| Modelo | `gemini-3.1-flash-lite` por defeito. É um modelo multimodal estável e económico; o administrador pode substituí-lo por `GEMINI_MODEL` sem alterar código.[3] [4] |
| Entrada | PDF/imagem obtida pelo servidor a partir do MinIO; preferir envio inline para documentos de até 10 MB. |
| Resposta | JSON Schema estrito, validado no servidor antes de ser persistido. |
| Acionamento | Manual em documentos com revisão pendente, depois opcionalmente por regra de baixa confiança. |
| Retentativas | Máximo limitado por documento; falha mantém OCR atual e explica a indisponibilidade. |
| Uso de ficheiros Gemini | Evitar na primeira fase. A Files API pode manter ficheiros enviados durante 48 horas; usar apenas se for necessária análise multi-turno ou documento grande e se houver aprovação explícita.[1] |

## Privacidade, proteção e auditoria

| Controlo | Regra |
| --- | --- |
| Consentimento | Ativação por organização e apenas por administrador. |
| Minimização | Enviar um documento por pedido, sem anexar histórico de pagamentos, CRM ou outros documentos. |
| Dados sensíveis | Ocultar/mascarar identificadores de cartão e não enviar documentos que a política do tenant marque como restritos. |
| Região e contrato | Confirmar os termos de dados, região disponível e acordo de tratamento de dados da conta Google antes de ativar produção. |
| Auditoria | Guardar tenant, documento, hash, modelo, versão de prompt, data, resultado resumido, confiança e decisão humana. |
| Retenção | Não guardar a chave, o pedido bruto nem ficheiros Gemini na base de dados; manter apenas referência de auditoria e resultados aprovados. |
| Custo e limites | Limite diário/mensal configurável por tenant, tamanho máximo 10 MB e proteção contra reenvio do mesmo hash. |

## Critérios de aceitação antes de ativar

1. Testar com documentos autorizados de tipos diferentes: PDF nativo, fotografia de recibo, fatura com QR e documento sem QR.
2. Comparar proposta Gemini contra revisão humana, sem aplicar automaticamente resultados no primeiro ciclo.
3. Verificar que total e IVA não são aceites quando contradizem QR ou dados confirmados.
4. Testar indisponibilidade, timeout, resposta JSON inválida e limite de orçamento.
5. Confirmar que nenhuma chave Gemini aparece em logs, resposta tRPC, browser ou Git.

## Configuração futura no Coolify

| Variável | Finalidade |
| --- | --- |
| `GEMINI_API_KEY` | Chave secreta Google Gemini, runtime-only. |
| `GEMINI_MODEL` | ID do modelo multimodal aprovado para a conta. |
| `GEMINI_ENABLED` | `false` por defeito; só passa a `true` após testes autorizados. |
| `GEMINI_MAX_DOCUMENT_BYTES` | Limite adicional de segurança, no máximo 10 MB na primeira versão. |
| `GEMINI_DAILY_DOCUMENT_LIMIT` | Travão de utilização por tenant. |

## Referências

[1]: https://ai.google.dev/gemini-api/docs/document-processing "Google Gemini API — Document understanding"
[2]: https://ai.google.dev/gemini-api/docs/structured-output "Google Gemini API — Structured outputs"
[3]: https://ai.google.dev/gemini-api/docs/models "Google Gemini API — Models"
[4]: https://ai.google.dev/gemini-api/docs/pricing "Google Gemini API — Pricing"
