import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

export function Navbar() {
  const { user } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-card flex items-center px-4 sticky top-0 z-50">
      <SidebarTrigger />
      <div className="ml-auto flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {user?.email}
        </span>
      </div>
    </header>
  );
}
