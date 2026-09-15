# PF2e Creature Images

Módulo para associar imagens pessoais hospedadas na Asset Library do Forge (ou
em outro caminho acessível pelo Foundry) às criaturas dos compêndios do PF2e.

O módulo não inclui, baixa nem redistribui imagens. Cada usuário fornece os
próprios arquivos e URLs.

## Instalação por manifesto

No Foundry VTT ou em **The Forge → Bazaar → Custom Modules → Install from
Manifest**, use:

```text
https://github.com/John-Villas/pf2e-creature-images/releases/latest/download/module.json
```

## Funcionalidades

Compatível com Foundry VTT v13 e PF2e. O módulo:

- associa uma URL a uma criatura usando o UUID do compêndio de origem;
- atualiza imediatamente atores já importados;
- aplica a associação a importações futuras;
- oferece sincronização dos NPCs existentes no mundo;
- oferece uma tela pesquisável para editar e remover associações;
- importa e exporta o catálogo para transferi-lo entre mundos.

Na janela **Associar imagem**, marque **Usar outra imagem para o token** para
informar uma imagem separada. Ela será salva em `tokenImage` no catálogo e
aplicada aos campos **Image Path** e **Subject Texture** do Prototype Token,
desativando o anel dinâmico para usar a arte fornecida diretamente. A associação vale para o ator editado,
importações futuras e a sincronização de atores existentes. Tokens já colocados
em cenas não são atualizados.

Desmarcar a opção remove `tokenImage` da associação, mas não desfaz imagens
já aplicadas ao Prototype Token nem reativa o anel. Catálogos antigos, sem esse campo, continuam
alterando apenas o retrato.

## Instalação local para desenvolvimento

Copie esta pasta para:

```text
<Foundry User Data>/Data/modules/pf2e-creature-images
```

Reinicie o Foundry, habilite o módulo no mundo PF2e e abra a ficha de uma
criatura importada do compêndio. No menu do cabeçalho, escolha **Associar
imagem** e cole a URL da imagem.

O botão **Sincronizar imagens** aparece no rodapé da aba de Atores e só altera
retratos vazios ou genéricos. Quando há uma imagem de token associada, ela é
aplicada aos dois campos do Prototype Token, mesmo se já tiverem outra imagem.

O catálogo completo fica em **Configurações → Configurar definições →
Configurações do módulo → PF2e Creature Images → Abrir catálogo**.

## Console de desenvolvimento

O catálogo pode ser exportado no console do navegador com:

```js
game.modules.get("pf2e-creature-images").api.exportCatalog()
```

Para importar um objeto já carregado:

```js
await game.modules.get("pf2e-creature-images").api.importCatalog(data)
```

O catálogo é salvo por mundo. Use a exportação e importação para compartilhar as
associações entre mundos locais ou hospedados no Forge.

## Limitações conhecidas

- URLs privadas precisam ser acessíveis à sessão atual do Foundry.
- Alterar a arte no compêndio não modifica automaticamente atores antigos; use
  a sincronização.
- O módulo não baixa, inclui ou redistribui nenhuma imagem.
