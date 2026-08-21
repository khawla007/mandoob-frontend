import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(process.cwd(), 'src/components/company-onboarding');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const forms = [
  'LegalProfileForm.tsx',
  'ShareholdersForm.tsx',
  'ActivitiesForm.tsx',
  'OfficeDetailsForm.tsx',
  'EstablishmentCardForm.tsx',
  'BankDetailsForm.tsx',
];

test('shell owns one h1 and an ordered responsive semantic step rail', () => {
  const source = read('OnboardingShell.tsx');
  assert.equal(source.match(/<h1\b/gu)?.length, 1);
  assert.match(source, /<nav[^>]*aria-label=\{labels\.navigationLabel\}/u);
  assert.match(source, /<ol\b/u);
  assert.match(source, /aria-current=\{current \? 'step' : undefined\}/u);
  assert.match(source, /overflow-x-auto/u);
  assert.match(source, /md:grid-cols-\[14rem_minmax\(0,1fr\)\]/u);
  assert.match(source, /min-w-0/u);
  assert.doesNotMatch(source, /linear-gradient|radial-gradient|metric|chart/u);
});

test('step state uses localized text plus icons and warns before dirty navigation', () => {
  const shell = read('OnboardingShell.tsx');
  assert.match(shell, /CheckCircle2/u);
  assert.match(shell, /CircleDashed/u);
  assert.match(shell, /labels\.status\[step\.status\]/u);
  assert.match(shell, /onClick=\{handleStepNavigation\}/u);
  const utilities = read('form-utils.tsx');
  assert.match(utilities, /beforeunload/u);
  assert.match(utilities, /window\.confirm/u);
});

test('all forms use RHF with independent zod validation, linked errors, and polite action state', () => {
  const utilities = read('form-utils.tsx');
  assert.match(utilities, /zodResolver/u);
  assert.match(utilities, /useActionState/u);
  assert.match(utilities, /setFocus/u);
  assert.match(utilities, /summaryRef\.current\?\.focus/u);
  assert.match(utilities, /aria-live="polite"/u);
  assert.match(utilities, /aria-atomic="true"/u);
  assert.match(utilities, /claimFormSubmission/u);
  assert.match(utilities, /preventDefault/u);
  assert.match(utilities, /motion-reduce:animate-none/u);
  assert.match(utilities, /min-h-11/u);

  for (const file of forms) {
    const source = read(file);
    assert.match(source, /useOnboardingForm/u, file);
    assert.match(source, /<Label htmlFor=/u, file);
    assert.match(source, /<OnboardingFormFeedback/u, file);
    assert.match(source, /<OnboardingSubmitButton/u, file);
    assert.match(source, /aria-describedby/u, file);
  }
});

test('group choices use fieldsets and legends rather than visual-only grouping', () => {
  const shareholders = read('ShareholdersForm.tsx');
  assert.match(shareholders, /<fieldset/u);
  assert.match(shareholders, /<legend/u);
  const activities = read('ActivitiesForm.tsx');
  assert.match(activities, /<fieldset/u);
  assert.match(activities, /<legend/u);
  const office = read('OfficeDetailsForm.tsx');
  assert.match(office, /<fieldset/u);
  assert.match(office, /<legend/u);
});

test('repeatable rows use stable field arrays and keyboard-operable reorder/delete/undo controls', () => {
  for (const file of ['ShareholdersForm.tsx', 'ActivitiesForm.tsx']) {
    const source = read(file);
    assert.match(source, /useFieldArray/u, file);
    assert.match(source, /key=\{field\.fieldKey\}/u, file);
    assert.match(source, /type="button"/u, file);
    assert.match(source, /move\(/u, file);
    assert.match(source, /remove\(/u, file);
    assert.match(source, /undo/u, file);
    assert.match(source, /min-h-11/u, file);
  }
});

test('protected values are blank inputs with masked LTR summaries only', () => {
  for (const file of ['EstablishmentCardForm.tsx', 'BankDetailsForm.tsx']) {
    const source = read(file);
    assert.match(source, /dir="ltr"/u, file);
    assert.match(source, /masked/u, file);
    assert.doesNotMatch(source, /defaultValue=\{[^}]*masked/u, file);
  }
  const bank = read('BankDetailsForm.tsx');
  assert.match(bank, /autoComplete="off"/u);
  assert.match(bank, /clearBankIdentifier/u);
  assert.match(bank, /companyNameConfirmation/u);
});

test('review links each localized readiness code and explains disabled activation', () => {
  const source = read('OnboardingReview.tsx');
  assert.match(source, /requirement\.code/u);
  assert.match(source, /href=\{sectionHref/u);
  assert.match(source, /disabled=\{blocked/u);
  assert.match(source, /aria-describedby=\{blocked \? blockerId : undefined\}/u);
  assert.match(source, /aria-live="polite"/u);
});

test('forms use logical direction-safe classes and no hardcoded visible English', () => {
  const combined = ['OnboardingShell.tsx', 'OnboardingReview.tsx', ...forms].map(read).join('\n');
  assert.match(combined, /text-start|ms-|me-|ps-|pe-/u);
  assert.doesNotMatch(combined, /\b(?:ml|mr|pl|pr)-\d/u);
  assert.doesNotMatch(combined, />\s*(?:Save|Next|Remove|Add|Review|Activate|Company)\s*</u);
});
