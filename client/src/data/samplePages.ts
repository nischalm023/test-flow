import type {
  ElementCategory,
  SampleInteractivePage,
  ScannedElement,
  ScannedPage,
  TestCase,
} from '../lib/types';

function el(
  id: string,
  tag: string,
  selector: string,
  name: string,
  category: ElementCategory,
  extra: Partial<ScannedElement> = {},
): ScannedElement {
  return {
    type: extra.type ?? tag,
    isInteractive: extra.isInteractive ?? ['button', 'input', 'select', 'a', 'textarea'].includes(tag),
    ...extra,
    id,
    tag,
    selector,
    name,
    category,
  };
}

export const SAMPLE_PAGES: SampleInteractivePage[] = [
  {
    id: 'saas-login',
    name: 'CloudScale Sign In',
    category: 'SaaS Auth',
    description: 'Enterprise login with SSO, password, region, and MFA.',
    badge: '7 nodes',
    defaultUrl: 'https://app.cloudscale.io/login',
    htmlSnippet: '<form id="login"><input id="input-work-email"/><button id="btn-submit-login">Sign in</button></form>',
    elements: [
      el('elem-auth-1', 'h1', '#auth-heading', 'Sign In Heading', 'content', { text: 'Sign in to CloudScale' }),
      el('elem-auth-2', 'input', '#input-work-email', 'Corporate Email', 'input', { type: 'email', placeholder: 'alex.rivera@enterprisecorp.com', name: 'email', required: true }),
      el('elem-auth-3', 'input', '#input-user-password', 'Account Password', 'input', { type: 'password', placeholder: '••••••••••••', name: 'password', required: true }),
      el('elem-auth-4', 'select', '#select-datacenter', 'Cluster Region', 'input', { type: 'select', name: 'region', options: ['us-east', 'eu-central', 'ap-south'] }),
      el('elem-auth-5', 'input', '#input-mfa-code', '2FA OTP', 'input', { type: 'text', placeholder: '6-digit OTP (e.g. 849201)', name: 'otp' }),
      el('elem-auth-6', 'button', '#btn-oauth-google', 'Google SSO', 'action', { text: 'Continue with Google Workspace' }),
      el('elem-auth-7', 'button', '#btn-submit-login', 'Authenticate', 'action', { text: 'Authenticate & Enter Dashboard' }),
    ],
  },
  {
    id: 'travel-booking',
    name: 'SkyRoute Flight Finder',
    category: 'Travel',
    description: 'Flight search with origin, destination, date, and cabin class.',
    badge: '7 nodes',
    defaultUrl: 'https://skyroute.aero/flights',
    htmlSnippet: '<form id="flights"><input id="input-origin"/><button id="btn-search-flights">Search</button></form>',
    elements: [
      el('elem-tb-1', 'h1', '#flight-finder-title', 'Flight Finder Title', 'content', { text: 'SkyRoute Airline Flight Finder' }),
      el('elem-tb-2', 'input', '#input-origin', 'Departure Origin', 'input', { type: 'text', placeholder: 'SFO - San Francisco Intl', name: 'origin' }),
      el('elem-tb-3', 'input', '#input-destination', 'Arrival Destination', 'input', { type: 'text', placeholder: 'HND - Tokyo Haneda', name: 'destination' }),
      el('elem-tb-4', 'input', '#input-flight-date', 'Travel Date', 'input', { type: 'date', name: 'date' }),
      el('elem-tb-5', 'select', '#select-cabin-class', 'Cabin Class', 'input', { type: 'select', name: 'cabin', options: ['economy', 'premium', 'business'] }),
      el('elem-tb-6', 'button', '#btn-add-passenger', 'Add Passenger', 'action', { text: '+ Add Passenger (1 Selected)' }),
      el('elem-tb-7', 'button', '#btn-search-flights', 'Search Flights', 'action', { text: 'Search Best Available Flights' }),
    ],
  },
  {
    id: 'support-ticket',
    name: 'HelpDesk Pro Incidents',
    category: 'Support',
    description: 'Incident form with severity, component, and reproduction details.',
    badge: '6 nodes',
    defaultUrl: 'https://helpdesk.pro/incidents/new',
    htmlSnippet: '<form id="ticket"><input id="input-ticket-subject"/><button id="btn-submit-ticket">Submit</button></form>',
    elements: [
      el('elem-sup-1', 'h1', '#ticket-page-title', 'Ticket Page Title', 'content', { text: 'HelpDesk Pro Incident Submission' }),
      el('elem-sup-2', 'input', '#input-ticket-subject', 'Issue Subject', 'input', { type: 'text', placeholder: 'e.g. Database connection timeouts', name: 'subject', required: true }),
      el('elem-sup-3', 'select', '#select-severity', 'Incident Severity', 'input', { type: 'select', name: 'severity', options: ['p1', 'p2', 'p3'] }),
      el('elem-sup-4', 'input', '#input-component-name', 'Affected Component', 'input', { type: 'text', placeholder: 'e.g. Auth Gateway, Payment API', name: 'component' }),
      el('elem-sup-5', 'input', '#input-ticket-details', 'Incident Details', 'input', { type: 'text', placeholder: 'Paste stack trace or describe steps...', name: 'details' }),
      el('elem-sup-6', 'button', '#btn-submit-ticket', 'Submit Ticket', 'action', { text: 'Submit Incident' }),
    ],
  },
  {
    id: 'eventflow-client-auth',
    name: 'EventFlow Client (Port 4000)',
    category: 'EventFlow Next.js',
    description: 'Local running EventFlow application auth & registration interface.',
    badge: 'Local App',
    defaultUrl: 'http://localhost:4000/login',
    htmlSnippet: '<form id="auth-form"><input id="email" type="email"/><input id="password" type="password"/><button type="submit">Sign in</button></form>',
    elements: [
      el('ef-elem-1', 'h1', 'h1', 'Sign In Heading', 'content', { text: 'Sign in to EventFlow' }),
      el('ef-elem-2', 'input', 'input[type="email"]', 'Email Address', 'input', { type: 'email', placeholder: 'user@example.com', name: 'email', required: true }),
      el('ef-elem-3', 'input', 'input[type="password"]', 'Password', 'input', { type: 'password', placeholder: '••••••••', name: 'password', required: true }),
      el('ef-elem-4', 'button', 'button[type="submit"]', 'Sign In Button', 'action', { text: 'Sign in' }),
      el('ef-elem-5', 'a', 'a[href="/register"]', 'Register Link', 'action', { text: 'Create an account' }),
      el('ef-elem-6', 'a', 'a[href="/"]', 'EventFlow Logo', 'action', { text: 'EventFlow' }),
    ],
  },
  {
    id: 'eventflow-client-register',
    name: 'EventFlow Registration',
    category: 'EventFlow Next.js',
    description: 'User registration with name, email, password and confirmation.',
    badge: 'Local App',
    defaultUrl: 'http://localhost:4000/register',
    htmlSnippet: '<form id="reg-form"><input id="name"/><input id="email"/><input id="password"/><button type="submit">Register</button></form>',
    elements: [
      el('ef-reg-1', 'h1', 'h1', 'Register Heading', 'content', { text: 'Create an account' }),
      el('ef-reg-2', 'input', 'input[name="name"]', 'Full Name', 'input', { type: 'text', placeholder: 'John Doe', name: 'name', required: true }),
      el('ef-reg-3', 'input', 'input[type="email"]', 'Email Address', 'input', { type: 'email', placeholder: 'user@example.com', name: 'email', required: true }),
      el('ef-reg-4', 'input', 'input[name="password"]', 'Password', 'input', { type: 'password', placeholder: '••••••••', name: 'password', required: true }),
      el('ef-reg-5', 'input', 'input[name="confirmPassword"]', 'Confirm Password', 'input', { type: 'password', placeholder: '••••••••', name: 'confirmPassword', required: true }),
      el('ef-reg-6', 'button', 'button[type="submit"]', 'Create Account', 'action', { text: 'Create account' }),
      el('ef-reg-7', 'a', 'a[href="/login"]', 'Sign In Link', 'action', { text: 'Already have an account? Sign in' }),
    ],
  },
];

