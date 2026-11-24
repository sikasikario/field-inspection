import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { Layout } from './components/Layout.jsx';
import { Login } from './pages/Login.jsx';
import { MyInspections } from './pages/inspector/MyInspections.jsx';
import { InspectionForm } from './pages/inspector/InspectionForm.jsx';
import { NewInspection } from './pages/inspector/NewInspection.jsx';
import { InspectionList } from './pages/coordinator/InspectionList.jsx';
import { InspectionReview } from './pages/coordinator/InspectionReview.jsx';
import { Assign } from './pages/coordinator/Assign.jsx';
import { Reports } from './pages/coordinator/Reports.jsx';
import { registerServiceWorker } from './registerSW.js';
import './styles.css';

function AppRoutes() {
  const { user } = useAuth();
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  // Fiecare rol are propriile pagini. (Serverul verifică oricum drepturile la fiecare cerere.)
  return (
    <Routes>
      <Route element={<Layout />}>
        {user.role === 'inspector' ? (
          <>
            <Route index element={<MyInspections />} />
            <Route path="inspections/:id" element={<InspectionForm />} />
            <Route path="new" element={<NewInspection />} />
          </>
        ) : (
          <>
            <Route index element={<InspectionList />} />
            <Route path="inspections/:id" element={<InspectionReview />} />
            <Route path="assign" element={<Assign />} />
            <Route path="reports" element={<Reports />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker();
