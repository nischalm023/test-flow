import React, { useState } from 'react';
import { TestCase } from '../types';
import { Code2, Copy, Check, Download, ExternalLink } from 'lucide-react';
import { stepsToPlaywrightBody, resolveNavigateUrl } from '@/lib/playwrightCodegen';

interface CodeExportModalProps {
  testCase: TestCase;
  onClose: () => void;
}

export const CodeExportModal: React.FC<CodeExportModalProps> = ({ testCase, onClose }) => {
  const [framework, setFramework] = useState<'playwright' | 'cypress' | 'puppeteer' | 'selenium'>('playwright');
  const [copied, setCopied] = useState<boolean>(false);

  const generatePlaywrightCode = (tc: TestCase) => {
    return `import { test, expect } from '@playwright/test';

test.describe('${tc.category}: ${tc.title}', () => {
  test('should execute automated test flow', async ({ page }) => {
    // 1. Set default navigation timeout
    page.setDefaultTimeout(10000);

${stepsToPlaywrightBody(tc.steps, tc.targetUrl)}
  });
});
`;
  };

  const generateCypressCode = (tc: TestCase) => {
    return `describe('${tc.category}: ${tc.title}', () => {
  it('executes automated QA verification flow', () => {
${tc.steps.map((step, i) => {
  switch (step.action) {
    case 'navigate':
      return `    // Step ${i + 1}: Visit page\n    cy.visit('${resolveNavigateUrl(step.value, tc.targetUrl)}');`;
    case 'click':
      return `    // Step ${i + 1}: Click element\n    cy.get('${step.targetSelector}').click();`;
    case 'type':
      return `    // Step ${i + 1}: Type text\n    cy.get('${step.targetSelector}').type('${step.value || ''}');`;
    case 'select':
      return `    // Step ${i + 1}: Select dropdown option\n    cy.get('${step.targetSelector}').select('${step.value || ''}');`;
    case 'assert_visible':
      return `    // Step ${i + 1}: Assert visibility\n    cy.get('${step.targetSelector}').should('be.visible');`;
    case 'assert_text':
      return `    // Step ${i + 1}: Assert text contains\n    cy.get('${step.targetSelector}').should('contain', '${step.expectedValue || ''}');`;
    case 'assert_value':
      return `    // Step ${i + 1}: Assert input value\n    cy.get('${step.targetSelector}').should('have.value', '${step.expectedValue || ''}');`;
    case 'wait':
      return `    // Step ${i + 1}: Wait\n    cy.wait(${step.timeoutMs});`;
    default:
      return `    // Step ${i + 1}: Screenshot\n    cy.screenshot();`;
  }
}).join('\n\n')}
  });
});
`;
  };

  const generatePuppeteerCode = (tc: TestCase) => {
    return `import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

${tc.steps.map((step, i) => {
  switch (step.action) {
    case 'navigate':
      return `  // Step ${i + 1}: Goto URL\n  await page.goto('${resolveNavigateUrl(step.value, tc.targetUrl)}', { waitUntil: 'networkidle2' });`;
    case 'click':
      return `  // Step ${i + 1}: Click\n  await page.waitForSelector('${step.targetSelector}');\n  await page.click('${step.targetSelector}');`;
    case 'type':
      return `  // Step ${i + 1}: Type\n  await page.type('${step.targetSelector}', '${step.value || ''}');`;
    case 'assert_visible':
      return `  // Step ${i + 1}: Assert visible\n  await page.waitForSelector('${step.targetSelector}', { visible: true });`;
    default:
      return `  // Step ${i + 1}: Delay\n  await new Promise(r => setTimeout(r, ${step.timeoutMs}));`;
  }
}).join('\n\n')}

  console.log('Test case execution completed successfully!');
  await browser.close();
})();
`;
  };

  const generateSeleniumPython = (tc: TestCase) => {
    return `from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

driver = webdriver.Chrome()
driver.maximize_window()
wait = WebDriverWait(driver, 10)

try:
${tc.steps.map((step, i) => {
  switch (step.action) {
    case 'navigate':
      return `    # Step ${i + 1}: Open target URL\n    driver.get("${resolveNavigateUrl(step.value, tc.targetUrl)}")`;
    case 'click':
      return `    # Step ${i + 1}: Click element\n    elem = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "${step.targetSelector}")))\n    elem.click()`;
    case 'type':
      return `    # Step ${i + 1}: Type input text\n    elem = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "${step.targetSelector}")))\n    elem.clear()\n    elem.send_keys("${step.value || ''}")`;
    case 'assert_visible':
      return `    # Step ${i + 1}: Assert visible\n    assert wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "${step.targetSelector}"))).is_displayed()`;
    default:
      return `    # Step ${i + 1}: Delay\n    time.sleep(${step.timeoutMs / 1000})`;
  }
}).join('\n\n')}

    print("All test assertions passed successfully!")
finally:
    driver.quit()
`;
  };

  const getCode = () => {
    switch (framework) {
      case 'playwright': return generatePlaywrightCode(testCase);
      case 'cypress': return generateCypressCode(testCase);
      case 'puppeteer': return generatePuppeteerCode(testCase);
      case 'selenium': return generateSeleniumPython(testCase);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extMap = { playwright: 'spec.ts', cypress: 'cy.js', puppeteer: 'js', selenium: 'py' };
    const blob = new Blob([getCode()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-${testCase.id}.${extMap[framework]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-scaleUp">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Export Automation Script</h3>
              <p className="text-xs text-slate-500 font-mono">{testCase.title}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Framework Selector Pills */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {[
            { id: 'playwright', label: 'Playwright (TS)' },
            { id: 'cypress', label: 'Cypress' },
            { id: 'puppeteer', label: 'Puppeteer' },
            { id: 'selenium', label: 'Selenium (Python)' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFramework(f.id as any)}
              className={`px-3 py-1.5 rounded-xl border transition-all ${
                framework === f.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20 font-bold'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Code Snippet Box */}
        <div className="relative">
          <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-xs rounded-xl overflow-x-auto max-h-[340px] leading-relaxed border border-slate-800">
            <code>{getCode()}</code>
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500 font-mono">
            {testCase.steps.length} Steps Converted
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>

            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Code'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
