// Supabase Edge Function "quote-portal": the public side of the client quote link.
//   GET  .../functions/v1/quote-portal?t=<token>            -> the quote as issued (frozen copy), its state, and a PDF download address
//   POST .../functions/v1/quote-portal  {t, action:"accept", name}  -> the client accepts the quote
// No sign-in: the long random token in the address is the key. Only prices are ever returned (the frozen copy never holds costs).
// Accepting marks the estimate accepted, moves the job to Live, adds a starter checklist to the job's to-dos and records who accepted.
// Deploy with "Verify JWT" OFF.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// the same starter checklist the app adds when staff accept a quote (src/lib/planner/starter.ts): keep the two in step
const STARTER: [string, number][] = [
  ["Confirm the start date with the client", 1],
  ["Send order acknowledgement and payment terms", 1],
  ["Order materials (see the Costs tab: materials still needed)", 2],
  ["Book the job into the diary", 2],
  ["Raise the deposit invoice or first application for payment", 3],
  ["Prepare RAMS and site induction", 5],
];
const addDays = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* empty */ } }
  const token = String(body.t ?? url.searchParams.get("t") ?? "").trim();
  if (!/^[0-9a-f]{32,128}$/.test(token)) return json({ error: "not_found" }, 404);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: link } = await sb.from("quote_links").select("*").eq("token", token).is("revoked_at", null).maybeSingle();
  if (!link) return json({ error: "not_found" }, 404);
  const { data: est } = await sb.from("estimates").select("id, status, job_id, deleted_at").eq("id", link.estimate_id).maybeSingle();
  if (!est || est.deleted_at) return json({ error: "not_found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const valid: string | null = link.snapshot?.validUntil ?? null;
  const state = link.accepted_at || est.status === "accepted" ? "accepted"
    : est.status !== "issued" ? "replaced"
    : valid && valid < today ? "expired" : "open";

  if (req.method === "GET") {
    if (url.searchParams.get("p") !== "1") {
      await sb.from("quote_links").update({
        view_count: (link.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString(), first_viewed_at: link.first_viewed_at ?? new Date().toISOString(),
      }).eq("id", link.id);
    }
    let pdfUrl: string | null = null;
    if (link.pdf_path && state !== "replaced") {
      const { data } = await sb.storage.from("quote-pdfs").createSignedUrl(link.pdf_path, 3600);
      pdfUrl = data?.signedUrl ?? null;
    }
    // a replaced quote shows no prices: only the fact that it has been replaced and who to contact
    const snap = state === "replaced" ? { company: link.snapshot?.company, ref: link.snapshot?.ref } : link.snapshot;
    return json({ state, snapshot: snap, pdfUrl, accepted: link.accepted_at ? { name: link.accepted_name, at: link.accepted_at } : null });
  }

  if (req.method !== "POST" || body.action !== "accept") return json({ error: "bad_request" }, 400);
  if (state !== "open") return json({ error: state }, 409);
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (name.length < 2) return json({ error: "name_needed" }, 400);

  const nowIso = new Date().toISOString();
  // only the first acceptance counts, even if two taps arrive together
  const { data: won } = await sb.from("quote_links").update({
    accepted_at: nowIso, accepted_name: name,
    accepted_ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null,
    accepted_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
  }).eq("id", link.id).is("accepted_at", null).select("id");
  if (!won?.length) return json({ error: "accepted" }, 409);

  await sb.from("estimates").update({ status: "accepted" }).eq("id", est.id).eq("status", "issued");
  const { data: job } = await sb.from("jobs").select("id, status").eq("id", est.job_id).maybeSingle();
  if (job) {
    if (job.status === "estimating" || job.status === "quoted") await sb.from("jobs").update({ status: "live" }).eq("id", job.id);
    await sb.from("activity_log").insert([
      { entity: "job", entity_id: job.id, action: "status", detail: { from: job.status, to: "live", by: "client", quote: link.snapshot?.ref }, user_name: `${name} (client, online)` },
      { entity: "job", entity_id: job.id, action: "quote_accepted", detail: { by: "client", name, quote: link.snapshot?.ref }, user_name: `${name} (client, online)` },
    ]);
    const rows = [
      { title: `Quote ${link.snapshot?.ref ?? ""} accepted online by ${name}: phone to say thank you and confirm`, due_date: addDays(0) },
      ...STARTER.map(([title, d]) => ({ title, due_date: addDays(d) })),
    ].map((r) => ({ ...r, job_id: job.id, show_in_diary: true }));
    await sb.from("todos").insert(rows);
  }
  return json({ state: "accepted", accepted: { name, at: nowIso } });
});
