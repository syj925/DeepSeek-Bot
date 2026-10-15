// Original landscape, bundled with the plugin so the default needs no network.
const pines = (count, start, end, base, height, seed) => {
  let value = seed
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296 }
  return Array.from({ length: count }, (_, index) => {
    const x = start + (end - start) * index / count
    const y = base(x) + random() * 12
    const size = height * (.5 + random() * .7)
    const w = size * (.14 + random() * .05)
    return `<path d="M${x.toFixed(1)} ${(y - size).toFixed(1)}l${w.toFixed(1)} ${(size * .56).toFixed(1)}h${(-w * .45).toFixed(1)}l${(w * .8).toFixed(1)} ${(size * .25).toFixed(1)}h${(-w * .5).toFixed(1)}l${(w * .65).toFixed(1)} ${(size * .19).toFixed(1)}h${(-w * 3).toFixed(1)}l${(w * .65).toFixed(1)} ${(-size * .19).toFixed(1)}h${(-w * .5).toFixed(1)}l${(w * .8).toFixed(1)} ${(-size * .25).toFixed(1)}h${(-w * .45).toFixed(1)}Z"/>`
  }).join('')
}

export const canvasLandscape = `
<svg xmlns="http://www.w3.org/2000/svg" width="2560" height="1600" viewBox="0 0 2560 1600">
  <defs>
    <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#91abb8"/><stop offset=".63" stop-color="#d0d9d4"/><stop offset="1" stop-color="#ece5ce"/></linearGradient>
    <radialGradient id="light"><stop stop-color="#f5ebd1" stop-opacity=".75"/><stop offset="1" stop-color="#f5ebd1" stop-opacity="0"/></radialGradient>
    <linearGradient id="far" x2="0" y2="1"><stop stop-color="#8caaa9"/><stop offset="1" stop-color="#bccac0"/></linearGradient>
    <linearGradient id="middle" x2="0" y2="1"><stop stop-color="#658787"/><stop offset="1" stop-color="#9ab4aa"/></linearGradient>
    <linearGradient id="near" x2=".8" y2="1"><stop stop-color="#304f51"/><stop offset="1" stop-color="#63877b"/></linearGradient>
    <linearGradient id="water" x2="0" y2="1"><stop stop-color="#abc2b8"/><stop offset=".48" stop-color="#739c9b"/><stop offset="1" stop-color="#3b6872"/></linearGradient>
    <linearGradient id="reflection" x2="0" y2="1"><stop stop-color="white" stop-opacity=".55"/><stop offset=".85" stop-color="white" stop-opacity="0"/></linearGradient>
    <linearGradient id="bank" x2=".6" y2="1"><stop stop-color="#42675d"/><stop offset="1" stop-color="#183c3b"/></linearGradient>
    <linearGradient id="mist"><stop stop-color="#dee5d6" stop-opacity="0"/><stop offset=".48" stop-color="#e8eadb" stop-opacity=".78"/><stop offset="1" stop-color="#dee5d6" stop-opacity="0"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="haze"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".45" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <mask id="fade"><rect x="0" y="770" width="2560" height="830" fill="url(#reflection)"/></mask>
    <g id="mountains">
      <path fill="url(#far)" d="M-40 660C100 615 206 402 352 359S547 480 661 479C787 479 853 334 945 350S1082 480 1193 501C1319 518 1391 398 1502 420S1654 535 1752 487C1911 411 1986 289 2127 324S2372 462 2600 371V810H-40Z"/>
      <path fill="url(#middle)" d="M-40 508C111 441 223 540 350 547S531 598 619 641C718 689 782 626 875 618S1034 688 1124 718C1227 753 1324 679 1438 674S1646 577 1766 547C1869 520 1965 567 2096 496S2362 287 2600 311V817H-40Z"/>
      <path fill="url(#near)" d="M-40 385C73 407 169 518 269 548S434 650 518 684C615 723 703 729 800 763C607 782 496 796 320 813H-40ZM2600 378C2458 390 2349 476 2233 515S2083 595 1975 641C1855 692 1745 730 1600 764C1793 790 2081 810 2600 820Z"/>
      <path fill="#7f9e91" opacity=".24" d="M2600 407C2434 438 2343 507 2257 557S2043 654 1948 709C2159 658 2354 551 2600 487ZM-40 443C130 468 253 588 355 638S561 726 657 750C434 716 195 584-40 527Z"/>
      <g fill="#335a51" opacity=".68">${pines(110, -20, 780, x => 452 + .43 * x, 46, 19)}${pines(150, 1700, 2580, x => 759 - .39 * (x - 1700), 48, 31)}</g>
    </g>
  </defs>
  <rect width="2560" height="1600" fill="url(#sky)"/>
  <ellipse cx="1190" cy="470" rx="1090" ry="560" fill="url(#light)"/>
  <g filter="url(#haze)" fill="url(#mist)" opacity=".38"><ellipse cx="1090" cy="257" rx="1000" ry="36"/><ellipse cx="1410" cy="379" rx="1100" ry="25"/></g>
  <use href="#mountains" filter="url(#soft)"/>
  <rect y="784" width="2560" height="816" fill="url(#water)"/>
  <g mask="url(#fade)"><use href="#mountains" transform="translate(0 1570) scale(1 -1)" filter="url(#soft)"/></g>
  <g fill="url(#mist)" filter="url(#haze)"><ellipse cx="1270" cy="761" rx="1250" ry="35"/><ellipse cx="1310" cy="817" rx="1170" ry="22" opacity=".6"/></g>
  <g fill="none" stroke="#d8e3d5" stroke-linecap="round" opacity=".17">
    <path d="M654 854h1072M431 881h592m266 0h470M768 915h1125M326 962h421m146 0h586m107 0h508M621 1022h685m227 0h738M156 1096h472m315 0h1012M470 1191h386m268 0h1067M255 1324h659m365 0h990M651 1480h1184"/>
  </g>
  <path fill="url(#bank)" d="M-30 1083C129 1091 178 1134 274 1171S400 1218 474 1276C329 1270 163 1240-30 1248Z"/>
  <g fill="#284e43">${pines(46, -30, 355, x => 1110 + .35 * Math.max(0, x), 120, 73)}</g>
  <path fill="url(#bank)" d="M2600 1072C2473 1141 2388 1222 2280 1304S2089 1417 2007 1453C2144 1483 2397 1501 2600 1498Z"/>
  <g fill="#244b42">${pines(74, 2140, 2600, x => 1448 - .7 * (x - 2140), 132, 29)}</g>
  <path fill="#183e3c" opacity=".6" d="M-30 1485C175 1466 358 1539 551 1600H-30ZM2600 1490C2363 1460 2298 1556 2112 1600H2600Z"/>
  <rect width="2560" height="1600" filter="url(#grain)" opacity=".025" style="mix-blend-mode:soft-light"/>
</svg>`

export const canvasLandscapeUrl = `data:image/svg+xml,${encodeURIComponent(canvasLandscape)}`
