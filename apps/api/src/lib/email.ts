import { Resend } from 'resend'

let resend: Resend | null = null

function getResend(): Resend {
  if (resend) return resend

  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  resend = new Resend(apiKey)
  return resend
}

const FROM = 'knotify <hello@knotify.pro>'
const WEB_URL = process.env.PUBLIC_WEB_URL || 'https://knotify.pro'

export async function sendFriendInviteEmail(opts: { to: string; inviterName: string; url: string }) {
  const { to, inviterName, url } = opts
  const { error } = await getResend().emails.send({
    from: FROM,
    to,
    subject: `${inviterName} invited you to knotify`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'IBM Plex Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:0.5px solid rgba(84,72,58,0.14);overflow:hidden;">
        <tr>
          <td style="padding:40px 48px 32px;">
            <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a09287;font-weight:500;margin-bottom:24px;">knotify</div>
            <h1 style="font-family:'Fraunces',Georgia,serif;font-size:30px;font-weight:700;color:#1a1410;letter-spacing:-0.02em;margin:0 0 16px;">
              ${inviterName} invited you to knotify.
            </h1>
            <p style="font-size:15px;color:#6b5f55;line-height:1.7;margin:0 0 28px;">
              knotify is a quieter professional network for internationals in Munich: real connections, verified skills, warm introductions. ${inviterName} thinks you belong here.
            </p>
            <a href="${url}" style="display:inline-block;background:#D8442B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;">
              Accept your invite
            </a>
            <p style="font-size:13px;color:#a09287;margin:28px 0 0;line-height:1.6;">
              This invite is just for you. Use the email address it was sent to.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 48px;border-top:0.5px solid rgba(84,72,58,0.1);">
            <p style="font-size:12px;color:#a09287;margin:0;">&copy; ${new Date().getFullYear()} knotify &middot; Munich</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}

export async function sendBetaApprovalEmail(to: string, name?: string) {
  const firstName = name?.split(' ')[0] ?? 'there'
  const signupUrl = `${WEB_URL}/signup?email=${encodeURIComponent(to)}`

  const { error } = await getResend().emails.send({
    from: FROM,
    to,
    subject: "You're in, welcome to knotify",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'IBM Plex Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:0.5px solid rgba(84,72,58,0.14);overflow:hidden;">
        <tr>
          <td style="padding:40px 48px 32px;">
            <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a09287;font-weight:500;margin-bottom:24px;">knotify</div>
            <h1 style="font-family:'Fraunces',Georgia,serif;font-size:32px;font-weight:700;color:#1a1410;letter-spacing:-0.02em;margin:0 0 16px;">
              Hey ${firstName}, you're in.
            </h1>
            <p style="font-size:15px;color:#6b5f55;line-height:1.7;margin:0 0 28px;">
              Your spot on knotify is ready. We built this for internationals navigating Munich: professionals, students, and everyone in between trying to build a real network here.
            </p>
            <a href="${signupUrl}" style="display:inline-block;background:#D8442B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:0.01em;">
              Create your account
            </a>
            <p style="font-size:13px;color:#a09287;margin:28px 0 0;line-height:1.6;">
              Use the same email address this was sent to.<br>
              See you inside.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 48px;border-top:0.5px solid rgba(84,72,58,0.1);">
            <p style="font-size:12px;color:#a09287;margin:0;">
              &copy; ${new Date().getFullYear()} knotify &middot; Munich
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  })

  if (error) throw new Error(`Email send failed: ${error.message}`)
}
