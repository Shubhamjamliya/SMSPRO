import React from "react";

/**
 * Hand-drawn pictograms for the service picker.
 *
 * Deliberately not an icon set: each is a flat, two-tone drawing of the thing itself — a crane
 * and a building, a bowl, a parcel — built from plain geometric shapes so the seven read as one
 * family. `accent` is the service's own colour, `ink` the dark detail, and `paper` the colour of
 * the surface behind (used for windows and cut-outs), so the same drawing works on a light card
 * and on the dark featured panel.
 */

const Svg = ({ children, size = 44, title }) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {children}
  </svg>
);

/** A building going up beside a tower crane. */
function Construction({ accent, ink, paper, ...rest }) {
  return (
    <Svg {...rest}>
      <rect x="4" y="54" width="56" height="4" fill={ink} />
      <rect x="8" y="24" width="24" height="30" fill={accent} />
      {[0, 1, 2].flatMap((r) =>
        [0, 1].map((c) => (
          <rect key={`${r}-${c}`} x={13 + c * 10} y={29 + r * 8} width="5" height="5" fill={paper} />
        )),
      )}
      <rect x="42" y="8" width="4" height="46" fill={ink} />
      <rect x="22" y="8" width="36" height="4" fill={ink} />
      <rect x="50" y="12" width="9" height="5" fill={ink} />
      <rect x="26" y="12" width="1.6" height="4" fill={ink} />
      <rect x="22" y="16" width="9.6" height="4" fill={accent} />
    </Svg>
  );
}

/** A bowl with steam. */
function Food({ accent, ink, ...rest }) {
  return (
    <Svg {...rest}>
      <path d="M6 30h52a26 26 0 0 1-52 0z" fill={accent} />
      <rect x="22" y="54" width="20" height="4" fill={ink} />
      <path
        d="M22 22c-3-4 3-6 0-11M32 22c-3-4 3-6 0-11M42 22c-3-4 3-6 0-11"
        stroke={ink}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** A shopping bag with a stopwatch: groceries in minutes. */
function Quick({ accent, ink, paper, ...rest }) {
  return (
    <Svg {...rest}>
      <path d="M14 22h36l3 34H11z" fill={accent} />
      <path d="M22 22v-3a10 10 0 0 1 20 0v3" stroke={ink} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="40" r="10" fill={paper} />
      <path d="M32 33v7l4.5 3" stroke={ink} strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A parcel with tape. */
function Porter({ accent, ink, paper, ...rest }) {
  return (
    <Svg {...rest}>
      <polygon points="8,22 32,32 32,58 8,48" fill={accent} />
      <polygon points="32,32 56,22 56,48 32,58" fill={ink} />
      <polygon points="8,22 32,12 56,22 32,32" fill={accent} fillOpacity="0.55" />
      <path d="M20 17l24 10" stroke={paper} strokeWidth="4" />
      <path d="M32 32v26" stroke={paper} strokeWidth="2" />
    </Svg>
  );
}

/** A cab with its roof sign. */
function Taxi({ accent, ink, paper, ...rest }) {
  return (
    <Svg {...rest}>
      <rect x="25" y="14" width="14" height="7" rx="1.5" fill={ink} />
      <path d="M5 42l7-15a6 6 0 0 1 5.4-3.5h29.2A6 6 0 0 1 52 27l7 15v10H5z" fill={accent} />
      <path d="M17 28h30l4 9H13z" fill={paper} />
      <rect x="5" y="42" width="54" height="3" fill={ink} />
      <circle cx="19" cy="52" r="7" fill={ink} />
      <circle cx="45" cy="52" r="7" fill={ink} />
      <circle cx="19" cy="52" r="2.4" fill={paper} />
      <circle cx="45" cy="52" r="2.4" fill={paper} />
    </Svg>
  );
}

/** A scooter. */
function Bike({ accent, ink, paper, ...rest }) {
  return (
    <Svg {...rest}>
      <circle cx="15" cy="47" r="9" fill="none" stroke={ink} strokeWidth="4" />
      <circle cx="50" cy="47" r="9" fill="none" stroke={ink} strokeWidth="4" />
      <circle cx="15" cy="47" r="2.4" fill={ink} />
      <circle cx="50" cy="47" r="2.4" fill={ink} />
      <path d="M15 47h20l11-25" stroke={accent} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="9" y="28" width="22" height="7" rx="3.5" fill={accent} />
      <path d="M46 22h9" stroke={ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M46 22l4 25" stroke={ink} strokeWidth="3.4" strokeLinecap="round" />
    </Svg>
  );
}

/** A house with a gear in its window. */
function Services({ accent, ink, paper, ...rest }) {
  return (
    <Svg {...rest}>
      <path d="M6 30L32 7l26 23v26H6z" fill={accent} />
      {[0, 45, 90, 135].map((deg) => (
        <rect key={deg} x="30" y="19" width="4" height="22" fill={ink} transform={`rotate(${deg} 32 30)`} />
      ))}
      <circle cx="32" cy="30" r="7.5" fill={ink} />
      <circle cx="32" cy="30" r="3.2" fill={paper} />
      <rect x="25" y="44" width="14" height="12" fill={paper} />
    </Svg>
  );
}

const PICTOGRAMS = {
  construction: Construction,
  food: Food,
  quickCommerce: Quick,
  porter: Porter,
  taxi: Taxi,
  bikeRent: Bike,
  serviceProvider: Services,
};

export default function ModulePictogram({ moduleKey, accent, ink = "#1F1A17", paper = "#FFFFFF", size = 44, title }) {
  const Drawing = PICTOGRAMS[moduleKey];
  return Drawing ? <Drawing accent={accent} ink={ink} paper={paper} size={size} title={title} /> : null;
}
