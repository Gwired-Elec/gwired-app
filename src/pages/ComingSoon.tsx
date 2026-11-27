export default function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card"><p className="muted">Not built yet ({phase}).</p></div>
    </>
  )
}
