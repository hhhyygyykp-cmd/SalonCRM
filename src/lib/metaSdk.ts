const FB_SCRIPT_ID = 'facebook-jssdk'
const GRAPH_JS_VERSION = 'v22.0'

/** Official Coexistence launch selector (Meta: Onboard WhatsApp Business app users, updated Jun 26, 2026). */
export const COEXISTENCE_FEATURE_TYPE = 'whatsapp_business_app_onboarding'

/**
 * extras for FB.login — taken from Meta’s current Coexistence Embedded Signup sample:
 * https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/
 *
 * featureType + sessionInfoVersion are on that page.
 * feature_type is the same selector as named on Meta’s Embedded Signup v4 page
 * (“onboarding WhatsApp Business app users continues to be supported through the feature_type parameter”).
 */
export function coexistenceEmbeddedSignupExtras(): Record<string, unknown> {
  return {
    setup: {},
    featureType: COEXISTENCE_FEATURE_TYPE,
    feature_type: COEXISTENCE_FEATURE_TYPE,
    sessionInfoVersion: '3',
  }
}

export type EmbeddedSignupSession = {
  type?: string
  event?: string
  version?: number | string
  data?: {
    waba_id?: string
    phone_number_id?: string
    business_id?: string
    waba_ids?: string[]
  }
}

type FbLoginResponse = {
  authResponse?: { code?: string }
  status?: string
}

type FacebookSDK = {
  init: (opts: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void
  login: (
    cb: (res: FbLoginResponse) => void,
    opts: {
      config_id: string
      response_type: string
      override_default_response_type: boolean
      extras: Record<string, unknown>
    },
  ) => void
}

declare global {
  interface Window {
    FB?: FacebookSDK
    fbAsyncInit?: () => void
  }
}

function isMetaOrigin(origin: string) {
  return origin === 'https://www.facebook.com' || origin === 'https://web.facebook.com'
}

export function parseEmbeddedSignupMessage(raw: unknown): EmbeddedSignupSession | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw) as EmbeddedSignupSession
    if (parsed?.type === 'WA_EMBEDDED_SIGNUP') return parsed
  } catch {
    return null
  }
  return null
}

export function loadFacebookSdk(appId: string): Promise<FacebookSDK> {
  return new Promise((resolve, reject) => {
    const init = () => {
      if (!window.FB) {
        reject(new Error('Facebook SDK loaded without FB object'))
        return
      }
      window.FB.init({ appId, cookie: true, xfbml: false, version: GRAPH_JS_VERSION })
      resolve(window.FB)
    }

    if (window.FB) {
      init()
      return
    }

    const previous = window.fbAsyncInit
    window.fbAsyncInit = () => {
      try {
        previous?.()
        init()
      } catch (e) {
        reject(e)
      }
    }

    if (!document.getElementById(FB_SCRIPT_ID)) {
      const script = document.createElement('script')
      script.id = FB_SCRIPT_ID
      script.async = true
      script.defer = true
      script.crossOrigin = 'anonymous'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.onerror = () => reject(new Error('Could not load the Meta JavaScript SDK'))
      document.body.appendChild(script)
    }
  })
}

export function listenForEmbeddedSignupSession(onSession: (session: EmbeddedSignupSession) => void) {
  const handler = (event: MessageEvent) => {
    if (!isMetaOrigin(event.origin)) return
    const session = parseEmbeddedSignupMessage(event.data)
    if (session) onSession(session)
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

/**
 * Launches WhatsApp Business App Coexistence Embedded Signup.
 * FB.login is called synchronously so the popup is not treated as a separate Cloud API registration.
 * Never requests a token in the browser.
 */
export function launchWhatsAppCoexistenceSignup(params: {
  appId: string
  configId: string
}): Promise<{ code: string; session: EmbeddedSignupSession | null }> {
  return new Promise((resolve, reject) => {
    const FB = window.FB
    if (!FB) {
      reject(
        new Error(
          'Facebook SDK is not ready. Wait a second and click Connect WhatsApp Business again. Do not disconnect the WhatsApp Business app number.',
        ),
      )
      return
    }

    let session: EmbeddedSignupSession | null = null
    const stop = listenForEmbeddedSignupSession((next) => {
      if (next.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        session = next
        return
      }
      if (session?.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') return
      session = next
    })

    FB.login(
      (response) => {
        window.setTimeout(() => {
          stop()
          const code = response.authResponse?.code
          if (!code) {
            reject(
              new Error(
                'Embedded Signup was cancelled or did not return an authorization code. If Meta showed error #2655122, the popup used standard Cloud API registration — close it without disconnecting the number, then click Connect again and choose “connect your existing WhatsApp Business app account”.',
              ),
            )
            return
          }
          if (session?.event === 'FINISH' || session?.event === 'FINISH_ONLY_WABA') {
            reject(
              new Error(
                'Meta completed standard Cloud API onboarding (FINISH), not Coexistence. The CRM did not migrate or unregister 056 140 4016. Click Connect again. The first screen must offer connecting the existing WhatsApp Business app account — not adding a new Cloud API number.',
              ),
            )
            return
          }
          resolve({ code, session })
        }, 400)
      },
      {
        config_id: params.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: coexistenceEmbeddedSignupExtras(),
      },
    )
  })
}
