// Permission flags per module (not hard-coded roles). A user's `permissions` object in the database holds one true/false per flag.
// Presets are just starting points when inviting someone; the flags are what the app and the database actually check.
export const PERMISSIONS = [
  { key: 'jobs.view', label: 'View jobs' },
  { key: 'jobs.edit', label: 'Create and edit jobs' },
  { key: 'clients.view', label: 'View clients' },
  { key: 'clients.edit', label: 'Edit clients' },
  { key: 'diary', label: 'Diary' },
  { key: 'todos', label: 'To-dos' },
  { key: 'walkarounds', label: 'Site walkarounds' },
  { key: 'estimates.view', label: 'View estimates (sell prices)' },
  { key: 'estimates.edit', label: 'Edit estimates' },
  { key: 'estimates.view_cost', label: 'See costs and margins' },
  { key: 'variations', label: 'Variations' },
  { key: 'applications', label: 'Applications and invoices' },
  { key: 'money.view', label: 'See money (payments, dashboard)' },
  { key: 'costs', label: 'Costs' },
  { key: 'settings', label: 'Settings' },
  { key: 'users', label: 'Manage users' },
] as const

export type PermissionKey = (typeof PERMISSIONS)[number]['key']
export type Permissions = Partial<Record<PermissionKey, boolean>>

const all = (): Permissions => Object.fromEntries(PERMISSIONS.map((p) => [p.key, true]))
const only = (keys: PermissionKey[]): Permissions => Object.fromEntries(keys.map((k) => [k, true]))

export const PRESETS: Record<string, { label: string; permissions: Permissions }> = {
  owner: { label: 'Owner', permissions: all() },
  office: {
    label: 'Office',
    permissions: { ...all(), settings: false, users: false },
  },
  operative: {
    label: 'Operative (no prices or money)',
    permissions: only(['jobs.view', 'diary', 'todos', 'walkarounds']),
  },
}
