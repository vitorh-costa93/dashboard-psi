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
