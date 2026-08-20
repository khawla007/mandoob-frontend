import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./CompanyTypeahead.tsx', import.meta.url), 'utf8');
const customerFields = readFileSync(new URL('./UserCustomerFields.tsx', import.meta.url), 'utf8');
const employeeFields = readFileSync(new URL('./UserEmployeeFields.tsx', import.meta.url), 'utf8');
const changeRolePanel = readFileSync(new URL('./ChangeRolePanel.tsx', import.meta.url), 'utf8');

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  assert.ok(channels && channels.length === 3);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function blend(foreground: string, background: string, opacity: number): string {
  const foregroundChannels = foreground
    .slice(1)
    .match(/.{2}/gu)
    ?.map((part) => Number.parseInt(part, 16));
  const backgroundChannels = background
    .slice(1)
    .match(/.{2}/gu)
    ?.map((part) => Number.parseInt(part, 16));
  assert.ok(foregroundChannels && backgroundChannels);
  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(channel * opacity + backgroundChannels[index] * (1 - opacity))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

test('company typeahead popover uses the same localized name as its visible field label', () => {
  assert.match(component, /accessibleLabel:\s*string/u);
  assert.match(component, /<PopoverContent[^>]*aria-label=\{accessibleLabel\}/u);
  assert.match(customerFields, /accessibleLabel=\{t\('user\.fields\.linkedCompany'\)\}/u);
  assert.match(employeeFields, /accessibleLabel=\{t\('user\.fields\.employer'\)\}/u);
  assert.match(changeRolePanel, /accessibleLabel=\{t\('user\.fields\.linkedCompany'\)\}/u);
  assert.match(
    changeRolePanel,
    /accessibleLabel=\{t\('user\.roleChange\.companyRequiredLabel'\)\}/u,
  );
});

test('company status copy uses scoped foreground contrast in selected rows for both themes', () => {
  assert.match(component, /className="text-foreground\/70 ml-2 text-xs"/u);

  const lightStatus = blend('#0a0a0a', '#f5f5f5', 0.7);
  const darkStatus = blend('#fafafa', '#262626', 0.7);
  assert.ok(contrastRatio(lightStatus, '#f5f5f5') >= 4.5);
  assert.ok(contrastRatio(darkStatus, '#262626') >= 4.5);
});
