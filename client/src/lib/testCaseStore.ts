import { TestCase } from '@/lib/types';
import { DEFAULT_PRESET_TEST_CASES } from '@/data/samplePages';

export const TEST_CASES_KEY = 'qa_studio_test_cases';
export const ACTIVE_ID_KEY = 'qa_studio_active_test_case_id';

export function loadSavedTestCases(): TestCase[] | null {
  try {
    const saved = localStorage.getItem(TEST_CASES_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const kept = parsed.filter(
      (tc: TestCase) => !String(tc?.targetUrl || '').includes('apexgear.io'),
    );
    return kept.length > 0 ? kept : null;
  } catch (e) {
    console.error('Failed to parse local test cases:', e);
    return null;
  }
}

export function prependTestCases(newCases: TestCase[]): TestCase[] {
  const existing = loadSavedTestCases() || DEFAULT_PRESET_TEST_CASES;
  const combined = [...newCases, ...existing];
  try {
    localStorage.setItem(TEST_CASES_KEY, JSON.stringify(combined));
  } catch (e) {
    console.error('Failed to persist generated test cases:', e);
  }
  return combined;
}

export function setActiveTestCaseId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch {
    // ignore storage failures
  }
}
