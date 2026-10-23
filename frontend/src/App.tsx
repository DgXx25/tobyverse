import { Suspense } from "react";
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";

function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Tobyverse home">
          Tobyverse
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/jobs">Generation jobs</Link>
        </nav>
      </header>
      <main>
        <Suspense fallback={<p className="status">Loading page…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        index: true,
        element: (
          <section className="welcome-card">
            <p className="eyebrow">Parallel migration preview</p>
            <h1>A faster Tobyverse is taking shape.</h1>
            <p>
              This lightweight Vite shell runs alongside the current Next.js app.
              Generation jobs are the first feature moving to the new backend.
            </p>
            <Link className="primary-link" to="/jobs">
              Open generation jobs
            </Link>
          </section>
        ),
      },
      {
        path: "jobs",
        lazy: () => import("./routes/JobsPage"),
      },
      {
        path: "*",
        element: <p className="status">That page is not available in this preview yet.</p>,
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
