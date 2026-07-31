# Atualização automática segura do Labstar

Atualizado em 31 de julho de 2026.

O atualizador ainda não está ativado no aplicativo distribuído. Isso é intencional: o updater do Tauri exige assinatura criptográfica dos pacotes e não permite desativar essa verificação. Ativar um endpoint sem preservar corretamente a chave privada pode impedir todas as atualizações futuras dos aplicativos já instalados.

## Objetivo

Permitir que o Labstar:

1. verifique uma versão nova em HTTPS;
2. mostre versão, alterações e tamanho;
3. baixe o pacote em segundo plano;
4. valide a assinatura antes da instalação;
5. instale e reinicie com confirmação do usuário;
6. suporte canal interno e canal estável;
7. preserve um caminho de rollback.

## O que já existe

- versão única em `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`;
- EXE e MSI reproduzíveis pelo GitHub Actions;
- execução identificada por branch e commit;
- Artifacts privados para testes;
- checklist de release em `docs/RELEASE_CHECKLIST.md`;
- arquitetura Tauri 2 pronta para receber o plugin updater.

## Bloqueadores antes de ativar

- certificado de assinatura de código do Windows;
- par de chaves do updater Tauri;
- backup seguro e redundante da chave privada;
- endpoint HTTPS estável para o manifesto;
- Release privada assinada;
- política de versões;
- teste de atualização e rollback;
- definição de canal interno e estável.

## Chaves do updater

O updater usa duas chaves diferentes:

- **chave pública:** fica em `tauri.conf.json` e valida os pacotes;
- **chave privada:** assina os pacotes e nunca pode ser versionada ou compartilhada.

A perda da chave privada impede publicar atualizações para instalações que confiam na chave pública correspondente. Ela deve ter cópia criptografada e controle de acesso.

## Secrets planejados

Somente os nomes devem aparecer na documentação:

- `TAURI_SIGNING_PRIVATE_KEY`;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`;
- credenciais do certificado de assinatura do Windows;
- token do serviço usado para publicar a Release privada, quando necessário.

Nenhum desses valores pode aparecer em código, logs, issues, PRs ou mensagens.

## Configuração futura do Tauri

Depois da geração e armazenamento seguro das chaves:

1. adicionar `tauri-plugin-updater` ao Rust e ao frontend;
2. registrar o plugin em `src-tauri/src/lib.rs`;
3. adicionar permissões mínimas à capability;
4. configurar `bundle.createUpdaterArtifacts`;
5. configurar a chave pública e os endpoints HTTPS;
6. gerar artefatos e arquivos `.sig` no CI;
7. publicar manifesto por plataforma e arquitetura;
8. implementar interface de verificação, download e instalação.

Não usar transporte inseguro nem endpoint HTTP em produção.

## Canais

### Interno

- acesso somente a colaboradores;
- versões alpha e beta;
- atualizações frequentes;
- telemetria e feedback controlados;
- possibilidade de rollback rápido.

### Estável

- somente versões aprovadas pelo checklist;
- pacotes assinados;
- changelog revisado;
- atualização progressiva;
- monitoramento pós-release.

O aplicativo não deve aceitar downgrade por padrão. Um rollback precisa ser uma release explicitamente planejada e assinada.

## Política de versão

Usar SemVer:

- `MAJOR`: mudança incompatível ou grande ciclo do produto;
- `MINOR`: funcionalidade compatível;
- `PATCH`: correção compatível.

Exemplos internos:

- `11.0.1-alpha.1`;
- `11.1.0-beta.1`;
- `11.1.0`.

A versão deve ser sincronizada em todos os arquivos necessários antes do build.

## Fluxo de release futuro

1. escolher commit candidato;
2. executar toda a CI;
3. concluir checklist;
4. atualizar versão e changelog;
5. gerar EXE/MSI assinados;
6. gerar artefatos do updater e assinaturas;
7. publicar Release privada no canal interno;
8. testar atualização a partir da versão anterior;
9. testar reinstalação e rollback;
10. promover o mesmo commit para o canal estável.

## Interface esperada

O aplicativo deverá oferecer:

- `Verificar atualizações` nas configurações;
- versão instalada;
- versão disponível;
- notas da versão;
- progresso de download;
- confirmação antes de reiniciar;
- mensagem clara quando não houver atualização;
- mensagem de erro sem detalhes sensíveis.

Uma falha do servidor de atualizações nunca pode impedir login ou uso da versão já instalada.

## Critérios de aceite

- assinatura inválida é recusada;
- pacote alterado é recusado;
- endpoint indisponível não trava o aplicativo;
- download interrompido pode ser tentado novamente;
- usuário não perde sessão nem convite;
- atualização preserva dados locais permitidos;
- instalação anterior pode ser recuperada;
- chave privada nunca aparece no artefato ou nos logs.

## Regra atual

Até os bloqueadores serem resolvidos, o Labstar continua usando instaladores privados do GitHub Actions. Não adicionar uma implementação parcial do updater com chave temporária ou endpoint improvisado.
