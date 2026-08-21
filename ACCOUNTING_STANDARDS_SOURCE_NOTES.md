# Fontes oficiais para normalização contabilística assistida

> **Limite operacional:** o DocuFlux pode propor uma classificação e indicar a fonte normativa relevante. Não cria lançamentos contabilísticos, não substitui o julgamento profissional do contabilista certificado e não altera o documento original.

## Fontes de referência

| Fonte | Uso no DocuFlux | Limite de automatização |
| --- | --- | --- |
| Sistema de Normalização Contabilística (SNC) da Comissão de Normalização Contabilística | Enquadrar a classificação contabilística e o regime aplicável à entidade. | A classificação fica sempre em revisão até à confirmação profissional. |
| Código de Contas e respetivas notas de enquadramento | Relacionar uma categoria interna com uma conta sugerida e a respetiva explicação. | Não é criado qualquer lançamento nem conta externa de forma automática. |
| NCRF aplicáveis, incluindo NCRF 18 — Inventários e NCRF 20 — Rédito quando relevantes | Apresentar a norma potencialmente relacionada com o tipo de documento. | A aplicação não decide o reconhecimento, mensuração ou divulgação final. |
| Artigo 21.º do CIVA | Separar o tratamento de IVA dedutível/não dedutível da classificação contabilística. | O IVA só pode ser confirmado por contabilidade e nunca é comunicado automaticamente. |

## Regras de produto

1. Cada proposta deve guardar o identificador, a versão e a fonte da regra utilizada.
2. A sugestão contabilística e a proposta fiscal são objetos separados: uma categoria de despesa não determina, por si só, a dedutibilidade do IVA.
3. Apenas utilizadores com papel de administração ou contabilidade podem confirmar ou alterar uma proposta fiscal antes de exportação.
4. O fluxo TOConline só pode usar uma proposta fiscal com estado `confirmado_contabilista` ou uma exceção explicitamente registada.

## Referências

[1]: https://www.cnc.min-financas.pt/snc2016.html "Comissão de Normalização Contabilística — Sistema de Normalização Contabilística"
[2]: https://www.cnc.min-financas.pt/Instrumentos_snc_geral.html "Comissão de Normalização Contabilística — Instrumentos contabilísticos SNC"
[3]: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva21.aspx "Autoridade Tributária e Aduaneira — Artigo 21.º do CIVA"
