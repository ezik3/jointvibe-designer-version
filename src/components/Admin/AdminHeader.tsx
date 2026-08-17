import { Bell, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';

export function AdminHeader() {
  const { t } = useTranslation('admin');
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background">
      <div className="flex items-center justify-between h-full gap-3 px-4 sm:px-6">
        {/* Search */}
        <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('header.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted border-border focus:ring-primary"
          />
        </div>

        {/* Right side */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
          </Button>

          {/* Status indicator */}
          <div className="hidden items-center gap-2 px-3 py-1.5 bg-success/10 rounded-full md:flex">
            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-xs font-medium text-success">{t('header.system_online')}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;
