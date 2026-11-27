// Photos on one item of a variation: an Add photo button (the same camera, tick and pen as the walkaround) and small thumbnails.
import { useRef, useState } from 'react'
import type { Photo } from '../../lib/walkaround/data'
import { PhotoCapture } from '../walkaround/PhotoEditor'
import { attachPhotos, PhotoThumb } from '../walkaround/WalkaroundTab'

export default function LinePhotos({ jobId, lineId, photos, editable }: { jobId: string; lineId: string; photos: Photo[]; editable: boolean }) {
  const [busy, setBusy] = useState(false)
  const sort = useRef(0)
  return (
    <div style={{ marginTop: 8 }}>
      {editable && (
        <PhotoCapture busy={busy} onKeep={async (blob, original) => {
          setBusy(true)
          try {
            sort.current = Math.max(sort.current, photos.at(-1)?.sort ?? 0) + 10
            await attachPhotos([{ blob, original }], jobId, null, null, sort.current, { line_id: lineId })
          } finally { setBusy(false) }
        }} />
      )}
      {photos.length > 0 && <div className="thumbs">{photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}</div>}
    </div>
  )
}
