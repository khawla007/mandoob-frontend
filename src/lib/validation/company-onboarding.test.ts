import assert from 'node:assert/strict';
import test from 'node:test';

const command = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  companyId: '10000000-0000-4000-8000-000000000002',
  operationId: '10000000-0000-4000-8000-000000000003',
  expectedVersion: 0,
};

test('legal section normalizes fields and enforces product boundaries', async () => {
  const { companyLegalSectionSchema } = await import('./company-onboarding');
  const valid = {
    ...command,
    companyName: '  Acme   Trading LLC ',
    displayName: '  Acme  ',
    jurisdictionType: 'mainland',
    licensingAuthority: '  Dubai Economy  ',
    legalStructure: 'limited_liability_company',
    tradeLicenseNo: ' ded / 123 ',
    licenseExpiry: '2028-02-29',
    completeSection: true,
  };

  assert.deepEqual(companyLegalSectionSchema.parse(valid), {
    ...valid,
    companyName: 'Acme Trading LLC',
    displayName: 'Acme',
    licensingAuthority: 'Dubai Economy',
    tradeLicenseNo: 'DED / 123',
  });

  for (const patch of [
    { companyName: 'A' },
    { companyName: 'x'.repeat(201) },
    { displayName: 'x'.repeat(161) },
    { jurisdictionType: 'federal' },
    { licensingAuthority: 'x'.repeat(121) },
    { legalStructure: 'Not Snake Case' },
    { tradeLicenseNo: 'DED_123' },
    { licenseExpiry: '2027-02-29' },
    { licenseExpiry: '0000-01-01' },
  ]) {
    assert.equal(companyLegalSectionSchema.safeParse({ ...valid, ...patch }).success, false);
  }
  for (const jurisdictionType of ['mainland', 'free_zone', 'offshore']) {
    assert.equal(companyLegalSectionSchema.safeParse({ ...valid, jurisdictionType }).success, true);
  }
});

test('shareholders enforce variants, unique ids, and exact decimal totals', async () => {
  const { companyShareholdersSectionSchema } = await import('./company-onboarding');
  const individual = {
    id: '20000000-0000-4000-8000-000000000001',
    kind: 'individual',
    fullName: '  Aisha   Ali ',
    nationalityCode: 'ae',
    passportNumber: ' p-123 ',
    ownershipPercent: '99.9999',
    sortOrder: 0,
  };
  const company = {
    id: '20000000-0000-4000-8000-000000000002',
    kind: 'company',
    legalName: 'Holding LLC',
    countryOfIncorporation: 'gb',
    registrationNumber: ' reg-9 ',
    ownershipPercent: '0.0001',
    sortOrder: 1,
  };
  const input = { ...command, shareholders: [individual, company], completeSection: true };

  const parsed = companyShareholdersSectionSchema.parse(input);
  assert.equal(parsed.shareholders[0]?.ownershipPercent, '99.9999');
  assert.equal(parsed.shareholders[0]?.kind, 'individual');
  assert.equal(parsed.shareholders[1]?.kind, 'company');

  for (const shareholders of [
    [{ ...individual, ownershipPercent: '100.0001' }],
    [{ ...individual, id: company.id }, company],
    [
      { ...individual, sortOrder: 0 },
      { ...company, sortOrder: 0 },
    ],
    [
      { ...individual, passportNumber: 'P-123' },
      { ...individual, id: company.id },
    ],
    [
      { ...company, registrationNumber: 'REG-9' },
      { ...company, id: individual.id },
    ],
  ]) {
    assert.equal(
      companyShareholdersSectionSchema.safeParse({ ...input, shareholders }).success,
      false,
    );
  }
  assert.equal(
    companyShareholdersSectionSchema.safeParse({
      ...input,
      shareholders: [{ ...individual, ownershipPercent: '99.9999' }],
      completeSection: false,
    }).success,
    true,
  );
  assert.equal(
    companyShareholdersSectionSchema.safeParse({
      ...input,
      shareholders: [{ ...individual, ownershipPercent: '100.0000' }],
    }).success,
    true,
  );
});

test('activities reject duplicates and require exactly one primary when complete', async () => {
  const { companyActivitiesSectionSchema } = await import('./company-onboarding');
  const activity = {
    id: '30000000-0000-4000-8000-000000000001',
    activityCode: ' 6201-A ',
    activityName: ' Software development ',
    authorityName: ' Dubai Economy ',
    isPrimary: true,
    sortOrder: 0,
  };
  const input = { ...command, activities: [activity], completeSection: true };
  const parsed = companyActivitiesSectionSchema.parse(input);
  assert.equal(parsed.activities[0]?.activityCode, '6201-A');

  assert.equal(
    companyActivitiesSectionSchema.safeParse({
      ...input,
      activities: [activity, { ...activity, id: undefined, sortOrder: 1 }],
    }).success,
    false,
  );
  assert.equal(
    companyActivitiesSectionSchema.safeParse({
      ...input,
      activities: [{ ...activity, isPrimary: false }],
    }).success,
    false,
  );
  assert.equal(
    companyActivitiesSectionSchema.safeParse({ ...input, activities: [], completeSection: false })
      .success,
    true,
  );
});

