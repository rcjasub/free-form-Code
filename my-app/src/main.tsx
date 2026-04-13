import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import './index.css'
import App from './App.tsx'
import Home from './pages/Home.tsx'
import Dashboard from './pages/Dashboard.tsx'
import SharedCanvas from './pages/SharedCanvas.tsx'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="dark">
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/canvas/:canvasId" element={<App />} />
        <Route path="/canvas/share/:shareId" element={<SharedCanvas />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>,
)