export function resolveSampleIdForUrl(url?: string): string | null {
  if (!url) return null;
  const match = SAMPLE_PAGES.find((s) => s.defaultUrl === url);
  return match ? match.id : null;
}

export function buildScannedPage(sampleId: string): ScannedPage {
  const sample = SAMPLE_PAGES.find((s) => s.id === sampleId) || SAMPLE_PAGES[0];
  return {
    url: sample.defaultUrl,
    title: sample.name,
    description: sample.description,
    scannedAt: new Date().toISOString(),
    elements: sample.elements,
    counts: {
      total: sample.elements.length,
      buttons: sample.elements.filter((e) => e.tag === 'button').length,
      inputs: sample.elements.filter((e) => e.tag === 'input' || e.tag === 'select').length,
      forms: 1,
      links: sample.elements.filter((e) => e.tag === 'a').length,
      headings: sample.elements.filter((e) => e.category === 'content').length,
    },
    rawHtml: sample.htmlSnippet,
    sampleKey: sample.id,
  };
}

export const DEFAULT_PRESET_TEST_CASES: TestCase[] = [
  {
    id: 'tc-eventflow-login-happy',
    title: 'E2E Flow: EventFlow User Login & Session Persistence',
    description: 'Authenticates with valid credentials and verifies dashboard navigation and localStorage session token.',
    priority: 'critical',
    category: 'E2E',
    status: 'ready',
    targetUrl: 'http://localhost:4000/login',
    createdAt: new Date().toISOString(),
    steps: [
      { id: 'ef-s1', order: 1, action: 'navigate', targetSelector: 'window', targetDescription: 'Open EventFlow Login Page', value: 'http://localhost:4000/login', timeoutMs: 2000 },
      { id: 'ef-s2', order: 2, action: 'type', targetSelector: 'input[type="email"]', targetDescription: 'Fill user email address', value: 'tester@example.com', timeoutMs: 1000 },
      { id: 'ef-s3', order: 3, action: 'type', targetSelector: 'input[type="password"]', targetDescription: 'Fill account password', value: 'Password123!', timeoutMs: 1000 },
      { id: 'ef-s4', order: 4, action: 'click', targetSelector: 'button[type="submit"]', targetDescription: 'Click Sign In', timeoutMs: 1500 },
      { id: 'ef-s5', order: 5, action: 'assert_visible', targetSelector: 'header, nav', targetDescription: 'Verify navigation header is visible', expectedValue: 'visible', timeoutMs: 2000 },
    ],
  },
  {
    id: 'tc-eventflow-register-happy',
    title: 'E2E Flow: EventFlow User Registration',
    description: 'Registers a new user and confirms redirection or login prompt.',
    priority: 'high',
    category: 'E2E',
    status: 'ready',
    targetUrl: 'http://localhost:4000/register',
    createdAt: new Date().toISOString(),
    steps: [
      { id: 'efr-s1', order: 1, action: 'navigate', targetSelector: 'window', targetDescription: 'Open EventFlow Register Page', value: 'http://localhost:4000/register', timeoutMs: 2000 },
      { id: 'efr-s2', order: 2, action: 'type', targetSelector: 'input[name="name"]', targetDescription: 'Fill full name', value: 'Alex QA', timeoutMs: 1000 },
      { id: 'efr-s3', order: 3, action: 'type', targetSelector: 'input[type="email"]', targetDescription: 'Fill corporate email', value: 'alex.qa@example.com', timeoutMs: 1000 },
      { id: 'efr-s4', order: 4, action: 'type', targetSelector: 'input[name="password"]', targetDescription: 'Fill password', value: 'SecurePass123!', timeoutMs: 1000 },
      { id: 'efr-s5', order: 5, action: 'type', targetSelector: 'input[name="confirmPassword"]', targetDescription: 'Confirm password', value: 'SecurePass123!', timeoutMs: 1000 },
      { id: 'efr-s6', order: 6, action: 'click', targetSelector: 'button[type="submit"]', targetDescription: 'Click Create Account', timeoutMs: 1500 },
    ],
  },



];

/**
 * Fetch dynamic test cases stored in Qdrant & Redis for a given repo
 */
export async function fetchQdrantTestCases(repo?: string): Promise<TestCase[]> {
  try {
    const url = repo ? `/api/qdrant/test-cases?repo=${encodeURIComponent(repo)}` : `/api/qdrant/test-cases`;
    const res = await fetch(url);
    if (!res.ok) return DEFAULT_PRESET_TEST_CASES;
    const data = await res.json();
    if (Array.isArray(data.testCases) && data.testCases.length > 0) {
      return data.testCases;
    }
    return DEFAULT_PRESET_TEST_CASES;
  } catch {
    return DEFAULT_PRESET_TEST_CASES;
  }
}
