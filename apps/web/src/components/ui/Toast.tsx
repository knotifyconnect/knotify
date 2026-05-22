import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore } from '@/store/toasts'

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="pointer-events-auto w-80 bg-[#1a1a24] border border-[#ffffff10] rounded-xl p-4 shadow-xl flex items-start gap-3"
          >
            <div
              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                toast.type === 'referral_received'
                  ? 'bg-[#7c5cfc]'
                  : toast.type === 'referral_submitted'
                    ? 'bg-[#14b8a6]'
                    : toast.type === 'message'
                      ? 'bg-[#f59e0b]'
                      : 'bg-[#9090a8]'
              }`}
            />
            <div>
              <p className="text-sm font-medium text-[#f0f0f5]">{toast.title}</p>
              <p className="text-xs text-[#5a5a72] mt-0.5">{toast.body}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
