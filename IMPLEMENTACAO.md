# Implementação — Dashboard Psi

## O que foi alterado

- Limpeza completa do formulário de Prontuários após salvar.
- `paciente_id` permanente, baseado no nome único da Base de Pacientes.
- Histórico de prontuários preservado para pacientes inativos.
- Migração automática dos prontuários antigos para `paciente_id` quando houver correspondência.
- Alertas no Dashboard para renovações de pacote e sessões pendentes na última semana do mês.
- Nova sub-aba `Posts` em Atividades.
- Radar de tendências recentes via Google News + análise por IA.
- Geração de conteúdo para posts e geração opcional da arte.
- Salvamento de posts como rascunho.
- Radar pode ser atualizado diariamente por Vercel Cron.
- Nenhuma publicação automática no Instagram.

## Passo obrigatório no Supabase

Abra o SQL Editor do Supabase e rode **todo o conteúdo de `supabase schema.sql`**.

O script foi preparado para ser compatível com as tabelas existentes e adiciona as novas estruturas sem apagar os dados.

## Variáveis de ambiente

As já utilizadas continuam:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `OPENAI_KEY`

Não é necessário adicionar uma chave do Instagram.

## Observação sobre o radar

O radar acompanha assuntos recentes disponíveis na web, principalmente notícias relacionadas ao nicho. Ele não acessa métricas internas do Instagram nem publica nada.

## Publicação

Depois de rodar o SQL:
1. Substitua os arquivos do repositório pelos arquivos deste pacote.
2. Faça o deploy normalmente na Vercel.
3. Abra o Dashboard e confirme os alertas.
4. Abra `Prontuários` e confirme que os pacientes ativos aparecem no seletor.
5. Abra `Atividades > Posts` e clique em `Buscar tendências`.

O primeiro carregamento de Prontuários fará a associação dos registros antigos aos IDs permanentes quando encontrar o paciente correspondente na Base de Pacientes.
