'use client';

import {useRef, useState, type ReactNode} from 'react';
import {DropdownMenu as Menu} from 'radix-ui';
import {
  AlignLeft, Bold, Braces, Check, ChevronDown, ChevronRight, CodeXml, Eraser, ExternalLink,
  FilePenLine, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Highlighter, ImagePlus,
  Italic, Link2, List, ListChecks, ListOrdered, ListPlus, Minus, Paintbrush, Percent, Pilcrow,
  Quote, Sigma, SquareSigma, Strikethrough, Table2, type LucideIcon,
} from 'lucide-react';
import {highlightColors, paperFormatGroups, type PaperFormat} from '../lib/paper-format';
import {isPaperCellFormat} from './paper-table-widget';

const icons: Partial<Record<PaperFormat, LucideIcon>> = {
  bold: Bold, italic: Italic, strike: Strikethrough, highlight: Highlighter, code: CodeXml,
  math: Sigma, comment: Percent, clear: Eraser, bullet: List, numbered: ListOrdered, task: ListChecks,
  h1: Heading1, h2: Heading2, h3: Heading3, h4: Heading4, h5: Heading5, h6: Heading6,
  body: AlignLeft, quote: Quote, wiki: Link2, link: ExternalLink, footnote: FilePenLine, table: Table2,
  callout: Quote, rule: Minus, codeblock: Braces, mathblock: SquareSigma, image: ImagePlus,
};
const primaryTools = [['bold', '加粗', 'Mod-b', Bold], ['italic', '倾斜', 'Mod-i', Italic],
  ['strike', '删除线', 'Mod-Alt-s', Strikethrough], ['link', '外部链接', 'Mod-k', Link2]] as const;
const menuIcons = [Paintbrush, Pilcrow, ListPlus];
const sectionBreaks = new Set<PaperFormat>(['code', 'clear', 'h1', 'quote', 'footnote', 'codeblock', 'image']);

export function formatShortcut(key: string) {
  const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
  return key.split('-').map(part => part === 'Mod' ? (mac ? '⌘' : 'Ctrl') : part === 'Alt' && mac ? '⌥' : part.length === 1 ? part.toUpperCase() : part).join('+');
}

export type PaperFormatContext = {active: ReadonlySet<PaperFormat>; inCell: boolean};
const emptyContext: PaperFormatContext = {active: new Set(), inCell: false};

type Props = {
  busy: boolean;
  onFormat: (format: PaperFormat) => void;
  onTarget: (target: EventTarget | null) => void;
  getContext: () => PaperFormatContext;
};

function MenuRow({icon, label, shortcut, active, arrow}: {icon: ReactNode; label: string; shortcut?: string; active?: boolean; arrow?: boolean}) {
  return <>
    <span className="notebook-menu-icon" aria-hidden="true">{icon}</span>
    <span className="notebook-menu-label">{label}</span>
    <span className="notebook-menu-tail">
      {shortcut && <kbd>{formatShortcut(shortcut)}</kbd>}
      {arrow ? <ChevronRight size={15} aria-hidden="true"/> : <span className="notebook-menu-check" aria-hidden="true">{active && <Check size={15}/>}</span>}
    </span>
  </>;
}

export function PaperFormatToolbar({busy, onFormat, onTarget, getContext}: Props) {
  const toolbar = useRef<HTMLDivElement>(null);
  const applied = useRef(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [context, setContext] = useState(emptyContext);

  function remember(target: EventTarget | null) {
    if (target instanceof Node && toolbar.current?.contains(target)) return;
    onTarget(target);
  }

  function apply(format: PaperFormat) {
    applied.current = true;
    onFormat(format);
  }

  function item(id: PaperFormat, label: string, shortcut: string, icon: ReactNode) {
    const active = context.active.has(id) && (id !== 'highlight' || !highlightColors.some(([color]) => context.active.has(color)));
    return <Menu.Item className="notebook-menu-item" textValue={label} aria-current={active ? 'true' : undefined}
      disabled={context.inCell && !isPaperCellFormat(id)} onSelect={() => apply(id)}>
      <MenuRow icon={icon} label={label} shortcut={shortcut} active={active}/>
    </Menu.Item>;
  }

  return <div className="notebook-format" role="group" aria-label="Markdown 格式" ref={toolbar}
    onPointerDownCapture={() => remember(document.activeElement)}
    onFocusCapture={event => remember(event.relatedTarget)}>
    <div className="notebook-quick">
      {primaryTools.map(([format, label, key, Icon]) => <button key={format} type="button" title={`${label} · ${formatShortcut(key)}`} aria-label={label}
        disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => onFormat(format)}><Icon size={16}/></button>)}
    </div>
    {paperFormatGroups.map((group, index) => {
      const Icon = menuIcons[index];
      return <Menu.Root key={group.label} modal={false} onOpenChange={open => {
        if (open) { applied.current = false; setContext(getContext()); }
      }}>
        <Menu.Trigger type="button" className="notebook-format-trigger" disabled={busy}>
          <Icon className="notebook-format-trigger-icon" size={16}/><span>{group.label}</span><ChevronDown className="notebook-format-chevron" size={13}/>
        </Menu.Trigger>
        <Menu.Portal container={portal}>
          <Menu.Content className="notebook-format-menu" aria-label={group.label} align="start" sideOffset={7} collisionPadding={10}
            onCloseAutoFocus={event => { if (applied.current) event.preventDefault(); }}>
            {group.items.map(([id, label, key]) => {
              const Icon = icons[id];
              const glyph = Icon ? <Icon size={17}/> : null;
              return <div key={id} role="presentation">
                {sectionBreaks.has(id) && <Menu.Separator className="notebook-menu-rule"/>}
                {id !== 'highlight' ? item(id, label, key, glyph) : <Menu.Sub>
                  <Menu.SubTrigger className="notebook-menu-item" textValue={label} aria-current={context.active.has(id) ? 'true' : undefined}>
                    <MenuRow icon={glyph} label={label} shortcut={key} arrow/>
                  </Menu.SubTrigger>
                  <Menu.Portal container={portal}>
                    <Menu.SubContent className="notebook-format-menu notebook-color-menu" aria-label="高亮颜色" sideOffset={6} collisionPadding={10}>
                      {item('highlight', '默认高亮', key, <Highlighter size={17}/>)}
                      <Menu.Separator className="notebook-menu-rule"/>
                      {highlightColors.map(([color, , name, key]) => <div key={color} role="presentation">
                        {item(color, `${name}高亮`, key, <i className="notebook-menu-swatch" data-color={color}/>)}
                      </div>)}
                    </Menu.SubContent>
                  </Menu.Portal>
                </Menu.Sub>}
              </div>;
            })}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>;
    })}
    <div className="notebook-menu-layer" ref={setPortal}/>
  </div>;
}
