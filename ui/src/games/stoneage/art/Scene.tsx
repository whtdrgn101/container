/**
 * The Morning Valley — Stone Age's board landscape (visual upgrade, 2026-07). **Deliberately
 * ORIGINAL art**: the *arrangement* follows the classic board's geography (hunting meadow top-left,
 * forest top-center, clay pit beside it, quarry in the mountains feeding the river down the right
 * edge, the village center-left), but every shape here is ours.
 *
 * Colors are hardcoded on purpose — the landscape is diegetic "physical board" art and does not
 * re-theme in dark mode (same rule as Container's board); the interactive chrome above it uses
 * semantic tokens. Authored as horizontal bands so `preserveAspectRatio="none"` stretch stays safe
 * from desktop-wide down to mobile-tall.
 */
export function Scene() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="sa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2e5c8" />
          <stop offset="1" stopColor="#dfe3c4" />
        </linearGradient>
        <radialGradient id="sa-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3d0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff3d0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sa-meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b6c98a" />
          <stop offset="1" stopColor="#a3b877" />
        </linearGradient>
        <linearGradient id="sa-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9bd7d" />
          <stop offset="1" stopColor="#98ac6d" />
        </linearGradient>
        <linearGradient id="sa-rock" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9bec3" />
          <stop offset="1" stopColor="#8d939b" />
        </linearGradient>
        <linearGradient id="sa-river" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8d8e2" />
          <stop offset="1" stopColor="#8db6c6" />
        </linearGradient>
      </defs>

      {/* sky + morning sun + birds */}
      <rect width="100" height="18" fill="url(#sa-sky)" />
      <ellipse cx="60" cy="6" rx="14" ry="9" fill="url(#sa-sun)" />
      <circle cx="60" cy="6" r="2.8" fill="#fbeecb" />
      <path d="M20 5.5 q1.2 -1.2 2.4 0 M24 7 q1.1 -1.1 2.2 0" fill="none" stroke="#8f8a76" strokeWidth="0.5" />

      {/* rolling valley floor */}
      <path d="M0 14 Q30 9 55 12 Q80 15 100 11 L100 100 L0 100 Z" fill="url(#sa-ground)" />

      {/* top-left: the hunting meadow, with its herd */}
      <path d="M0 12 Q18 8 32 12 L34 34 Q16 38 0 36 Z" fill="url(#sa-meadow)" />
      <g stroke="#7c8b52" strokeWidth="0.5" fill="none">
        <path d="M4 20 q1 -2.5 2 0 M27 16 q1 -2.5 2 0 M30 27 q1 -2.5 2 0 M3 30 q1 -2.5 2 0" />
      </g>
      <g fill="#e9e2c8" opacity="0.9">
        <circle cx="6" cy="15" r="0.5" />
        <circle cx="29" cy="21" r="0.5" />
        <circle cx="4" cy="25" r="0.5" />
      </g>
      <g fill="#5c4526">
        <path d="M10 22 l1.4 -2.8 0.7 1.5 2.4 -0.6 2.7 0.9 1 2.4 -0.7 2.1 -1.3 -0.15 -0.5 2.2 -1 0 0.15 -2.2 -2.1 0.3 -0.3 1.9 -1 0 0 -2.4 Z" />
        <path d="M11.7 19.7 l0.45 -1.8 0.75 1.4 Z M13.2 19.8 l0.75 -1.7 0.45 1.5 Z" />
        <path d="M20 27 l1.2 -2.4 0.6 1.3 2 -0.5 2.3 0.75 0.85 2 -0.6 1.8 -1.1 -0.12 -0.4 1.9 -0.85 0 0.12 -1.9 -1.8 0.25 -0.25 1.6 -0.85 0 0 -2 Z" opacity="0.9" />
        <path d="M6 30 l1 -2 0.5 1.1 1.7 -0.4 1.9 0.6 0.7 1.7 -0.5 1.5 -0.9 -0.1 -0.35 1.6 -0.7 0 0.1 -1.6 -1.5 0.2 -0.2 1.35 -0.7 0 0 -1.7 Z" opacity="0.8" />
      </g>

      {/* top-center: the forest */}
      <g>
        <ellipse cx="42" cy="24" rx="12" ry="6" fill="#4d6a36" />
        <rect x="35.4" y="22" width="1.2" height="6" fill="#6e451f" />
        <ellipse cx="36" cy="17.5" rx="4.4" ry="4" fill="#6a874d" />
        <rect x="41.4" y="20" width="1.3" height="8" fill="#5f3c1b" />
        <ellipse cx="42" cy="14.5" rx="5.2" ry="4.6" fill="#77935a" />
        <ellipse cx="40.5" cy="12.8" rx="2.4" ry="1.8" fill="#8aa76b" />
        <rect x="47.6" y="22" width="1.2" height="6.5" fill="#6e451f" />
        <ellipse cx="48.2" cy="17.5" rx="4.2" ry="3.8" fill="#5d7a43" />
        <ellipse cx="52.5" cy="21.5" rx="3.2" ry="2.6" fill="#6a874d" />
      </g>

      {/* upper-right-of-center: the clay pit */}
      <ellipse cx="63" cy="18" rx="9" ry="4.6" fill="#c8874f" />
      <ellipse cx="63" cy="17.4" rx="6.8" ry="3.2" fill="#b06f3d" />
      <ellipse cx="62.4" cy="16.8" rx="4.4" ry="2" fill="#94582e" />
      <ellipse cx="62" cy="16.4" rx="2.2" ry="1" fill="#7c4826" />
      <path d="M56 21.5 q7 2.8 14 0" fill="none" stroke="#8f5730" strokeWidth="0.55" opacity="0.75" />
      <path d="M67.5 14.2 l1.6 -1 0.5 0.8 -1.6 1 Z" fill="#8a5a2b" />

      {/* right: the quarry mountains, snow caps, a worked ledge, the waterfall */}
      <path d="M68 34 L76 10 L84 16 L90 6 L97 18 L100 14 L100 48 L72 44 Z" fill="url(#sa-rock)" />
      <path d="M76 10 L80 14 L76 18 L73 15 Z" fill="#d6dade" opacity="0.9" />
      <path d="M90 6 L93 10 L90 13 L87.5 9.5 Z" fill="#e8ecef" opacity="0.95" />
      <path d="M80 22 L88 20 L90 26 L82 28 Z" fill="#7c828a" />
      <path d="M82 28 L90 26 L89 31 L83 32 Z" fill="#a4aab1" />
      <path d="M90.5 32 Q91 38 91.6 43" fill="none" stroke="#e9f4f6" strokeWidth="1.6" opacity="0.9" />
      <path d="M92.2 33 Q92.6 38 93 43" fill="none" stroke="#cfe6ec" strokeWidth="0.8" opacity="0.8" />

      {/* the river: a pool at the falls, then down the right edge past gravel panning banks */}
      <path d="M86 44 Q93 40 100 44 L100 100 L70 100 Q72 88 76 78 Q80 66 81 56 Q81.5 48 86 44 Z" fill="url(#sa-river)" />
      <path d="M87 48 Q85 58 83.5 66 Q81 76 78 86" fill="none" stroke="#e5f2f2" strokeWidth="0.7" opacity="0.65" />
      <path d="M93 52 Q91 64 88 74 Q85.5 84 83 94" fill="none" stroke="#dcecee" strokeWidth="0.5" opacity="0.55" />
      <path d="M70 100 Q72 88 76 78 Q78 72 79 66 Q76.5 74 73 82 Q70 90 68 100 Z" fill="#d8c9a2" />
      <ellipse cx="74" cy="86" rx="2.6" ry="0.9" fill="#8a5a2b" />
      <ellipse cx="74" cy="85.7" rx="2" ry="0.5" fill="#6e451f" />
      <circle cx="80.5" cy="70" r="0.5" fill="#e0b64a" />
      <circle cx="78" cy="80" r="0.4" fill="#e0b64a" />

      {/* center-left: the village clearing */}
      <ellipse cx="32" cy="63" rx="30" ry="18" fill="#d9c69b" />
      <ellipse cx="32" cy="63" rx="22" ry="12.5" fill="#e2d1a6" opacity="0.7" />

      {/* the fenced wheat field */}
      <g>
        <rect x="19" y="45" width="15" height="9" rx="1.4" fill="#cfa94f" />
        <g stroke="#8a6c2c" strokeWidth="0.4" opacity="0.75">
          <path d="M20.5 47 h12 M20.5 49.2 h12 M20.5 51.4 h12" />
        </g>
        <g stroke="#6e451f" strokeWidth="0.5">
          <path d="M19 54.6 h15" opacity="0.9" />
          <path d="M20 54 v1.4 M23.5 54 v1.4 M27 54 v1.4 M30.5 54 v1.4 M33.6 54 v1.4" />
        </g>
      </g>

      {/* the marriage hut — one thatched cone, smoke rising */}
      <g>
        <path d="M39 68 L46.5 53 L54 68 Z" fill="#c2a26a" />
        <path d="M41 68 L46.5 57 L52 68 Z" fill="#b08f56" opacity="0.6" />
        <path d="M44.8 68 L46.5 61 L48.4 68 Z" fill="#6e451f" />
        <path d="M39 68 h15" stroke="#8a6a40" strokeWidth="0.55" />
        <path d="M47 52.5 q0.9 -2.8 -0.55 -4.5 q2.2 0.95 2.2 3.7" fill="none" stroke="#efe6d2" strokeWidth="0.65" opacity="0.75" />
      </g>

      {/* the tool maker: fire ring, knapped flint, a propped spear */}
      <g>
        <ellipse cx="13" cy="71" rx="6" ry="2.5" fill="#c4ad7c" opacity="0.9" />
        <circle cx="10.8" cy="70" r="1.4" fill="#8b8f96" />
        <circle cx="14.8" cy="71.4" r="1" fill="#767b82" />
        <circle cx="12.8" cy="72.3" r="0.8" fill="#9ba0a6" />
        <path d="M17.5 69.2 l1.5 -3 1.5 3 Z" fill="#d98a45" />
        <path d="M18.1 69.2 l0.9 -1.8 0.9 1.8 Z" fill="#f2c26b" />
        <path d="M6.5 73 l3 -6" stroke="#8a5a2b" strokeWidth="0.65" />
        <path d="M9.5 67 l1.1 0.55 -0.75 1.1 -1 -0.65 Z" fill="#8b8f96" />
      </g>

      {/* standing stones between village and river */}
      <path d="M63 82 l0.8 -3.8 1.2 3.8 Z" fill="#8f9498" />
      <path d="M66 82.5 l0.6 -2.6 0.9 2.6 Z" fill="#a5aaae" />

      {/* bottom-left: hazy foothills */}
      <path d="M0 88 Q14 82 30 86 Q20 92 0 94 Z" fill="#9db073" opacity="0.6" />
      <g stroke="#7c8b52" strokeWidth="0.5" fill="none" opacity="0.8">
        <path d="M34 92 q1 -2.5 2 0 M44 90 q1 -2.5 2 0 M54 92 q1 -2.5 2 0" />
      </g>
    </svg>
  );
}
