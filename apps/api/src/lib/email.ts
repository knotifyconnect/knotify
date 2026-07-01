import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Armen from knotify <hello@knotify.pro>'
const WEB_URL = process.env.PUBLIC_WEB_URL || 'https://knotify.pro'

// ---------------------------------------------------------------------------
// Shared layout
// ---------------------------------------------------------------------------

function layout(body: string, footer?: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'IBM Plex Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:0.5px solid rgba(84,72,58,0.14);overflow:hidden;max-width:560px;width:100%;">
        <tr>
          <td style="padding:40px 48px 32px;">
            <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#a09287;font-weight:600;margin-bottom:28px;">knotify</div>
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 48px;border-top:0.5px solid rgba(84,72,58,0.1);">
            <p style="font-size:12px;color:#a09287;margin:0;line-height:1.6;">
              ${footer ?? `&copy; ${new Date().getFullYear()} knotify &middot; Munich &middot; <a href="${WEB_URL}" style="color:#a09287;">knotify.pro</a>`}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()
}

function h1(text: string) {
  return `<h1 style="font-family:'Fraunces',Georgia,serif;font-size:30px;font-weight:700;color:#1a1410;letter-spacing:-0.02em;margin:0 0 16px;line-height:1.2;">${text}</h1>`
}

function p(text: string) {
  return `<p style="font-size:15px;color:#6b5f55;line-height:1.75;margin:0 0 20px;">${text}</p>`
}

function cta(text: string, url: string) {
  return `<a href="${url}" style="display:inline-block;background:#D8442B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.01em;margin-bottom:28px;">${text}</a>`
}

function signature(name = 'Armen') {
  return `<p style="font-size:15px;color:#6b5f55;line-height:1.75;margin:20px 0 0;">-- ${name}<br><span style="color:#a09287;font-size:13px;">Co-founder, knotify</span></p>`
}

// ---------------------------------------------------------------------------
// Email 1: "You were there" -- send immediately after fair
// Tone: personal, founder-to-human, no marketing speak
// ---------------------------------------------------------------------------

export async function sendWaitlistWelcomeEmail(to: string, firstName: string) {
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Hey ${firstName} -- quick note from knotify`,
    html: layout(`
      ${h1(`Hey ${firstName}.`)}
      ${p(`We met at the startup fair and I've been thinking about the conversations we had. A lot of people told us the same thing: Munich is a great city to build a career in, but actually getting connected to the right people here as an international is harder than it should be.`)}
      ${p(`That's exactly what we're building knotify for. Not another LinkedIn. Something quieter -- built around real introductions, verified context, and the kind of trust that makes a connection actually useful.`)}
      ${p(`You're on our beta list and you're going to be one of the first people inside. Before we open it up, I want to ask you one thing:`)}
      <p style="font-size:17px;color:#1a1410;font-weight:600;line-height:1.6;margin:0 0 24px;font-style:italic;">"What's the hardest part of building a professional network in Munich as an international?"</p>
      ${p(`Just reply to this email. I read every response personally and it directly shapes what we build next.`)}
      ${signature()}
    `),
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Email 2: "You're shaping this" -- send ~10 days after Email 1
// Tone: transparent, builder sharing progress, making them feel co-authorship
// ---------------------------------------------------------------------------

export async function sendInsiderUpdateEmail(to: string, firstName: string, highlights: string[]) {
  const bulletItems = highlights
    .map(h => `<li style="font-size:15px;color:#6b5f55;line-height:1.75;margin-bottom:8px;">${h}</li>`)
    .join('')

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `What we've been building (because of you)`,
    html: layout(`
      ${h1(`Here's what you changed.`)}
      ${p(`${firstName}, the responses we got from the people we met at the fair have been incredible. I want to be transparent with you about what we heard and what we built because of it.`)}
      ${p(`People told us they wanted:`)}
      <ul style="margin:0 0 24px;padding-left:20px;">
        ${bulletItems}
      </ul>
      ${p(`We've been heads down building. The beta is almost ready and you're going to be among the first people to see it -- not as a user testing a finished product, but as someone who helped define what it should be.`)}
      ${p(`One more thing before we open the doors: we're keeping the first cohort intentionally small. If there's someone in your life who's navigating Munich as an international and would genuinely benefit from this -- someone you'd vouch for -- reply with their name. I'll make sure they get a spot alongside you.`)}
      ${signature()}
    `),
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Email 3: "You're in" -- beta access granted
// Replaces the old sendBetaApprovalEmail
// ---------------------------------------------------------------------------

export async function sendBetaApprovalEmail(to: string, name?: string) {
  const firstName = name?.split(' ')[0] ?? 'there'
  const signupUrl = `${WEB_URL}/signup`

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Your spot is ready, ${firstName}`,
    html: layout(`
      ${h1(`${firstName}, you're in.`)}
      ${p(`This is the moment. Your knotify account is ready -- you're part of the founding cohort, the people who were here before it was obvious.`)}
      ${p(`Here's what I want you to do first: set up your profile, connect with one person, and then tell me what felt off. Literally reply to this email. The founding cohort gets my direct attention and what you notice in the first 48 hours is the most valuable feedback we'll ever get.`)}
      ${cta('Create your account', signupUrl)}
      ${p(`You have 5 invite slots. Use them for people you'd genuinely introduce to someone at a dinner party -- people who belong in Munich's international professional scene. Your invites shape the culture of the network from day one.`)}
      ${signature()}
    `),
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Email 4: Friend invite (existing users inviting contacts)
// ---------------------------------------------------------------------------

export async function sendFriendInviteEmail(opts: { to: string; inviterName: string; url: string }) {
  const { to, inviterName, url } = opts
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `${inviterName} wants you on knotify`,
    html: layout(`
      ${h1(`${inviterName} thinks you belong here.`)}
      ${p(`knotify is a professional network built specifically for internationals in Munich -- real connections, verified context, warm introductions. It's invite-only, and ${inviterName} used one of their personal invite slots on you.`)}
      ${p(`That means something. Invites are limited and people use them intentionally.`)}
      ${cta('Accept your invite', url)}
      <p style="font-size:13px;color:#a09287;margin:0;line-height:1.6;">This invite is personal -- it works only with the email address it was sent to.</p>
    `),
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}
