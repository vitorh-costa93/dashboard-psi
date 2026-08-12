# Implementação — Dashboard Psi (versão consolidada)

## O que foi alterado

### Prontuários
- Correção do fluxo de salvamento de sessão.
- Após salvar, paciente, relato e demais campos são limpos automaticamente.
- Data volta para hoje.
- Seleção de busca e prontuário aberto são resetados para iniciar o próximo registro.
- Registros antigos continuam carregando do Supabase.
- Paciente possui `paciente_id` permanente baseado no nome único da Base de Pacientes.
- Histórico permanece disponível mesmo quando o paciente fica inativo.
- Se o paciente retornar com outro dia/horário, o histórico continua vinculado ao mesmo ID.
- Registros antigos sem `paciente_id` são associados automaticamente quando o nome correspondente é encontrado.

### Pacientes
- Correção do upsert por `nome` no endpoint do Supabase (`on_conflict=nome`).
- Dropdown de novos registros continua limitado aos pacientes ativos.
- Biblioteca de prontuários inclui pacientes inativos que tenham histórico.

### Alertas de pacotes
- Renovação prevista continua sendo calculada pela frequência semanal e saldo de sessões.
- Só entram no alerta de renovação pacientes cujo pacote habitual seja maior que 1 sessão.
- O pacote habitual é inferido pelo histórico de `Sessões cobradas`; em empate, considera-se o pacote mais recente entre os mais frequentes.
- Sessões pendentes só aparecem na última semana do mês.
- Fora da última semana, nenhuma pendência é exibida no painel de alertas.

### Espaço de criação
- A antiga seção `Atividades` foi renomeada para `Espaço de criação`.
- As sub-abas de geração de imagens e apresentações foram preservadas.
- A sub-aba de posts foi mantida dentro do Espaço de criação.

### Posts e radar de tendências
- Radar voltado para uma psicóloga que atende todo o ciclo vital:
  - Infância
  - Adolescência
  - Adultos
  - Idosos
  - Família/Parentalidade
  - Ciclo vital
- Busca assuntos recentes em fontes públicas via Google News RSS.
- A IA classifica relevância, faixa do ciclo vital, formato, potencial e ângulo de abordagem.
- Não usa dados de pacientes no radar.
- Geração de legenda, gancho, slides, hashtags e CTA.
- Nenhuma publicação automática no Instagram.
- Posts podem ser salvos como rascunho.

### Identidade visual
- A logo enviada foi incorporada ao projeto.
- A versão transparente escura é aplicada automaticamente às artes geradas.
- A arte recebe a logo em uma pequena área clara no canto inferior direito.
- O fundo verde da imagem enviada é tratado apenas como referência visual; não é obrigatório nas artes.
- Também foram preservadas versões branca e original da logo em `assets/` para futuras variações.

## Supabase

Execute todo o conteúdo de `supabase schema.sql` no SQL Editor do Supabase.

O script preserva as tabelas existentes e cria/atualiza as estruturas necessárias para:
- pacientes;
- prontuários;
- posts;
- radar de tendências.

## Variáveis de ambiente

Mantenha:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_KEY`

Opcional:
- `OPENAI_TEXT_MODEL` — padrão `gpt-4.1-mini`.

Não é necessário configurar Instagram nem Meta API.

## Radar automático

O `vercel.json` mantém uma execução diária de `/api/trends`.
O radar acompanha assuntos públicos recentes; ele não acessa mensagens, dados privados ou informações de pacientes.

## Publicação

1. Rode o `supabase schema.sql`.
2. Substitua os arquivos do repositório pelos arquivos deste pacote.
3. Faça o deploy na Vercel.
4. Abra `Prontuários` e confira se os pacientes ativos aparecem no seletor.
5. Confira se os prontuários já existentes aparecem na biblioteca.
6. Abra `Dashboard` e confira os alertas de renovação.
7. Abra `Espaço de criação > Posts` e use `Buscar tendências`.


### Carrossel e identidade visual
- Carrosséis geram exatamente 7 artes, uma por slide.
- A logo é transparente e é recolorida automaticamente para um tom de destaque extraído da arte, em vez de usar uma cor fixa.
- As 7 artes podem ser baixadas individualmente e são armazenadas em `posts.imagens_b64` (JSONB).
- Execute novamente o `supabase schema.sql`; os `ALTER TABLE ... IF NOT EXISTS` são seguros para instalações existentes.

## Correção de legibilidade editorial (12/08/2026)
- A posição do texto agora é escolhida conjuntamente para todas as artes do post/carrossel.
- O aplicativo mede luminância, homogeneidade e contraste nas zonas candidatas antes de aplicar a tipografia.
- A cor do texto é definida de forma consistente para o conjunto do carrossel.
- Quando a área não oferece contraste suficiente, um véu/gradiente editorial sutil é aplicado atrás do texto, em vez de depender apenas da cor da fonte.
- A posição da logo continua sendo decidida em conjunto e é mantida igual em todo o carrossel.
- A cor da logo também é escolhida por contraste real, alternando entre verde profundo e creme claro.
- A paginação `1/7 ... 7/7` continua sendo desenhada pelo aplicativo, nunca pela IA.
- Os campos de posição/cor/contraste do texto e da logo são armazenados junto ao rascunho.


## V6 — Legibilidade real do carrossel

- A escolha da cor do texto agora usa percentis de luminância (q10/q50/q90), e não somente média.
- O sistema exige contraste mínimo de referência antes de escolher entre texto escuro e claro.
- A cor do texto é independente da cor da logo.
- A logo também é avaliada pelo pior caso entre os slides; a escolha não usa mais o menor contraste de forma invertida.
- O véu editorial foi reforçado para funcionar como suporte de leitura, sem card branco.
- A paginação usa a mesma cor da tipografia e permanece aplicada pelo aplicativo.

## Endurecimento da identidade visual dos posts

A identidade visual de um post/carrossel é definida uma única vez sobre o conjunto completo de imagens e então congelada. Não existe recalculo de cor ou posição por slide.

- Carrossel: mesma cor de texto, mesma cor de logo, mesma posição de texto, mesma posição de logo e mesma tipografia em todos os 7 slides.
- Contraste: se a cor escolhida não atingir segurança suficiente em algum slide, o sistema adiciona um véu editorial na área fixa de texto/logo; a cor não muda.
- A IA gera apenas os fundos/composição visual. Texto, título, numeração e logo são compostos pelo aplicativo.
- Título: somente na capa do carrossel. Posts simples podem usar o título uma única vez.
