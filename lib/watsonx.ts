interface WatsonxResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let tokenInflight: Promise<string> | null = null;

/** Returns true when the key is a Bob production API key (no IAM exchange needed). */
function isBobKey(apiKey: string): boolean {
  return apiKey.startsWith("bob_");
}

async function getIamToken(apiKey: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  if (tokenInflight) return tokenInflight;

  tokenInflight = (async () => {
    const response = await fetch("https://iam.cloud.ibm.com/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ibm:params:oauth:grant-type:apikey",
        apikey: apiKey,
      }),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`IBM IAM token request failed with ${response.status}.`);
    const data = (await response.json()) as { access_token?: string; expiration?: number };
    if (!data.access_token) throw new Error("IBM IAM response did not include an access token.");

    const expiration = data.expiration ?? Math.floor(Date.now() / 1000) + 3600;
    cachedToken = { token: data.access_token, expiresAt: expiration * 1000 - 60_000 };
    return data.access_token;
  })();

  try {
    return await tokenInflight;
  } finally {
    tokenInflight = null;
  }
}

/**
 * Resolve the bearer token to use for the inference request.
 * - Bob API keys (bob_…) are used directly — no IAM exchange.
 * - IBM Cloud API keys go through IAM to obtain a short-lived bearer token.
 */
async function resolveBearerToken(apiKey: string): Promise<string> {
  if (isBobKey(apiKey)) return apiKey;
  return getIamToken(apiKey);
}

/**
 * Build the inference request body.
 * Bob keys do not require a project_id; IBM Cloud keys do.
 */
function buildRequestBody(modelId: string, projectId: string | undefined, apiKey: string, messages: object[]): object {
  const body: Record<string, unknown> = {
    model_id: modelId,
    messages,
    max_tokens: 220,
    temperature: 0.2,
  };
  // Only attach project_id when using an IBM Cloud key that requires it.
  if (!isBobKey(apiKey) && projectId) {
    body.project_id = projectId;
  }
  return body;
}

/** Resolve the inference base URL: Bob keys use the Bob gateway; IBM Cloud keys use watsonx.ai. */
function resolveInferenceUrl(apiKey: string, watsonxUrl: string | undefined): string {
  if (isBobKey(apiKey)) return "https://bob.ibm.com/api/v1";
  return (watsonxUrl ?? "https://us-south.ml.cloud.ibm.com").replace(/\/$/, "") + "/ml/v1";
}

export async function explainFinding(input: string): Promise<{ text: string; live: boolean }> {
  // BOB_API_KEY takes priority; fall back to WATSONX_API_KEY / WATSONX_AI_APIKEY.
  const apiKey = process.env.BOB_API_KEY ?? process.env.WATSONX_API_KEY ?? process.env.WATSONX_AI_APIKEY;
  const watsonxUrl = process.env.WATSONX_AI_URL;
  const projectId = process.env.WATSONX_PROJECT_ID;
  const modelId = process.env.WATSONX_MODEL_ID ?? "ibm/granite-3-8b-instruct";

  // For IBM Cloud keys, both url and projectId must be present.
  // For Bob keys, only the key itself is required.
  if (!apiKey || (!isBobKey(apiKey) && (!watsonxUrl || !projectId))) {
    return {
      live: false,
      text: "The deterministic engine is the decision maker. This finding means the tool can perform an action that falls outside its approved capability passport. Remediate the added authority, restore the smallest required scope, then re-scan and re-approve the tool.",
    };
  }

  const token = await resolveBearerToken(apiKey);
  const baseUrl = resolveInferenceUrl(apiKey, watsonxUrl);
  const messages = [
    { role: "system", content: "You are a concise enterprise AI security reviewer. Explain only the evidence supplied. State the security impact and the smallest practical remediation. Never invent facts." },
    { role: "user", content: `Finding:\n${input}` },
  ];

  // Bob gateway: /chat/completions (OpenAI-compatible, no version query param).
  // watsonx.ai: /chat/completions?version=2025-02-11
  const chatUrl = isBobKey(apiKey)
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/chat/completions?version=2025-02-11`;

  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(buildRequestBody(modelId, projectId, apiKey, messages)),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`inference request failed with ${response.status}.`);
  const data = (await response.json()) as WatsonxResponse;
  const generated = data.choices?.[0]?.message?.content?.trim();
  if (!generated) throw new Error("inference response contained no generated text.");
  return { text: generated, live: true };
}
