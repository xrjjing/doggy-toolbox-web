<template>
  <div class="brand-mascot">
    <svg
      class="brand-mascot__svg"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="brand-mascot-face"
          x1="16"
          y1="14"
          x2="57"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" :stop-color="'var(--mascot-face-top)'" />
          <stop offset="100%" :stop-color="'var(--mascot-face-bottom)'" />
        </linearGradient>
        <radialGradient
          id="brand-mascot-snoute"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(36 42) rotate(90) scale(18 17)"
        >
          <stop offset="0%" stop-color="rgba(255,255,255,0.92)" />
          <stop offset="100%" stop-color="var(--mascot-snoute-shadow)" />
        </radialGradient>
        <radialGradient
          id="brand-mascot-cheek-left"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(25 42) rotate(90) scale(7 8)"
        >
          <stop offset="0%" stop-color="var(--mascot-cheek)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient
          id="brand-mascot-cheek-right"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(47 42) rotate(90) scale(7 8)"
        >
          <stop offset="0%" stop-color="var(--mascot-cheek)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <ellipse cx="36" cy="61" rx="18" ry="6.6" class="brand-mascot__shadow" />

      <path
        class="brand-mascot__ear"
        d="M19 25.6C15.2 21.5 13.4 17 13.4 12.9C13.4 9.4 15.7 7 19 7C23.5 7 27.1 11 29.8 18.6L27.1 35.8C23.5 34.2 21.1 30.5 19 25.6Z"
      />
      <path
        class="brand-mascot__ear"
        d="M53 25.6C56.8 21.5 58.6 17 58.6 12.9C58.6 9.4 56.3 7 53 7C48.5 7 44.9 11 42.2 18.6L44.9 35.8C48.5 34.2 50.9 30.5 53 25.6Z"
      />

      <path
        d="M36 13.4C24.2 13.4 16.6 21.8 16.6 33.2C16.6 44.3 22.8 54.8 36 54.8C49.2 54.8 55.4 44.3 55.4 33.2C55.4 21.8 47.8 13.4 36 13.4Z"
        class="brand-mascot__face"
        fill="url(#brand-mascot-face)"
      />

      <ellipse cx="36" cy="39" rx="15.1" ry="12.9" class="brand-mascot__snout-pad" />

      <ellipse cx="28.9" cy="31.5" rx="5.2" ry="6.5" class="brand-mascot__eye" />
      <ellipse cx="43.1" cy="31.5" rx="5.2" ry="6.5" class="brand-mascot__eye" />
      <circle cx="27.4" cy="29.6" r="1.45" class="brand-mascot__eye-glint" />
      <circle cx="41.6" cy="29.6" r="1.45" class="brand-mascot__eye-glint" />
      <circle cx="30.4" cy="33.6" r="0.7" class="brand-mascot__eye-glint-secondary" />
      <circle cx="44.6" cy="33.6" r="0.7" class="brand-mascot__eye-glint-secondary" />

      <ellipse cx="24.6" cy="41.8" rx="6.2" ry="5.2" fill="url(#brand-mascot-cheek-left)" />
      <ellipse cx="47.4" cy="41.8" rx="6.2" ry="5.2" fill="url(#brand-mascot-cheek-right)" />

      <ellipse
        cx="36"
        cy="40.8"
        rx="11.8"
        ry="10.2"
        class="brand-mascot__snoute"
        fill="url(#brand-mascot-snoute)"
      />

      <path
        d="M32.4 38.6C32.4 36.9 34 35.7 36 35.7C38 35.7 39.6 36.9 39.6 38.6C39.6 40.2 38 41.5 36 41.5C34 41.5 32.4 40.2 32.4 38.6Z"
        class="brand-mascot__nose"
      />

      <path d="M36 41.6V44.5" class="brand-mascot__mouth" />
      <path d="M32.2 45.2C33.2 46.5 34.5 47.1 36 47.1C37.5 47.1 38.8 46.5 39.8 45.2" class="brand-mascot__mouth" />

      <g class="brand-mascot__tongue-group">
        <path
          d="M33.5 44.9C33.5 43.7 34.6 42.8 36 42.8C37.4 42.8 38.5 43.7 38.5 44.9V49.8C38.5 51.9 37.5 53 36 53C34.5 53 33.5 51.9 33.5 49.8V44.9Z"
          class="brand-mascot__tongue"
        />
        <path d="M36 45.2V51.6" class="brand-mascot__tongue-line" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.brand-mascot {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}

.brand-mascot__svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.brand-mascot__shadow {
  fill: rgba(31, 41, 55, 0.12);
  filter: blur(2px);
}

.brand-mascot__ear {
  fill: var(--mascot-ear, var(--mascot-face-bottom));
  transform-origin: center top;
  transition:
    fill 220ms ease,
    transform 220ms ease;
}

.brand-mascot__face {
  filter: drop-shadow(0 10px 24px rgba(15, 23, 42, 0.18));
}

.brand-mascot__snout-pad {
  fill: rgba(255, 255, 255, 0.1);
}

.brand-mascot__eye {
  fill: var(--mascot-eye, #1a1a2e);
}

.brand-mascot__eye-glint {
  fill: rgba(255, 255, 255, 0.92);
}

.brand-mascot__eye-glint-secondary {
  fill: rgba(255, 255, 255, 0.72);
}

.brand-mascot__snoute {
  filter: drop-shadow(0 3px 5px rgba(255, 255, 255, 0.3));
}

.brand-mascot__nose {
  fill: var(--mascot-nose, #2d2d2d);
  transition: fill 220ms ease;
}

.brand-mascot__mouth {
  stroke: var(--mascot-nose, #2d2d2d);
  stroke-width: 2;
  stroke-linecap: round;
  transition: stroke 220ms ease;
}

.brand-mascot__tongue-group {
  transform-origin: 32px 40px;
  transition: transform 180ms ease;
}

.brand-mascot__tongue {
  fill: var(--mascot-tongue, #ff6b8a);
}

.brand-mascot__tongue-line {
  stroke: rgba(175, 59, 91, 0.45);
  stroke-width: 1.6;
  stroke-linecap: round;
}

:global(.brand-card:hover) .brand-mascot__tongue-group {
  transform: translateY(2.2px) scaleY(1.16);
}

:global(.brand-card:hover) .brand-mascot__ear:first-of-type {
  transform: rotate(-8deg) translateX(-1px) translateY(1px);
}

:global(.brand-card:hover) .brand-mascot__ear:last-of-type {
  transform: rotate(8deg) translateX(1px) translateY(1px);
}
</style>
