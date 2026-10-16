import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import './App.css';

// The dashboard pulls in charts, maps and MUI; load it only after login
const Dashboard = lazy(() => import('./components/Dashboard'));

function App() {
  return (
    <Router>
      <Suspense fallback={<div className="container">Loading…</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/" element={<Login />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
