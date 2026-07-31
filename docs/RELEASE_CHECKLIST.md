# Checklist de release do Labstar

Nenhum item deve ser marcado sem evidência. Esta lista serve para alpha interna, beta e lançamento público.

## Identificação da versão

- [ ] versão definida;
- [ ] commit candidato registrado;
- [ ] branch candidata registrada;
- [ ] changelog preparado;
- [ ] responsável pela decisão de release definido.

## Código e CI

- [ ] `Validar Labstar` verde;
- [ ] `Validar Tauri e Rust` verde;
- [ ] `Validar integração Tauri Auth` verde;
- [ ] backend Rust validado;
- [ ] dependências revisadas;
- [ ] nenhuma credencial em diff, logs ou Artifacts;
- [ ] documentação atualizada.

## Backend e banco

- [ ] `/health/live` aprovado;
- [ ] `/health/ready` aprovado;
- [ ] backup novo gerado e baixado;
- [ ] restauração testada em ambiente separado quando a release altera banco;
- [ ] migrações revisadas e aplicadas uma por vez;
- [ ] plano de rollback documentado;
- [ ] CORS e origens permitidas revisados;
- [ ] rate limits e logs revisados.

## Autenticação e autorização

- [ ] proprietário entra com `hepterstudios@gmail.com` pelo Google;
- [ ] Google mostra seletor de contas;
- [ ] troca de conta funciona;
- [ ] convite pendente é preservado durante a troca;
- [ ] identidade GitHub não vinculada permanece bloqueada;
- [ ] vinculação explícita de identidade testada, quando implementada;
- [ ] membro ativo entra;
- [ ] segundo login do membro ativo funciona sem novo convite;
- [ ] membro pendente permanece aguardando aprovação;
- [ ] membro suspenso permanece bloqueado;
- [ ] usuário sem cadastro permanece bloqueado;
- [ ] convite pessoal correto funciona;
- [ ] convite pessoal com e-mail errado falha;
- [ ] convite rápido cria estado pendente;
- [ ] convite reutilizado falha;
- [ ] convite expirado falha;
- [ ] convite revogado falha;
- [ ] somente owner concede administração.

## Aplicativo Windows

- [ ] execução verde do workflow corresponde ao commit candidato;
- [ ] EXE baixado do Artifact correto;
- [ ] MSI baixado do Artifact correto;
- [ ] instalação limpa do EXE testada;
- [ ] desinstalação do EXE testada;
- [ ] instalação limpa do MSI testada;
- [ ] desinstalação do MSI testada;
- [ ] callback funciona com app fechado;
- [ ] callback funciona com app aberto;
- [ ] instância única funciona;
- [ ] atalho e ícone corretos;
- [ ] nenhum console ou segredo aparece;
- [ ] assinatura digital válida para release pública;
- [ ] updater testado para release pública;
- [ ] rollback do updater testado.

## Interface

- [ ] `1024×640` validado;
- [ ] `1366×768` validado;
- [ ] `1440×900` validado;
- [ ] `1920×1080` validado;
- [ ] imagens dos Espaços não esticam;
- [ ] avatares não esticam;
- [ ] indicador online não corta;
- [ ] loading, erro, vazio e offline revisados;
- [ ] navegação por teclado revisada;
- [ ] contraste e foco revisados;
- [ ] textos não ficam cortados.

## Web/PWA

- [ ] build de produção validado;
- [ ] service worker revisado;
- [ ] cache não armazena dados privados;
- [ ] login web funciona;
- [ ] redirects funcionam;
- [ ] `_headers` e CSP revisados;
- [ ] rollback do Cloudflare Pages conhecido.

## Segurança

- [ ] RLS revisada;
- [ ] buckets privados revisados;
- [ ] URLs assinadas revisadas;
- [ ] nenhum `service_role` no cliente;
- [ ] nenhum secret em variável `VITE_`;
- [ ] nenhum token completo em log;
- [ ] nenhum token de convite armazenado em texto puro;
- [ ] dependências com alertas críticos resolvidas;
- [ ] permissões Tauri mínimas revisadas;
- [ ] incident response atualizado.

## Internacionalização — obrigatório antes do lançamento internacional

- [ ] português e inglês completos;
- [ ] nenhum texto obrigatório fixo em português;
- [ ] datas e horas localizadas;
- [ ] fusos horários testados;
- [ ] números e moedas localizados;
- [ ] e-mails localizados;
- [ ] layout suporta textos maiores;
- [ ] caracteres internacionais testados;
- [ ] termos e política de privacidade revisados por país.

## Operação

- [ ] monitoramento ativo;
- [ ] alertas testados;
- [ ] canal de suporte definido;
- [ ] responsável de plantão definido durante a janela;
- [ ] plano de comunicação de incidente preparado;
- [ ] custos estimados e limites revisados;
- [ ] status page preparada para release pública.

## Aprovação

- [ ] todos os bloqueadores resolvidos;
- [ ] evidências anexadas à issue/PR de release;
- [ ] proprietário aprovou;
- [ ] janela de release definida;
- [ ] rollback pronto;
- [ ] release executada;
- [ ] verificação pós-release concluída.

## Regra de interrupção

Qualquer falha em autorização, perda de dados, segredo exposto, instalação quebrada ou impossibilidade de rollback interrompe a release imediatamente.
