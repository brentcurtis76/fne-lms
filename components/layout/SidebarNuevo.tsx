/**
 * The new look's menu (redesign 5b): markup only.
 *
 * `Sidebar` (Sidebar.tsx) stays the one component that decides what an account can reach: it runs
 * every check and data call, filters `NAVIGATION_ITEMS`, and hands this component the filtered list
 * with the same values today's `SidebarItem` receives. Each entry here calls the same hook as
 * today's entry (`useSidebarItem`) for its children, its click and its floating list. Nothing in
 * this file decides who sees what.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { XIcon as XMarkIcon, ChevronDownIcon } from '@heroicons/react/outline';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useSidebarItem } from './useSidebarItem';
import type { NavigationItem, SidebarItemProps } from './Sidebar';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const MOTION = 'transition-colors duration-150 motion-reduce:transition-none';

/** The small yellow count of new support reports. */
function Count({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#fbbf24] text-[#0a0a0a] font-sans text-[11px] font-bold leading-none tracking-normal normal-case">
      {value}
    </span>
  );
}

/** The 3 px yellow bar of the current entry. */
function CurrentBar() {
  return <span aria-hidden="true" className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm bg-[#fbbf24]" />;
}

const SidebarItemNuevo: React.FC<SidebarItemProps> = React.memo((props) => {
  const { item, isCollapsed, newFeedbackCount, isItemActive, routerAsPath } = props;
  const {
    showCollapsedMenu,
    setShowCollapsedMenu,
    menuRef,
    isExpanded,
    filteredChildren,
    hasChildren,
    isActive,
    handleClick,
    isHidden,
    handleMouseEnter,
    handleMouseLeave,
  } = useSidebarItem(props);

  // Where the collapsed menu's floating list starts: beside its entry, kept inside the window.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [flyoutTop, setFlyoutTop] = useState(8);
  useIsomorphicLayoutEffect(() => {
    if (!showCollapsedMenu || !buttonRef.current) return;
    const estimatedHeight = 64 + filteredChildren.length * 52;
    const top = buttonRef.current.getBoundingClientRect().top - 4;
    setFlyoutTop(Math.max(8, Math.min(top, window.innerHeight - estimatedHeight - 8)));
  }, [showCollapsedMenu, filteredChildren.length]);

  if (isHidden) {
    return null;
  }

  const isCurrent = isActive && !hasChildren;
  const showsCount = filteredChildren.some(c => c.id === 'feedback') && newFeedbackCount > 0;
  const title = isCollapsed ? (hasChildren ? undefined : item.label) : item.description;
  // The button's name is the entry's label in every state (5b, send-back 1): collapsed, the label is
  // not drawn and the icon is hidden from screen readers, so without it a group's button has no name.

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        data-testid={`sidebar-item-${item.id}`}
        aria-expanded={hasChildren ? (isCollapsed ? showCollapsedMenu : isExpanded) : undefined}
        aria-current={isCurrent ? 'page' : undefined}
        aria-label={item.label}
        title={title}
        className={`group relative flex items-center w-full gap-3 rounded-sm py-2.5 text-left font-mont text-[11px] font-semibold uppercase tracking-[0.08em] ${MOTION} ${
          isCollapsed ? 'justify-center px-0' : 'px-3'
        } ${
          isCurrent || (isCollapsed && showCollapsedMenu)
            ? 'bg-white/10 text-white'
            : 'text-white/80 hover:bg-white/5 hover:text-white'
        }`}
      >
        {isCurrent && <CurrentBar />}
        <item.icon
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 ${isCurrent ? 'text-[#fbbf24]' : 'text-white/70 group-hover:text-white'}`}
        />
        {!isCollapsed && <span className="flex-1 min-w-0 truncate">{item.label}</span>}
        {!isCollapsed && showsCount && <Count value={newFeedbackCount} />}
        {!isCollapsed && hasChildren && (
          <ChevronDownIcon
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-white/50 ${isExpanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Collapsed: the group's floating list */}
      {isCollapsed && hasChildren && showCollapsedMenu && (
        <div ref={menuRef} className="fixed left-[60px] z-50 pl-2" style={{ top: flyoutTop }} data-frame="flyout">
          <div className="bg-white text-gray-900 rounded-md shadow-xl border border-gray-200 min-w-[14rem] max-w-xs max-h-[calc(100vh-1rem)] overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-200">
              <h3 className="font-mont text-[11px] font-bold uppercase tracking-[0.08em] text-gray-900">{item.label}</h3>
              {item.description && <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>}
            </div>
            <div className="py-1">
              {filteredChildren.map(child => {
                const childActive = isItemActive(child.href, routerAsPath);
                return (
                  <Link
                    key={child.id}
                    href={child.href}
                    onClick={() => setShowCollapsedMenu(false)}
                    aria-current={childActive ? 'page' : undefined}
                    className={`relative block px-3 py-2 text-[13px] ${MOTION} ${
                      childActive ? 'bg-gray-100 font-semibold text-gray-900' : 'text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {childActive && <CurrentBar />}
                    <span className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate">{child.label}</span>
                      {child.id === 'feedback' && newFeedbackCount > 0 && <Count value={newFeedbackCount} />}
                    </span>
                    {child.description && (
                      <span className="block text-xs font-normal text-gray-600 truncate mt-0.5">{child.description}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Children */}
      {!isCollapsed && hasChildren && isExpanded && (
        <div className="mt-0.5 mb-1 space-y-0.5">
          {filteredChildren.map(child => {
            const childActive = isItemActive(child.href, routerAsPath);
            return (
              <Link
                key={child.id}
                href={child.href}
                title={child.description}
                aria-current={childActive ? 'page' : undefined}
                className={`relative flex items-center gap-2 rounded-sm py-2 pl-11 pr-3 font-sans text-[13px] ${MOTION} ${
                  childActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {childActive && <CurrentBar />}
                <span className="flex-1 min-w-0 truncate">{child.label}</span>
                {child.id === 'feedback' && newFeedbackCount > 0 && <Count value={newFeedbackCount} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
});

SidebarItemNuevo.displayName = 'SidebarItemNuevo';

interface SidebarNuevoProps {
  items: NavigationItem[];
  itemProps: Omit<SidebarItemProps, 'item'>;
  isDesktop: boolean;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onDesktopToggle: () => void;
  onMobileClose: () => void;
  className?: string;
}

export default function SidebarNuevo({
  items,
  itemProps,
  isDesktop,
  isCollapsed,
  isMobileOpen,
  onDesktopToggle,
  onMobileClose,
  className = '',
}: SidebarNuevoProps) {
  const toggleLabel = isDesktop ? (isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar') : 'Cerrar menú';
  const ToggleIcon = isDesktop ? (isCollapsed ? PanelLeftOpen : PanelLeftClose) : XMarkIcon;

  return (
    <>
      {/* Mobile Overlay */}
      {!isDesktop && isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onMobileClose}
          data-testid="mobile-sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full flex flex-col bg-[#0a0a0a] text-white ${
          isDesktop
            ? `z-30 transition-[width] duration-150 motion-reduce:transition-none ${isCollapsed ? 'w-[68px]' : 'w-[264px]'}`
            : `z-50 w-[min(300px,86vw)] shadow-xl ${isMobileOpen ? 'translate-x-0' : '-translate-x-full invisible'}`
        } ${className}`}
        data-testid="global-sidebar"
        data-frame="sidebar"
      >
        {/* Head */}
        <div className={`flex items-center h-14 shrink-0 px-4 gap-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 min-w-0">
              <img src="/genera/icon-transparent.svg" alt="Genera" className="w-8 h-8 shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="font-mont text-sm font-bold">Genera</div>
                <div className="text-[11px] text-white/60 truncate">Hub de Transformación · by FNE</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={isDesktop ? onDesktopToggle : onMobileClose}
            className={`p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md ${MOTION}`}
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <ToggleIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-2 space-y-0.5">
          {items.map(item => (
            <SidebarItemNuevo key={item.id} item={item} {...itemProps} />
          ))}
        </nav>

        {/* Foot */}
        {!isCollapsed && (
          <div className="shrink-0 px-4 py-3 border-t border-white/10 text-[11px] text-white/50">
            Fundación Nueva Educación
          </div>
        )}
      </div>
    </>
  );
}
