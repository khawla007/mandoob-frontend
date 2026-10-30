/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload intercepts require before the runtime test loads the component. */
const Module = require('node:module');
const requireFromProject = Module.createRequire(process.cwd() + '/package.json');
const React = requireFromProject('react');
const DialogContext = React.createContext(undefined);
const load = Module._load;

const element =
  (tag) =>
  ({ children, ...props }) =>
    React.createElement(tag, props, children);

Module._load = function loadUploadDialogRuntimeDependency(request, parent, isMain) {
  if (request === 'next-intl') return { useTranslations: () => (key) => key };
  if (request === 'next/navigation') {
    return { useRouter: () => ({ refresh: () => (globalThis.__refreshes += 1) }) };
  }
  if (request === '@/components/ui/button') return { Button: element('button') };
  if (request === '@/components/ui/input') return { Input: element('input') };
  if (request === '@/components/ui/label') return { Label: element('label') };
  if (request === '@/components/ui/alert') {
    return {
      Alert: element('section'),
      AlertDescription: element('p'),
      AlertTitle: element('h3'),
    };
  }
  if (request === '@/components/ui/dialog') {
    return {
      Dialog: ({ children, open, onOpenChange }) =>
        React.createElement(DialogContext.Provider, { value: { open, onOpenChange } }, children),
      DialogTrigger: ({ children }) => {
        const state = React.useContext(DialogContext);
        return React.cloneElement(children, { onClick: () => state.onOpenChange(true) });
      },
      DialogContent: ({ children }) => {
        const state = React.useContext(DialogContext);
        return state.open
          ? React.createElement(
              'section',
              { role: 'dialog' },
              children,
              React.createElement(
                'button',
                {
                  type: 'button',
                  'aria-label': 'dialog-close',
                  onClick: () => state.onOpenChange(false),
                },
                'close',
              ),
            )
          : null;
      },
      DialogDescription: element('p'),
      DialogFooter: element('footer'),
      DialogHeader: element('header'),
      DialogTitle: element('h2'),
    };
  }
  return load.call(this, request, parent, isMain);
};
