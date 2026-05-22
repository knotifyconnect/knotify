import { Card } from '../components/ui/Card'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-text-secondary mt-2">This module is scaffolded and queued for implementation in later phases.</p>
    </Card>
  )
}
