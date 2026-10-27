export type Money = {
  amountMinor: number;
  currency: string;
};

export type TaxBasis = 'exclusive' | 'inclusive' | 'exempt' | 'zero_rated';

export type InvoiceLineAmountsInput = {
  quantity: number;
  unitAmountMinor: number;
  discountMinor: number;
  taxBasis: TaxBasis;
  vatBasisPoints: number;
};

export type InvoiceLineAmounts = {
  netMinor: number;
  vatMinor: number;
  totalMinor: number;
};

const ISO_4217_CODES = new Set(
  `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG`.split(
    ' ',
  ),
);

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const BASIS_POINT_DIVISOR = BigInt(10_000);
const LINE_AMOUNT_LIMIT = BigInt(100_000_000_000);

export function isIsoCurrency(currency: string): boolean {
  return ISO_4217_CODES.has(currency);
}

export function createMoney(amountMinor: number, currency: string): Money {
  assertSafeInteger(amountMinor, 'MONEY_AMOUNT_INVALID');
  if (!isIsoCurrency(currency)) throw new Error('CURRENCY_INVALID');
  return { amountMinor, currency };
}

export function addMoney(left: Money, right: Money): Money {
  const checkedLeft = createMoney(left.amountMinor, left.currency);
  const checkedRight = createMoney(right.amountMinor, right.currency);
  assertSameCurrency(checkedLeft.currency, checkedRight.currency);
  return checkedMoneyResult(
    BigInt(checkedLeft.amountMinor) + BigInt(checkedRight.amountMinor),
    checkedLeft.currency,
  );
}

export function subtractMoney(left: Money, right: Money): Money {
  const checkedLeft = createMoney(left.amountMinor, left.currency);
  const checkedRight = createMoney(right.amountMinor, right.currency);
  assertSameCurrency(checkedLeft.currency, checkedRight.currency);
  return checkedMoneyResult(
    BigInt(checkedLeft.amountMinor) - BigInt(checkedRight.amountMinor),
    checkedLeft.currency,
  );
}

export function assertSameCurrency(left: string, right: string): void {
  if (!isIsoCurrency(left) || !isIsoCurrency(right)) throw new Error('CURRENCY_INVALID');
  if (left !== right) throw new Error('CURRENCY_MISMATCH');
}

export function roundHalfAwayFromZero(numerator: number, denominator = 1): number {
  assertSafeInteger(numerator, 'ROUND_INPUT_INVALID');
  assertSafeInteger(denominator, 'ROUND_INPUT_INVALID');
  if (denominator <= 0) throw new Error('ROUND_INPUT_INVALID');

  const signedNumerator = BigInt(numerator);
  const divisor = BigInt(denominator);
  const negative = signedNumerator < ZERO;
  const absolute = negative ? -signedNumerator : signedNumerator;
  const quotient = absolute / divisor;
  const remainder = absolute % divisor;
  const rounded = quotient + (remainder * TWO >= divisor ? ONE : ZERO);
  return safeBigIntToNumber(negative ? -rounded : rounded, 'ROUND_RESULT_OUT_OF_RANGE');
}

export function calculateInvoiceLineAmounts(input: InvoiceLineAmountsInput): InvoiceLineAmounts {
  assertIntegerInRange(input.quantity, 1, 1_000_000, 'LINE_INPUT_INVALID');
  assertIntegerInRange(input.unitAmountMinor, 0, 100_000_000_000, 'LINE_INPUT_INVALID');
  assertIntegerInRange(input.discountMinor, 0, 100_000_000_000, 'LINE_INPUT_INVALID');
  assertIntegerInRange(input.vatBasisPoints, 0, 10_000, 'LINE_INPUT_INVALID');
  if (!['exclusive', 'inclusive', 'exempt', 'zero_rated'].includes(input.taxBasis)) {
    throw new Error('LINE_INPUT_INVALID');
  }
  if (
    ((input.taxBasis === 'exclusive' || input.taxBasis === 'inclusive') &&
      input.vatBasisPoints !== 500) ||
    ((input.taxBasis === 'exempt' || input.taxBasis === 'zero_rated') && input.vatBasisPoints !== 0)
  ) {
    throw new Error('LINE_INPUT_INVALID');
  }

  const gross = BigInt(input.quantity) * BigInt(input.unitAmountMinor);
  const discount = BigInt(input.discountMinor);
  if (discount > gross) throw new Error('DISCOUNT_EXCEEDS_BASE');
  const taxable = gross - discount;
  if (taxable > LINE_AMOUNT_LIMIT) throw new Error('LINE_AMOUNT_OUT_OF_RANGE');

  if (input.taxBasis === 'exempt' || input.taxBasis === 'zero_rated') {
    const netMinor = safeLineAmount(taxable);
    return { netMinor, vatMinor: 0, totalMinor: netMinor };
  }

  const basisPoints = BigInt(input.vatBasisPoints);
  if (input.taxBasis === 'exclusive') {
    const netMinor = safeLineAmount(taxable);
    const vatMinor = roundBigIntRatio(taxable * basisPoints, BASIS_POINT_DIVISOR);
    const totalMinor = safeLineAmount(BigInt(netMinor) + BigInt(vatMinor));
    return { netMinor, vatMinor, totalMinor };
  }

  const totalMinor = safeLineAmount(taxable);
  const netMinor = roundBigIntRatio(
    taxable * BASIS_POINT_DIVISOR,
    BASIS_POINT_DIVISOR + basisPoints,
  );
  return { netMinor, vatMinor: totalMinor - netMinor, totalMinor };
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(code);
}

function assertIntegerInRange(value: number, min: number, max: number, code: string): void {
  assertSafeInteger(value, code);
  if (value < min || value > max) throw new Error(code);
}

function checkedMoneyResult(value: bigint, currency: string): Money {
  return createMoney(safeBigIntToNumber(value, 'MONEY_OVERFLOW'), currency);
}

function safeLineAmount(value: bigint): number {
  if (value < ZERO || value > LINE_AMOUNT_LIMIT) throw new Error('LINE_AMOUNT_OUT_OF_RANGE');
  return Number(value);
}

function safeBigIntToNumber(value: bigint, code: string): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(code);
  }
  return Number(value);
}

function roundBigIntRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= ZERO) throw new Error('ROUND_INPUT_INVALID');
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return safeLineAmount(quotient + (remainder * TWO >= denominator ? ONE : ZERO));
}
