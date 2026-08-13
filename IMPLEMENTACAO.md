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


## Ajustes de consistência visual do carrossel
- Logo aplicada pelo aplicativo em posição fixa no centro superior, dentro de uma zona de respiro protegida.
- Paginação aplicada pelo aplicativo em componente fixo `02 / 07`, no canto superior esquerdo.
- Paleta congelada por carrossel: creme `#F5F1E8`, verde profundo `#4E553E`, sage `#899776`, terracota `#B86A49`, areia `#D9CDB8`.
- IA instruída a não gerar logo, paginação ou elementos de marca e a reservar as zonas superiores.
- Slides internos não repetem o título principal.


## Rascunhos de Posts — V14
- A geração visual do carrossel foi preservada da versão V12, incluindo logo central superior, paginação fixa e paleta congelada.
- Rascunhos agora usam a tabela `post_artes` para armazenar cada PNG separadamente, evitando requests gigantes com as 7 imagens.
- O histórico carrega apenas metadados; ao clicar em um rascunho, a API busca as artes e abre uma galeria com miniaturas, tela cheia, download, exportação, edição e exclusão.
- Execute o `supabase schema.sql` para criar `post_artes`.
