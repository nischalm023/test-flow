import React, { useState, useEffect } from 'react';
import { ScannedElement, TestCaseStep, LiveTestState } from '../types';
import { 
  CheckCircle, ArrowRight, Plane, Lock, Mail,
  MousePointer, HelpCircle, Send
} from 'lucide-react';

interface LivePageCanvasProps {
  sampleKey?: string;
  url: string;
  title: string;
  elements: ScannedElement[];
  onSelectElement?: (element: ScannedElement) => void;
  selectedElementId?: string;
  hoveredElementId?: string;
  onHoverElement?: (elementId?: string) => void;
  interactiveMode?: 'inspect' | 'simulate';
  activeStep?: TestCaseStep;
  simulatedCursorPos?: { x: number; y: number; visible: boolean; clicking?: boolean; typingText?: string };
  testState?: LiveTestState;
  onUpdateTestState?: (updater: (prev: any) => any) => void;
}

export const LivePageCanvas: React.FC<LivePageCanvasProps> = ({
  sampleKey = 'saas-login',
  url,
  title,
  elements,
  onSelectElement,
  selectedElementId,
  hoveredElementId,
  onHoverElement,
  interactiveMode = 'inspect',
  activeStep,
  simulatedCursorPos,
  testState = {} as LiveTestState,
  onUpdateTestState,
}) => {
  // Local state for interactive page controls
  const [localFormData, setLocalFormData] = useState<Record<string, string>>({
    'input-work-email': '',
    'input-user-password': '',
    'input-mfa-code': '',
    'input-origin': 'SFO - San Francisco',
    'input-destination': 'HND - Tokyo Haneda',
    'input-flight-date': '2026-09-15',
    'input-ticket-subject': '',
    'input-component-name': '',
    'input-ticket-details': ''
  });

  const [loginSuccess, setLoginSuccess] = useState<boolean>(!!testState.loginAuthenticated);
  const [ticketDone, setTicketDone] = useState<boolean>(!!testState.ticketSubmitted);
  const [flightDone, setFlightDone] = useState<boolean>(!!testState.flightSearched);

  // Sync with test state if passed from test runner
  useEffect(() => {
    if (testState.loginAuthenticated !== undefined) setLoginSuccess(testState.loginAuthenticated);
    if (testState.ticketSubmitted !== undefined) setTicketDone(testState.ticketSubmitted);
    if (testState.flightSearched !== undefined) setFlightDone(testState.flightSearched);
    if (testState.formData) {
      setLocalFormData(prev => ({ ...prev, ...testState.formData }));
    }
  }, [testState]);

  const handleInputChange = (fieldId: string, val: string) => {
    setLocalFormData(prev => ({ ...prev, [fieldId]: val }));
    if (onUpdateTestState) {
      onUpdateTestState(prev => ({
        ...prev,
        formData: { ...(prev?.formData || {}), [fieldId]: val }
      }));
    }
  };

  const getElementHighlightClass = (selector: string, elemId?: string) => {
    const isSelected = selectedElementId === elemId;
    const isHovered = hoveredElementId === elemId;
    const isStepTarget = activeStep && activeStep.targetSelector === selector;

    if (isStepTarget) {
      return 'ring-2 ring-amber-500 bg-amber-50/50 shadow-md scale-[1.01] transition-all duration-200';
    }
    if (isSelected) {
      return 'ring-2 ring-blue-600 bg-blue-50/40 shadow-sm';
    }
    if (isHovered && interactiveMode === 'inspect') {
      return 'ring-1.5 ring-blue-400 bg-blue-50/20 cursor-crosshair';
    }
    return '';
  };

  const findElementBySelector = (selector: string) => {
    return elements.find(e => e.selector === selector || e.name === selector);
  };

  const handleClickElementWrapper = (selector: string, e: React.MouseEvent) => {
    if (interactiveMode === 'inspect') {
      e.stopPropagation();
      const elem = findElementBySelector(selector);
      if (elem && onSelectElement) {
        onSelectElement(elem);
      }
    }
  };

  const handleMouseEnterWrapper = (selector: string) => {
    if (interactiveMode === 'inspect' && onHoverElement) {
      const elem = findElementBySelector(selector);
      if (elem) onHoverElement(elem.id);
    }
  };

  const handleMouseLeaveWrapper = () => {
    if (interactiveMode === 'inspect' && onHoverElement) {
      onHoverElement(undefined);
    }
  };

  return (
    <div id="live-page-canvas-container" className="relative w-full h-full bg-slate-50 overflow-y-auto select-none font-sans text-slate-800">
      {/* Visual Cursor overlay in simulation mode */}
      {simulatedCursorPos && simulatedCursorPos.visible && (
        <div 
          className="pointer-events-none fixed z-50 transition-all duration-300 ease-out flex items-start gap-1"
          style={{
            left: `${simulatedCursorPos.x}px`,
            top: `${simulatedCursorPos.y}px`,
            transform: 'translate(-3px, -3px)'
          }}
        >
          <div className="relative">
            <MousePointer className={`w-6 h-6 text-indigo-600 drop-shadow-md transition-transform duration-150 ${simulatedCursorPos.clicking ? 'scale-75 text-amber-500' : ''}`} />
            {simulatedCursorPos.clicking && (
              <span className="absolute -inset-2 rounded-full bg-amber-400/40 animate-ping" />
            )}
          </div>
          {simulatedCursorPos.typingText && (
            <span className="px-2 py-0.5 text-xs font-mono bg-slate-900 text-slate-100 rounded-md shadow-lg border border-slate-700 animate-pulse whitespace-nowrap">
              Typing: "{simulatedCursorPos.typingText}"
            </span>
          )}
        </div>
      )}

      {/* SaaS Auth Sample */}
      {sampleKey === 'saas-login' && (
        <div className="max-w-md mx-auto p-6 md:p-10 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-5">
            <div 
              id="auth-heading"
              onClick={(e) => handleClickElementWrapper('#auth-heading', e)}
              onMouseEnter={() => handleMouseEnterWrapper('#auth-heading')}
              onMouseLeave={handleMouseLeaveWrapper}
              className={`text-center space-y-1 ${getElementHighlightClass('#auth-heading', 'elem-auth-1')}`}
            >
              <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center mx-auto shadow-xs">
                <Lock className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 pt-2">Sign in to CloudScale</h1>
              <p className="text-xs text-slate-500">Enterprise Cloud Observability & Automation</p>
            </div>

            {loginSuccess && (
              <div id="auth-success-banner" className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 animate-fadeIn">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Authentication Succeeded! Session token granted for {localFormData['input-work-email'] || 'developer'}.</span>
              </div>
            )}

            <button
              id="btn-oauth-google"
              onClick={(e) => handleClickElementWrapper('#btn-oauth-google', e)}
              onMouseEnter={() => handleMouseEnterWrapper('#btn-oauth-google')}
              onMouseLeave={handleMouseLeaveWrapper}
              className={`w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors ${getElementHighlightClass('#btn-oauth-google', 'elem-auth-6')}`}
            >
              <Mail className="w-4 h-4 text-indigo-600" />
              <span>Continue with Google Workspace</span>
            </button>

            <div className="relative flex items-center justify-center text-xs text-slate-400">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-2 absolute text-[11px] uppercase tracking-wider font-mono">Or with credentials</span>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Corporate Email</label>
                <input
                  id="input-work-email"
                  type="email"
                  placeholder="alex.rivera@enterprisecorp.com"
                  value={localFormData['input-work-email']}
                  onChange={(e) => handleInputChange('input-work-email', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-work-email', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-work-email')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${getElementHighlightClass('#input-work-email', 'elem-auth-2')}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account Password</label>
                <input
                  id="input-user-password"
                  type="password"
                  placeholder="••••••••••••"
                  value={localFormData['input-user-password']}
                  onChange={(e) => handleInputChange('input-user-password', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-user-password', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-user-password')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${getElementHighlightClass('#input-user-password', 'elem-auth-3')}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cluster Region</label>
                <select
                  id="select-datacenter"
                  onClick={(e) => handleClickElementWrapper('#select-datacenter', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#select-datacenter')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${getElementHighlightClass('#select-datacenter', 'elem-auth-4')}`}
                >
                  <option value="us-east">US-East (N. Virginia)</option>
                  <option value="eu-central">EU-Central (Frankfurt)</option>
                  <option value="ap-south">AP-South (Singapore)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">2FA Authenticator OTP</label>
                <input
                  id="input-mfa-code"
                  type="text"
                  placeholder="6-digit OTP (e.g. 849201)"
                  value={localFormData['input-mfa-code']}
                  onChange={(e) => handleInputChange('input-mfa-code', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-mfa-code', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-mfa-code')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${getElementHighlightClass('#input-mfa-code', 'elem-auth-5')}`}
                />
              </div>

              <button
                id="btn-submit-login"
                onClick={(e) => {
                  handleClickElementWrapper('#btn-submit-login', e);
                  setLoginSuccess(true);
                  if (onUpdateTestState) {
                    onUpdateTestState(prev => ({ ...prev, loginAuthenticated: true }));
                  }
                }}
                onMouseEnter={() => handleMouseEnterWrapper('#btn-submit-login')}
                onMouseLeave={handleMouseLeaveWrapper}
                className={`w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 ${getElementHighlightClass('#btn-submit-login', 'elem-auth-7')}`}
              >
                <span>Authenticate & Enter Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Travel Flight Search Sample */}
      {sampleKey === 'travel-booking' && (
        <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div 
              id="flight-finder-title"
              onClick={(e) => handleClickElementWrapper('#flight-finder-title', e)}
              onMouseEnter={() => handleMouseEnterWrapper('#flight-finder-title')}
              onMouseLeave={handleMouseLeaveWrapper}
              className={`flex items-center gap-3 ${getElementHighlightClass('#flight-finder-title', 'elem-tb-1')}`}
            >
              <div className="p-2.5 bg-sky-600 text-white rounded-xl">
                <Plane className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">SkyRoute Airline Flight Finder</h1>
                <p className="text-xs text-slate-500">Real-time Global Inventory • Lowest Fare Guarantee</p>
              </div>
            </div>

            {flightDone && (
              <div id="flight-results-banner" className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-sky-950 text-xs space-y-1 animate-fadeIn">
                <div className="font-bold flex items-center gap-1.5 text-sky-900">
                  <CheckCircle className="w-4 h-4 text-sky-600" />
                  Found 14 Available Non-Stop Flights
                </div>
                <p className="text-sky-800">
                  {localFormData['input-origin']} ➔ {localFormData['input-destination']} on {localFormData['input-flight-date']} • Starting from $482.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Departure Origin Airport</label>
                <input
                  id="input-origin"
                  type="text"
                  placeholder="SFO - San Francisco Intl"
                  value={localFormData['input-origin']}
                  onChange={(e) => handleInputChange('input-origin', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-origin', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-origin')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 ${getElementHighlightClass('#input-origin', 'elem-tb-2')}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Arrival Destination Airport</label>
                <input
                  id="input-destination"
                  type="text"
                  placeholder="HND - Tokyo Haneda"
                  value={localFormData['input-destination']}
                  onChange={(e) => handleInputChange('input-destination', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-destination', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-destination')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 ${getElementHighlightClass('#input-destination', 'elem-tb-3')}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Travel Date</label>
                <input
                  id="input-flight-date"
                  type="date"
                  value={localFormData['input-flight-date']}
                  onChange={(e) => handleInputChange('input-flight-date', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-flight-date', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-flight-date')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 ${getElementHighlightClass('#input-flight-date', 'elem-tb-4')}`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cabin Class</label>
                <select
                  id="select-cabin-class"
                  onClick={(e) => handleClickElementWrapper('#select-cabin-class', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#select-cabin-class')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 ${getElementHighlightClass('#select-cabin-class', 'elem-tb-5')}`}
                >
                  <option value="economy">Economy Standard</option>
                  <option value="premium">Premium Economy</option>
                  <option value="business">Business Flagship</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                id="btn-add-passenger"
                onClick={(e) => handleClickElementWrapper('#btn-add-passenger', e)}
                onMouseEnter={() => handleMouseEnterWrapper('#btn-add-passenger')}
                onMouseLeave={handleMouseLeaveWrapper}
                className={`py-2 px-3 text-xs font-medium border border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors ${getElementHighlightClass('#btn-add-passenger', 'elem-tb-6')}`}
              >
                + Add Passenger (1 Selected)
              </button>

              <button
                id="btn-search-flights"
                onClick={(e) => {
                  handleClickElementWrapper('#btn-search-flights', e);
                  setFlightDone(true);
                  if (onUpdateTestState) {
                    onUpdateTestState(prev => ({ ...prev, flightSearched: true }));
                  }
                }}
                onMouseEnter={() => handleMouseEnterWrapper('#btn-search-flights')}
                onMouseLeave={handleMouseLeaveWrapper}
                className={`flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 ${getElementHighlightClass('#btn-search-flights', 'elem-tb-7')}`}
              >
                <span>Search Best Available Flights</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Ticket Desk Sample */}
      {sampleKey === 'support-ticket' && (
        <div className="max-w-2xl mx-auto p-6 md:p-8 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div 
              id="ticket-page-title"
              onClick={(e) => handleClickElementWrapper('#ticket-page-title', e)}
              onMouseEnter={() => handleMouseEnterWrapper('#ticket-page-title')}
              onMouseLeave={handleMouseLeaveWrapper}
              className={`flex items-center gap-3 ${getElementHighlightClass('#ticket-page-title', 'elem-sup-1')}`}
            >
              <div className="p-2.5 bg-rose-600 text-white rounded-xl">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">HelpDesk Pro Incident Submission</h1>
                <p className="text-xs text-slate-500">Tier-3 Escalation Portal • SLA Monitored</p>
              </div>
            </div>

            {ticketDone && (
              <div id="ticket-success-banner" className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 animate-fadeIn">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Ticket #INC-8029 Created! Support on-call engineer assigned with 15-minute SLA.</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Issue Subject *</label>
                <input
                  id="input-ticket-subject"
                  type="text"
                  placeholder="e.g. Database connection timeouts on primary API cluster"
                  value={localFormData['input-ticket-subject']}
                  onChange={(e) => handleInputChange('input-ticket-subject', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-ticket-subject', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-ticket-subject')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 ${getElementHighlightClass('#input-ticket-subject', 'elem-sup-2')}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Incident Severity</label>
                  <select
                    id="select-severity"
                    onClick={(e) => handleClickElementWrapper('#select-severity', e)}
                    onMouseEnter={() => handleMouseEnterWrapper('#select-severity')}
                    onMouseLeave={handleMouseLeaveWrapper}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 ${getElementHighlightClass('#select-severity', 'elem-sup-3')}`}
                  >
                    <option value="p1">P1 - Critical Outage (SLA 15m)</option>
                    <option value="p2">P2 - Major Degradation (SLA 1h)</option>
                    <option value="p3">P3 - Moderate Defect</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Affected Component</label>
                  <input
                    id="input-component-name"
                    type="text"
                    placeholder="e.g. Auth Gateway, Payment API"
                    value={localFormData['input-component-name']}
                    onChange={(e) => handleInputChange('input-component-name', e.target.value)}
                    onClick={(e) => handleClickElementWrapper('#input-component-name', e)}
                    onMouseEnter={() => handleMouseEnterWrapper('#input-component-name')}
                    onMouseLeave={handleMouseLeaveWrapper}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 ${getElementHighlightClass('#input-component-name', 'elem-sup-4')}`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Incident Details & Reproduction</label>
                <input
                  id="input-ticket-details"
                  type="text"
                  placeholder="Paste stack trace or describe steps..."
                  value={localFormData['input-ticket-details']}
                  onChange={(e) => handleInputChange('input-ticket-details', e.target.value)}
                  onClick={(e) => handleClickElementWrapper('#input-ticket-details', e)}
                  onMouseEnter={() => handleMouseEnterWrapper('#input-ticket-details')}
                  onMouseLeave={handleMouseLeaveWrapper}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 ${getElementHighlightClass('#input-ticket-details', 'elem-sup-5')}`}
                />
              </div>

              <button
                id="btn-submit-ticket"
                onClick={(e) => {
                  handleClickElementWrapper('#btn-submit-ticket', e);
                  setTicketDone(true);
                  if (onUpdateTestState) {
                    onUpdateTestState(prev => ({ ...prev, ticketSubmitted: true }));
                  }
                }}
                onMouseEnter={() => handleMouseEnterWrapper('#btn-submit-ticket')}
                onMouseLeave={handleMouseLeaveWrapper}
                className={`w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 ${getElementHighlightClass('#btn-submit-ticket', 'elem-sup-6')}`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch & Open Incident Ticket</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback for generic URL / custom scanned elements */}
      {!['saas-login', 'travel-booking', 'support-ticket'].includes(sampleKey) && (
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h1 className="text-lg font-bold text-slate-900">{title || 'Scanned Web Document'}</h1>
              <p className="text-xs text-slate-500 font-mono">{url}</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Interactive DOM Elements extracted from target page ({elements.length} discovered):
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {elements.map((elem) => (
                  <div
                    key={elem.id}
                    onClick={(e) => handleClickElementWrapper(elem.selector, e)}
                    onMouseEnter={() => handleMouseEnterWrapper(elem.selector)}
                    onMouseLeave={handleMouseLeaveWrapper}
                    className={`p-3 rounded-lg border bg-slate-50/70 cursor-pointer transition-all ${getElementHighlightClass(elem.selector, elem.id)}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 truncate">{elem.text || elem.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{elem.tag}</span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 truncate mt-1">{elem.selector}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
