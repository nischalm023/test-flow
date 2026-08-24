# Specs

Test plans written by the **Planner** agent. The **Generator** agent turns scenarios into runnable specs.

## Auth (login & register)

- Plan: [`auth-login-register.md`](./auth-login-register.md)
- Specs: `tests/auth/login.spec.ts`, `tests/auth/register.spec.ts`
- API calls are mocked via `src/utils/mock-auth-api.ts` — tests never hit the real backend
