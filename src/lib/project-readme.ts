export type ProjectDocumentRequest = {
  githubUrl?: string;
  documentUrl?: string;
  documentMarkdown?: string;
};

export type ProjectDocument = {
  content: string;
  sourceUrl: string;
  sourceLabel: string;
};

const MAX_DOCUMENT_BYTES = 320_000;

function trimmed(value: string | undefined) {
  return value?.trim() ?? "";
}

function githubRepository(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com" && !url.hostname.endsWith(".github.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/i, ""),
    };
  } catch {
    return null;
  }
}

function normalizeDocumentUrl(value: string) {
  const input = trimmed(value);
  if (!input) return "";
  try {
    const url = new URL(input);
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const blobIndex = parts.indexOf("blob");
      if (parts.length >= 5 && blobIndex === 2) {
        const [owner, repo] = parts;
        const branch = parts[3];
        const filePath = parts.slice(4).join("/");
        return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
      }
    }
    return url.toString();
  } catch {
    return input;
  }
}

async function textResponse(response: Response) {
  if (!response.ok) {
    const error = Object.assign(new Error(`project_document_http_${response.status}`), {
      status: response.status,
    });
    throw error;
  }
  const text = await response.text();
  if (new Blob([text]).size > MAX_DOCUMENT_BYTES) {
    throw new Error("project_document_too_large");
  }
  return text;
}

async function fetchExplicitDocument(url: string): Promise<ProjectDocument> {
  const normalized = normalizeDocumentUrl(url);
  const response = await fetch(normalized, {
    headers: { Accept: "text/markdown,text/plain;q=0.9,*/*;q=0.5" },
    cache: "no-store",
  });
  return {
    content: await textResponse(response),
    sourceUrl: url,
    sourceLabel: "Documento vinculado",
  };
}

async function fetchGithubReadme(githubUrl: string): Promise<ProjectDocument> {
  const repository = githubRepository(githubUrl);
  if (!repository) throw new Error("github_repository_invalid");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/readme`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  return {
    content: await textResponse(response),
    sourceUrl: githubUrl,
    sourceLabel: `${repository.owner}/${repository.repo} · README do GitHub`,
  };
}

export async function loadProjectDocument(request: ProjectDocumentRequest): Promise<ProjectDocument> {
  const manual = trimmed(request.documentMarkdown);
  if (manual) {
    return {
      content: manual,
      sourceUrl: trimmed(request.documentUrl) || trimmed(request.githubUrl),
      sourceLabel: "Documento manual do Labstar",
    };
  }

  const documentUrl = trimmed(request.documentUrl);
  if (documentUrl) return fetchExplicitDocument(documentUrl);

  const githubUrl = trimmed(request.githubUrl);
  if (githubUrl) return fetchGithubReadme(githubUrl);

  throw new Error("project_document_source_missing");
}

export function projectDocumentErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/source_missing/i.test(message)) {
    return "Este projeto ainda não tem documento. Vincule um repositório GitHub, uma URL de documento ou escreva o conteúdo manualmente.";
  }
  if (/github_repository_invalid/i.test(message)) {
    return "O endereço do repositório GitHub não parece válido.";
  }
  if (/http_404/i.test(message)) {
    return "Não encontrei o README. Se o repositório for privado, use uma URL de documento acessível ou salve um documento manual no Labstar.";
  }
  if (/http_403|http_429/i.test(message)) {
    return "O GitHub limitou a leitura automática agora. Tente novamente em alguns instantes ou use uma URL direta do documento.";
  }
  if (/too_large/i.test(message)) {
    return "Esse documento é grande demais para a visualização rápida do Labstar.";
  }
  return "Não foi possível abrir o documento dentro do Labstar. O link externo continua disponível.";
}