test('office schema enforces every office-type conditional branch', async () => {
  const { companyOfficeSectionSchema } = await import('./company-onboarding');
  const common = {
    ...command,
    addressLine2: '',
    postalCode: '',
    countryCode: 'AE',
    completeSection: true,
  };
  const physical = {
    ...common,
    officeType: 'physical',
    addressLine1: 'Office 10',
    area: 'Business Bay',
    city: 'Dubai',
    emirate: 'Dubai',
    providerName: '',
    leaseReference: 'EJARI-1',
    leaseExpiry: '2028-01-01',
  };
  const flexi = {
    ...physical,
    officeType: 'flexi_desk',
    addressLine1: '',
    providerName: 'Workspace Provider',
  };
  const virtual = {
    ...physical,
    officeType: 'virtual',
    addressLine1: '',
    area: '',
    providerName: 'Virtual Office LLC',
    leaseReference: '',
    leaseExpiry: '',
  };

  for (const valid of [physical, flexi, virtual]) {
    assert.equal(companyOfficeSectionSchema.safeParse(valid).success, true);
  }
  for (const invalid of [
    { ...physical, addressLine1: '' },
    { ...physical, leaseReference: '' },
    { ...physical, leaseExpiry: '' },
    { ...flexi, providerName: '' },
    { ...virtual, providerName: '' },
    { ...virtual, leaseReference: 'PAIR', leaseExpiry: '' },
    { ...virtual, leaseReference: '', leaseExpiry: '2028-01-01' },
    { ...physical, countryCode: 'US' },
  ]) {
    assert.equal(companyOfficeSectionSchema.safeParse(invalid).success, false);
  }
});

test('establishment and bank inputs enforce protected identifier boundaries', async () => {
  const { companyBankSectionSchema, companyEstablishmentSectionSchema } =
    await import('./company-onboarding');

  assert.equal(
    companyEstablishmentSectionSchema.safeParse({
      ...command,
      establishmentCardNumber: ' EST-1234 ',
      establishmentCardExpiry: '2028-02-29',
      completeSection: true,
    }).success,
    true,
  );
  assert.equal(
    companyEstablishmentSectionSchema.safeParse({
      ...command,
      establishmentCardNumber: '',
      establishmentCardExpiry: '0000-01-01',
      completeSection: true,
    }).success,
    false,
  );

  const bank = {
    ...command,
    bankName: 'Emirates Bank',
    branchName: '',
    accountHolderName: 'Acme Trading LLC',
    currencyCode: 'AED',
    swiftBic: 'EBILAEAD',
    iban: 'AE070331234567890123456',
    accountNumber: '',
    completeSection: true,
  };
  assert.equal(companyBankSectionSchema.safeParse(bank).success, true);
  assert.equal(
    companyBankSectionSchema.safeParse({ ...bank, swiftBic: 'EBILAEAD123' }).success,
    true,
  );
  for (const patch of [
    { currencyCode: 'USD' },
    { swiftBic: 'BAD' },
    { iban: 'AE123' },
    { iban: '', accountNumber: '' },
    { accountNumber: '1' },
    { bankName: 'x'.repeat(121) },
  ]) {
    assert.equal(companyBankSectionSchema.safeParse({ ...bank, ...patch }).success, false);
  }
});

test('commands require UUID operation ids, nonnegative versions, and confirmed clear/reopen', async () => {
  const { clearCompanyBankIdentifierSchema, reopenCompanyOnboardingSectionSchema } =
    await import('./company-onboarding');
  const clear = {
    ...command,
    identifier: 'iban',
    companyNameConfirmation: 'Acme Trading LLC',
    expectedCompanyName: 'Acme Trading LLC',
  };
  assert.equal(clearCompanyBankIdentifierSchema.safeParse(clear).success, true);
  for (const patch of [
    { operationId: 'not-a-uuid' },
    { expectedVersion: -1 },
    { companyNameConfirmation: 'Wrong company' },
    { identifier: 'swift' },
  ]) {
    assert.equal(clearCompanyBankIdentifierSchema.safeParse({ ...clear, ...patch }).success, false);
  }

  const reopen = {
    ...command,
    section: 'legal',
    reason: 'The licensing authority changed.',
  };
  assert.equal(reopenCompanyOnboardingSectionSchema.safeParse(reopen).success, true);
  assert.equal(
    reopenCompanyOnboardingSectionSchema.safeParse({ ...reopen, reason: 'no' }).success,
    false,
  );
  assert.equal(
    reopenCompanyOnboardingSectionSchema.safeParse({ ...reopen, reason: 'x'.repeat(501) }).success,
    false,
  );
});
