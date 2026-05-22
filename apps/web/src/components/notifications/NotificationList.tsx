import { AnimatedList } from '@/components/magicui/animated-list'

type NotificationItem = {
  id: string
  title: string
  time: string
  fromUser?: { fullName?: string | null }
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  return (
    <AnimatedList delay={800}>
      {items.map((item) => (
        <div
          key={item.id}
          className="w-full bg-[#111118] border border-[#ffffff06] rounded-xl p-4 flex items-start gap-3 hover:border-[#ffffff10] transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-[#7c5cfc22] flex items-center justify-center text-sm font-medium text-[#9b82fd] flex-shrink-0">
            {item.fromUser?.fullName?.[0] ?? 'N'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[#f0f0f5]">{item.title}</p>
            <p className="text-xs text-[#5a5a72] mt-0.5">{item.time}</p>
          </div>
        </div>
      ))}
    </AnimatedList>
  )
}
