/**
 * Optional gateway diagnostic. Run from repository root:
 *   node --env-file=.env scripts/orbio-diagnostic.mjs
 *   node --env-file=.env scripts/orbio-diagnostic.mjs --probe
 *   node --env-file=.env scripts/orbio-diagnostic.mjs --tool-probe
 * Without flags this performs a metadata GET only, with no paid inference.
 */
const key = process.env.ORBIO_API_KEY?.trim();
const base = (process.env.ORBIO_BASE_URL || "https://api.orbio.so/api/v1").replace(/\/+$/, "");
const model = process.env.ORBIO_MODEL?.trim() || "google/gemini-3.8-flash";
const mode = process.argv[2] || "--models";
if (!key) { console.error("ORBIO_API_KEY is not set in the environment."); process.exit(1); }
if (!["--models", "--probe", "--tool-probe"].includes(mode)) {
  console.error("Use --models, --probe, or --tool-probe"); process.exit(1);
}
if (!/^https:\/\//i.test(base)) { console.error("Gateway URL must use HTTPS."); process.exit(1); }
const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000)
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, json };
}
function describeError(result) {
  const raw = result.json?.error?.message;
  const safe = String(raw || "No error message returned")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-[\w-]+/gi, "[redacted]")
    .slice(0, 220);
  console.error(`HTTP ${result.status}: ${safe}`);
}
try {
  console.log(`Gateway: ${base}\nSelected model: ${model}`);
  if (mode === "--models") {
    const result = await request("/models");
    if (!result.ok) { describeError(result); process.exitCode = 1; }
    else {
      const models = Array.isArray(result.json?.data) ? result.json.data : [];
      const selected = models.find((item) => item?.id === model);
      console.log(`Metadata returned ${models.length} model(s).`);
      console.log(selected ? `Selected model is listed. Declared parameters: ${JSON.stringify(selected.supported_parameters || [])}` : "Selected model was not listed in the metadata response. This does not itself prove its inference route is unusable.");
      const candidates = models.filter((item) => typeof item?.id === "string" && (Array.isArray(item.supported_parameters) ? item.supported_parameters.includes("tools") : false));
      console.log("Model IDs declaring tool support (first 30):");
      for (const item of candidates.slice(0, 30)) console.log(`  ${item.id}`);
      if (candidates.length === 0) console.log("No tool-support metadata returned; verify exact candidate IDs in the Orbio dashboard.");
    }
  } else {
    const body = {
      model,
      messages: mode === "--probe"
        ? [{ role: "user", content: "Reply with exactly: Auvra connected." }]
        : [{ role: "user", content: "Use the calculate tool to add 2 and 3." }],
      ...(mode === "--tool-probe" ? {
        tools: [{ type: "function", function: { name: "calculate", description: "Add two numbers", parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] } } }],
        tool_choice: "auto"
      } : {}),
      max_tokens: mode === "--probe" ? 128 : 256
    };
    console.log(`Making ONE live ${mode === "--probe" ? "text" : "tool"} request (paid inference).`);
    const result = await request("/chat/completions", body);
    if (!result.ok) { describeError(result); process.exitCode = 1; }
    else {
      const message = result.json?.choices?.[0]?.message;
      const usage = result.json?.usage;
      console.log(`HTTP ${result.status}; returned model: ${result.json?.model || "not returned"}`);
      console.log(`Text: ${String(message?.content || "(none)").slice(0, 300)}`);
      console.log(`Tool calls: ${Array.isArray(message?.tool_calls) ? message.tool_calls.map((x) => x.function?.name).join(", ") : "none"}`);
      console.log(`Tokens: ${usage?.total_tokens ?? "unavailable"}; provider-reported cost: ${usage?.cost ?? "unavailable"}`);
      if (!message?.content && !message?.tool_calls?.length) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(`Diagnostic request did not complete: ${error?.name === "TimeoutError" ? "timeout" : "network failure"}`);
  process.exitCode = 1;
}
