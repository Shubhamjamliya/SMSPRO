/**
 * Starter construction catalogue.
 *
 * The BRD leaves the service list open (question 3) — no list exists anywhere in
 * the business documents. This is a working draft for SMS Pro Venture to correct,
 * built around the Indian residential and small-commercial market rather than
 * invented from nothing. Every field here is editable from Admin → Construction,
 * so replacing any of it needs no code change.
 *
 * Budgets are indicative ranges in rupees, used only to help a customer
 * self-select before they enquire. They are NOT prices — construction is quoted
 * after a site visit, which is the entire premise of the module.
 *
 * Stage plans are only consulted when settings.stages.mode is 'platform_fixed'.
 * The default mode is 'contractor_proposed', where the contractor sets stages in
 * their quote. They are included so the fixed mode is usable out of the box.
 */

export const CONSTRUCTION_CATALOGUE = [
  {
    name: 'New Building Construction',
    description: 'Building from the ground up — houses, duplexes, villas and small apartment blocks.',
    displayOrder: 1,
    services: [
      {
        name: 'Independent House Construction',
        description:
          'A complete single-family house built from foundation to handover, including structure, roofing, plastering and basic finishing.',
        typicalDurationText: '8 to 14 months',
        typicalBudget: { min: 1500000, max: 8000000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Electrical', 'Plumbing', 'Finishing'],
        covers: [
          'Site clearing and excavation',
          'Foundation and footing',
          'RCC structure — columns, beams, slabs',
          'Brickwork and block masonry',
          'Internal and external plastering',
          'Basic electrical wiring and points',
          'Plumbing lines and sanitary fittings',
          'Doors, windows and grills',
          'Flooring and wall tiling',
          'Interior and exterior painting',
        ],
        excludes: [
          'Land cost and registration',
          'Government approvals and sanction fees',
          'Architectural and structural design fees',
          'Modular kitchen and wardrobes',
          'Furniture, curtains and soft furnishing',
          'Compound wall and gate',
          'Borewell and water connection',
        ],
        defaultStages: [
          { name: 'Mobilisation and site setup', percentage: 10, typicalDurationDays: 15 },
          { name: 'Foundation and plinth', percentage: 15, typicalDurationDays: 45 },
          { name: 'Ground floor structure', percentage: 20, typicalDurationDays: 60 },
          { name: 'Upper floor and roof slab', percentage: 20, typicalDurationDays: 60 },
          { name: 'Masonry and plastering', percentage: 15, typicalDurationDays: 45 },
          { name: 'Electrical, plumbing and flooring', percentage: 12, typicalDurationDays: 45 },
          { name: 'Painting, finishing and handover', percentage: 8, typicalDurationDays: 30 },
        ],
      },
      {
        name: 'Duplex / Villa Construction',
        description:
          'A two-level home built to a custom design, with higher specification finishing than a standard house.',
        typicalDurationText: '10 to 18 months',
        typicalBudget: { min: 3000000, max: 15000000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Electrical', 'Plumbing', 'Finishing', 'External works'],
        covers: [
          'Excavation and foundation',
          'RCC framed structure across both levels',
          'Internal staircase',
          'Brickwork, plastering and waterproofing',
          'Electrical wiring with distribution boards',
          'Plumbing, drainage and sanitary fittings',
          'Flooring, dado and bathroom tiling',
          'Doors, windows and safety grills',
          'Painting inside and out',
        ],
        excludes: [
          'Land cost and legal charges',
          'Design and structural consultancy',
          'Interior furniture and false ceiling',
          'Landscaping and outdoor lighting',
          'Solar, lift or home automation',
          'Swimming pool',
        ],
        defaultStages: [
          { name: 'Mobilisation and setting out', percentage: 8, typicalDurationDays: 15 },
          { name: 'Foundation and plinth', percentage: 14, typicalDurationDays: 50 },
          { name: 'Ground floor structure', percentage: 18, typicalDurationDays: 70 },
          { name: 'First floor and roof', percentage: 18, typicalDurationDays: 70 },
          { name: 'Masonry, plastering and waterproofing', percentage: 15, typicalDurationDays: 55 },
          { name: 'Services and flooring', percentage: 15, typicalDurationDays: 55 },
          { name: 'Finishing and handover', percentage: 12, typicalDurationDays: 40 },
        ],
      },
      {
        name: 'Apartment / Multi-unit Building',
        description:
          'A small residential block of several flats, built as a single project with shared services.',
        typicalDurationText: '14 to 30 months',
        typicalBudget: { min: 5000000, max: 50000000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Electrical', 'Plumbing', 'Common areas', 'Finishing'],
        covers: [
          'Excavation, foundation and RCC structure',
          'All floors, staircases and common lobbies',
          'Overhead and underground water tanks',
          'Common area electrical and lighting',
          'Drainage and sewage lines',
          'Internal finishing for each unit',
          'Parking area flooring',
        ],
        excludes: [
          'Land cost and approvals',
          'Lift installation',
          'Fire fighting system',
          'DG set and transformer',
          'Interior fit-out of individual flats',
          'Landscaping and amenities',
        ],
      },
    ],
  },

  {
    name: 'Renovation & Remodelling',
    description: 'Reworking an existing home — whole house, or one room at a time.',
    displayOrder: 2,
    services: [
      {
        name: 'Full Home Renovation',
        description:
          'A complete refresh of an existing home: layout changes, new services, new flooring and finishing throughout.',
        typicalDurationText: '2 to 5 months',
        typicalBudget: { min: 300000, max: 2500000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Demolition', 'Civil work', 'Electrical', 'Plumbing', 'Finishing'],
        covers: [
          'Careful demolition and debris removal',
          'Wall additions or removals',
          'Rewiring and new electrical points',
          'New plumbing lines and fittings',
          'Fresh flooring throughout',
          'Bathroom and kitchen renovation',
          'Plastering, putty and painting',
        ],
        excludes: [
          'Structural strengthening if required',
          'Furniture and appliances',
          'Society permissions and deposits',
          'Temporary accommodation during work',
        ],
        defaultStages: [
          { name: 'Demolition and clearing', percentage: 15, typicalDurationDays: 10 },
          { name: 'Civil and layout changes', percentage: 25, typicalDurationDays: 25 },
          { name: 'Electrical and plumbing', percentage: 25, typicalDurationDays: 25 },
          { name: 'Flooring and tiling', percentage: 20, typicalDurationDays: 20 },
          { name: 'Painting and handover', percentage: 15, typicalDurationDays: 15 },
        ],
      },
      {
        name: 'Kitchen Renovation',
        description:
          'Rebuilding a kitchen — plumbing, electrical points, counter, dado tiling and finishing.',
        typicalDurationText: '3 to 6 weeks',
        typicalBudget: { min: 150000, max: 800000 },
        defaultUnit: 'lumpsum',
        defaultQuoteSections: ['Civil work', 'Electrical', 'Plumbing', 'Finishing'],
        covers: [
          'Removing the old counter and tiles',
          'New granite or quartz counter',
          'Dado tiling up to the required height',
          'Sink, tap and drainage work',
          'Electrical points for appliances',
          'Painting and finishing',
        ],
        excludes: [
          'Modular kitchen cabinets and shutters',
          'Chimney, hob and appliances',
          'Water purifier and plumbing beyond the kitchen',
        ],
      },
      {
        name: 'Bathroom Renovation',
        description:
          'A full bathroom rebuild including waterproofing, concealed plumbing, tiling and fittings.',
        typicalDurationText: '2 to 4 weeks',
        typicalBudget: { min: 80000, max: 400000 },
        defaultUnit: 'lumpsum',
        defaultQuoteSections: ['Demolition', 'Waterproofing', 'Plumbing', 'Finishing'],
        covers: [
          'Dismantling old tiles and fittings',
          'Waterproofing the floor and walls',
          'Concealed plumbing and drainage',
          'Wall and floor tiling',
          'Sanitary ware and CP fittings installation',
          'False ceiling and exhaust',
        ],
        excludes: [
          'Sanitary ware and fittings if client-supplied',
          'Geyser and electrical appliances',
          'Structural changes to the bathroom footprint',
        ],
      },
    ],
  },

  {
    name: 'Interior Fit-out',
    description: 'Furniture, ceilings and finishes that turn a finished shell into a home.',
    displayOrder: 3,
    services: [
      {
        name: 'Modular Kitchen',
        description:
          'Designed and installed modular kitchen with base units, wall units, shutters and hardware.',
        typicalDurationText: '3 to 6 weeks',
        typicalBudget: { min: 150000, max: 1000000 },
        defaultUnit: 'rft',
        defaultQuoteSections: ['Carcass', 'Shutters', 'Hardware', 'Installation'],
        covers: [
          'Site measurement and design',
          'Base and wall cabinet carcass',
          'Shutters with chosen finish',
          'Soft-close hinges and channels',
          'Handles and internal accessories',
          'Delivery and installation',
        ],
        excludes: [
          'Counter top and dado tiling',
          'Chimney, hob, oven and appliances',
          'Sink and tap',
          'Electrical and plumbing changes',
        ],
      },
      {
        name: 'Wardrobes & Storage',
        description: 'Built-in or modular wardrobes, lofts and storage units made to measure.',
        typicalDurationText: '2 to 5 weeks',
        typicalBudget: { min: 60000, max: 500000 },
        defaultUnit: 'rft',
        defaultQuoteSections: ['Carcass', 'Shutters', 'Hardware'],
        covers: [
          'Measurement and layout design',
          'Wardrobe carcass and internal shelving',
          'Sliding or openable shutters',
          'Mirror, drawers and hanging rods',
          'Loft storage above',
          'Installation and finishing',
        ],
        excludes: [
          'Wall repairs behind the wardrobe',
          'Electrical points inside the wardrobe',
          'Loose furniture',
        ],
      },
      {
        name: 'False Ceiling & Lighting',
        description: 'Gypsum or POP false ceiling with concealed and profile lighting.',
        typicalDurationText: '2 to 4 weeks',
        typicalBudget: { min: 40000, max: 300000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Ceiling', 'Electrical', 'Finishing'],
        covers: [
          'GI framework and gypsum boarding',
          'Cove and profile detailing',
          'Concealed wiring for ceiling lights',
          'Jointing, taping and putty',
          'Primer and final paint',
        ],
        excludes: [
          'Light fittings and fixtures',
          'Fans and their relocation',
          'Structural ceiling repairs',
        ],
      },
    ],
  },

  {
    name: 'Structural Repair & Waterproofing',
    description: 'Fixing leaks, cracks and weakened structure before they become expensive.',
    displayOrder: 4,
    services: [
      {
        name: 'Terrace & Roof Waterproofing',
        description:
          'Treating a leaking terrace or roof with proper slope, membrane and protective screed.',
        typicalDurationText: '1 to 3 weeks',
        typicalBudget: { min: 30000, max: 250000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Surface preparation', 'Waterproofing', 'Protection'],
        covers: [
          'Removing loose and damaged screed',
          'Crack filling and surface preparation',
          'Waterproof coating or membrane',
          'Slope correction for drainage',
          'Protective screed or tile layer',
          'Parapet and drain mouth treatment',
        ],
        excludes: [
          'Structural slab repairs',
          'Internal ceiling repairs after leakage',
          'Rainwater harvesting work',
        ],
      },
      {
        name: 'Crack Repair & Plaster Restoration',
        description:
          'Diagnosing and repairing wall cracks, damp patches and failing plaster.',
        typicalDurationText: '1 to 4 weeks',
        typicalBudget: { min: 50000, max: 500000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Investigation', 'Repair', 'Finishing'],
        covers: [
          'Inspecting and identifying the cause',
          'Cutting out and grouting cracks',
          'Removing hollow or damp plaster',
          'Re-plastering with the right mix',
          'Anti-damp treatment where needed',
          'Putty and repainting the repaired area',
        ],
        excludes: [
          'Structural strengthening',
          'Painting the whole room or building',
          'External scaffolding for high-rise work',
        ],
      },
      {
        name: 'Structural Strengthening',
        description:
          'Reinforcing weakened columns, beams or slabs, carried out to a structural engineer’s design.',
        typicalDurationText: '1 to 3 months',
        typicalBudget: { min: 100000, max: 1000000 },
        defaultUnit: 'lumpsum',
        defaultQuoteSections: ['Investigation', 'Strengthening', 'Finishing'],
        covers: [
          'Condition survey of the affected members',
          'Propping and temporary support',
          'Concrete jacketing or steel plating',
          'Rebar treatment against corrosion',
          'Micro-concreting and grouting',
          'Finishing the repaired members',
        ],
        excludes: [
          'Structural engineer’s design and certification',
          'Laboratory testing of materials',
          'Vacating and rehousing occupants',
        ],
      },
    ],
  },

  {
    name: 'Extension & Additional Floor',
    description: 'Adding space to a building you already own.',
    displayOrder: 5,
    services: [
      {
        name: 'Room Extension',
        description: 'Adding a room to an existing structure at the same level.',
        typicalDurationText: '2 to 4 months',
        typicalBudget: { min: 300000, max: 1500000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Electrical', 'Plumbing', 'Finishing'],
        covers: [
          'Foundation for the new portion',
          'Columns, beams and roof slab',
          'Brickwork and plastering',
          'Joining the new work to the existing structure',
          'Electrical points and wiring',
          'Flooring, doors and windows',
          'Painting',
        ],
        excludes: [
          'Municipal approval for the extension',
          'Structural design fees',
          'Modifications inside the existing rooms',
        ],
      },
      {
        name: 'Additional Floor',
        description:
          'Building an extra floor over an existing building, subject to the structure being able to take it.',
        typicalDurationText: '5 to 10 months',
        typicalBudget: { min: 800000, max: 4000000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Assessment', 'Civil work', 'Electrical', 'Plumbing', 'Finishing'],
        covers: [
          'Load assessment of the existing structure',
          'Column extension and new slab',
          'Staircase to the new floor',
          'Brickwork, plastering and waterproofing',
          'Electrical and plumbing for the new floor',
          'Flooring, doors, windows and painting',
        ],
        excludes: [
          'Structural engineer’s assessment and design',
          'Municipal sanction for additional floor',
          'Strengthening of existing foundations if required',
          'Lift extension',
        ],
      },
      {
        name: 'Balcony / Terrace Enclosure',
        description: 'Enclosing or covering an open balcony or terrace area.',
        typicalDurationText: '3 to 8 weeks',
        typicalBudget: { min: 100000, max: 800000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Fabrication', 'Finishing'],
        covers: [
          'Structural framework',
          'Roofing sheet or slab',
          'Glazing or grill enclosure',
          'Flooring and waterproofing',
          'Finishing and painting',
        ],
        excludes: [
          'Society or municipal permission',
          'Furniture and soft furnishing',
          'Air conditioning',
        ],
      },
    ],
  },

  {
    name: 'Commercial & Shop Fit-out',
    description: 'Getting a shop, office or restaurant ready to trade.',
    displayOrder: 6,
    services: [
      {
        name: 'Retail Shop Fit-out',
        description: 'Turning a bare shop unit into a finished retail space ready to open.',
        typicalDurationText: '1 to 3 months',
        typicalBudget: { min: 300000, max: 2500000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Electrical', 'Interior', 'Signage'],
        covers: [
          'Flooring and wall finishing',
          'False ceiling and lighting',
          'Display units and counters',
          'Electrical points and distribution',
          'Shop front and shutter finishing',
          'Painting and final cleaning',
        ],
        excludes: [
          'Trade licences and municipal permissions',
          'Air conditioning units',
          'Signage board approvals',
          'CCTV, billing and IT systems',
        ],
      },
      {
        name: 'Office Interior Fit-out',
        description:
          'A complete office interior — workstations, cabins, meeting rooms and services.',
        typicalDurationText: '2 to 5 months',
        typicalBudget: { min: 500000, max: 5000000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Electrical', 'HVAC', 'Interior', 'Finishing'],
        covers: [
          'Partitioning and cabin construction',
          'False ceiling and lighting design',
          'Flooring — vitrified, carpet or vinyl',
          'Electrical, data and networking conduits',
          'Workstations and storage units',
          'Painting and glass work',
        ],
        excludes: [
          'IT hardware, servers and networking equipment',
          'Loose furniture and chairs',
          'Fire NOC and statutory approvals',
          'HVAC equipment supply',
        ],
      },
      {
        name: 'Restaurant / Cafe Fit-out',
        description:
          'A food service space including kitchen civil work, seating area and required services.',
        typicalDurationText: '2 to 5 months',
        typicalBudget: { min: 800000, max: 6000000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Civil work', 'Kitchen', 'Electrical', 'Plumbing', 'Interior'],
        covers: [
          'Kitchen civil work and platforms',
          'Grease trap and drainage',
          'Exhaust ducting provision',
          'Seating area interior and lighting',
          'Washroom construction',
          'Flooring, tiling and painting',
        ],
        excludes: [
          'Kitchen equipment and appliances',
          'FSSAI and fire licences',
          'Furniture and crockery',
          'Signage and branding elements',
        ],
      },
    ],
  },

  {
    name: 'External & Site Works',
    description: 'Everything outside the building line — walls, gates, paving and drainage.',
    displayOrder: 7,
    services: [
      {
        name: 'Boundary Wall & Gate',
        description: 'Compound wall with foundation, coping and a main gate.',
        typicalDurationText: '3 to 8 weeks',
        typicalBudget: { min: 100000, max: 800000 },
        defaultUnit: 'rft',
        defaultQuoteSections: ['Civil work', 'Fabrication', 'Finishing'],
        covers: [
          'Excavation and wall foundation',
          'Brick or block masonry wall',
          'Columns and coping',
          'Plastering both faces',
          'Main gate fabrication and fixing',
          'Painting',
        ],
        excludes: [
          'Land survey and boundary demarcation',
          'Automatic gate motors',
          'Security fencing and barbed wire',
        ],
      },
      {
        name: 'Paving & Driveway',
        description: 'Paver block, concrete or stone paving for driveways, parking and pathways.',
        typicalDurationText: '2 to 5 weeks',
        typicalBudget: { min: 50000, max: 500000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Earthwork', 'Base', 'Paving'],
        covers: [
          'Excavation and levelling',
          'Compacted base course',
          'Sand bedding layer',
          'Paver block or stone laying',
          'Edge restraints and joint filling',
        ],
        excludes: [
          'Storm water drainage system',
          'Landscaping and planting',
          'Outdoor lighting',
        ],
      },
      {
        name: 'Drainage & Septic Tank',
        description: 'Underground drainage lines, inspection chambers and septic tank construction.',
        typicalDurationText: '2 to 6 weeks',
        typicalBudget: { min: 80000, max: 600000 },
        defaultUnit: 'lumpsum',
        defaultQuoteSections: ['Excavation', 'Civil work', 'Plumbing'],
        covers: [
          'Excavation for lines and tank',
          'Septic tank construction and plastering',
          'Soak pit',
          'Drainage piping and slope',
          'Inspection chambers and covers',
          'Backfilling and surface restoration',
        ],
        excludes: [
          'Municipal sewer connection charges',
          'Sewage treatment plant',
          'Water supply lines',
        ],
      },
    ],
  },

  {
    name: 'Finishing Works',
    description: 'Standalone finishing jobs when the structure is already sound.',
    displayOrder: 8,
    services: [
      {
        name: 'Painting — Interior & Exterior',
        description: 'Surface preparation, putty, primer and finish coats inside or outside.',
        typicalDurationText: '1 to 4 weeks',
        typicalBudget: { min: 30000, max: 300000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Preparation', 'Painting'],
        covers: [
          'Scraping and surface cleaning',
          'Crack filling and putty application',
          'Sanding to a smooth finish',
          'Primer coat',
          'Two finish coats of paint',
          'Covering and cleaning up afterwards',
        ],
        excludes: [
          'Plaster repairs beyond minor filling',
          'Waterproof coating',
          'Scaffolding for high-rise exteriors',
          'Furniture shifting and storage',
        ],
      },
      {
        name: 'Tiling & Flooring',
        description: 'Supplying and laying floor and wall tiles, or natural stone flooring.',
        typicalDurationText: '2 to 5 weeks',
        typicalBudget: { min: 50000, max: 500000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Preparation', 'Laying', 'Finishing'],
        covers: [
          'Removing existing flooring if required',
          'Base levelling and screed',
          'Tile or stone laying',
          'Skirting',
          'Grouting and joint filling',
          'Cleaning and polishing',
        ],
        excludes: [
          'Tile and stone material if client-supplied',
          'Structural floor repairs',
          'Waterproofing beneath the floor',
        ],
      },
      {
        name: 'Plastering & POP Work',
        description: 'Internal and external plastering, and POP punning for a smooth finish.',
        typicalDurationText: '2 to 6 weeks',
        typicalBudget: { min: 40000, max: 400000 },
        defaultUnit: 'sqft',
        defaultQuoteSections: ['Preparation', 'Plastering', 'Finishing'],
        covers: [
          'Surface cleaning and wetting',
          'Cement plastering to the required thickness',
          'Corner beading and level checking',
          'POP punning where specified',
          'Curing',
        ],
        excludes: [
          'Painting and putty',
          'Structural crack repairs',
          'External scaffolding above two floors',
        ],
      },
    ],
  },
];
