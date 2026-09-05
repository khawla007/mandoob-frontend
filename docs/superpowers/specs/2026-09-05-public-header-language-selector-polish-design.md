# Public Header Language Selector Polish Design

## Goal

Make the public header read as one precisely aligned navigation system and make the language control unmistakably recognizable as a dropdown. Preserve the existing Mandoob monochrome-and-orange visual language and the header's current information hierarchy.

## Decisions

- Keep one 64px sticky public header. Do not add an announcement or utility bar without content that justifies the extra height.
- Keep `Get Estimate` as the only dominant orange action and `Sign in` as a secondary text action.
- Standardize desktop navigation and utility labels at 14px, medium weight, with 44px minimum pointer targets.
- Present the public language control as a restrained outlined pill containing the language icon, full current-language label (`English` or `العربية`), and a downward chevron.
- Give the trigger distinct hover, focus, and expanded states so it reads as interactive without competing with the primary CTA.
- Show the full language label in the mobile navigation rather than reducing the control to an unexplained icon.

## Component Design

`LanguageSwitcher` remains the shared behavior component. Add an explicit public presentation variant so the public header and mobile navigation can opt into the labeled trigger and polished menu without changing the compact dashboard topbar control.

The public dropdown will:

- align to the logical end of its trigger in both LTR and RTL layouts;
- use a modestly wider menu than the trigger when necessary;
- provide 44px minimum option rows;
- retain radio semantics and the selected-language checkmark;
- use existing localized language names and pending/error messages;
- keep the existing guarded locale-change and hard-reload behavior unchanged.

Public header CSS will own sizing, border, color, and state treatment. No page-specific header markup or duplicated locale logic will be introduced.

## Responsive and Accessibility Behavior

- Desktop: icon, full language name, and chevron are visible.
- Mobile navigation: the same labeled dropdown is visible and fits within the utilities row.
- Dashboard: existing compact behavior remains unchanged.
- Trigger retains `aria-label`, `aria-busy`, disabled behavior, keyboard operation, and Radix `aria-expanded`/menu semantics.
- Focus remains visibly indicated, and selected state is communicated by radio semantics and a checkmark rather than color alone.

## Verification

- Add a failing component/contract test for the public variant's full label and chevron.
- Add a failing styling contract for 14px typography, 44px targets, outlined trigger states, and 44px menu rows.
- Run the focused language-switcher and public-navigation tests, TypeScript, lint, formatting, and diff checks.
- Visually inspect desktop English, desktop Arabic/RTL, mobile menu, expanded dropdown, hover/focus, and pending states when the local browser environment is available.
