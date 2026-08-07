/**
 * Shared shell for every message.
 *
 * Table-based and inline-styled on purpose: Outlook and several Indian webmail
 * clients still drop <style> blocks and ignore flexbox, and a supplier reading
 * an approval on a phone is the common case. Nothing here is clever.
 */

const BRAND = '#0f2740'
const GOLD = '#b8912f'
const TEXT = '#1f2933'
const MUTED = '#6b7280'

/** Escapes interpolated values. Company names carry apostrophes and ampersands. */
export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface LayoutInput {
  heading: string
  /** Paragraphs of already-escaped HTML. */
  bodyHtml: string
  cta?: { label: string; url: string }
  /** Small print under the button. */
  footnote?: string
}

export function renderLayout({ heading, bodyHtml, cta, footnote }: LayoutInput): string {
  const button = cta
    ? `
      <tr>
        <td style="padding:8px 0 24px 0;">
          <a href="${esc(cta.url)}"
             style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;
                    padding:12px 24px;border-radius:4px;font-weight:600;font-size:15px;">
            ${esc(cta.label)}
          </a>
        </td>
      </tr>`
    : ''

  const small = footnote
    ? `<tr><td style="padding:0 0 16px 0;color:${MUTED};font-size:13px;line-height:20px;">${footnote}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:6px;padding:32px;
                    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
        <tr>
          <td style="padding-bottom:24px;border-bottom:2px solid ${GOLD};">
            <span style="font-size:18px;font-weight:700;letter-spacing:0.08em;color:${BRAND};">TRIYARA</span>
            <span style="font-size:12px;color:${MUTED};letter-spacing:0.12em;"> BUSINESS NETWORK</span>
          </td>
        </tr>
        <tr><td style="padding:28px 0 12px 0;font-size:20px;font-weight:600;color:${BRAND};">${esc(heading)}</td></tr>
        <tr><td style="font-size:15px;line-height:24px;padding-bottom:20px;">${bodyHtml}</td></tr>
        ${button}
        ${small}
        <tr>
          <td style="padding-top:20px;border-top:1px solid #e5e7eb;color:${MUTED};font-size:12px;line-height:18px;">
            TRIYARA Exports — this message was sent because of activity on the TRIYARA
            Business Network. If it reached you unexpectedly, you can ignore it.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Wraps paragraphs for the HTML body. Values must already be escaped. */
export function paras(...parts: string[]): string {
  return parts.map((p) => `<p style="margin:0 0 14px 0;">${p}</p>`).join('')
}

/** Plain-text counterpart. Every message ships both; some clients show only this. */
export function renderText(lines: (string | undefined)[]): string {
  return [...lines.filter((l): l is string => l !== undefined), '', '— TRIYARA Exports'].join('\n')
}
