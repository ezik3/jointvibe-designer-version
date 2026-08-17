import { ReactNode } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { useTranslation } from 'react-i18next';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useTranslation('admin');
  return (
    <div className="min-h-screen bg-background dark">
      <AdminSidebar />
      <div className="lg:pl-64 pl-16">
        <AdminHeader />
        <main className="p-4 sm:p-6 lg:p-7 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
