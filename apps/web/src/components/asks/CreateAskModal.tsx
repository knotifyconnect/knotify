import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Briefcase,
  Check,
  Globe,
  Hash,
  Search,
  UsersRound,
  X,
} from 'lucide-react'
import { apiGetCached, apiPost } from '../../lib/api'
import { KAvatar, KBtn } from '../../lib/knotify'
import { INTERESTS, PERSONAS } from '../../lib/taxonomy'
import './CreateAskModal.css'

type AudienceType = 'everyone' | 'interest' | 'persona' | 'people'

type Person = {
  id: string
  full_name: string
  username: string
  avatar_url: string | null
  headline?: string | null
}

type Connection = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  user: Person | null
}

const AUDIENCE_OPTIONS = [
  {
    value: 'everyone' as const,
    label: 'Your knot',
    description: 'All your connections',
    icon: Globe,
  },
  {
    value: 'interest' as const,
    label: 'By topic',
    description: 'Match an interest',
    icon: Hash,
  },
  {
    value: 'persona' as const,
    label: 'By profession',
    description: 'Match a role',
    icon: Briefcase,
  },
  {
    value: 'people' as const,
    label: 'Specific people',
    description: 'Choose one or more',
    icon: UsersRound,
  },
]

export function CreateAskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [audienceType, setAudienceType] = useState<AudienceType>('everyone')
  const [audienceValue, setAudienceValue] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [connections, setConnections] = useState<Person[]>([])
  const [peopleLoading, setPeopleLoading] = useState(true)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    if (window.matchMedia('(min-width: 700px)').matches) {
      window.requestAnimationFrame(() => textareaRef.current?.focus())
    }

    apiGetCached<{ connections: Connection[] }>('/api/connections', { ttlMs: 10_000 })
      .then((result) => {
        setConnections(
          (result.connections ?? [])
            .filter((connection) => connection.status === 'accepted' && connection.user)
            .map((connection) => connection.user!)
            .sort((a, b) => a.full_name.localeCompare(b.full_name))
        )
      })
      .catch(() => setConnections([]))
      .finally(() => setPeopleLoading(false))

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const filteredPeople = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase()
    if (!query) return connections
    return connections.filter((person) => (
      person.full_name.toLowerCase().includes(query)
      || person.username.toLowerCase().includes(query)
      || person.headline?.toLowerCase().includes(query)
    ))
  }, [connections, peopleQuery])

  const needsValue = audienceType === 'interest' || audienceType === 'persona'
  const needsPeople = audienceType === 'people'
  const audienceReady = needsValue
    ? !!audienceValue
    : needsPeople
      ? selectedIds.length > 0
      : true
  const canPost = text.trim().length > 0 && audienceReady

  function pickType(type: AudienceType) {
    setAudienceType(type)
    setAudienceValue(null)
    setError('')
  }

  function togglePerson(userId: string) {
    setSelectedIds((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ))
  }

  async function post() {
    if (!text.trim()) {
      setError('Write your ask first.')
      textareaRef.current?.focus()
      return
    }
    if (!audienceReady) {
      setError(needsPeople ? 'Select at least one person.' : 'Choose the audience match.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await apiPost('/api/asks', {
        content: text.trim(),
        audienceType,
        audienceValue: needsValue ? audienceValue : null,
        audienceUserIds: needsPeople ? selectedIds : [],
      })
      onCreated?.()
      onClose()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not post this ask.')
    } finally {
      setBusy(false)
    }
  }

  const audienceHint =
    audienceType === 'everyone'
      ? 'Everyone in your knot can see this and will be notified.'
      : audienceType === 'interest'
        ? audienceValue
          ? `Connections interested in ${audienceValue} can see this and will be notified.`
          : 'Choose a topic to reach matching people in your knot.'
        : audienceType === 'persona'
          ? audienceValue
            ? `${PERSONAS.find((persona) => persona.value === audienceValue)?.label ?? audienceValue} connections can see this and will be notified.`
            : 'Choose a profession to reach matching people in your knot.'
          : selectedIds.length > 0
            ? `Only the ${selectedIds.length} selected ${selectedIds.length === 1 ? 'person' : 'people'} can see this and will be notified.`
            : 'Choose one or more people. Nobody else in your knot will see it.'

  return createPortal(
    <div
      className="k-visual-viewport-overlay k-ask-compose-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="k-ask-compose"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-ask-title"
      >
        <header className="k-ask-compose__header">
          <div>
            <h2 id="create-ask-title">Ask for help</h2>
            <p>Share the need, then choose exactly who should receive it.</p>
          </div>
          <button type="button" className="k-ask-compose__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="k-ask-compose__body">
          <div className="k-ask-compose__prompt">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 280))}
              placeholder="e.g. Looking for a flat in Schwabing — is anyone subletting or connected to someone at Celonis?"
              rows={4}
              aria-label="Your ask"
            />
            <span>{text.length}/280</span>
          </div>

          <fieldset className="k-ask-compose__audience">
            <legend>Who should see it?</legend>
            <div className="k-ask-compose__audience-grid">
              {AUDIENCE_OPTIONS.map(({ value, label, description, icon: Icon }) => {
                const active = audienceType === value
                return (
                  <button
                    key={value}
                    type="button"
                    className={active ? 'is-active' : ''}
                    aria-pressed={active}
                    onClick={() => pickType(value)}
                  >
                    <span className="k-ask-compose__audience-icon"><Icon size={18} /></span>
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                    {active && <Check className="k-ask-compose__audience-check" size={15} />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {audienceType === 'interest' && (
            <div className="k-ask-compose__choice-panel" aria-label="Choose a topic">
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className={audienceValue === interest ? 'is-active' : ''}
                  onClick={() => setAudienceValue(interest)}
                >
                  {interest}
                </button>
              ))}
            </div>
          )}

          {audienceType === 'persona' && (
            <div className="k-ask-compose__choice-panel" aria-label="Choose a profession">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.value}
                  type="button"
                  className={audienceValue === persona.value ? 'is-active' : ''}
                  onClick={() => setAudienceValue(persona.value)}
                >
                  {persona.label}
                </button>
              ))}
            </div>
          )}

          {audienceType === 'people' && (
            <div className="k-ask-compose__people">
              <div className="k-ask-compose__people-toolbar">
                <label>
                  <Search size={15} />
                  <input
                    value={peopleQuery}
                    onChange={(event) => setPeopleQuery(event.target.value)}
                    placeholder="Search your knot"
                    aria-label="Search people in your knot"
                  />
                </label>
                <span>{selectedIds.length} selected</span>
              </div>

              <div className="k-ask-compose__people-list">
                {peopleLoading && <div className="k-ask-compose__people-empty">Loading your knot…</div>}
                {!peopleLoading && connections.length === 0 && (
                  <div className="k-ask-compose__people-empty">
                    Connect with someone first, then you can send them a private ask.
                  </div>
                )}
                {!peopleLoading && connections.length > 0 && filteredPeople.length === 0 && (
                  <div className="k-ask-compose__people-empty">No one matches that search.</div>
                )}
                {filteredPeople.map((person) => {
                  const selected = selectedIds.includes(person.id)
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className={selected ? 'is-selected' : ''}
                      aria-pressed={selected}
                      onClick={() => togglePerson(person.id)}
                    >
                      <KAvatar name={person.full_name} src={person.avatar_url} size={34} />
                      <span>
                        <strong>{person.full_name}</strong>
                        <small>@{person.username}{person.headline ? ` · ${person.headline}` : ''}</small>
                      </span>
                      <span className="k-ask-compose__person-check">
                        {selected && <Check size={14} />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="k-ask-compose__delivery">
            <UsersRound size={15} />
            <span>{audienceHint} Replies, reactions, and status updates notify the same relevant people.</span>
          </div>

          {error && <div className="k-ask-compose__error" role="alert">{error}</div>}
        </div>

        <footer className="k-ask-compose__footer">
          <KBtn variant="ghost" size="sm" onClick={onClose}>Cancel</KBtn>
          <KBtn variant="signal" size="sm" onClick={post} disabled={busy || !canPost}>
            {busy ? 'Posting…' : 'Post ask'}
          </KBtn>
        </footer>
      </section>
    </div>,
    document.body
  )
}
