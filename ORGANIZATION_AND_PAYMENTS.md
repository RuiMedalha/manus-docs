# Organização de ficheiros e pagamentos

## Ficheiros e pastas

Os ficheiros não são guardados dentro da base de dados nem em pastas locais do servidor. Cada PDF, imagem ou DOCX é guardado uma vez no armazenamento de objetos, com uma chave privada por organização. A aplicação grava no documento uma **pasta lógica** (`finalFolder`), por exemplo `/2026/08/Fatura recebida/ACME`, e usa essa informação para apresentar uma área navegável de Pastas.

Mover um documento entre pastas altera apenas esta referência lógica. O ficheiro original mantém a mesma chave segura no armazenamento de objetos, evitando cópias, links quebrados e duplicação de espaço. As regras de pastas continuam a sugerir automaticamente o destino no upload e após a revisão OCR; o utilizador pode confirmar ou substituir a pasta na interface.

## Calendário de pagamentos

Cada pagamento pertence a um tenant e pode estar ligado a um documento. Conserva credor/devedor, data de vencimento, valor em cêntimos, moeda, estado (`pendente`, `pago` ou `cancelado`) e data de pagamento. Uma fatura recebida que tenha total e vencimento cria ou atualiza uma entrada sugerida no calendário; o utilizador pode criar pagamentos avulsos e confirmar a liquidação.

O calendário apresenta os vencimentos do mês selecionado, um resumo de atrasados e os valores previstos. Todos os acessos e alterações são limitados por `tenantId` e auditados.
