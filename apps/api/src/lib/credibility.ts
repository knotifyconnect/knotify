import { supabase } from '../lib.js'

/**
 * Atomically recompute a user's credibility from the sum of their quest points.
 *
 * Prefers the `recompute_credibility` RPC (migration 055), which does it in a
 * single UPDATE and is therefore free of the read-modify-write race the old
 * inline code had. Falls back to a client-side sum if the RPC isn't present yet
 * (e.g. the migration hasn't been applied), so this is safe to deploy in any
 * order relative to the migration.
 */
export async function recomputeCredibility(userId: string): Promise<number> {
  const rpc = await supabase.rpc('recompute_credibility', { p_user_id: userId })
  if (!rpc.error && typeof rpc.data === 'number') return rpc.data

  const rows =
    (await supabase.from('user_quests').select('points_awarded').eq('user_id', userId)).data ?? []
  const score = rows.reduce(
    (sum: number, row: { points_awarded?: number | null }) => sum + (row.points_awarded ?? 0),
    0
  )
  await supabase.from('users').update({ credibility_score: score }).eq('id', userId)
  return score
}
