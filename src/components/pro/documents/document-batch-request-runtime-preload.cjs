// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module');
const requireFromProject = Module.createRequire(process.cwd() + '/package.json');
const React = requireFromProject('react');

const load = Module._load;
Module._load = function loadBatchRequestRuntimeDependency(request, parent, isMain) {
  if (request === '@/app/(tenant)/t/[tenant]/(pro)/documents/actions') {
    return {
      requestDocumentBatchAction: (...args) => globalThis.__batchRequestAction(...args),
    };
  }
  if (request === '@/components/ui/button') {
    return {
      Button: ({ children, size, variant, asChild, ...props }) => {
        void size;
        void variant;
        void asChild;
        return React.createElement('button', props, children);
      },
    };
  }
  if (request === '@/components/ui/dialog') {
    const box = (tag, extra = {}) =>
      function RuntimeDialogPart({ children, asChild, closeLabel, open, onOpenChange, ...props }) {
        void open;
        void onOpenChange;
        if (asChild) return children;
        return React.createElement(
          tag,
          { ...extra, ...props, 'data-close-label': closeLabel },
          children,
        );
      };
    return {
      Dialog: box('div'),
      DialogClose: box('div'),
      DialogContent: box('section'),
      DialogDescription: box('p'),
      DialogFooter: box('footer'),
      DialogHeader: box('header'),
      DialogTitle: box('h2'),
      DialogTrigger: box('div'),
    };
  }
  if (request === 'lucide-react') {
    return new Proxy({}, { get: () => (props) => React.createElement('span', props) });
  }
  return load.call(this, request, parent, isMain);
};
