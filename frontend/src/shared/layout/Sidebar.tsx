// ─── Sidebar.tsx — backward-compatibility re-export 
// All sidebar logic now lives in ./sidebar/*.
// This file keeps existing imports in App.tsx working without changes.
//
// App.tsx imports:
//   import { Sidebar, TopNav } from "./shared/layout";
//   import { SidebarProvider, SidebarInset } from "./shared/layout/Sidebar";
//
// NOTE: We use explicit sub-module paths here (not the "./sidebar" barrel)
// because on Windows, "./sidebar" resolves to this file (case-insensitive FS),
// creating a circular reference.

export { default } from "./sidebar/AppSidebar";

export {
  SidebarProvider,
} from "./sidebar/hooks/useSidebar";

export {
  SidebarInset,
  SidebarPrimitive,
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
} from "./sidebar/SidebarPrimitives";

export { useSidebar } from "./sidebar/hooks/useSidebar";
