// Runs Cloudflare Turnstile, the "are you a person" check the agent
// backend asks for once per session when it is configured to (see the
// backend's verification.py). Nothing here loads until the backend asks:
// a visitor who never sends a message never fetches Cloudflare's script.

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      appearance: 'interaction-only'
      callback: (token: string) => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TIMEOUT_MS = 60_000

let scriptLoading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile)
    script.onerror = () => {
      scriptLoading = null
      reject(new Error('could not load Turnstile'))
    }
    document.head.append(script)
  })
  return scriptLoading
}

// Resolves with a token to hand to the backend's /verify. Most visitors
// see nothing; the widget only becomes visible, floating above the input,
// if Cloudflare wants them to tick a box.
export async function getTurnstileToken(siteKey: string): Promise<string> {
  const turnstile = await loadTurnstile()

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:50%;bottom:7rem;translate:-50% 0;z-index:50'
  document.body.append(container)

  return new Promise<string>((resolve, reject) => {
    // Filled in once the widget exists; the callbacks below can fire
    // before render() has returned.
    const widget: { id?: string } = {}
    const finish = (settle: () => void) => {
      window.clearTimeout(timeout)
      if (widget.id !== undefined) turnstile.remove(widget.id)
      container.remove()
      settle()
    }
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error('Turnstile timed out'))),
      TIMEOUT_MS,
    )
    widget.id = turnstile.render(container, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      callback: (token) => finish(() => resolve(token)),
      'error-callback': () => finish(() => reject(new Error('Turnstile failed'))),
    })
  })
}
