# Pipeline de OCR e classificação

## Objetivo

Cada documento elegível é colocado numa fila por organização. A fila conserva o estado, as tentativas, o texto extraído e uma sugestão estruturada de metadados. **Nenhuma sugestão substitui automaticamente os dados existentes**: a Inbox apresenta uma revisão explícita para aplicar os campos propostos.

## Dois modos, uma fila

| Modo | Acionamento | Comportamento |
| --- | --- | --- |
| Automático | Após upload e em ciclos agendados | O upload cria um trabalho pendente; um processador autenticado recolhe um pequeno lote, executa OCR/classificação e regista o resultado. |
| Sob pedido | Ação de utilizador autorizado na Inbox | O utilizador coloca um documento ou lote na mesma fila e executa imediatamente um ciclo de processamento. |

O processador trabalha lotes pequenos e é idempotente. Um trabalho em curso não pode ser recolhido duas vezes; falhas são registadas, com um número limitado de tentativas. O acionamento automático será ativado depois de a versão ser publicada, pois o endpoint agendado requer uma aplicação acessível publicamente.

## Extração e classificação

O processador obtém uma URL temporária do ficheiro no armazenamento de objetos e chama o modelo multimodal **Gemini 3 Flash** no servidor. PDFs são enviados como ficheiro e JPG/PNG como imagem. DOCX é convertido para texto no servidor e enviado ao classificador com o conteúdo extraído.

O modelo devolve JSON estrito com tipo de documento, entidade, NIF, número, datas, valores, IVA, moeda, etiquetas e confiança. Antes de guardar a sugestão, o servidor valida limites, formatos de data, valores inteiros em cêntimos e moeda. O texto OCR fica limitado a uma dimensão segura e só é acessível no escopo do tenant.

## Segurança e auditoria

Cada consulta inclui `tenantId`; o trabalho é carregado pelo identificador e tenant em simultâneo. A fila regista `ocr.queued`, `ocr.started`, `ocr.completed`, `ocr.failed` e `ocr.suggestion_applied` no histórico de auditoria. A atualização definitiva dos metadados reutiliza as mesmas regras de permissão da Inbox.
