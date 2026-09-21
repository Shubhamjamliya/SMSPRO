/**
 * The packages the customer app showed before they became admin-managed.
 *
 * Kept here so an admin can load them into an empty segment with one click
 * (POST /construction/admin/packages/seed-defaults) rather than retyping four
 * homes' worth of specifications. Loading is refused if the segment already has
 * any package, so it can never overwrite what the team has since edited.
 */
export const DEFAULT_PACKAGES = {
  residential: [
    {
      name: 'Silver Package',
      tagline: 'Essential Construction',
      price: 1650,
      unit: 'per sq.ft',
      badge: 'Standard',
      theme: 'slate',
      icon: 'shield',
      isPopular: false,
      features: [
        'Ultratech / TATA TMT Steel Grade A',
        'Double Charged Vitrified Tiles (2x2 ft)',
        'Flush Main Door & Internal Doors',
        'Standard Electrical (Anchor / Cello)',
        'Essential Plumbing Fittings (Cera)',
        '10-Year Structural Warranty',
      ],
    },
    {
      name: 'Gold Package',
      tagline: 'Premium Quality & Finish',
      price: 1950,
      unit: 'per sq.ft',
      badge: '★ Most Popular',
      theme: 'amber',
      icon: 'crown',
      isPopular: true,
      features: [
        'Premium Cement & TATA Tiscon TMT Steel',
        'Double Charged Vitrified Tiles (4x2 ft)',
        'Teak Wood Main Door Frame & Shutter',
        'Jaquar / Cera Premium Bath Fittings',
        'Full Modular Kitchen Setup',
        '3D Architectural & Floor Plan Elevation',
        '15-Year Structural Warranty',
      ],
    },
    {
      name: 'Diamond Package',
      tagline: 'Luxury Living Standards',
      price: 2450,
      unit: 'per sq.ft',
      badge: 'Luxury',
      theme: 'cyan',
      icon: 'sparkles',
      isPopular: false,
      features: [
        'Grade A+ TMT Steel & Waterproof Concrete',
        'Italian Marble Flooring in Living Room',
        'Teak Wood Doors & Soundproof Windows',
        'Kohler / Grohe Designer Sanitary Ware',
        'Designer False Ceiling & Cove Lighting',
        'Solar Water Heating Provisions',
        '20-Year Structural Warranty',
      ],
    },
    {
      name: 'Platinum Package',
      tagline: 'Bespoke Royal Architecture',
      price: 2950,
      unit: 'per sq.ft',
      badge: 'Elite Architectural',
      theme: 'purple',
      icon: 'award',
      isPopular: false,
      features: [
        'Imported Italian Marble & Hardwood Flooring',
        'Smart Home Automation & Keyless Locks',
        'Fully Loaded German Modular Kitchen',
        'VRV Central Air Conditioning Infrastructure',
        'Custom Landscaping & Private Terrace Garden',
        'Dedicated Senior Architect & Site Manager',
        'Lifetime Structural Warranty',
      ],
    },
  ],
  commercial: [
    {
      name: 'Corporate Office Fitouts',
      tagline: 'Modern Workspaces & Cabin Layouts',
      price: 1200,
      unit: 'per sq.ft',
      badge: 'Office',
      theme: 'blue',
      icon: 'building',
      description:
        'Turnkey office interiors, acoustic glass partitions, workstation wiring, HVAC & reception counters.',
    },
    {
      name: 'Retail Showrooms & Outlets',
      tagline: 'High-Footfall Brand Outlets',
      price: 1450,
      unit: 'per sq.ft',
      badge: 'Retail',
      theme: 'emerald',
      icon: 'sparkles',
      description:
        'High-impact store facades, display shelving, spot lighting, security systems & POS counter setups.',
    },
    {
      name: 'Commercial Turnkey Building',
      tagline: 'Multi-Storey Commercial Complexes',
      price: 1850,
      unit: 'per sq.ft',
      badge: 'Turnkey',
      theme: 'amber',
      icon: 'hardhat',
      description:
        'Full RCC structure, glass curtain walling, elevator shafts, parking basements & fire compliance.',
    },
    {
      name: 'Warehouses & Industrial Sheds',
      tagline: 'PEB Sheds & Heavy Logistics',
      price: 1100,
      unit: 'per sq.ft',
      badge: 'Industrial',
      theme: 'slate',
      icon: 'layers',
      description:
        'Pre-Engineered Building (PEB) steel structures, heavy load flooring, loading docks & ventilation.',
    },
  ],
};
