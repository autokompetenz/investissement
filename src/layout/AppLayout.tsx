import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { cn } from "@/utils";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />

      {/*
        `min-w-0` is what stops the page from ever scrolling sideways.

        From `xl` this div is a flex item, and a flex item's default
        `min-width` is its content's intrinsic width. A financial table or a
        long identifier would therefore hold the column open past the edge of
        the screen: the page would scroll horizontally, and every element would
        sit at the wrong place relative to the others. `min-w-0` removes that
        floor, so the column can shrink and the wide content scrolls or folds
        inside it — the table below 768 px, the identifier by wrapping.
      */}
      <div
        className={cn(
          "min-w-0 flex-1 transition-[margin] duration-300 ease-in-out",
          isExpanded || isHovered ? "xl:ms-72.5" : "xl:ms-22.5",
          isMobileOpen ? "ms-0" : "",
        )}
      >
        <AppHeader />
        <main className="mx-auto w-full max-w-(--breakpoint-2xl) p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
