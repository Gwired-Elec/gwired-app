// Supabase Edge Function "manage-users": the owner adds staff, changes what they can see, resets passwords and switches
// logins off, from Settings > Users. Creating a login needs Supabase's server key, which must never be in the app;
// Supabase gives it to Edge Functions automatically. Every call first checks the caller holds the "users" permission.
//
// Actions (POST JSON):
//   { action: "list" }                                              -> every login with profile, last sign-in, switched off?
//   { action: "create", email, full_name, preset, permissions }     -> new login with a temporary password (shown once)
//   { action: "update", user_id, full_name?, preset?, permissions? }-> change name / preset / permission flags
//   { action: "reset_password", user_id }                           -> new temporary password (shown once)
//   { action: "disable" | "enable", user_id }                       -> switch a login off / on (never deleted: history keeps names)
//   { action: "sign_out_all" }                                      -> end the caller's own sessions on every device
// Deploy with "Verify JWT" ON.
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (detail: string, status = 200) => reply({ ok: false, detail }, status);

// keep in step with src/lib/permissions.ts
const KEYS = [
  "jobs.view", "jobs.edit", "clients.view", "clients.edit", "diary", "todos", "walkarounds", "estimates.view", "estimates.edit",
  "estimates.view_cost", "variations", "applications", "money.view", "costs", "settings", "users",
];
const PRESETS = ["owner", "office", "operative", "custom"];

function cleanPermissions(p: unknown) {
  const out: Record<string, boolean> = {};
  if (p && typeof p === "object") for (const k of KEYS) out[k] = !!(p as Record<string, unknown>)[k];
  return out;
}

// a temporary password that's easy to read out, e.g. GW-7KQM-X4TP-29 (no 0/O, 1/l/I)
function tempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join("");
  return `GW-${pick(4)}-${pick(4)}-${pick(2)}`;
}

function serverKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const k = keys.default ?? Object.values(keys)[0];
      if (k) return k;
    } catch {
      /* not JSON: fall through */
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = serverKey();
    if (!key) return fail("The server key isn't available to this function.");
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    // who is calling, and do they hold the "users" permission? Asked as the caller, through the database's own has_perm()
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const publicKey = req.headers.get("apikey") ?? "";
    if (!token || !publicKey) return fail("Sign in first.", 401);
    const asCaller = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller } = await asCaller.auth.getUser(token);
    if (!caller?.user) return fail("Sign in first.", 401);
    const { data: allowed, error: permErr } = await asCaller.rpc("has_perm", { p: "users" });
    if (permErr) return fail(`Couldn't check your permission: ${permErr.message}`);
    if (!allowed) return fail("Only someone with the Manage users permission can do this.", 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "list") {
      const { data: profiles, error } = await admin.from("profiles").select("*").order("created_at");
      if (error) return fail(error.message);
      const auth: Record<string, { last_sign_in_at: string | null; disabled: boolean }> = {};
      for (let page = 1; page < 50; page++) {
        const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (e) return fail(e.message);
        for (const u of data.users) {
          const b = (u as { banned_until?: string }).banned_until;
          auth[u.id] = { last_sign_in_at: u.last_sign_in_at ?? null, disabled: !!b && new Date(b) > new Date() };
        }
        if (data.users.length < 200) break;
      }
      return reply({ ok: true, users: (profiles ?? []).map((p) => ({ ...p, ...auth[p.id] })) });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const preset = PRESETS.includes(String(body.preset)) ? String(body.preset) : "custom";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("That email address doesn't look right.");
      const password = tempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName || email, must_change_password: true },
      });
      if (error) return fail(/already|registered|exists/i.test(error.message) ? "There's already a login for that email." : error.message);
      // the database makes the profile (switched off) as the login is created; now set it up
      const { error: pErr } = await admin.from("profiles").update({ full_name: fullName || email, preset, permissions: cleanPermissions(body.permissions), active: true }).eq("id", data.user.id);
      if (pErr) return reply({ ok: true, user_id: data.user.id, password, warning: `Login made, but the permissions weren't saved: ${pErr.message}` });
      return reply({ ok: true, user_id: data.user.id, password });
    }

    const userId = String(body.user_id ?? caller.user.id);

    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
      if (typeof body.preset === "string" && PRESETS.includes(body.preset)) patch.preset = body.preset;
      if (body.permissions) {
        const perms = cleanPermissions(body.permissions);
        // never let the owner lock themselves out of user management
        if (userId === caller.user.id) perms.users = true;
        patch.permissions = perms;
      }
      const { error } = await admin.from("profiles").update(patch).eq("id", userId);
      return error ? fail(error.message) : reply({ ok: true });
    }

    if (action === "reset_password") {
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password, user_metadata: { must_change_password: true } });
      return error ? fail(error.message) : reply({ ok: true, password });
    }

    if (action === "disable" || action === "enable") {
      if (action === "disable" && userId === caller.user.id) return fail("You can't switch off your own login.");
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: action === "disable" ? "876000h" : "none" });
      if (error) return fail(error.message);
      await admin.from("profiles").update({ active: action === "enable" }).eq("id", userId);
      return reply({ ok: true });
    }

    if (action === "sign_out_all") {
      // the caller's own sessions on every device (revokes their refresh tokens)
      const { error } = await admin.auth.admin.signOut(token, "global");
      return error ? fail(error.message) : reply({ ok: true });
    }

    return fail("Unknown action.", 400);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
});
