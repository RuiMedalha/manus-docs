# Ingestão de faturas recebidas por email

## Decisão de produto

O DocuFlux trata **anexos e links como fontes diferentes**. Um anexo PDF/JPG/PNG/DOCX elegível é pré-visualizado e pode ser importado diretamente para a Inbox. Um link externo, mesmo vindo de um emissor conhecido, não é descarregado automaticamente: é apresentado ao utilizador com remetente, domínio e motivo de confiança para confirmação explícita. Só depois dessa confirmação o servidor pode obter o ficheiro por HTTPS, validar tipo, tamanho, assinatura de conteúdo e hash, e submetê-lo às salvaguardas normais de deduplicação, OCR e auditoria.

> Um link recebido por email não prova, por si só, que o respetivo destino continua seguro nem que devolve um documento. O DocuFlux não introduz credenciais em links, não contorna páginas de login, não segue redirecionamentos para domínios não aprovados e não abre documentos em nome do utilizador sem confirmação.

## Tratamento por origem

| Origem | Comportamento DocuFlux | Ação do utilizador |
| --- | --- | --- |
| Anexo elegível | Pré-visualiza e importa para a Inbox após seleção; aplica hash, OCR e regras de pasta. | Selecionar os anexos a importar. |
| Link HTTPS de fornecedor conhecido | Mostra cartão de revisão com remetente, domínio, URL mascarado e aviso de validade. | Confirmar a obtenção do ficheiro; rever o documento importado. |
| Link autenticado, página HTML ou portal | Não tenta adivinhar nem reutilizar a sessão do browser. | Abrir o portal no browser e descarregar o PDF; depois enviar para a Inbox. |
| Link expirado ou resposta inválida | Não cria documento e regista a falha de forma auditável. | Pedir novo envio ou carregar o ficheiro manualmente. |

## Compatibilidade observada

O Moloni permite o envio de documentos por email através de um link de descarga cuja validade pode ser configurada; depois de expirar, é necessário novo envio. O TOConline disponibiliza documentos enviados por email em página de consulta ou link de descarga e mantém um fluxo de arquivo/associação para documentos recebidos por email. Por isso, o DocuFlux deve privilegiar os anexos quando existirem e tratar os links como propostas de obtenção com confirmação, não como importações automáticas.[1] [2] [3]

## Limites da primeira versão

1. A importação é manual a partir do conector Outlook já autorizado; não existe varrimento automático da caixa de correio.
2. São aceites apenas PDF, JPG, PNG e DOCX até 10 MB depois do download validado.
3. O conector apenas pode aceder a mensagens e anexos da caixa Microsoft 365 autorizada; não usa a sessão, palavra-passe ou cookies de Moloni, TOConline ou outro fornecedor.
4. O resultado é sempre enviado para a Inbox para revisão humana, incluindo quando OCR ou QR AT sugerem classificação contabilística.

## Referências

[1]: https://www.moloni.pt/suporte/posso-enviar-documentos-por-e-mail-aos-meus-clientes-e-fornecedores "Moloni — envio de documentos por email"
[2]: https://manual.toconline.pt/support/solutions/articles/3000105217-envio-de-documento-por-e-mail "TOConline — envio de documento por email"
[3]: https://manual.toconline.pt/support/solutions/articles/3000112777-recebidos-por-email "TOConline — documentos recebidos por email"
