// Walkaround data: the types, one loader (used by the screen and the PDF / Excel export), and a small registry of "items typed
// but not yet added" so they can be saved automatically before anything reads the walkaround.
import { db, type Row } from '../sync/db'

export interface Area extends Row { walkaround_id: string; name: string; notes: string | null; sort: number }
export interface Photo extends Row { area_id: string; element_id: string | null; path: string; original_path: string | null; caption: string | null; sort: number }
export interface Element extends Row { area_id: string; description: string; qty: number; unit: string; notes: string | null; sort: number }

const alive = (r: Row) => !r.deleted_at

export async function loadWalkaround(jobId: string) {
  const walks = (await db().walkarounds.where('job_id').equals(jobId).filter(alive).toArray()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const walk = walks[0]
  const areas = walk ? ((await db().walkaround_areas.where('walkaround_id').equals(walk.id).filter(alive).toArray()) as Area[]).map((a) => ({ ...a, sort: Number(a.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
  const ids = areas.map((a) => a.id)
  const elements = ids.length ? ((await db().walkaround_elements.where('area_id').anyOf(ids).filter(alive).toArray()) as Element[]).map((e) => ({ ...e, qty: Number(e.qty ?? 1), sort: Number(e.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
  const photos = ids.length ? ((await db().walkaround_photos.where('area_id').anyOf(ids).filter(alive).toArray()) as Photo[]).map((p) => ({ ...p, sort: Number(p.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
  return { walk, areas, elements, photos }
}

// each area's "Add an item" form registers a function that saves whatever has been typed into it (if anything)
const drafts = new Map<string, () => Promise<void>>()
export const registerDraft = (areaId: string, save: () => Promise<void>) => { drafts.set(areaId, save) }
export const unregisterDraft = (areaId: string) => { drafts.delete(areaId) }
export const commitAllDrafts = async () => { await Promise.all([...drafts.values()].map((f) => f())) }
