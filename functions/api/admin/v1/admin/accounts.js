const DEFAULT_UPSTREAM = "https://labstar-api-mackson.fly.dev";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return json({ error: { code: "authentication_failed", message: "Autenticação necessária." } }, 401);
  }

  const upstreamBase = String(env?.LABSTAR_API_URL || DEFAULT_UPSTREAM).trim().replace(/\/$/, "");
  let body = "";
  try {
    body = await request.text();
  } catch {
    return json({ error: { code: "invalid_request_body", message: "Não foi possível ler a solicitação." } }, 400);
  }

  let upstream;
  try {
    upstream = await fetch(`${upstreamBase}/v1/admin/accounts`, {
      method: "DELETE",
      headers: {
        authorization,
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
    });
  } catch {
    return json({
      error: {
        code: "admin_api_unavailable",
        message: "A API administrativa não respondeu ao proxy do Labstar.",
      },
    }, 503);
  }

  const responseBody = await upstream.arrayBuffer();
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function onRequest() {
  return json({ error: { code: "method_not_allowed", message: "Método não permitido." } }, 405);
}
