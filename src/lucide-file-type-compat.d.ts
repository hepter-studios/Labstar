import "lucide-react";

// DirectMessagesHub usa o ícone `File` e também o arquivo nativo do navegador.
// A declaração acrescenta somente o lado de tipo ao símbolo importado; o valor
// React exportado por lucide-react continua inalterado.
declare module "lucide-react" {
  interface File extends globalThis.File {}
}
