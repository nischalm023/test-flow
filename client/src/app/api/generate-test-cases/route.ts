import { NextResponse } from 'next/server';
import type { ScannedElement, TestCase, TestCaseStep } from '@/lib/types';

function step(partial: Omit<TestCaseStep, 'id' | 'order' | 'timeoutMs'> & { timeoutMs?: number }, index: number): TestCaseStep {
  return {
    ...partial,
    id: `step-ai-${Date.now()}-${index}`,
    order: index + 1,
    timeoutMs: partial.timeoutMs ?? 1000,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url : 'https://app.cloudscale.io/login';
  const title = typeof body.title === 'string' ? body.title : 'Web Page';
  const elements: ScannedElement[] = Array.isArray(body.elements) ? body.elements : [];
  const categoryHint = typeof body.category === 'string' ? body.category : '';
  const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt : '';

  const inputs = elements.filter((e) => e.tag === 'input' || e.tag === 'select' || e.tag === 'textarea');
  const buttons = elements.filter((e) => e.tag === 'button');
  const stamp = Date.now();

  const happySteps: TestCaseStep[] = [
    step({ action: 'navigate', targetSelector: 'window', targetDescription: `Open ${title}`, value: url, timeoutMs: 1200 }, 0),
  ];
  inputs.slice(0, 4).forEach((inp) => {
    happySteps.push(
      step({
        action: inp.tag === 'select' ? 'select' : 'type',
        targetSelector: inp.selector,
        targetDescription: `Fill ${inp.placeholder || inp.name}`,
        value: inp.type === 'email' ? 'tester@example.com' : inp.options?.[0] || 'Test Value',
      }, happySteps.length),
    );
  });
  if (buttons[0]) {
    happySteps.push(
      step({
        action: 'click',
        targetSelector: buttons[0].selector,
        targetDescription: `Click ${buttons[0].text || buttons[0].name}`,
        timeoutMs: 1200,
      }, happySteps.length),
    );
  }
  happySteps.push(
    step({
      action: 'assert_visible',
      targetSelector: 'body',
      targetDescription: 'Assert page still interactive',
      expectedValue: 'visible',
      timeoutMs: 1500,
    }, happySteps.length),
  );

  const smokeSteps: TestCaseStep[] = [
    step({ action: 'navigate', targetSelector: 'window', targetDescription: `Open ${title}`, value: url }, 0),
    step({
      action: 'assert_visible',
      targetSelector: elements[0]?.selector || 'body',
      targetDescription: `Assert ${elements[0]?.name || 'page'} is visible`,
      expectedValue: 'visible',
    }, 1),
  ];

  const negativeSteps: TestCaseStep[] = [
    step({ action: 'navigate', targetSelector: 'window', targetDescription: `Open ${title}`, value: url }, 0),
    step({
      action: 'click',
      targetSelector: buttons[0]?.selector || 'body',
      targetDescription: `Submit without filling ${title}`,
    }, 1),
    step({
      action: 'assert_visible',
      targetSelector: inputs.find((i) => i.required)?.selector || inputs[0]?.selector || 'body',
      targetDescription: 'Assert required field still present',
      expectedValue: 'required',
    }, 2),
  ];

  const testCases: TestCase[] = [
    {
      id: `tc-ai-${stamp}-1`,
      title: `E2E Flow: ${title}`,
      description: customPrompt || `Happy-path sequence generated from ${elements.length} scanned controls on ${title}.`,
      priority: 'high',
      category: 'E2E',
      status: 'ready',
      targetUrl: url,
      createdAt: new Date().toISOString(),
      steps: happySteps,
    },
    {
      id: `tc-ai-${stamp}-2`,
      title: `Smoke: ${title} loads`,
      description: 'Navigate and assert the primary scanned control is visible.',
      priority: 'medium',
      category: 'Smoke',
      status: 'ready',
      targetUrl: url,
      createdAt: new Date().toISOString(),
      steps: smokeSteps,
    },
    {
      id: `tc-ai-${stamp}-3`,
      title: `Negative: ${title} required fields`,
      description: categoryHint || 'Submit with empty required fields.',
      priority: 'high',
      category: 'Negative / Edge Case',
      status: 'ready',
      targetUrl: url,
      createdAt: new Date().toISOString(),
      steps: negativeSteps,
    },
  ];

  return NextResponse.json({ testCases });
}
