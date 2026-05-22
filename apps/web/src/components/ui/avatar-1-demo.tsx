import { AvatarGroup } from '@/components/ui/avatar-1'

export default function AvatarGroupDemo() {
  return (
    <div className="flex w-3/4 flex-col gap-2">
      <AvatarGroup
        members={[
          { username: 'evilrabbit', src: 'https://vercel.com/api/www/avatar?u=evilrabbit&s=64' },
          { username: 'leerob', src: 'https://vercel.com/api/www/avatar?u=leerob&s=64' },
          { username: 'rauchg', src: 'https://avatars.githubusercontent.com/rauchg?s=64' },
        ]}
        size={32}
      />
      <AvatarGroup
        limit={4}
        members={[
          { username: 'sambecker', src: 'https://vercel.com/api/www/avatar?u=sambecker&s=64' },
          { username: 'rauno', src: 'https://vercel.com/api/www/avatar?u=rauno&s=64' },
          { username: 'shuding', src: 'https://vercel.com/api/www/avatar?u=shuding&s=64' },
          { username: 'skllcrn' },
          { username: 'almonk' },
        ]}
        size={32}
      />
    </div>
  )
}
