// Supabase Edge Function "diary-feed": serves the diary as a calendar feed (.ics) that Apple Calendar, Outlook or Google Calendar
// can subscribe to. The address looks like  .../functions/v1/diary-feed?t=<secret>[&mine=1]  where the secret comes from the app
// (More > Diary > Apple Calendar). It checks the secret, that the person is still active and still has the diary permission,
// then returns their diary: diary entries from 2 months ago to a year ahead, plus open to-dos that have a due date.
// "mine=1" limits it to entries and to-dos given to that person (or to anyone).
// Deploy with "Verify JWT" OFF (calendar apps cannot sign in; the secret in the address is the key).
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (s: string) => s.replace(/-/g, "");
const addDay = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// calendar lines must be 75 characters or fewer: longer ones continue on the next line after a space
const fold = (line: string) => {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  const mine = url.searchParams.get("mine") === "1";
  if (!/^[0-9a-f]{32,128}$/.test(token)) return new Response("Not found", { status: 404 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: feed } = await sb.from("calendar_feeds").select("user_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Not found", { status: 404 });
  const { data: prof } = await sb.from("profiles").select("active, permissions").eq("id", feed.user_id).maybeSingle();
  if (!prof?.active || !(prof.permissions as Record<string, boolean> | null)?.diary) return new Response("Not found", { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const from = addDay(today, -60);
  const to = addDay(today, 365);
  let ev = sb.from("calendar_events").select("*").is("deleted_at", null).lte("event_date", to).or(`end_date.gte.${from},event_date.gte.${from}`);
  let td = sb.from("todos").select("*").is("deleted_at", null).is("done_at", null).eq("show_in_diary", true).not("due_date", "is", null).lte("due_date", to);
  if (mine) {
    ev = ev.or(`assigned_to.eq.${feed.user_id},assigned_to.is.null`);
    td = td.or(`assigned_to.eq.${feed.user_id},assigned_to.is.null`);
  }
  const [{ data: events }, { data: todos }] = await Promise.all([ev, td]);
  const ids = [...new Set([...(events ?? []), ...(todos ?? [])].map((r) => r.job_id).filter(Boolean))];
  const jobName = new Map<string, string>();
  if (ids.length) {
    const { data: jobs } = await sb.from("jobs").select("id, job_number, title").in("id", ids);
    for (const j of jobs ?? []) jobName.set(j.id, `${j.job_number ?? ""} ${j.title ?? ""}`.trim());
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//G|Wired Electrical Services//Diary//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:G|Wired diary", "REFRESH-INTERVAL;VALUE=DURATION:PT15M", "X-PUBLISHED-TTL:PT15M"];
  for (const e of events ?? []) {
    const last = e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date;
    out.push("BEGIN:VEVENT", `UID:${e.id}@gwired`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(e.title)}`);
    if (e.all_day || !e.start_time) out.push(`DTSTART;VALUE=DATE:${ymd(e.event_date)}`, `DTEND;VALUE=DATE:${ymd(addDay(last, 1))}`);
    else out.push(`DTSTART:${ymd(e.event_date)}T${String(e.start_time).replace(":", "")}00`, `DTEND:${ymd(last)}T${String(e.end_time ?? e.start_time).replace(":", "")}00`);
    if (e.location) out.push(`LOCATION:${esc(e.location)}`);
    const desc = [jobName.get(e.job_id), e.notes].filter(Boolean).join("\n");
    if (desc) out.push(`DESCRIPTION:${esc(desc)}`);
    out.push("END:VEVENT");
  }
  for (const t of todos ?? []) {
    out.push("BEGIN:VEVENT", `UID:${t.id}@gwired`, `DTSTAMP:${stamp}`, `SUMMARY:${esc("To do: " + t.title)}`, `DTSTART;VALUE=DATE:${ymd(t.due_date)}`, `DTEND;VALUE=DATE:${ymd(addDay(t.due_date, 1))}`);
    const desc = [jobName.get(t.job_id), t.notes].filter(Boolean).join("\n");
    if (desc) out.push(`DESCRIPTION:${esc(desc)}`);
    out.push("END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return new Response(out.map(fold).join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
});
