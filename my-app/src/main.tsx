import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import './index.css'
import App from './App.tsx'
import Home from './pages/Home.tsx'
import Dashboard from './pages/Dashboard.tsx'
import SharedCanvas from './pages/SharedCanvas.tsx'
import LocalCanvasGate from './components/LocalCanvasGate.tsx'
import { isLocalCanvas } from './lib/localCanvas.ts'
import { useLottieFavicon } from './hooks/useLottieFavicon.ts'

// A fresh canvas page per canvas: going from one canvas to another (e.g. a
// browser-only canvas moved online) would otherwise keep the old one's undo
// history and socket connection. The browser-only canvas is shown in one tab
// at a time.
function CanvasPage() {
  const { canvasId } = useParams()
  const app = <App key={canvasId} />
  return isLocalCanvas(canvasId) ? <LocalCanvasGate>{app}</LocalCanvasGate> : app
}

function Root() {
  useLottieFavicon('https://lottie.host/eeaf425b-2e97-4917-92a7-f080d43b783e/122VHclLBM.lottie')

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/canvas/:canvasId" element={<CanvasPage />} />
        <Route path="/canvas/share/:shareId" element={<SharedCanvas />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="dark">
    <Root />
  </ThemeProvider>,
)
