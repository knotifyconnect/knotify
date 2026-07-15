import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../lib.js'

const createConnectionSchema = z.object({
  addresseeId: z.string().uuid(),
})

const patchConnectionSchema = z.object({
  status: z.enum(['accepted', 'declined']),
})

const connectionIdParamSchema = z.object({
  id: z.string().uuid(),
})

type ConnectionRow = {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  updated_at: string
}

export const connectionsRouter = Router()

connectionsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const result = await supabase
    .from('connections')
    .select('*')
    .or(`requester_id.eq.${req.appUserId},addressee_id.eq.${req.appUserId}`)
    .order('created_at', { ascending: false })

  if (result.error) {
    return res.status(500).json({ error: result.error.message })
  }

  const rows = (result.data ?? []) as ConnectionRow[]
  const otherIds = rows.map((c) => (c.requester_id === req.appUserId ? c.addressee_id : c.requester_id))
  const usersResult = otherIds.length
    ? await supabase.from('users').select('id, full_name, username, avatar_url, headline, location_city, university, current_company, status').in('id', otherIds)
    : { data: [], error: null }

  if (usersResult.error) {
    return res.status(500).json({ error: usersResult.error.message })
  }

  const usersById = new Map((usersResult.data ?? []).map((u) => [u.id, u]))
  const connections = rows.map((c) => {
    const otherId = c.requester_id === req.appUserId ? c.addressee_id : c.requester_id
    return { ...c, user: usersById.get(otherId) ?? null }
  })

  return res.json({ connections })
})

connectionsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const parsed = createConnectionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const { addresseeId } = parsed.data

  if (addresseeId === req.appUserId) {
    return res.status(422).json({ error: 'Cannot connect with yourself' })
  }

  const existing = await supabase
    .from('connections')
    .select('*')
    .or(
      `and(requester_id.eq.${req.appUserId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${req.appUserId})`
    )

  if (existing.error) {
    return res.status(500).json({ error: existing.error.message })
  }

  const rows = (existing.data ?? []) as ConnectionRow[]
  const direct = rows.find((c) => c.requester_id === req.appUserId && c.addressee_id === addresseeId)
  const reverse = rows.find((c) => c.requester_id === addresseeId && c.addressee_id === req.appUserId)

  // If the other user already requested me, accept that request directly.
  if (reverse && reverse.status === 'pending') {
    const accept = await supabase
      .from('connections')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', reverse.id)
      .select('*')
      .single()

    if (accept.error) return res.status(500).json({ error: accept.error.message })
    return res.status(200).json({ connection: accept.data, autoAccepted: true })
  }

  // If connection already accepted in any direction, return it.
  const accepted = rows.find((c) => c.status === 'accepted')
  if (accepted) {
    return res.status(200).json({ connection: accepted, alreadyConnected: true })
  }

  // Re-send by updating an existing direct request (pending or declined) back to pending.
  if (direct) {
    const update = await supabase
      .from('connections')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', direct.id)
      .select('*')
      .single()
    if (update.error) return res.status(500).json({ error: update.error.message })
    return res.status(200).json({ connection: update.data })
  }

  // No relationship yet: create new pending request.
  const insert = await supabase
    .from('connections')
    .insert({ requester_id: req.appUserId, addressee_id: addresseeId, status: 'pending' })
    .select('*')
    .single()

  if (insert.error) {
    return res.status(500).json({ error: insert.error.message })
  }

  return res.status(201).json({ connection: insert.data })
})

connectionsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const parsed = patchConnectionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Invalid payload', fields: parsed.error.flatten() })
  }

  const params = connectionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid connection id', fields: params.error.flatten() })
  }
  const id = params.data.id

  const result = await supabase
    .from('connections')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('addressee_id', req.appUserId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (result.error) {
    return res.status(500).json({ error: result.error.message })
  }

  if (!result.data) {
    return res.status(404).json({ error: 'Pending request not found' })
  }

  return res.json({ connection: result.data })
})


