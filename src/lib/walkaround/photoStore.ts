// Walkaround photos. The picture is shrunk and saved on this device first (so it works with no signal), the small record about it
// syncs like any other row, and the picture itself is uploaded to the private "walkaround-photos" bucket when there is a
// connection. A picture taken on another device is downloaded when first needed and kept here, so it then works offline.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { db, dbIsOpen } from '../sync/db'

export const BUCKET = 'walkaround-photos'
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

export const keepLocal = (id: string, blob: Blob) => db().photo_files.put({ id, blob, uploaded: 0 })

let uploading = false
// send any pictures still on this device to the cloud (called after each sync, and after taking a photo)
export async function uploadPendingPhotos(): Promise<void> {
  if (uploading || !dbIsOpen() || !navigator.onLine) return
  uploading = true
  try {
    const d = db()
    const waiting = (await d.photo_files.toArray()).filter((f) => f.uploaded === 0)
    for (const f of waiting) {
      const row = await d.walkaround_photos.get(f.id)
      if (!row) continue // the record hasn't been made yet
      if (row.deleted_at) { await d.photo_files.update(f.id, { uploaded: 1 }); continue }
      const { error } = await supabase.storage.from(BUCKET).upload(String(row.path), f.blob, { contentType: 'image/jpeg', upsert: true })
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
  if (local) return local.blob
  if (!navigator.onLine) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(p.path)
  if (error || !data) return null
  await db().photo_files.put({ id: p.id, blob: data, uploaded: 1 })
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
