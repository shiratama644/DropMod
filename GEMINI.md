# CraftForge - Minecraft Mod Manager PRO (Instructional Context)

This file serves as the core developer guidelines, architectural index, and workspace instructions for **Gemini CLI** and other AI agents operating on the CraftForge project.

---

## 1. Project Overview

**CraftForge** is a modern, high-fidelity web-based Minecraft client mod profile manager. It integrates directly with the Modrinth API to search for, inspect, download, and resolve dependencies for Minecraft mods.

### Core Capabilities
* **Profile Management:** Create, duplicate, and edit profiles with specific Minecraft version and mod loader configurations (Fabric, Forge, NeoForge).
* **Mod Search & Inspection:** Deep search and filter mods on Modrinth by categories, sort parameters (popular, relevance, updated, newest), and keyword queries.
* **Intelligent Dependency Check:** Analyze currently installed mods against their Modrinth version declarations to flag missing required dependencies, suggest optional recommendations, or detect version conflicts.
* **ZIP Packaging:** Export profiles as a `.zip` package containing either:
  1. A structured folder layout with actual `.jar` mod files (downloaded in-browser), an export manifest `profile.json`, and a `README.txt`.
  2. Modrinth-native `.mrpack` index files.
* **ZIP Parsing & Importing:** Supports importing `.mrpack` files directly, or uploading `.jar` compilation ZIP files, analyzing each jar file's SHA-1 hash against the Modrinth database to automatically reconstruct matching mod profile configurations.
* **Modern & Animated UI:** Built with dark/light theme options, rich glassmorphic elements, smooth GSAP-powered micro-animations, and fully responsive layouts.

### Main Technologies & Tech Stack
* **Frontend SPA:** [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) + [Vite 6](https://vite.dev/)
* **CSS & Styling:** [Tailwind CSS v4](https://tailwindcss.com/) (using `@tailwindcss/vite` and `@import "tailwindcss"`)
* **Animations:** [GSAP (GreenSock Animation Platform) v3](https://gsap.com/)
* **ZIP Manipulation:** [JSZip v3](https://stuk.github.io/jszip/)
* **API Middleware / Dev Proxy:** [Hono v4](https://hono.dev/) with `@hono/node-server` and `@hono/vite-dev-server`
* **Markdown Rendering:** `react-markdown` + `remark-gfm` + `rehype-raw` + `rehype-sanitize` for rendering rich Modrinth project details.

### System Architecture
The codebase is structured as a single-page React app with a lightweight Hono dev-server proxy to circumvent CORS limitations and inject appropriate `User-Agent` headers required by the Modrinth API.

```
craft-m2/
├── server/
│   └── index.ts               # Hono backend API proxy for Modrinth API
├── src/
│   ├── main.tsx               # Entry point of the React app
│   ├── App.tsx                # Core React App shell & state orchestrator
│   ├── types.ts               # Complete TypeScript interfaces & domain models
│   ├── index.css              # Tailwind CSS imports & custom theme definitions
│   ├── services/
│   │   └── api.ts             # Service module for Modrinth fetch & helper logic
│   └── components/            # Highly reusable React components
│       ├── BottomNav.tsx      # Mobile/Responsive tab selector bar
│       ├── CustomDropdown.tsx # Accessible select/dropdown replacement
│       ├── Header.tsx         # Top dashboard with profile selection & bulk actions
│       ├── HomeTab.tsx        # Mod exploration and direct search workspace
│       ├── ModsTab.tsx        # Profile inventory list with updates/version manager
│       ├── SettingsTab.tsx    # Global settings, reset, zip drag-and-drop workspace
│       ├── ModCard.tsx        # Standard mod display item card
│       ├── ToastContainer.tsx # System toast alerts (info, success, warning)
│       └── Modals/            # Overlay modals for specific flows
│           ├── EditProfileModal.tsx
│           ├── NewProfileModal.tsx
│           ├── ModDetailModal.tsx
│           ├── DependencyCheckModal.tsx
│           └── ZipProgressModal.tsx
├── package.json               # Manifest file containing scripts and dependencies
├── tsconfig.json              # TypeScript compiler configuration
└── vite.config.ts             # Vite configuration with Tailwind CSS and Hono plugins
```

---

## 2. Building and Running

### Prerequisites
* **Node.js** v18+ is recommended.
* **pnpm** is utilized as the package manager (see `pnpm-lock.yaml` and `pnpm-workspace.yaml`).

### Key Commands

| Command | Action | Description |
| :--- | :--- | :--- |
| `pnpm install` | Install Dependencies | Resolves and downloads workspace dependencies. |
| `pnpm run dev` | Run Dev Server | Launches the Vite compiler + local Hono proxy on `http://localhost:5173`. |
| `pnpm run build` | Production Build | Bundles the React assets into the `dist/` directory. |
| `pnpm run preview` | Production Preview | Serves the locally compiled production bundle from `dist/`. |
| *No test suite* | Run Tests | *Placeholder: Currently, no testing framework is installed.* |

*Note: For API proxying, Hono operates via the `@hono/vite-dev-server` plugin in `vite.config.ts`. All endpoints on `/api/*` are captured by Hono (`server/index.ts`), while other routes serve the React SPA.*

---

## 3. Development Conventions & Guidelines

### Coding style and standards
1. **Type Safety & TypeScript:**
   * Strict mode is enabled (`"strict": true` in `tsconfig.json`).
   * Never bypass the type system or use `any` cast. Always declare explicit types using the definitions in `src/types.ts`.
   * Keep unused imports or unused locals clean, even if configurations (`noUnusedLocals: false`) are permissive.
2. **React Conventions:**
   * Favor **functional components** with explicit `React.FC` typings and functional hooks (`useState`, `useEffect`, `useCallback`, `useRef`).
   * Always memoize callbacks passed to complex child components with `useCallback` to avoid redundant re-renders.
   * State management is centrally managed in `App.tsx` and propagated down. For deeper nested actions (like updating versions or deleting mods), pass handler methods down.
3. **Styling and Theme Mode (Tailwind CSS v4):**
   * Do not write custom styles in raw CSS unless defining keyframes or CSS variables in `src/index.css`.
   * Leverage variables defined in `:root` and `html.dark` in `src/index.css` for consistent dark/light themes.
   * Utilize `glass-panel` and `glass-card` classes for the frosted pane design paradigm.
   * Apply responsive design helper classes (e.g., `sm:`, `md:`, `lg:`) to support desktop, tablet, and mobile views.
4. **Modrinth API & Proxying:**
   * For querying Modrinth, use the wrapper function `fetchModrinth()` inside `src/services/api.ts` to benefit from build-in client-side caching (`apiCache`) and local Hono proxy logic.
   * Include standard API query params using the search options.
   * Respect Modrinth API guidelines. Avoid flooding the endpoints; implement debounce delays (implemented as `350ms` on the search box) when querying based on user input.
5. **State Persistence:**
   * Profile data is saved in `localStorage` under the key `craftforge_state_v2`. Ensure any new properties added to `Profile` or `ModItem` are fully serializable and backwards-compatible.
6. **No Automated Tests:**
   * If adding automated tests in the future, prefer [Vitest](https://vitest.dev/) for Vite compatibility and configure tests within `src/**/*.test.ts` or `src/**/*.test.tsx`.
