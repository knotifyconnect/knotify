import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  Globe,
  Info,
  Search,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { apiGetCached, apiPost } from '../../lib/api'
import { KAvatar, KBtn } from '../../lib/knotify'
import './CreateAskModal.css'

type AudienceType = 'everyone' | 'people'

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
    value: 'people' as const,
    label: 'Specific people',
    description: 'Choose up to 12',
    icon: UsersRound,
  },
]

const MAX_SELECTED_PEOPLE = 12
const OPEN_COMPANION_EVENT = 'knotify:open-companion'

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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [connections, setConnections] = useState<Person[]>([])
  const [peopleLoading, setPeopleLoading] = useState(true)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)

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

  const selectedPeople = useMemo(
    () => selectedIds
      .map((id) => connections.find((person) => person.id === id))
      .filter((person): person is Person => Boolean(person)),
    [connections, selectedIds]
  )

  const filteredPeople = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase()
    const matches = !query ? connections : connections.filter((person) => (
      person.full_name.toLowerCase().includes(query)
      || person.username.toLowerCase().includes(query)
      || person.headline?.toLowerCase().includes(query)
    ))
    return [...matches].sort((a, b) => (
      Number(selectedIds.includes(b.id)) - Number(selectedIds.includes(a.id))
      || a.full_name.localeCompare(b.full_name)
    ))
  }, [connections, peopleQuery, selectedIds])

  const needsPeople = audienceType === 'people'
  const audienceReady = needsPeople ? selectedIds.length > 0 : true
  const canPost = text.trim().length > 0 && audienceReady

  function pickType(type: AudienceType) {
    setAudienceType(type)
    setError('')
  }

  function togglePerson(userId: string) {
    setSelectedIds((current) => {
      if (current.includes(userId)) return current.filter((id) => id !== userId)
      if (current.length >= MAX_SELECTED_PEOPLE) {
        setError(`Choose up to ${MAX_SELECTED_PEOPLE} people.`)
        return current
      }
      setError('')
      return [...current, userId]
    })
  }

  function discoverWithCompanion() {
    const ask = text.trim()
    window.dispatchEvent(new CustomEvent(OPEN_COMPANION_EVENT, {
      detail: {
        draft: ask
          ? `Help me decide who in my knot should receive this ask: "${ask}"`
          : 'Help me discover who in my knot I should ask for help.',
      },
    }))
    onClose()
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
        audienceValue: null,
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
          <div className="k-ask-compose__title">
            <h2 id="create-ask-title">Ask for help</h2>
            <button
              type="button"
              className="k-ask-compose__info"
              aria-label="About Ask for help"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((open) => !open)}
            >
              <Info size={14} />
            </button>
            {infoOpen && (
              <div className="k-ask-compose__info-popover" role="status">
                Share the need, then choose exactly who should receive it.
              </div>
            )}
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
              placeholder="Looking for a flat in Schwabing?"
              rows={3}
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
              <button
                type="button"
                className="k-ask-compose__companion"
                onClick={discoverWithCompanion}
              >
                <span className="k-ask-compose__audience-icon"><Sparkles size={18} /></span>
                <span>
                  <strong>Discover</strong>
                  <small>with Companion</small>
                </span>
              </button>
            </div>
          </fieldset>

          {audienceType === 'people' && (
            <div className="k-ask-compose__people">
              {selectedPeople.length > 0 && (
                <div className="k-ask-compose__selected" aria-label="Selected people">
                  {selectedPeople.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => togglePerson(person.id)}
                      aria-label={`Remove ${person.full_name}`}
                    >
                      <KAvatar name={person.full_name} src={person.avatar_url} size={20} />
                      <span>{person.full_name.split(' ')[0]}</span>
                      <X size={11} />
                    </button>
                  ))}
                </div>
              )}
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
                <span>{selectedIds.length}/{MAX_SELECTED_PEOPLE}</span>
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
