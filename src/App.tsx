import React from 'react';
import { ErpProvider, useErp } from './context/ErpContext';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { PrintModal } from './components/print/PrintModal';
import { ToastBanner } from './components/ui/SharedUi';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { WarehousePage } from './pages/WarehousePage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';

const AppShell: React.FC = () => {
  const { currentUser, activeView, can, toast, dismissToast } = useErp();

  if (!currentUser) {
    return (
      <>
        <LoginScreen />
        <ToastBanner toast={toast} onDismiss={dismissToast} />
      </>
    );
  }

  const renderPage = () => {
    switch (activeView) {
      case 'dashboard':
        return can('view:dashboard') ? <DashboardPage /> : <PosPage />;
      case 'pos':
        return can('view:pos') ? <PosPage /> : <DashboardPage />;
      case 'warehouse':
        return can('view:warehouse') ? <WarehousePage /> : <DashboardPage />;
      case 'transactions':
        return <TransactionsPage />;
      case 'receivables':
        return can('view:receivables') ? <ReceivablesPage /> : <PosPage />;
      case 'products':
        return <ProductsPage />;
      case 'customers':
        return <CustomersPage />;
      case 'reports':
        return can('view:reports') ? <ReportsPage /> : <DashboardPage />;
      case 'audit':
        return can('view:audit') ? <AuditLogsPage /> : <DashboardPage />;
      case 'users':
        return can('view:users') ? <UsersPage /> : <DashboardPage />;
      case 'settings':
        return can('view:settings') ? <SettingsPage /> : <DashboardPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <>
      <Layout>{renderPage()}</Layout>
      <PrintModal />
      <ToastBanner toast={toast} onDismiss={dismissToast} />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ErpProvider>
      <AppShell />
    </ErpProvider>
  );
};

export default App;
