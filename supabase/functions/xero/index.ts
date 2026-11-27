// Supabase Edge Function "xero": connects G|Wired to Xero and sends applications and invoices across as Xero sales invoices.
//
// Setup (once): create an app at developer.xero.com (type "Web app") with the redirect address
//     <your Supabase address>/functions/v1/xero
// then add these as Edge Function secrets:
//     XERO_CLIENT_ID, XERO_CLIENT_SECRET   from the Xero app
//     APP_URL                              https://gwired-app.web.app
//   optional:
//     XERO_SCOPES          default "offline_access accounting.invoices accounting.contacts accounting.settings.read"
//     XERO_SALES_ACCOUNT   default "200" (the Xero sales account the invoice lines go to)
//     XERO_STATUS          default "DRAFT" (invoices arrive as drafts for the bookkeeper to approve; use "AUTHORISED" to skip that)
//
// Deploy with "Verify JWT" OFF: Xero's redirect back to this function carries no sign-in. Every call from the app is checked here
// instead (the caller must be signed in and hold the right permission).
//
// From the app (POST JSON, signed in):
//   { action: "connect" }                       -> { url }  the Xero sign-in address (needs the "settings" permission)
//   { action: "disconnect" }                    -> forget the connection (needs "settings")
//   { action: "send", kind, id, client_id, ... }-> create (or update a still-draft) Xero invoice (needs "estimates.edit")
//   { action: "refresh" }                       -> ask Xero about every invoice sent; mark paid ones as paid (needs "estimates.edit")
// From Xero (GET ?code=...&state=...)           -> finish connecting, then send the person back to the app.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (detail: string) => reply({ ok: false, detail });

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const CLIENT_ID = env("XERO_CLIENT_ID");
const CLIENT_SECRET = env("XERO_CLIENT_SECRET");
const APP_URL = env("APP_URL", "https://gwired-app.web.app").replace(/\/+$/, "");
const SCOPES = env("XERO_SCOPES", "offline_access accounting.invoices accounting.contacts accounting.settings.read");
const SALES_ACCOUNT = env("XERO_SALES_ACCOUNT", "200");
const INVOICE_STATUS = env("XERO_STATUS", "DRAFT");
const SELF = `${env("SUPABASE_URL")}/functions/v1/xero`;

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const basic = () => "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

// ---------------------------------------------------------------- who is calling
async function caller(req: Request, perm: string) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const me = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await me.auth.getUser();
  if (!data.user) return null;
  const { data: ok } = await me.rpc("has_perm", { p: perm });
  return ok ? data.user : null;
}

