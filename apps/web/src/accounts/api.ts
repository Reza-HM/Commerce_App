export type Action = 'register' | 'signIn' | 'current' | 'signOut';
export type FailureCode = 'configuration' | 'unavailable' | 'timeout' | 'cancelled' |
  'invalid' | 'credentials' | 'forbidden' | 'limited' | 'required' | 'email' |
  'passwordEncoding' | 'passwordSize' | 'passwordLength' | 'passwordWeak';
export type Result = {ok: true} | {ok: false; code: FailureCode; field?: 'email' | 'password'};
type Credentials = {email: string; password: string};

export function apiOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return 'http://127.0.0.1:3001';
  try {
    const url = new URL(value);
    if (!value || value !== value.trim() || /[\\?#@]/.test(value) ||
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/') return undefined;
    return url.origin;
  } catch { return undefined; }
}

const paths: Record<Action, string> = {
  register: '/accounts/register', signIn: '/accounts/sessions',
  current: '/accounts/sessions/current', signOut: '/accounts/sessions/current'
};
const policy: Record<string, FailureCode> = {
  required: 'required', invalid_email: 'email', password_encoding: 'passwordEncoding',
  password_too_large: 'passwordSize', password_length: 'passwordLength', password_blocklisted: 'passwordWeak'
};
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function createAccountApi(originValue: string | undefined, send: typeof fetch = fetch, deadline = 15000) {
  const origin = apiOrigin(originValue);
  return async (action: Action, credentials?: Credentials, signal?: AbortSignal): Promise<Result> => {
    if (!origin) return {ok: false, code: 'configuration'};
    if (signal?.aborted) return {ok: false, code: 'cancelled'};
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = () => {};
    const interrupted = new Promise<Result>(resolve => {
      cancel = () => { controller.abort(); resolve({ok: false, code: 'cancelled'}); };
      signal?.addEventListener('abort', cancel, {once: true});
      timer = setTimeout(() => { resolve({ok: false, code: 'timeout'}); controller.abort(); }, deadline);
    });
    const request = async (): Promise<Result> => {
      try {
        const hasBody = action === 'register' || action === 'signIn';
        const response = await send(origin + paths[action], {
          method: hasBody ? 'POST' : action === 'signOut' ? 'DELETE' : 'GET',
          headers: {...(hasBody ? {'Content-Type': 'application/json'} : {}),
            ...(action !== 'register' ? {'X-Commerce-Request': '1'} : {})},
          credentials: action === 'register' ? 'omit' : 'include',
          cache: 'no-store', redirect: 'error', signal: controller.signal,
          ...(hasBody ? {body: JSON.stringify(credentials)} : {})
        });
        if (action === 'signOut' && response.status === 204) return {ok: true};
        const body: unknown = await response.json();
        const expected = action === 'register' ? 202 : action === 'signIn' ? 201 : 200;
        if (response.status === expected && object(body)) {
          if (action === 'register' && body.status === 'accepted' &&
            body.message === 'Registration request processed.' && Object.keys(body).length === 2) return {ok: true};
          if (action === 'signIn' && body.status === 'signed_in' && Object.keys(body).length === 1) return {ok: true};
          if (action === 'current' && body.status === 'signed_in' && Object.keys(body).length === 2 &&
            typeof body.accountId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.accountId)) return {ok: true};
        }
        if (response.status === 401 && action !== 'register') return {ok: false, code: 'credentials'};
        if (response.status === 403) return {ok: false, code: 'forbidden'};
        if (response.status === 429) return {ok: false, code: 'limited'};
        if (response.status === 400) {
          if (action === 'register' && object(body) && body.error === 'invalid_registration' &&
            (body.field === 'email' || body.field === 'password') && typeof body.code === 'string' && Object.hasOwn(policy, body.code) &&
            (body.code === 'required' || (body.field === 'email' ? body.code === 'invalid_email' : body.code.startsWith('password_')))) {
            return {ok: false, code: policy[body.code]!, field: body.field};
          }
          return {ok: false, code: 'invalid'};
        }
        return {ok: false, code: 'unavailable'};
      } catch { return {ok: false, code: 'unavailable'}; }
    };
    try { return await Promise.race([interrupted, request()]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  };
}

export const accountApi = createAccountApi(process.env.NEXT_PUBLIC_API_ORIGIN);
