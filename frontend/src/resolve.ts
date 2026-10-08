import { getTurnstileToken } from './turnstile.ts'

// Mirrors agent_backend/api/models.py's ResolveRequest/ResolveResponse --
// keep these in sync with that file if the backend's shape changes.
export type ResolveRequest = {
  query: string
  session_id: string
  // Capability names this app has widgets for; the backend offers the
  // model only these.
  tools: string[]
}

export type ResolveResponse = {
  tool: string | null
  args: Record<string, unknown> | null
  reply: string | null
  // Names the usage limit that refused the question, when one did;
  // `reply` then holds the explanation.
  limited?: string | null
  // With limited === 'verification': the key for the human check.
  site_key?: string | null
}

// Typed tool-call shape, mirrored from apps/ssr-agent/app/agent.ts -- kept
// in sync with that file and with agent_backend's actual two capabilities.
export type ToolCall =
  | { tool: 'showWeather'; args: { location: string } }
  | { tool: 'showCalendar'; args: { week_offset: number } }
  | { tool: 'showTodo'; args: { add: string[] } }

// The shape of the function that asks the agent. `resolve` below is the
// real one; App takes it as a prop so a caller can supply another (a
// test double, a different transport).
export type ResolveFn = (request: ResolveRequest) => Promise<ResolveResponse>

// Always same-origin, relative -- nginx proxies this in branch deploys
// (deploy/nginx.branch.conf), Vite's dev server proxies it locally
// (vite.config.ts), so this file never needs to know the backend's real
// address in either environment.
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/agent-tools-api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function resolve(request: ResolveRequest): Promise<ResolveResponse> {
  const answer = await post<ResolveResponse>('/resolve', request)
  if (answer.limited !== 'verification' || !answer.site_key) return answer

  // The backend wants to know a person is asking before it answers this
  // session (once; see its verification.py). Run the check, hand over the
  // result, and ask the same question again.
  try {
    const token = await getTurnstileToken(answer.site_key)
    const { verified } = await post<{ verified: boolean }>('/verify', {
      session_id: request.session_id,
      token,
    })
    if (verified) return post<ResolveResponse>('/resolve', request)
  } catch {
    // Falls through to the message below.
  }
  return {
    tool: null,
    args: null,
    reply: "Sorry, I couldn't verify that you're not a robot. Please try again.",
    limited: 'verification',
  }
}
