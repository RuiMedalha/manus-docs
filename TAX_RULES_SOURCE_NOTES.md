# Fonte oficial para regras de IVA assistidas

Este ficheiro guarda a base legal usada na modelação de regras assistidas. Não substitui validação pelo contabilista responsável nem autoriza comunicação automática de IVA.

## Artigo 21.º do CIVA — pontos relevantes para a configuração

O artigo 21.º do Código do IVA exclui, em regra, o direito à dedução do IVA em despesas de alimentação, bebidas, tabacos, receção, transportes/viagens de negócios e determinadas despesas com viaturas.[1]

Para combustíveis normalmente utilizáveis em viaturas automóveis, o artigo estabelece uma regra de dedução de 50% para gasóleo, GPL, gás natural e biocombustíveis, sujeita a exceções e a condições específicas; certos usos/veículos podem ter tratamento diferente.[1]

As exceções do mesmo artigo incluem, entre outras, situações de refeições/alimentação fornecidas pelo sujeito passivo ao pessoal em estruturas próprias, despesas efetuadas por conta de terceiro a reembolsar e determinadas despesas de eventos com percentagens próprias.[1]

## Implicação para o DocuFlux

O DocuFlux deve guardar a regra aplicada, o fundamento, a percentagem proposta, a evidência e a decisão humana. A classificação OCR/Gemini não decide sozinha a dedução fiscal, nem comunica declarações de IVA ou lançamentos ao TOConline sem confirmação.

| Categoria reconhecida | Ação inicial da aplicação | Ação humana obrigatória |
| --- | --- | --- |
| Alimentação/refeições | Sugerir `IVA não dedutível — confirmar exceção` | Contabilista confirma ou altera antes de exportar. |
| Combustível | Sugerir `IVA sujeito a regra de combustível — confirmar tipo de combustível e veículo` | Contabilista confirma percentagem e exceção aplicável. |
| Água, eletricidade, telecomunicações | Sugerir revisão normal por categoria | Confirmar elegibilidade e dados da fatura antes de exportar. |
| Despesa ambígua | Marcar `requer revisão fiscal` | Contabilista decide regra e destino. |

## Referência

[1]: https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/civa_rep/Pages/iva21.aspx "Autoridade Tributária e Aduaneira — Artigo 21.º do CIVA, Exclusões do direito à dedução"
