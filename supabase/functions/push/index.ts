// Supabase Edge Function "push": sends push notifications to phones and computers that have switched them on in the app.
//   POST {action:"key"}                                        -> the public key the phone needs to subscribe (no sign-in needed)
//   POST {action:"test"}              (signed in)              -> sends a test notice to the caller's own devices
//   POST {action:"todo", title, job_id, ids:[...]}  (signed in) -> tells the tagged people about a to-do
//   POST {action:"notify", kind, job_id, text}  (server only)  -> quote accepted / payment received: tells the team (called by quote-portal and xero)
//   POST {action:"daily"}  (server only, from the daily schedule) -> the 07:00 summary of what is due today
// Secrets needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT, CRON_SECRET for the daily schedule).
// Deploy with "Verify JWT" OFF (this function checks who is calling itself).
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
if (pub && priv) webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "https://gwired-app.web.app", pub, priv);

type Payload = { title: string; body: string; url?: string; tag?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "bad_request" }, 400);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");
  if (action === "key") return json({ key: pub });
  if (!pub || !priv) return json({ error: "not_configured", detail: "The push keys have not been added to Supabase yet." }, 500);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cron = Deno.env.get("CRON_SECRET");
  const isServer = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (!!cron && req.headers.get("x-cron-secret") === cron);

  // who is each person (active, with their permissions)
  async function people(): Promise<{ id: string; name: string; permissions: Record<string, boolean> }[]> {
    const { data } = await sb.from("profiles").select("id, full_name, email, permissions, active").eq("active", true);
    return (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "", permissions: (p.permissions ?? {}) as Record<string, boolean> }));
  }
  async function sendTo(userIds: string[], p: Payload): Promise<number> {
    if (!userIds.length) return 0;
    const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", userIds);
    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 86400 });
        sent += 1;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id); // the phone has gone: forget it
      }
    }
    return sent;
  }

  // ---- server-only actions
  if (action === "notify") {
    if (!isServer) return json({ error: "forbidden" }, 403);
    const kind = String(body.kind ?? "");
    const perm = kind === "payment" ? "estimates.view" : "jobs.view";
    const ids = (await people()).filter((p) => p.permissions[perm]).map((p) => p.id);
    const jobId = body.job_id ? String(body.job_id) : "";
    const n = await sendTo(ids, { title: kind === "payment" ? "Payment received" : "Quote accepted", body: String(body.text ?? "").slice(0, 180), url: jobId ? `/jobs/${jobId}` : "/", tag: `${kind}-${jobId}` });
    return json({ sent: n });
  }
  if (action === "daily") {
    if (!isServer) return json({ error: "forbidden" }, 403);
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hour12: false }).format(new Date()));
    if (hour !== 7 && body.force !== true) return json({ skipped: "not 7am in London" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
    const { data: todos } = await sb.from("todos").select("assigned_to, due_date").is("deleted_at", null).is("done_at", null).not("due_date", "is", null).lte("due_date", today);
    const { data: events } = await sb.from("calendar_events").select("assigned_to, event_date, end_date").is("deleted_at", null).lte("event_date", today);
    let sent = 0;
    for (const p of await people()) {
      const mine = <T extends { assigned_to: string | null }>(r: T) => !r.assigned_to || r.assigned_to === p.id;
      const t = p.permissions.todos ? (todos ?? []).filter(mine) : [];
      const e = p.permissions.diary ? (events ?? []).filter(mine).filter((x) => (x.end_date && x.end_date > x.event_date ? x.end_date : x.event_date) >= today) : [];
      const dueToday = t.filter((x) => x.due_date === today).length, overdue = t.length - dueToday;
      const parts = [];
      if (t.length) parts.push(`${t.length} to-do${t.length === 1 ? "" : "s"}${overdue ? ` (${overdue} overdue)` : ""}`);
      if (e.length) parts.push(`${e.length} diary entr${e.length === 1 ? "y" : "ies"}`);
      if (!parts.length) continue;
      sent += await sendTo([p.id], { title: "Today at G|Wired", body: parts.join(" and "), url: t.length ? "/todos" : "/diary", tag: "daily" });
    }
    return json({ sent });
  }

  // ---- actions for a signed-in person
  const { data: u } = bearer ? await sb.auth.getUser(bearer) : { data: { user: null } };
  const me = u?.user?.id;
  if (!me) return json({ error: "sign_in_needed" }, 401);
  const all = await people();
  const self = all.find((p) => p.id === me);
  if (!self) return json({ error: "forbidden" }, 403);

  if (action === "test") {
    const n = await sendTo([me], { title: "G|Wired", body: "Notifications are working on this device.", url: "/", tag: "test" });
    return json({ sent: n });
  }
  if (action === "todo") {
    if (!self.permissions.todos) return json({ error: "forbidden" }, 403);
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((id) => id !== me && all.some((p) => p.id === id && p.permissions.todos));
    const n = await sendTo(ids, { title: `${self.name || "Someone"} tagged you`, body: String(body.title ?? "").slice(0, 180), url: body.job_id ? `/jobs/${body.job_id}?tab=To-dos` : "/todos" });
    return json({ sent: n });
  }
  return json({ error: "bad_request" }, 400);
});
