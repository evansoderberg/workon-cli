import {
  createPrompt,
  useState,
  useEffect,
  useKeypress,
  usePrefix,
  usePagination,
  useRef,
  isEnterKey,
  isUpKey,
  isDownKey,
  isBackspaceKey,
  makeTheme,
} from '@inquirer/core';
import { cursorHide } from '@inquirer/ansi';
import figures from '@inquirer/figures';

export interface BrowseItem {
  id: string;
  name: string;
  /** 'container' items can be drilled into; 'leaf' items are selectable */
  type: 'container' | 'leaf';
}

export interface HierarchyBrowserConfig {
  message: string;
  items: BrowseItem[];
  /** Called when drilling into a container item. Return its children. */
  onDrillDown: (item: BrowseItem) => Promise<BrowseItem[]>;
  pageSize?: number;
  /** Pre-populated navigation stack (for starting mid-hierarchy) */
  initialStack?: StackEntry[];
  /** Pre-populated breadcrumb trail (should match initialStack labels) */
  initialBreadcrumb?: string[];
  /**
   * Called when left arrow is pressed but the stack is empty.
   * Should return the parent stack entries and breadcrumb to navigate into.
   * This allows lazy-loading parent hierarchy only when the user needs it.
   */
  onBack?: () => Promise<{ stack: StackEntry[]; breadcrumb: string[] }>;
}

export interface StackEntry {
  items: BrowseItem[];
  active: number;
  label: string;
}

const browseTheme = {
  icon: { cursor: figures.pointer },
  style: {
    highlight: (text: string) => `\x1b[36m${text}\x1b[0m`, // cyan
    help: (text: string) => `\x1b[2m${text}\x1b[0m`, // dim
    message: (text: string, status: string) => {
      if (status === 'done') return `\x1b[1m${text}\x1b[0m`;
      return `\x1b[1m${text}\x1b[0m`;
    },
    answer: (text: string) => `\x1b[36m${text}\x1b[0m`,
  },
};

const hierarchyBrowser = createPrompt<BrowseItem, HierarchyBrowserConfig>((config, done) => {
  const { pageSize = 10 } = config;
  const theme = makeTheme(browseTheme, {});
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const prefix = usePrefix({ status: status === 'loading' ? 'loading' : status === 'done' ? 'done' : 'idle' });
  const [items, setItems] = useState<BrowseItem[]>(config.items);
  const [active, setActive] = useState(0);
  const [stack, setStack] = useState<StackEntry[]>(config.initialStack ?? []);
  const [breadcrumb, setBreadcrumb] = useState<string[]>(config.initialBreadcrumb ?? []);
  const [doneName, setDoneName] = useState('');
  const onDrillDownRef = useRef(config.onDrillDown);
  onDrillDownRef.current = config.onDrillDown;
  const onBackRef = useRef(config.onBack);
  onBackRef.current = config.onBack;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  useKeypress(async (key, rl) => {
    if (status === 'loading' || status === 'done') return;

    clearTimeout(searchTimeoutRef.current);

    if (isEnterKey(key) || key.name === 'right') {
      const item = items[active];
      if (!item) return;

      if (item.type === 'container') {
        // Drill into container
        setSearchTerm('');
        rl.clearLine(0);
        setStatus('loading');
        try {
          const children = await onDrillDownRef.current(item);
          // Push current state onto stack
          setStack([...stack, { items, active, label: item.name }]);
          setBreadcrumb([...breadcrumb, item.name]);
          setItems(children);
          setActive(0);
          setStatus('idle');
        } catch {
          setStatus('idle');
        }
      } else if (isEnterKey(key)) {
        // Select leaf item
        setDoneName(item.name);
        setStatus('done');
        done(item);
      }
    } else if (key.name === 'left') {
      // Go back
      setSearchTerm('');
      rl.clearLine(0);
      if (stack.length > 0) {
        const prev = stack[stack.length - 1]!;
        setStack(stack.slice(0, -1));
        setBreadcrumb(breadcrumb.slice(0, -1));
        setItems(prev.items);
        setActive(prev.active);
      } else if (onBackRef.current) {
        // Lazy-load parent hierarchy
        setStatus('loading');
        try {
          const parent = await onBackRef.current();
          // The last stack entry becomes the current view's parent
          // Pop it to become the new current items
          const newStack = parent.stack;
          const newBreadcrumb = parent.breadcrumb;
          if (newStack.length > 0) {
            const current = newStack[newStack.length - 1]!;
            setStack(newStack.slice(0, -1));
            setBreadcrumb(newBreadcrumb.slice(0, -1));
            setItems(current.items);
            setActive(current.active);
          }
          setStatus('idle');
        } catch {
          setStatus('idle');
        }
      }
    } else if (isUpKey(key)) {
      rl.clearLine(0);
      setSearchTerm('');
      if (active > 0) setActive(active - 1);
    } else if (isDownKey(key)) {
      rl.clearLine(0);
      setSearchTerm('');
      if (active < items.length - 1) setActive(active + 1);
    } else if (isBackspaceKey(key)) {
      rl.clearLine(0);
      setSearchTerm('');
    } else {
      // Type-to-search: match item names by what the user has typed
      const term = rl.line.toLowerCase();
      if (term) {
        const matchIndex = items.findIndex(item =>
          item.name.toLowerCase().startsWith(term),
        );
        if (matchIndex !== -1) {
          setActive(matchIndex);
        }
        setSearchTerm(term);
        searchTimeoutRef.current = setTimeout(() => {
          rl.clearLine(0);
          setSearchTerm('');
        }, 700);
      }
    }
  });

  useEffect(() => () => {
    clearTimeout(searchTimeoutRef.current);
  }, []);

  const message = theme.style.message(config.message, status);

  if (status === 'done') {
    const trail = [...breadcrumb, doneName].join(' > ');
    return [prefix, message, theme.style.answer(trail)].join(' ');
  }

  const crumbLine = breadcrumb.length > 0
    ? `  ${theme.style.help(breadcrumb.join(' > '))}\n`
    : '';

  if (status === 'loading') {
    return `${prefix} ${message}\n${crumbLine}  Loading...${cursorHide}`;
  }

  if (items.length === 0) {
    return `${prefix} ${message}\n${crumbLine}  ${theme.style.help('No items found. Press ← to go back.')}${cursorHide}`;
  }

  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive }) {
      const icon = item.type === 'container' ? '📁 ' : '  ';
      const arrow = item.type === 'container' ? ` ${figures.arrowRight}` : '';
      const label = `${icon}${item.name}${arrow}`;
      if (isActive) {
        return `\x1b[36m${figures.pointer} ${label}\x1b[0m`;
      }
      return `  ${label}`;
    },
    pageSize,
    loop: false,
  });

  const searchLine = searchTerm
    ? `  ${theme.style.help(`search: ${searchTerm}`)}\n`
    : '';

  const helpTip = theme.style.help(
    [
      `${figures.arrowUp}${figures.arrowDown} navigate`,
      '→ open',
      breadcrumb.length > 0 ? '← back' : '',
      '⏎ select',
      'type to search',
    ].filter(Boolean).join('  '),
  );

  return `${prefix} ${message}\n${crumbLine}${page}\n${searchLine} ${helpTip}${cursorHide}`;
});

export default hierarchyBrowser;
