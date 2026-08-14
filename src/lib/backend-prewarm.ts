export async function prewarmRustBackend() {
  // Mantido por compatibilidade com a inicialização existente. Desde a versão
  // 11.2.7, identidade e convites usam diretamente as funções seguras do
  // Supabase, portanto não existe servidor externo para aquecer.
}
