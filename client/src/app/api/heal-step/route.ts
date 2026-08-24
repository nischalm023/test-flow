import { NextResponse } from 'next/server';
import type { ScannedElement, TestCaseStep } from '@/lib/types';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const step = (body.step || {}) as Partial<TestCaseStep>;
  const errorMessage = typeof body.errorMessage === 'string' ? body.errorMessage : 'Element not found within timeout';
  const availableElements: ScannedElement[] = Array.isArray(body.availableElements) ? body.availableElements : [];

  const byName = availableElements.find(
    (el) =>
      el.name &&
      step.targetDescription &&
      el.name.toLowerCase().includes(step.targetDescription.toLowerCase().split(' ').pop() || ''),
  );
  const byTag =
    availableElements.find((el) => el.tag === 'button' && step.action === 'click') ||
    availableElements.find((el) => el.tag === 'input' && step.action === 'type') ||
    availableElements[0];

  const suggested = byName || byTag;
  const suggestedSelector = suggested?.selector || step.targetSelector || 'body';

  return NextResponse.json({
    recommendation: `Selector "${step.targetSelector}" failed (${errorMessage}). Prefer ${suggestedSelector}${suggested?.text ? ` ("${suggested.text}")` : ''} or a role/name locator.`,
    suggestedSelector,
  });
}
