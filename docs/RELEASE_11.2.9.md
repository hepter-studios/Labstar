# Labstar 11.2.9 — comunicações privadas e instalador

## Mensagens diretas

- carregamento separado de mensagens, autores, cargos e anexos para que uma falha secundária não derrube a conversa inteira;
- suporte a até oito anexos por mensagem, com até 50 MB por arquivo;
- arquivos de código, documentos, compactados, imagens e demais formatos aceitos sem lista artificial de extensões;
- atualização em tempo real e notificações globais para mensagens recebidas.

## Presença

- presença publicada somente enquanto o membro está conectado e com o Labstar visível;
- indicador e texto usam o mesmo estado: verde/Online ou vermelho/Offline;
- saída da página e ocultação removem a presença em tempo real.

## Chamadas privadas

- chamada recebida é monitorada por uma ponte global, independentemente da tela aberta;
- aviso interno, toque, vibração quando suportada, notificação do sistema e atenção da janela;
- tela de ligação redesenhada para voz e vídeo;
- aceitar, recusar, desligar, microfone e câmera continuam usando WebRTC e sinalização protegida no Supabase.

## Notificações

- Web/PWA usa a Notification API mediante autorização explícita do usuário;
- desktop instalado usa notificação nativa do sistema pelo Tauri;
- avisos dentro do Labstar possuem ação para abrir a área de mensagens diretas;
- o desktop solicita atenção da janela quando uma chamada chega em segundo plano.

## Instalador Windows

- produto: Labstar;
- publicador: Hepter Studios;
- versão: 11.2.9;
- ícone do Labstar no aplicativo, instalador e desinstalador;
- NSIS com escolha de instalação por usuário ou para todos os usuários;
- português do Brasil e inglês;
- pasta do menu Iniciar identificada como Labstar;
- EXE e MSI oficiais com hashes SHA-256 no `build-info.txt`.

## Validação manual final

- duas contas reais;
- mensagem de texto, imagem, arquivo de código e ZIP;
- edição, resposta, exclusão, fixação e recarga;
- presença ao alternar visibilidade;
- chamada de voz e vídeo em redes diferentes;
- notificação com a janela minimizada;
- instalação, atualização sobre versão anterior e desinstalação no Windows.
