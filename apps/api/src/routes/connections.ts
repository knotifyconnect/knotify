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

connectionsRouter.get('/map', requireAuth, async (req, res) => {
  try {
    if (!req.appUserId) {
      return res.status(404).json({ error: 'Profile not found' })
    }
    const meId = req.appUserId

    // 1. Get all my connections, then filter accepted in JS.
    // This mirrors the /api/connections endpoint exactly, which we KNOW returns 3 rows
    // (useConnectionCount counts accepted from this same shape).
    const myConns = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`)

    if (myConns.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map: my connections query error:', myConns.error)
      return res.status(500).json({ error: myConns.error.message })
    }

    const acceptedConns = (myConns.data ?? []).filter((c: any) => c.status === 'accepted')
    // eslint-disable-next-line no-console
    console.log(`[connections/map] meId=${meId} total=${(myConns.data ?? []).length} accepted=${acceptedConns.length}`)

    // 2. First-degree user IDs.
    const firstDegreeIds = new Set<string>()
    for (const c of acceptedConns) {
      firstDegreeIds.add(c.requester_id === meId ? c.addressee_id : c.requester_id)
    }
    const firstDegreeIdList = [...firstDegreeIds]

    if (firstDegreeIdList.length === 0) {
      return res.json({ firstDegreeNodes: [], secondDegreeNodes: [] })
    }

    // 3. Fetch first-degree user records.
    const firstDegreeUsers = await supabase
      .from('users')
      .select('id, full_name, username, avatar_url, is_online, referral_score, current_company')
      .in('id', firstDegreeIdList)

    if (firstDegreeUsers.error) {
      // eslint-disable-next-line no-console
      console.error('connections/map: first-degree users query error:', firstDegreeUsers.error)
      return res.status(500).json({ error: firstDegreeUsers.error.message })
    }

    // 4. Second-degree: connections of first-degree users.
    // Fetch ALL connections involving any first-degree user, filter accepted in JS
    const secondConnsA = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .in('requester_id', firstDegreeIdList)
    const secondConnsB = await supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status')
      .in('addressee_id', firstDegreeIdList)

    const secondRows = [
      ...((secondConnsA.data ?? []) as any[]).filter((c) => c.status === 'accepted'),
      ...((secondConnsB.data ?? []) as any[]).filter((c) => c.status === 'accepted'),
    ]

    const secondDegreeIds = new Set<string>()
    for (const c of secondRows) {
      const aIsFirst = firstDegreeIds.has(c.requester_id)
      const bIsFirst = firstDegreeIds.has(c.addressee_id)
      if (aIsFirst && c.addressee_id !== meId && !firstDegreeIds.has(c.addressee_id)) secondDegreeIds.add(c.addressee_id)
      if (bIsFirst && c.requester_id !== meId && !firstDegreeIds.has(c.requester_id)) secondDegreeIds.add(c.requester_id)
    }
    const secondDegreeIdList = [...secondDegreeIds]

    let secondDegreeNodes: any[] = []
    if (secondDegreeIdList.length > 0) {
      const sdUsers = await supabase
        .from('users')
        .select('id, full_name, username, avatar_url, current_company')
        .in('id', secondDegreeIdList)
      secondDegreeNodes = sdUsers.data ?? []
    }

    return res.json({
      firstDegreeNodes: firstDegreeUsers.data ?? [],
      secondDegreeNodes,
      _debug: {
        version: 'v3-2026-05-20-debug',
        meId,
        totalConns: (myConns.data ?? []).length,
        acceptedConns: acceptedConns.length,
        firstDegreeIdCount: firstDegreeIdList.length,
        firstDegreeUserCount: (firstDegreeUsers.data ?? []).length,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('connections/map: unexpected error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
})
