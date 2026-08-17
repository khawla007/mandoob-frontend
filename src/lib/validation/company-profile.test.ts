import assert from 'node:assert/strict';
import test from 'node:test';

test('company profile accepts and trims the four Step 1 fields', async () => {
  const { companyProfileSchema } = await import('./company-profile');
  assert.deepEqual(
    companyProfileSchema.parse({
      company_name: '  Acme Trading LLC  ',
      trade_license_no: ' DED-123 ',
      jurisdiction: ' Dubai Mainland ',
      license_expiry: '2027-08-17',
    }),
    {
      company_name: 'Acme Trading LLC',
      trade_license_no: 'DED-123',
      jurisdiction: 'Dubai Mainland',
      license_expiry: '2027-08-17',
    },
  );
});

test('company profile reports field-specific validation failures', async () => {
  const { companyProfileSchema } = await import('./company-profile');
  const parsed = companyProfileSchema.safeParse({
    company_name: 'A',
    trade_license_no: 'x'.repeat(65),
    jurisdiction: 'x'.repeat(121),
    license_expiry: '17/08/2027',
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const errors = parsed.error.flatten().fieldErrors;
  assert.ok(errors.company_name?.length);
  assert.ok(errors.trade_license_no?.length);
  assert.ok(errors.jurisdiction?.length);
  assert.ok(errors.license_expiry?.length);
});

test('company profile rejects impossible dates and accepts Gregorian leap days', async () => {
  const { companyProfileSchema } = await import('./company-profile');
  const base = {
    company_name: 'Acme Trading LLC',
    trade_license_no: '',
    jurisdiction: '',
  };

  assert.equal(
    companyProfileSchema.safeParse({ ...base, license_expiry: '2028-02-29' }).success,
    true,
  );
  for (const license_expiry of ['2027-02-29', '2027-04-31', '2027-13-01']) {
    assert.equal(companyProfileSchema.safeParse({ ...base, license_expiry }).success, false);
  }
});

test('company profile rejects PostgreSQL year zero and accepts year one', async () => {
  const { companyProfileSchema } = await import('./company-profile');
  const base = { company_name: 'Acme Trading LLC', trade_license_no: '', jurisdiction: '' };

  assert.equal(
    companyProfileSchema.safeParse({ ...base, license_expiry: '0000-01-01' }).success,
    false,
  );
  assert.equal(
    companyProfileSchema.safeParse({ ...base, license_expiry: '0001-01-01' }).success,
    true,
  );
});
