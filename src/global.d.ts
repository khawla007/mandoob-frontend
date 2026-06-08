type Messages = typeof import('./messages/en/common.json') &
  typeof import('./messages/en/home.json') &
  typeof import('./messages/en/pricing.json') &
  typeof import('./messages/en/estimate.json') &
  typeof import('./messages/en/knowledge-base.json') &
  typeof import('./messages/en/legal.json') &
  typeof import('./messages/en/company-setup.json') &
  typeof import('./messages/en/apply.json');

declare interface IntlMessages extends Messages {}
