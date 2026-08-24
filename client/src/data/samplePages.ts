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
];

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
    id: 'tc-preset-login-happy',
    title: 'E2E Flow: CloudScale Sign In',
    description: 'Fill credentials and authenticate into the dashboard.',
    priority: 'high',
    category: 'E2E',
    status: 'ready',
    targetUrl: 'https://app.cloudscale.io/login',
    createdAt: new Date().toISOString(),
    steps: [
      { id: 'step-p1-1', order: 1, action: 'navigate', targetSelector: 'window', targetDescription: 'Open CloudScale Sign In', value: 'https://app.cloudscale.io/login', timeoutMs: 1200 },
      { id: 'step-p1-2', order: 2, action: 'type', targetSelector: '#input-work-email', targetDescription: 'Fill corporate email', value: 'tester@example.com', timeoutMs: 800 },
      { id: 'step-p1-3', order: 3, action: 'type', targetSelector: '#input-user-password', targetDescription: 'Fill password', value: 'TestPass123!', timeoutMs: 800 },
      { id: 'step-p1-4', order: 4, action: 'click', targetSelector: '#btn-submit-login', targetDescription: 'Authenticate', timeoutMs: 1200 },
      { id: 'step-p1-5', order: 5, action: 'assert_visible', targetSelector: '#auth-success-banner', targetDescription: 'Assert authenticated state', expectedValue: 'visible', timeoutMs: 1500 },
    ],
  },
  {
    id: 'tc-preset-login-required',
    title: 'Negative: Sign in required fields',
    description: 'Submit login with empty required fields.',
    priority: 'high',
    category: 'Negative / Edge Case',
    status: 'ready',
    targetUrl: 'https://app.cloudscale.io/login',
    createdAt: new Date().toISOString(),
    steps: [
      { id: 'step-p2-1', order: 1, action: 'navigate', targetSelector: 'window', targetDescription: 'Open sign in', value: 'https://app.cloudscale.io/login', timeoutMs: 1200 },
      { id: 'step-p2-2', order: 2, action: 'click', targetSelector: '#btn-submit-login', targetDescription: 'Submit empty form', timeoutMs: 1000 },
      { id: 'step-p2-3', order: 3, action: 'assert_visible', targetSelector: '#input-work-email', targetDescription: 'Assert email field still present', expectedValue: 'required', timeoutMs: 1200 },
    ],
  },
];
