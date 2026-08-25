import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Octokit } from 'octokit';
import type { User } from '@/types';

export const GITHUB_STATE_COOKIE = 'github_oauth_state';
export const GITHUB_SESSION_COOKIE = 'github_pending_session';
export const GITHUB_ACCESS_COOKIE = 'github_access_token';

export function githubCredentials() {
  const clientId = process.env.AUTH_GITHUB_ID;
  const clientSecret = process.env.AUTH_GITHUB_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('AUTH_GITHUB_ID and AUTH_GITHUB_SECRET must be set');
  }
  return { clientId, clientSecret };
}

function signingSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET must be set');
  }
  return secret;
}

export function createOAuthState() {
  return randomBytes(16).toString('hex');
}

export function equalValue(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signSessionToken(user: User) {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const sig = createHmac('sha256', signingSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function readSessionToken(token: string): User | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', signingSecret())
    .update(payload)
    .digest('base64url');
  if (!equalValue(sig, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()) as User;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function callbackUrl(origin: string) {
  return `${origin}/api/auth/github/callback`;
}

type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

export async function exchangeGithubCode(code: string, origin: string) {
  const { clientId, clientSecret } = githubCredentials();
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl(origin),
    }),
  });

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };

  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error || 'Failed to exchange GitHub code');
  }

  return tokenJson.access_token;
}

export async function fetchGithubUser(accessToken: string): Promise<User> {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'EventFlow',
  };

  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    throw new Error('Failed to load GitHub profile');
  }
  const ghUser = (await userRes.json()) as GithubUser;

  let email = ghUser.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers,
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as GithubEmail[];
      email =
        emails.find((item) => item.primary && item.verified)?.email ||
        emails.find((item) => item.verified)?.email ||
        emails[0]?.email;
    }
  }

  const now = new Date().toISOString();
  return {
    id: String(ghUser.id),
    email: email || `${ghUser.login}@users.noreply.github.com`,
    name: ghUser.name || ghUser.login,
    role: 'USER',
    githubLogin: ghUser.login,
    createdAt: now,
    updatedAt: now,
  };
}

export function signGithubAccessToken(token: string) {
  const payload = Buffer.from(token).toString('base64url');
  const sig = createHmac('sha256', signingSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function readGithubAccessToken(value: string): string | null {
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', signingSecret())
    .update(payload)
    .digest('base64url');
  if (!equalValue(sig, expected)) return null;
  try {
    return Buffer.from(payload, 'base64url').toString();
  } catch {
    return null;
  }
}

export type GithubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
};

/**
 * Fetch public or private repositories for a given GitHub token or username.
 */
export async function fetchUserRepositories(token: string) {
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching repositories:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch detailed information for a specific repository.
 */
export async function fetchRepositoryDetails(token: string, owner: string, repo: string) {
  const octokit = new Octokit({ auth: token });

  try {
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error(`Error fetching repo ${owner}/${repo}:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function fetchGithubRepos(accessToken: string): Promise<GithubRepo[]> {
  const res = await fetchUserRepositories(accessToken);
  if (!res.success || !res.data) {
    throw new Error(res.error || 'Failed to load GitHub repositories');
  }

  return res.data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description,
    private: repo.private,
    stargazers_count: repo.stargazers_count ?? 0,
  }));
}

