# Correção dos rascunhos de Posts

Esta versão foi reconstruída a partir dos arquivos anexados pelo usuário.

Correções:
- o código do modal de rascunhos fica dentro do bloco `<script>` e não é mais renderizado como texto na página;
- rascunhos carregados no histórico são clicáveis;
- clicar em um rascunho abre uma visualização completa;
- botão "Abrir no editor" recupera o conteúdo salvo;
- botão "Excluir rascunho" remove o registro via `/api/data?table=posts&id=...`;
- o histórico é mantido em memória para ações rápidas e recarrega do Supabase quando necessário;
- foi adicionada normalização de hashtags e artes para compatibilidade com rascunhos antigos.
