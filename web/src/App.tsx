import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { RequireAuth } from '#components/routing/RequireAuth'

// Route-level code splitting keeps the first paint small; each page (and its
// heavy visual dependencies) is downloaded only when it is opened.
const LampDemo = lazy(() => import('#components/features/landingPage/hero').then((module) => ({ default: module.LampDemo })))
const SignupFormDemo = lazy(() => import('#components/features/auth/components/signup').then((module) => ({ default: module.SignupFormDemo })))
const LoginFormDemo = lazy(() => import('#components/features/auth/components/login').then((module) => ({ default: module.LoginFormDemo })))
const FileUploadDemo = lazy(() => import('#components/features/upload/upload').then((module) => ({ default: module.FileUploadDemo })))
const UnderConstruction = lazy(() => import('#components/features/underconstruction/underconstruction'))
const Gallery = lazy(() => import('#components/features/feed/gallery'))
const ProfilePage = lazy(() => import('#components/features/account/ProfilePage'))
const People = lazy(() => import('#components/features/people/people'))
const PersonGallery = lazy(() => import('#components/features/people/peopleGallery'))
const Albums = lazy(() => import('#components/features/albums/Albums'))
const AlbumView = lazy(() => import('#components/features/albums/AlbumView'))
const Stream = lazy(() => import('#components/features/stream/stream'))

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-700 border-t-violet-500" />
    </div>
  )
}

const App = () => {
  return (
    <div>
      <Router>
        <div className="flex flex-col min-h-screen">
          <main className="grow">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<LampDemo />} />
                <Route path="/signup" element={<SignupFormDemo />} />
                <Route path="/login" element={<LoginFormDemo />} />
                <Route path="/uc" element={<UnderConstruction />} />

                <Route path="/upload" element={<RequireAuth><FileUploadDemo /></RequireAuth>} />
                <Route path="/gallery" element={<RequireAuth><Gallery /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="/people" element={<RequireAuth><People /></RequireAuth>} />
                <Route path="/people/:personId" element={<RequireAuth><PersonGallery /></RequireAuth>} />
                <Route path="/albums" element={<RequireAuth><Albums /></RequireAuth>} />
                <Route path="/albums/:albumId" element={<RequireAuth><AlbumView /></RequireAuth>} />
                <Route path="/stream" element={<RequireAuth><Stream /></RequireAuth>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </div>
  )
}

export default App
