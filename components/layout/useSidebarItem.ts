/**
 * One menu entry's own logic, shared by both frames (redesign 5b).
 *
 * Which of the entry's children show (`isChildVisible`, the one copy of the child gates), whether
 * the entry is a group, whether it is the current page, what a click does, the rule that a group
 * whose children are all hidden and that has no address is not drawn, and the collapsed floating
 * list (opened by hover after 150 ms or by a click, closed by leaving or by a click outside).
 *
 * This code was lifted word for word out of `SidebarItem` in `Sidebar.tsx`: today's item and the
 * new look's item (`SidebarNuevo.tsx`) both call this hook, so what an account can reach cannot
 * differ between the two frames. Do not fork it.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { isChildVisible } from '../../lib/sidebar/childVisibility';
import type { SidebarItemProps } from './Sidebar';

// Backed by a stable NEXT_PUBLIC_* env var; read once at module scope rather
// than as a reactive dependency since its value cannot change at runtime.
export const FEATURE_SUPERADMIN_RBAC_ENABLED = isFeatureEnabled('FEATURE_SUPERADMIN_RBAC');

export function useSidebarItem({
  item,
  isCollapsed,
  expandedItems,
  isAdmin,
  userRole,
  userRoles,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  permissionsLoading,
  isSuperadmin,
  superadminCheckDone,
  hasCommunity,
  communityCheckDone,
  canRunQATests,
  qaCheckDone,
  hasAssessments,
  assessmentsCheckDone,
  isItemActive,
  toggleExpanded,
  routerAsPath
}: SidebarItemProps) {
  const router = useRouter();
  const [showCollapsedMenu, setShowCollapsedMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isExpanded = expandedItems.has(item.id);

  // Close floating menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowCollapsedMenu(false);
      }
    };

    if (showCollapsedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCollapsedMenu]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Filter children based on admin status and permissions
  const filteredChildren = useMemo(() => {
    const ctx = {
      isAdmin,
      userRole,
      userRoles,
      isSuperadmin,
      superadminCheckDone,
      hasCommunity,
      communityCheckDone,
      canRunQATests,
      qaCheckDone,
      hasAssessments,
      assessmentsCheckDone,
      featureSuperadminRbac: FEATURE_SUPERADMIN_RBAC_ENABLED,
      permissionsLoading,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
    };
    return item.children?.filter(child => isChildVisible(child, ctx)) || [];
  }, [item.children, isAdmin, userRole, userRoles, hasPermission, hasAnyPermission, hasAllPermissions, permissionsLoading, isSuperadmin, superadminCheckDone, hasCommunity, communityCheckDone, canRunQATests, qaCheckDone, hasAssessments, assessmentsCheckDone]);

  const hasChildren = filteredChildren.length > 0;
  const isActive = item.href ? isItemActive(item.href, routerAsPath) : false;

  const handleClick = useCallback(async () => {
    if (isCollapsed && hasChildren) {
      setShowCollapsedMenu(prev => !prev);
    } else if (hasChildren) {
      toggleExpanded(item.id);
    } else if (item.href) {
      try {
        router.push(item.href);
      } catch (err) {
        console.error('Navigation error in sidebar:', err);
      }
    }
  }, [isCollapsed, hasChildren, item.id, item.href, toggleExpanded, router]);

  // Don't render parent items that have children but all children are filtered out
  const isHidden = !!(item.children && !hasChildren && !item.href);

  const handleMouseEnter = () => {
    if (isCollapsed) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(true);
        if (hasChildren) setShowCollapsedMenu(true);
      }, 150);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(false);
    if (hasChildren) {
      setShowCollapsedMenu(false);
    }
  };

  return {
    showCollapsedMenu,
    setShowCollapsedMenu,
    isHovered,
    menuRef,
    isExpanded,
    filteredChildren,
    hasChildren,
    isActive,
    handleClick,
    isHidden,
    handleMouseEnter,
    handleMouseLeave,
  };
}
