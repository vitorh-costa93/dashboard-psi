# Dashboard Psi — histórico e continuidade

Este arquivo registra o estado operacional do repositório e decisões que
precisam sobreviver a mudanças de agente. Não armazene tokens, chaves,
prontuários ou quaisquer dados pessoais nele.

## Repositório e integrações

- Diretório de trabalho: `C:\Users\Vitor\Documents\dashboard-psi`
- Branch atual: `main`
- Remoto: `origin` → `https://github.com/vitorh-costa93/dashboard-psi.git`
- A integração operacional deve usar as CLIs oficiais: `gh`, `npm run vercel -- …`
  e `npm run supabase -- …`.
- Verificação feita em 03/09/2026: GitHub CLI autenticado como
  `vitorh-costa93`, protocolo HTTPS e escopos `gist`, `read:org` e `repo`.
  `git ls-remote --heads origin` confirmou o acesso à branch remota `main`.
- Push, deploy e alterações no Supabase (migrations/schema) estão
  pré-autorizados pelo usuário (vitorh-costa93, 09/09/2026) — não é preciso
  pedir confirmação antes de subir. Ainda assim, rode os testes (`npm test`)
  e revise o diff/migration antes de subir, e nunca pule essa checagem só
  porque a autorização já existe.
- Verificação de 10/09/2026: `HEAD` e `origin/main` apontam para o mesmo
  commit (`9ef8ad4`); não há atualização remota pendente. Arquivos PSM não
  rastreados e a alteração local de `assets/logo-jaqueline-dark.png` foram
  preservados, sem sobrescrita.
- Supabase CLI: `npm run supabase -- projects list` confirma o projeto ativo
  `dashboard-psi` (`tanluftwqzckzqiwqkhw`) e o checkout permanece vinculado.
- Vercel CLI: instalada localmente como `vercel@59.5.0`, exposta por
  `npm run vercel -- …`, autenticada como `vitorh-costa93` e vinculada ao
  projeto `consultorio-jaqueline`. Não registrar valores de variáveis de
  ambiente da Vercel neste arquivo.

## Comandos úteis

```powershell
npm test
npm run supabase -- status
npm run vercel -- --help
gh auth status
git status --short
```

Para a validação local de exportação da PSM, o projeto usa Chrome local por
meio de `CHROME_PATH` e `lib/pdf.js`. A exportação precisa continuar no formato
12 × 8 polegadas, equivalente a 864 × 576 pontos no PDF.

## Arquitetura relevante

- Aplicação estática em `index.html`, APIs em `api/` e funções reutilizáveis em
  `lib/`.
- Os dados clínicos são protegidos no servidor. `SUPABASE_SERVICE_KEY` nunca
  pode ir para cliente, logs, artefatos ou commits.
- Migrações são aditivas e ficam em `supabase/migrations/`. Leia
  `ROADMAP_MIGRACAO_SUPABASE.md` e `PROJECT_CONTEXT.md` antes de alterar
  autenticação, SQL, APIs, migrações ou regras de negócio.
- `PROJECT_CONTEXT.md` é o registro arquitetural de longo prazo. Este arquivo
  complementa-o com o estado operacional e de implementação corrente.

## Histórico da PSM Infantil — UI Emoções

### Referência e objetivo

- A referência aprovada é `121b78d9-psminfantil_12.pdf`.
- A versão anterior exportada como páginas PNG/WebP tinha aparência de captura
  e texto de baixa qualidade.
- O objetivo atual é montar as dez páginas diretamente no aplicativo, com
  textos, fundos, ícones e ilustrações em SVG/canvas, mantendo valores
  dinâmicos e exportação PDF funcional.

### Implementação atual no diretório de trabalho

- `lib/psm-infantil-template.js` concentra o template de dez páginas para
  prévia e PDF; os textos são SVG nativo e os valores da página 7 são
  dinâmicos.
- `lib/psm-infantil-components.js` contém primitives SVG de badges, coração,
  estrela, WhatsApp, Google Meet e estados iniciais de mascotes.
- `assets/psm/infantil-emocoes/vector-art/` contém SVGs obtidos de elementos
  individuais aprovados; o template não deve voltar a referenciar PNG, WebP ou
  JPG.
- `scripts/vectorize-psm-infantil-art.mjs` recria os SVGs das ilustrações
  individuais. Ele nunca deve receber as dez páginas completas como entrada.
- `scripts/vectorize-psm-infantil-lettering.mjs` é histórico de um traçado de
  lettering; priorize fontes nativas para textos, pois traçados antigos podem
  introduzir vazios nas letras.
- `lib/documents.js` usa o mesmo template infantil para a exportação. Os assets
  SVG são embutidos como `data:` URI no HTML do PDF para evitar dependência de
  servidor estático durante a renderização.
- `lib/pdf.js` fecha o Chrome local quando `CHROME_PATH` está definido, evitando
  processos órfãos durante validações consecutivas.
- `tests/psm-infantil-template.test.js` valida dez páginas, valores dinâmicos,
  limites do canvas e bloqueia regressão para PNG/WebP/JPG no template.

### Validações realizadas

- `npm test`: 20 testes aprovados na última execução registrada.
- `output/pdf/psm-infantil-vetorial.pdf`: exportado e validado com 10 páginas
  de 864 × 576 pontos.
- A estrutura vetorial e a exportação estão funcionais. A equivalência visual
  estrita 1:1 ainda precisa de revisão humana: alguns personagens da capa só
  existem no material disponível como composição já mesclada e não como fonte
  independente.

### Regras para próximas iterações

1. Não usar páginas inteiras como imagem de fundo.
2. Não reintroduzir `<img>` ou caminhos `.png`, `.webp` ou `.jpg` no template
   infantil vetorial.
3. Manter `preserveAspectRatio="xMidYMid meet"`, coordenadas dentro do
   `viewBox` 2430 × 1620 e validar cortes no PDF antes de entregar.
4. Alterar uma composição por vez e conferir as páginas 1, 3, 4, 6, 7, 8 e 9,
   que foram as páginas com problemas de corte relatados.
5. Não declarar a PSM finalizada apenas por testes verdes: comparar visualmente
   com o PDF de referência e validar a exportação real.

## Estado do diretório de trabalho

Há arquivos não rastreados de implementação e auditoria da PSM, incluindo
`assets/psm/infantil-emocoes/vector-art/`, templates, scripts e testes. Antes de
criar um commit, separe deliberadamente os arquivos de código/asset que fazem
parte da solução de artefatos locais como `tmp/`, `output/`, `.devserver.log`,
`.claude/` e `.impeccable/`.

Os commits mais recentes do histórico Git tratam documentos e geração de
conteúdo; consulte `git log --oneline -12` para a sequência atual antes de
criar novo commit.
