import React from 'react';
import { ErpProvider, useErp } from './context/ErpContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { PrintModal } from './components/print/PrintModal';
import { ToastBanner } from './components/ui/SharedUi';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { WarehousePage } from './pages/WarehousePage';
import { PurchasesPage } from './pages/PurchasesPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { ProductsPage } from './pages/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { ExpensesPage } from './pages/ExpensesPage';
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

  const fallbackPage = can('view:dashboard') ? <DashboardPage /> : <PosPage />;

  const renderPage = () => {
    switch (activeView) {
      case 'dashboard':
        return can('view:dashboard') ? <DashboardPage /> : <PosPage />;
      case 'pos':
        return can('view:pos') ? <PosPage /> : fallbackPage;
      case 'warehouse':
        return can('view:warehouse') ? <WarehousePage /> : fallbackPage;
      case 'purchases':
        return can('view:purchases') ? <PurchasesPage /> : fallbackPage;
      case 'transactions':
        return <TransactionsPage />;
      case 'receivables':
        return can('view:receivables') ? <ReceivablesPage /> : fallbackPage;
      case 'products':
        return <ProductsPage />;
      case 'customers':
        return <CustomersPage />;
      case 'expenses':
        return can('view:expenses') ? <ExpensesPage /> : fallbackPage;
      case 'reports':
        return can('view:reports') ? <ReportsPage /> : fallbackPage;
      case 'audit':
        return can('view:audit') ? <AuditLogsPage /> : fallbackPage;
      case 'users':
        return can('view:users') ? <UsersPage /> : fallbackPage;
      case 'settings':
        return can('view:settings') ? <SettingsPage /> : fallbackPage;
      default:
        return fallbackPage;
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
    <ThemeProvider>
      <ErpProvider>
        <AppShell />
      </ErpProvider>
    </ThemeProvider>
  );
};

export default App;
