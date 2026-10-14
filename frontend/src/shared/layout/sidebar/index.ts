// ─── Sidebar module — public API ──────────────────────────────────────────────
// Import from this barrel, never from individual sub-files.

export { default as AppSidebar } from "./AppSidebar";

// Primitives consumed by App.tsx shell
export {
  SidebarPrimitive,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarTrigger,
} from "./SidebarPrimitives";

// Context + provider consumed by App.tsx shell
export { SidebarProvider, useSidebar } from "./hooks/useSidebar";

// Nav config — exported for any consumer that needs the tab label map
export { TAB_LABELS, buildNav } from "./navConfig";
