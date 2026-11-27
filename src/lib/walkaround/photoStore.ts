// Walkaround photos. The picture is shrunk and saved on this device first (so it works with no signal), the small record about it
// syncs like any other row, and the picture itself is uploaded to the private "walkaround-photos" bucket when there is a
// connection. A picture taken on another device is downloaded when first needed and kept here, so it then works offline.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { db, dbIsOpen } from '../sync/db'

export const BUCKET = 'walkaround-photos'
const ORIG = ':orig'
export interface PhotoRef { id: string; path: string }

// Phone photos are 4 to 12 MB. Scale so the longest side is at most 1600 px and save as a JPEG (a few hundred KB): still clear
// enough to see a fault, and quick to upload and to put in a PDF.
export async function shrinkImage(file: Blob, maxSide = 1600, quality = 0.8): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality))
  if (!out) throw new Error('That picture could not be read.')
  return out
}

export const keepLocal = (id: string, blob: Blob, path: string) => db().photo_files.put({ id, blob, uploaded: 0, path })

let uploading = false
// send any pictures still on this device to the cloud (called after each sync, and after taking a photo)
export async function uploadPendingPhotos(): Promise<void> {
  if (uploading || !dbIsOpen() || !navigator.onLine) return
  uploading = true
  try {
    const d = db()
    const waiting = (await d.photo_files.toArray()).filter((f) => f.uploaded === 0)
    for (const f of waiting) {
      // a record called "<id>:orig" is the untouched picture kept for a marked-up photo
      const isOrig = f.id.endsWith(ORIG)
      const row = await d.walkaround_photos.get(isOrig ? f.id.slice(0, -ORIG.length) : f.id)
      if (!row) continue // the record hasn't been made yet
      const path = isOrig ? row.original_path : row.path
      if (row.deleted_at || !path) { await d.photo_files.update(f.id, { uploaded: 1 }); continue }
      const { error } = await supabase.storage.from(BUCKET).upload(String(path), f.blob, { contentType: 'image/jpeg', upsert: true })
      if (error) {
        if (/fetch|network|load failed/i.test(error.message)) return // offline: try again later
        continue // e.g. the record is not on the server yet: try again next time
      }
      await d.photo_files.update(f.id, { uploaded: 1 })
    }
  } finally {
    uploading = false
  }
}

// the picture as a Blob: from this device if it is here, otherwise downloaded (and then kept here)
export async function getPhotoBlob(p: PhotoRef): Promise<Blob | null> {
  const local = await db().photo_files.get(p.id)
  // this device's copy is used if it is still waiting to go up, or it is the same version as the record says
  // (a marked-up picture gets a new path, so other devices fetch the new version)
  if (local && (local.uploaded === 0 || !local.path || local.path === p.path)) return local.blob
  if (!navigator.onLine) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(p.path)
  if (error || !data) return null
  await db().photo_files.put({ id: p.id, blob: data, uploaded: 1, path: p.path })
  return data
}

// the state of a picture for the screen
export async function photoWaiting(id: string): Promise<boolean> {
  return (await db().photo_files.get(id))?.uploaded === 0
}

// a temporary address for showing a picture in the page (undefined while loading, null if it cannot be shown yet)
export function usePhotoUrl(p: PhotoRef): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let made: string | null = null
    let cancelled = false
    void getPhotoBlob(p).then((b) => {
      if (cancelled) return
      if (!b) return setUrl(null)
      made = URL.createObjectURL(b)
      setUrl(made)
    })
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made) }
  }, [p.id, p.path]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}

// keep the untouched picture of a marked-up photo (so the markup can be removed later)
export const keepOriginal = (id: string, blob: Blob, path: string) => db().photo_files.put({ id: id + ORIG, blob, uploaded: 0, path })

// Mark up a saved photo. The first time, the picture as it was becomes the "original"; the marked-up one gets a new path so
// it uploads as a new file and other devices fetch the new version. Returns what to write on the photo's record.
export async function markUpPhoto(photo: PhotoRef & { original_path?: string | null }, jobId: string, marked: Blob): Promise<{ path: string; original_path?: string }> {
  const d = db()
  const path = `${jobId}/${photo.id}-${Date.now()}.jpg`
  let original_path: string | undefined
  if (!photo.original_path) {
    const cur = await d.photo_files.get(photo.id)
    if (cur) { await d.photo_files.put({ id: photo.id + ORIG, blob: cur.blob, uploaded: cur.uploaded, path: photo.path }); original_path = photo.path }
  }
  await keepLocal(photo.id, marked, path)
  return original_path ? { path, original_path } : { path }
}

// Take the markup off: the original becomes the photo again. Returns the fields to write on the record.
export async function removeMarkup(photo: PhotoRef & { original_path?: string | null }): Promise<boolean> {
  const d = db()
  const origPath = photo.original_path
  if (!origPath) return false
  const kept = await d.photo_files.get(photo.id + ORIG)
  let blob = kept?.blob ?? null
  let uploaded = kept ? kept.uploaded : 1
  if (!blob) {
    if (!navigator.onLine) return false
    const { data } = await supabase.storage.from(BUCKET).download(origPath)
    if (!data) return false
    blob = data
    uploaded = 1
  }
  await d.photo_files.put({ id: photo.id, blob, uploaded, path: origPath })
  await d.photo_files.delete(photo.id + ORIG)
  return true
}
