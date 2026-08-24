# Test Plan: EventFlow Auth (Login & Register)

**Target:** http://localhost:4000
**App:** `client/` (Next.js EventFlow)
**Seed:** tests/seed.spec.ts
**Date:** 2026-08-24

## Overview

Covers the EventFlow client authentication UI at `/login` and `/register`. All API calls to `POST /auth/login` and `POST /auth/register` must be **mocked with `page.route()`** — tests never hit the real backend at `localhost:3000`.

## Preconditions

- Next.js client running at `http://localhost:4000` (`pnpm dev` in `client/`)
- Playwright `baseURL` set to `http://localhost:4000`
- Test data loaded from `tests/data/auth.json`
- API routes mocked before form submission in every scenario that triggers a network call

## API mocking contract

| Endpoint | Method | Mock helper | Success response shape |
|----------|--------|-------------|------------------------|
| `**/auth/login` | POST | `mockLoginSuccess()` | `{ data: { access_token, user } }` |
| `**/auth/register` | POST | `mockRegisterSuccess()` | `{ data: user }` |
| `**/auth/login` | POST (error) | `mockAuthError(page, 'login', msg)` | `{ error: { message } }` status 401 |
| `**/auth/register` | POST (error) | `mockAuthError(page, 'register', msg)` | `{ error: { message } }` status 409 |

Use helpers from `src/utils/mock-auth-api.ts`. Page objects live in `src/pages/LoginPage.ts` and `src/pages/RegisterPage.ts`.

## Scenarios

### Scenario 1.1 — Login page renders
- **Priority:** P0
- **Tags:** @smoke @critical
- **Preconditions:** None
- **Steps:**
  1. Navigate to `/login` — expected: login page loads
- **Assertions:**
  - Heading "Welcome back" is visible
  - Email and Password fields are visible
  - "Sign In" button is visible
  - "Sign up" link is visible
- **Edge cases considered:** None (UI-only, no API call)

### Scenario 1.2 — Successful login with mocked API
- **Priority:** P0
- **Tags:** @smoke @critical
- **Preconditions:** `mockLoginSuccess()` registered for `**/auth/login`
- **Steps:**
  1. Navigate to `/login`
  2. Fill email and password from `tests/data/auth.json`
  3. Click "Sign In" — expected: mocked API returns token, app redirects to home
- **Assertions:**
  - URL is `/`
  - Toast "Logged in successfully" appears
- **Edge cases considered:** Token stored in localStorage (not asserted — implementation detail)

### Scenario 1.3 — Login form validation (short password)
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** None (client-side validation only, no API call)
- **Steps:**
  1. Navigate to `/login`
  2. Enter valid email and password shorter than 6 characters
  3. Click "Sign In" — expected: Zod validation blocks submit
- **Assertions:**
  - "Password must be at least 6 characters long" error message is visible
  - URL remains `/login`
- **Edge cases considered:** Invalid email format (same validation pattern)

### Scenario 1.4 — Login failure with mocked API error
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** `mockAuthError(page, 'login', 'Invalid credentials')` registered
- **Steps:**
  1. Navigate to `/login`
  2. Fill valid credentials from test data
  3. Click "Sign In" — expected: mocked 401 response
- **Assertions:**
  - Toast "Login failed" appears
  - URL remains `/login`
- **Edge cases considered:** Network timeout (not covered — requires separate mock)

### Scenario 1.5 — Navigate from login to register
- **Priority:** P2
- **Tags:** @regression
- **Preconditions:** None
- **Steps:**
  1. Navigate to `/login`
  2. Click "Sign up" link — expected: register page loads
- **Assertions:**
  - URL is `/register`
  - Heading "Create an account" is visible
- **Edge cases considered:** None

### Scenario 2.1 — Register page renders
- **Priority:** P0
- **Tags:** @smoke @critical
- **Preconditions:** None
- **Steps:**
  1. Navigate to `/register` — expected: register page loads
- **Assertions:**
  - Heading "Create an account" is visible
  - Name, Email, Password, Confirm Password fields are visible
  - "Create Account" button is visible
  - "Sign in" link is visible
- **Edge cases considered:** None (UI-only)

### Scenario 2.2 — Successful registration with mocked API
- **Priority:** P0
- **Tags:** @smoke @critical
- **Preconditions:** `mockRegisterSuccess()` registered for `**/auth/register`
- **Steps:**
  1. Navigate to `/register`
  2. Fill name, email, password, confirm password from test data
  3. Click "Create Account" — expected: mocked API succeeds, redirect to login
- **Assertions:**
  - URL is `/login`
  - Toast "Registered successfully" appears
- **Edge cases considered:** Duplicate email (see 2.4)

### Scenario 2.3 — Register form validation (password mismatch)
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** None (client-side validation only)
- **Steps:**
  1. Navigate to `/register`
  2. Fill all fields with mismatched confirm password
  3. Click "Create Account" — expected: Zod refine blocks submit
- **Assertions:**
  - "Passwords do not match" error is visible
  - URL remains `/register`
- **Edge cases considered:** Short password shows min-length error

### Scenario 2.4 — Register failure with mocked API error
- **Priority:** P1
- **Tags:** @regression
- **Preconditions:** `mockAuthError(page, 'register', 'Email already exists', 409)` registered
- **Steps:**
  1. Navigate to `/register`
  2. Fill valid registration data
  3. Click "Create Account" — expected: mocked 409 response
- **Assertions:**
  - Toast "Registration failed" appears
  - URL remains `/register`
- **Edge cases considered:** None

### Scenario 2.5 — Navigate from register to login
- **Priority:** P2
- **Tags:** @regression
- **Preconditions:** None
- **Steps:**
  1. Navigate to `/register`
  2. Click "Sign in" link — expected: login page loads
- **Assertions:**
  - URL is `/login`
  - Heading "Welcome back" is visible
- **Edge cases considered:** None

## Not covered (and why)

- Real backend integration — blocked by design; use mocked `page.route()` only
- OAuth / social login — not implemented in client
- Password reset flow — not present in client UI
- Profile fetch (`GET /auth/profile`) — post-login only, separate plan needed