// ---------------------------------------------------------------- tokens
async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Xero refused the sign-in (${j.error ?? res.status}). Connect Xero again from More > Xero.`);
  return j as { access_token: string; refresh_token: string; expires_in: number };
}

// a good access token for the connected organisation (refreshing it when it is about to run out; Xero swaps the refresh token each time)
async function connection() {
  const { data: c } = await admin.from("xero_connection").select("*").eq("id", 1).maybeSingle();
  if (!c) throw new Error("Xero is not connected yet. Connect it from More > Xero.");
  if (new Date(c.expires_at).getTime() - Date.now() > 60_000) return c;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  const next = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString() };
  await admin.from("xero_connection").update(next).eq("id", 1).eq("refresh_token", c.refresh_token);
  return { ...c, ...next };
}

async function xero(path: string, init: RequestInit = {}) {
  const c = await connection();
  const res = await fetch("https://api.xero.com/api.xro/2.0" + path, {
    ...init,
    headers: { Authorization: `Bearer ${c.access_token}`, "Xero-tenant-id": c.tenant_id, Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let j: any = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
  if (!res.ok) {
    const msgs: string[] = [];
    for (const e of j.Elements ?? []) for (const v of e.ValidationErrors ?? []) msgs.push(v.Message);
    throw new Error(msgs.length ? msgs.join(" ") : j.Message ?? j.Detail ?? `Xero said ${res.status}`);
  }
  return j;
}

// Xero dates arrive as "/Date(1700000000000+0000)/"
const xeroDate = (s?: string) => { const m = /\/Date\((\d+)/.exec(s ?? ""); return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : null; };
const pounds = (pence: number) => Math.round(pence) / 100;

// ---------------------------------------------------------------- contacts
async function contactFor(clientId: string): Promise<string> {
  const { data: known } = await admin.from("xero_contacts").select("xero_contact_id").eq("client_id", clientId).maybeSingle();
  if (known) return known.xero_contact_id;
  const { data: cl } = await admin.from("clients").select("name, email, phone, address").eq("id", clientId).maybeSingle();
  if (!cl) throw new Error("That client was not found.");
  const name = String(cl.name).trim();
  const found = await xero(`/Contacts?where=${encodeURIComponent(`Name=="${name.replace(/"/g, "")}"`)}`);
  let id: string | undefined = found.Contacts?.[0]?.ContactID;
  if (!id) {
    const made = await xero("/Contacts", { method: "POST", body: JSON.stringify({ Name: name, EmailAddress: cl.email || undefined, Phones: cl.phone ? [{ PhoneType: "DEFAULT", PhoneNumber: cl.phone }] : undefined }) });
    id = made.Contacts?.[0]?.ContactID;
  }
  if (!id) throw new Error("Could not find or create the client in Xero.");
  await admin.from("xero_contacts").upsert({ client_id: clientId, xero_contact_id: id, name });
  return id;
}

// UK tax types in Xero. If your Xero uses different ones, change them here.
function taxType(vatRate: number, reverseCharge: boolean) {
  if (reverseCharge) return "DRCHARGESERVICES";
  if (vatRate === 0) return "ZERORATEDOUTPUT";
  if (vatRate === 5) return "OUTPUT5"; // 5% reduced rate
  return "OUTPUT2"; // 20% standard
}

// ---------------------------------------------------------------- the actions
async function send(b: any) {
  const kind = b.kind === "invoice" ? "invoice" : "application";
  const id = String(b.id ?? "");
  const net = Number(b.net_pence);
  if (!id || !b.client_id) throw new Error("Give the job a client first, so Xero knows who to invoice.");
  if (!Number.isFinite(net) || net <= 0) throw new Error("The amount to invoice must be more than nothing.");
  const contactId = await contactFor(String(b.client_id));
  const body = {
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Date: String(b.date).slice(0, 10),
    DueDate: String(b.due_date).slice(0, 10),
    Reference: String(b.reference ?? "").slice(0, 255),
    LineAmountTypes: "Exclusive",
    Status: INVOICE_STATUS,
    LineItems: [{ Description: String(b.description ?? "Electrical works").slice(0, 4000), Quantity: 1, UnitAmount: pounds(net), AccountCode: SALES_ACCOUNT, TaxType: taxType(Number(b.vat_rate), !!b.reverse_charge) }],
  };
  const { data: link } = await admin.from("xero_invoice_links").select("*").eq("source_type", kind).eq("source_id", id).maybeSingle();
  if (link?.xero_invoice_id && link.xero_status && link.xero_status !== "DRAFT") throw new Error(`It is already in Xero as ${link.xero_number ?? "an invoice"} (${link.xero_status.toLowerCase()}). Change it in Xero.`);
  const res = link?.xero_invoice_id
    ? await xero(`/Invoices/${link.xero_invoice_id}`, { method: "POST", body: JSON.stringify(body) })
    : await xero("/Invoices", { method: "POST", body: JSON.stringify(body) });
  const inv = res.Invoices?.[0];
  if (!inv?.InvoiceID) throw new Error("Xero did not create the invoice.");
  const row = { source_type: kind, source_id: id, xero_invoice_id: inv.InvoiceID, xero_number: inv.InvoiceNumber ?? null, xero_status: inv.Status, total_pence: Math.round(Number(inv.Total ?? 0) * 100), paid_pence: Math.round(Number(inv.AmountPaid ?? 0) * 100), last_error: null, synced_at: new Date().toISOString() };
  const { error } = await admin.from("xero_invoice_links").upsert(row, { onConflict: "source_type,source_id" });
  if (error) throw new Error(error.message);
  return { number: inv.InvoiceNumber ?? null, status: inv.Status };
}

// Ask Xero about every invoice we sent that is not finished, and mirror it. A fully paid one marks the application / invoice as paid.
async function refresh() {
  const { data: links } = await admin.from("xero_invoice_links").select("*").is("deleted_at", null).not("xero_invoice_id", "is", null).not("xero_status", "in", "(PAID,VOIDED)");
  let paid = 0, checked = 0;
  for (let i = 0; i < (links?.length ?? 0); i += 40) {
    const chunk = links!.slice(i, i + 40);
    const res = await xero(`/Invoices?IDs=${chunk.map((l: any) => l.xero_invoice_id).join(",")}`);
    for (const inv of res.Invoices ?? []) {
      const l = chunk.find((x: any) => x.xero_invoice_id === inv.InvoiceID);
      if (!l) continue;
      checked += 1;
      const amountPaid = Math.round(Number(inv.AmountPaid ?? 0) * 100);
      await admin.from("xero_invoice_links").update({ xero_number: inv.InvoiceNumber ?? l.xero_number, xero_status: inv.Status, total_pence: Math.round(Number(inv.Total ?? 0) * 100), paid_pence: amountPaid, last_error: null, synced_at: new Date().toISOString() }).eq("id", l.id);
      if (inv.Status === "PAID") {
        const when = xeroDate(inv.FullyPaidOnDate) ?? new Date().toISOString().slice(0, 10);
        // mark it paid, and (only if it was not already) leave a note on the job so the team sees it
        const done = l.source_type === "application"
          ? await admin.from("applications").update({ status: "paid", paid_pence: amountPaid, paid_date: when }).eq("id", l.source_id).neq("status", "paid").select("job_id, number")
          : await admin.from("invoices").update({ status: "paid", paid_date: when }).eq("id", l.source_id).neq("status", "paid").select("job_id, number");
        const row = done.data?.[0];
        if (row) {
          const label = (l.source_type === "application" ? "Application " : "Invoice ") + row.number;
          await admin.from("activity_log").insert({ entity: "job", entity_id: row.job_id, action: "payment_received", detail: { label, amount_pence: amountPaid, xero_number: inv.InvoiceNumber ?? null, date: when }, user_name: "Xero" });
        }
        paid += 1;
      }
    }
  }
  return { checked, paid };
}

// ---------------------------------------------------------------- Xero sending the person back after they approve the connection
async function callback(url: URL) {
  const back = (q: string) => Response.redirect(`${APP_URL}/more/xero?${q}`, 302);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("error=" + encodeURIComponent(url.searchParams.get("error_description") ?? "Xero did not allow the connection."));
  const { data: st } = await admin.from("xero_oauth_state").select("*").eq("state", state).maybeSingle();
  if (!st || !code || Date.now() - new Date(st.created_at).getTime() > 10 * 60_000) return back("error=" + encodeURIComponent("That connection link has expired. Start again from More > Xero."));
  await admin.from("xero_oauth_state").delete().eq("state", state);
  try {
    const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: SELF });
    const tenants = await (await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
    const tenant = Array.isArray(tenants) ? tenants[0] : null;
    if (!tenant) return back("error=" + encodeURIComponent("No Xero organisation was shared with the app."));
    await admin.from("xero_connection").upsert({ id: 1, tenant_id: tenant.tenantId, tenant_name: tenant.tenantName ?? null, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), connected_by: st.user_id, connected_at: new Date().toISOString() });
    return back("connected=1");
  } catch (e) {
    return back("error=" + encodeURIComponent((e as Error).message));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!CLIENT_ID || !CLIENT_SECRET) {
    if (req.method === "GET") return Response.redirect(`${APP_URL}/more/xero?error=${encodeURIComponent("Xero is not set up on the server yet (client id and secret).")}`, 302);
    return fail("Xero is not set up on the server yet: add XERO_CLIENT_ID and XERO_CLIENT_SECRET as secrets on the xero function.");
  }
  const url = new URL(req.url);
  if (req.method === "GET") return callback(url);

  let b: any = {};
  try { b = await req.json(); } catch { /* empty */ }
  try {
    if (b.action === "connect") {
      const u = await caller(req, "settings");
      if (!u) return fail("Only someone with the Settings permission can connect Xero.");
      const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await admin.from("xero_oauth_state").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
      await admin.from("xero_oauth_state").insert({ state, user_id: u.id });
      const q = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: SELF, scope: SCOPES, state });
      return reply({ ok: true, url: `https://login.xero.com/identity/connect/authorize?${q}` });
    }
    if (b.action === "disconnect") {
      if (!(await caller(req, "settings"))) return fail("Only someone with the Settings permission can disconnect Xero.");
      const { data: c } = await admin.from("xero_connection").select("refresh_token").eq("id", 1).maybeSingle();
      if (c) await fetch("https://identity.xero.com/connect/revocation", { method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: c.refresh_token }) }).catch(() => {});
      await admin.from("xero_connection").delete().eq("id", 1);
      return reply({ ok: true });
    }
    if (b.action === "send") {
      if (!(await caller(req, "estimates.edit"))) return fail("You do not have permission to send invoices to Xero.");
      return reply({ ok: true, ...(await send(b)) });
    }
    if (b.action === "refresh") {
      if (!(await caller(req, "estimates.edit"))) return fail("You do not have permission to do this.");
      return reply({ ok: true, ...(await refresh()) });
    }
    return fail("Unknown request.");
  } catch (e) {
    return fail((e as Error).message || "Something went wrong talking to Xero.");
  }
});
