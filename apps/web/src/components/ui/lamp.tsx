import type { PropsWithChildren } from 'react'

export function LampContainer({ children }: PropsWithChildren) {
  return <div className="relative overflow-hidden">{children}</div>
}