connectionsRouter.delete('/:id', requireAuth, async (req, res) => {
  if (!req.appUserId) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  const params = connectionIdParamSchema.safeParse(req.params)
  if (!params.success) {
    return res.status(422).json({ error: 'Invalid connection id', fields: params.error.flatten() })
  }

  const id = params.data.id

  const existing = await supabase
    .from('connections')
    .select('id, requester_id, addressee_id, status')
    .eq('id', id)
    .maybeSingle()

  if (existing.error) {
    return res.status(500).json({ error: existing.error.message })
  }

  if (!existing.data) {
    return res.status(404).json({ error: 'Connection not found' })
  }

  const isParticipant = existing.data.requester_id === req.appUserId || existing.data.addressee_id === req.appUserId
  if (!isParticipant) {
    return res.status(403).json({ error: 'Not allowed to remove this connection' })
  }

  const deleted = await supabase.from('connections').delete().eq('id', id)

  if (deleted.error) {
    return res.status(500).json({ error: deleted.error.message })
  }

  return res.json({ ok: true })
})

connectionsRouter.get('/map', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    const meId = req.appUserId

    const myConns = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`)

    if (myConns.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map: my connections query error:', myConns.error)
      return res.status(500).json({ error: myConns.error.message })
    }

    const acceptedConns = ((myConns.data ?? []) as any[]).filter((c) => c.status === 'accepted')
    const visibleRelationshipConns = ((myConns.data ?? []) as any[]).filter((c) => c.status !== 'declined')

    const firstDegreeIds = new Set<string>()
    for (const c of visibleRelationshipConns) {
      firstDegreeIds.add(c.requester_id === meId ? c.addressee_id : c.requester_id)
    }

    const firstDegreeIdList = [...firstDegreeIds]

    if (firstDegreeIdList.length === 0) {
      return res.json({ firstDegreeNodes: [], peerEdges: [] })
    }

    const firstDegreeUsers = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url, is_online, referral_score, current_company')
      .in('id', firstDegreeIdList)

    if (firstDegreeUsers.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map: first-degree users query error:', firstDegreeUsers.error)
      return res.status(500).json({ error: firstDegreeUsers.error.message })
    }

    const peerConnsA = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .in('requester_id', firstDegreeIdList)

    if (peerConnsA.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map: peer requester query error:', peerConnsA.error)
      return res.status(500).json({ error: peerConnsA.error.message })
    }

    const peerConnsB = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .in('addressee_id', firstDegreeIdList)

    if (peerConnsB.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map: peer addressee query error:', peerConnsB.error)
      return res.status(500).json({ error: peerConnsB.error.message })
    }

    const peerEdgeMap = new Map<string, { id: string; source_id: string; target_id: string; status: 'accepted' }>()
    const peerRows = [...((peerConnsA.data ?? []) as any[]), ...((peerConnsB.data ?? []) as any[])]

    for (const c of peerRows) {
      if (c.status !== 'accepted') continue

      const aIsFirst = firstDegreeIds.has(c.requester_id)
      const bIsFirst = firstDegreeIds.has(c.addressee_id)

      if (!aIsFirst || !bIsFirst) continue

      const [source_id, target_id] = [c.requester_id, c.addressee_id].sort()
      peerEdgeMap.set(`${source_id}:${target_id}`, {
        id: c.id,
        source_id,
        target_id,
        status: 'accepted',
      })
    }

    const peerEdges = [...peerEdgeMap.values()]

    return res.json({
      firstDegreeNodes: firstDegreeUsers.data ?? [],
      peerEdges,
    })
  } catch (err) {
    console.error('connections/map: unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

connectionsRouter.get('/map/expand/:userId', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    const params = z.object({ userId: z.string().uuid() }).safeParse(req.params)
    if (!params.success) {
      return res.status(422).json({ error: 'Invalid user id', fields: params.error.flatten() })
    }

    const meId = req.appUserId
    const rootUserId = params.data.userId

    if (rootUserId === meId) {
      return res.status(422).json({ error: 'Cannot expand yourself' })
    }

    const myConns = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`)

    if (myConns.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map/expand: my connections query error:', myConns.error)
      return res.status(500).json({ error: myConns.error.message })
    }

    const acceptedMyConns = ((myConns.data ?? []) as any[]).filter((c) => c.status === 'accepted')
    const firstDegreeIds = new Set<string>()

    for (const c of acceptedMyConns) {
      firstDegreeIds.add(c.requester_id === meId ? c.addressee_id : c.requester_id)
    }

    if (!firstDegreeIds.has(rootUserId)) {
      return res.status(403).json({ error: 'You can only expand a direct knot' })
    }

    const rootConnsA = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .eq('requester_id', rootUserId)

    if (rootConnsA.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map/expand: root requester query error:', rootConnsA.error)
      return res.status(500).json({ error: rootConnsA.error.message })
    }

    const rootConnsB = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .eq('addressee_id', rootUserId)

    if (rootConnsB.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map/expand: root addressee query error:', rootConnsB.error)
      return res.status(500).json({ error: rootConnsB.error.message })
    }

    const rootRowsById = new Map<string, any>()
    for (const c of [...((rootConnsA.data ?? []) as any[]), ...((rootConnsB.data ?? []) as any[])]) {
      if (c.status === 'accepted') rootRowsById.set(c.id, c)
    }

    const secondDegreeIds = new Set<string>()
    const secondDegreeEdges: Array<{ id: string; source_id: string; target_id: string; status: 'accepted' }> = []

    for (const c of rootRowsById.values()) {
      const otherId = c.requester_id === rootUserId ? c.addressee_id : c.requester_id

      if (otherId === meId) continue
      if (firstDegreeIds.has(otherId)) continue

      secondDegreeIds.add(otherId)

      const [source_id, target_id] = [rootUserId, otherId].sort()
      secondDegreeEdges.push({
        id: c.id,
        source_id,
        target_id,
        status: 'accepted',
      })
    }

    const secondDegreeIdList = [...secondDegreeIds]

    let secondDegreeNodes: any[] = []
    let peerEdges: Array<{ id: string; source_id: string; target_id: string; status: 'accepted' }> = []

    if (secondDegreeIdList.length > 0) {
      const secondDegreeUsers = await supabase
        .from('users')
        .select('id, full_name, username, avatar_url, headline, location_city, university, current_company, status, is_online, referral_score')
        .in('id', secondDegreeIdList)

      if (secondDegreeUsers.error) {
        // eslint-disable-next-line no-console
        console.error('connections/map/expand: second-degree users query error:', secondDegreeUsers.error)
        return res.status(500).json({ error: secondDegreeUsers.error.message })
      }

      secondDegreeNodes = secondDegreeUsers.data ?? []

      const peerConnsA = await supabase
        .from('connections')
        .select('id, requester_id, addressee_id, status')
        .in('requester_id', secondDegreeIdList)

      if (peerConnsA.error) {
        // eslint-disable-next-line no-console
        console.error('connections/map/expand: second-degree peer requester query error:', peerConnsA.error)
        return res.status(500).json({ error: peerConnsA.error.message })
      }

      const peerConnsB = await supabase
        .from('connections')
        .select('id, requester_id, addressee_id, status')
        .in('addressee_id', secondDegreeIdList)

      if (peerConnsB.error) {
        // eslint-disable-next-line no-console
        console.error('connections/map/expand: second-degree peer addressee query error:', peerConnsB.error)
        return res.status(500).json({ error: peerConnsB.error.message })
      }

      const peerEdgeMap = new Map<string, { id: string; source_id: string; target_id: string; status: 'accepted' }>()
      const peerRows = [...((peerConnsA.data ?? []) as any[]), ...((peerConnsB.data ?? []) as any[])]

      for (const c of peerRows) {
        if (c.status !== 'accepted') continue

        const aIsSecond = secondDegreeIds.has(c.requester_id)
        const bIsSecond = secondDegreeIds.has(c.addressee_id)

        if (!aIsSecond || !bIsSecond) continue

        const [source_id, target_id] = [c.requester_id, c.addressee_id].sort()
        peerEdgeMap.set(`${source_id}:${target_id}`, {
          id: c.id,
          source_id,
          target_id,
          status: 'accepted',
        })
      }

      peerEdges = [...peerEdgeMap.values()]
    }

    return res.json({
      rootUserId,
      secondDegreeNodes,
      secondDegreeEdges,
      peerEdges,
    })
  } catch (err) {
    console.error('connections/map/expand: unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
