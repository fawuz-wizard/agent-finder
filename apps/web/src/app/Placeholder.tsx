import { Card } from '@/design'

/** Stage 3 placeholder for routes whose screens arrive in later stages. */
export function Placeholder({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <Card>
        <p className="text-sm text-muted">This screen is implemented in {stage}.</p>
      </Card>
    </div>
  )
}
