/**
 * Local, public-safe workflow templates for the Foundry Schematic.
 *
 * These are explanatory data only. They neither inspect nor change a Foundry
 * instance, and a renderer or runtime must not infer authority beyond a
 * declared Canon-issued Job Order.
 */

const REQUIRED_KINDS = [
  'projection-signal',
  'intent-candidate',
  'grounding',
  'canon-issue',
  'actuality',
  'grounding-receipt',
  'intent-disposition',
  'projection-capture',
];

const DEFAULT_ACTORS = [
  { id: 'pawn', type: 'pawn', label: 'Pawn' },
  { id: 'steward', type: 'owner', label: 'Facility Steward / Captain' },
  { id: 'agent', type: 'agent', label: 'Assigned Agent' },
];

const DEFAULT_PACKETS = [
  { id: 'projection-signal', type: 'projection', label: 'Freshness-stamped Projection signal' },
  { id: 'intent-candidate', type: 'intent', label: 'Intent candidate' },
  { id: 'intake-receipt', type: 'grounding', label: 'Grounding intake receipt' },
  { id: 'job-order', type: 'job-order', label: 'Bounded Job Order' },
  { id: 'actuality-result', type: 'actuality', label: 'Bounded Actuality result' },
  { id: 'grounding-receipt', type: 'grounding', label: 'Grounding receipt and disposition' },
  { id: 'projection-capture', type: 'projection', label: 'Pawn Projection capture' },
];

const PUBLIC_UNSAFE_PATTERN = /(?:\/(?:Users|private|var)\/|[A-Za-z]:\\|(?:api[_-]?key|secret|token|password)\s*[:=]|https?:\/\/github\.com|git@|\bGPT_OS\b|\bKaydenClark\b)/i;

function routePanels(route, step, freshness = 'fresh') {
  return {
    taskboard: {
      surface: 'canon',
      state: step === 'canon-issue' ? 'job-order-issued' : 'visible-context',
      owner: 'Canon',
    },
    grounding: {
      surface: 'grounding',
      state: step.includes('grounding') ? 'receipt-recorded' : 'pending-or-contextual',
      owner: 'Grounding Journal',
      receipts: [`${route.id}:${step}:receipt`],
    },
    projection: {
      surface: 'projection',
      source: {
        identity: `${route.id}-source`,
        at: '2026-08-03T09:00:00Z',
      },
      captureAt: '2026-08-03T09:05:00Z',
      freshness,
    },
  };
}

function buildRoute({
  id,
  title,
  purpose,
  primaryOwner,
  expectedPackets,
  atlas,
  observableReturn,
  requirements,
  routeSpecific,
}) {
  const jobOrderId = `JO-${id}`;
  const evidence = (kind) => [
    `${id}:${kind}:local-explanatory-evidence`,
    ...routeSpecific.evidence[kind],
  ];
  const dioramaNodes = {
    'projection-signal': ['projection'],
    'intent-candidate': ['intent'],
    grounding: ['grounding'],
    'canon-issue': ['canon', 'canon-taskboard'],
    actuality: [routeSpecific.actualityNode ?? atlas.nodes[0]],
    'grounding-receipt': ['grounding', 'grounding-journal'],
    'intent-disposition': ['intent', 'canon-taskboard'],
    'projection-capture': ['projection', 'pawns'],
  };
  const stepAtlas = (kind) => ({
    nodes: routeSpecific.stepNodes[kind] ?? dioramaNodes[kind],
    edges: routeSpecific.stepEdges[kind] ?? atlas.edges,
  });

  return {
    id,
    title,
    purpose,
    primaryOwner,
    expectedPackets,
    atlas,
    components: atlas.nodes,
    observableReturn,
    requirements,
    boundaries: routeSpecific.boundaries,
    actors: DEFAULT_ACTORS,
    packets: DEFAULT_PACKETS,
    steps: [
      {
        id: `${id}-projection-signal`,
        kind: 'projection-signal',
        title: 'Read a freshness-visible Projection signal',
        actorId: 'pawn',
        packetId: 'projection-signal',
        atlas: stepAtlas('projection-signal'),
        panels: routePanels({ id }, 'projection-signal', 'fresh'),
        evidence: evidence('projection-signal'),
      },
      {
        id: `${id}-intent-candidate`,
        kind: 'intent-candidate',
        title: routeSpecific.intentTitle,
        actorId: 'steward',
        packetId: 'intent-candidate',
        atlas: stepAtlas('intent-candidate'),
        panels: routePanels({ id }, 'intent-candidate'),
        evidence: evidence('intent-candidate'),
      },
      {
        id: `${id}-grounding`,
        kind: 'grounding',
        title: routeSpecific.intakeTitle,
        actorId: 'pawn',
        packetId: 'intake-receipt',
        atlas: stepAtlas('grounding'),
        panels: routePanels({ id }, 'grounding'),
        evidence: evidence('grounding'),
      },
      {
        id: `${id}-canon-issue`,
        kind: 'canon-issue',
        title: 'Canon issues a bounded Job Order',
        actorId: 'steward',
        packetId: 'job-order',
        atlas: stepAtlas('canon-issue'),
        panels: routePanels({ id }, 'canon-issue'),
        jobOrder: {
          id: jobOrderId,
          scope: routeSpecific.jobOrderScope,
          canonRef: `canon:${id}:bounded-work`,
        },
        evidence: evidence('canon-issue'),
      },
      {
        id: `${id}-actuality`,
        kind: 'actuality',
        title: routeSpecific.actualityTitle,
        actorId: 'agent',
        packetId: 'actuality-result',
        atlas: stepAtlas('actuality'),
        panels: routePanels({ id }, 'actuality'),
        jobOrderId,
        evidence: evidence('actuality'),
      },
      {
        id: `${id}-grounding-receipt`,
        kind: 'grounding-receipt',
        title: routeSpecific.receiptTitle,
        actorId: 'agent',
        packetId: 'grounding-receipt',
        atlas: stepAtlas('grounding-receipt'),
        panels: routePanels({ id }, 'grounding-receipt'),
        evidence: evidence('grounding-receipt'),
      },
      {
        id: `${id}-intent-disposition`,
        kind: 'intent-disposition',
        title: routeSpecific.dispositionTitle,
        actorId: 'steward',
        packetId: 'grounding-receipt',
        atlas: stepAtlas('intent-disposition'),
        panels: {
          ...routePanels({ id }, 'intent-disposition'),
          grounding: {
            ...routePanels({ id }, 'intent-disposition').grounding,
            disposition: routeSpecific.disposition,
          },
        },
        disposition: routeSpecific.disposition,
        evidence: evidence('intent-disposition'),
      },
      {
        id: `${id}-projection-capture`,
        kind: 'projection-capture',
        title: 'Pawn captures the named outcome in Projection',
        actorId: 'pawn',
        packetId: 'projection-capture',
        atlas: stepAtlas('projection-capture'),
        panels: {
          ...routePanels({ id }, 'projection-capture', 'fresh'),
          projection: {
            ...routePanels({ id }, 'projection-capture', 'fresh').projection,
            capture: {
              actor: 'Pawn',
              at: '2026-08-03T09:05:00Z',
              freshness: 'fresh',
            },
          },
        },
        evidence: evidence('projection-capture'),
      },
    ],
  };
}

const atlas = {
  adoption: {
    nodes: ['factory', 'product-core', 'forge', 'assay', 'ward', 'gatehouse', 'socket-contracts', 'installed-modules', 'instance-zone', 'projection', 'pawns'],
    edges: ['factory-adopts-product', 'hall-houses-socket', 'module-binds-socket', 'pawn-captures-projection'],
  },
  release: {
    nodes: ['producer-zone', 'forge', 'assay', 'product-output', 'canon', 'grounding', 'projection', 'pawns'],
    edges: ['forge-packages-artifact', 'assay-judges-artifact', 'forge-targets-integration', 'pawn-captures-projection'],
  },
  assay: {
    nodes: ['workshop', 'assay', 'grounding-journal', 'canon-taskboard', 'canon', 'grounding', 'projection', 'pawns'],
    edges: ['assay-reads-workshop', 'finding-becomes-ticket', 'ticket-reenters-intent', 'pawn-captures-projection'],
  },
  workshop: {
    nodes: ['projects', 'workshop', 'workbench', 'wiki', 'canon-taskboard', 'grounding-journal', 'canon', 'grounding', 'projection', 'pawns'],
    edges: ['projects-enrolls-workshop', 'workshop-routes-workbench', 'wiki-stores-context', 'pawn-captures-projection'],
  },
  update: {
    nodes: ['captain', 'agents', 'canon-taskboard', 'workshop', 'workbench', 'grounding-journal', 'canon', 'grounding', 'actuality', 'projection', 'pawns'],
    edges: ['captain-routes-ticket', 'canon-issues-job-order', 'engineer-returns-proof', 'pawn-captures-projection'],
  },
  daily: {
    nodes: ['scheduled-activation', 'scheduling', 'captain', 'agents', 'canon-taskboard', 'canon', 'grounding-journal', 'grounding', 'projection', 'pawns'],
    edges: ['schedule-activates-captain', 'captain-selects-eligible-slice', 'capacity-records-disposition', 'pawn-captures-projection'],
  },
  module: {
    nodes: ['ward', 'socket-contracts', 'installed-modules', 'grounding-journal', 'grounding', 'canon', 'actuality', 'projection', 'pawns'],
    edges: ['hall-houses-socket', 'module-binds-contract', 'ward-records-health', 'pawn-captures-projection'],
  },
};

const ROUTE_BOUNDARY_CONTRACTS = Object.freeze({
  'foundry-adoption': {
    requirements: ['native-halls', 'eligible-module-binding', 'instance-boundary'],
    components: atlas.adoption.nodes,
    edges: atlas.adoption.edges,
    boundaries: { nativeHalls: true, eligibleModuleBinding: true, instanceBoundaryRetained: true },
    disposition: 'adopted-with-instance-boundary-retained',
  },
  'foundry-release': {
    requirements: ['producer-product-boundary', 'independent-assay', 'integration-target', 'owner-only-main'],
    components: atlas.release.nodes,
    edges: atlas.release.edges,
    boundaries: { producerIsAuthoringSource: true, productIsAuthoringSource: false, independentAssay: true, target: 'integration', mainPromotion: 'owner-only' },
    disposition: 'integration-targeted-main-owner-only',
  },
  'independent-project-assay': {
    requirements: ['read-only-assay', 'scoped-workshop', 'successor-job-order', 'ticket-handoff'],
    components: atlas.assay.nodes,
    edges: atlas.assay.edges,
    boundaries: { readOnly: true, repairAuthority: false, handoffRequiresNewJobOrder: true },
    disposition: 'read-only-verdict-with-successor-ticket',
  },
  'new-workshop': {
    requirements: ['projects-wiki-workbench-separation', 'routing-identity', 'canon-evidence-separation'],
    components: atlas.workshop.nodes,
    edges: atlas.workshop.edges,
    boundaries: { owners: ['projects', 'wiki', 'workbench', 'canon', 'grounding'], routingIdentity: true },
    disposition: 'workshop-enrolled-with-separated-ownership',
  },
  'project-update': {
    requirements: ['canonical-ticket-routing', 'bounded-engineer-slice', 'verification-receipt'],
    components: atlas.update.nodes,
    edges: atlas.update.edges,
    boundaries: { canonicalTicket: true, boundedSlice: true, verificationReceiptRequired: true },
    disposition: 'bounded-update-verified',
  },
  'daily-captain-pass': {
    requirements: ['scheduled-activation', 'capacity-disposition', 'eligible-blocked-finished-lanes', 'frozen-slice'],
    components: atlas.daily.nodes,
    edges: atlas.daily.edges,
    boundaries: { scheduledActivation: true, frozenSlice: true, laneDispositions: ['eligible', 'blocked', 'finished'] },
    disposition: 'eligible-blocked-finished-capacity-recorded',
  },
  'module-integration': {
    requirements: ['hall-housed-socket', 'ward-fit-health-evidence', 'no-module-reach-around', 'integration-not-publication'],
    components: atlas.module.nodes,
    edges: atlas.module.edges,
    boundaries: { socketOwner: 'hall', wardEvidence: true, directModuleReachAround: false, publicationLane: false },
    disposition: 'socket-contract-validated-with-ward-evidence',
  },
});

const standardEvidence = (specific) => ({
  'projection-signal': ['source identity and freshness are visible'],
  'intent-candidate': ['candidate has no Actuality authority'],
  grounding: ['placement and boundary checks are recorded'],
  'canon-issue': ['Canon reference and bounded scope are named'],
  actuality: [specific.actuality],
  'grounding-receipt': [specific.receipt],
  'intent-disposition': [specific.disposition],
  'projection-capture': [specific.projection],
});

export const FOUNDRY_SCHEMATIC_WORKFLOWS = {
  id: 'foundry-schematic-workflow-library',
  version: '1.0.0',
  title: 'Foundry Schematic Workflow Library',
  localOnly: true,
  routes: [
    buildRoute({
      id: 'foundry-adoption',
      title: 'Foundry adoption',
      purpose: 'Adopt the portable product while preserving a Factory instance boundary.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['adoption candidate', 'bounded adoption Job Order', 'adoption receipt'],
      atlas: atlas.adoption,
      observableReturn: 'Adoption receipt, retained instance boundary, and fresh Factory Projection.',
      requirements: ['native-halls', 'eligible-module-binding', 'instance-boundary'],
      routeSpecific: {
        intentTitle: 'Frame portable product adoption as an Intent candidate',
        intakeTitle: 'Verify native Halls, eligible socket bindings, and the private instance boundary',
        jobOrderScope: 'Validate a generic product adoption and record only its explanatory receipt.',
        actualityTitle: 'Adopt native Halls and bind eligible Modules through declared socket contracts',
        receiptTitle: 'Return adoption receipt and retained instance-boundary evidence',
        dispositionTitle: 'Dispose adoption as bounded, evidence-backed, and instance-preserving',
        disposition: 'adopted-with-instance-boundary-retained',
        boundaries: { nativeHalls: true, eligibleModuleBinding: true, instanceBoundaryRetained: true },
        evidence: standardEvidence({
          actuality: 'native Halls remain product source; instance bindings remain local',
          receipt: 'adoption receipt records eligible bindings without instance contents',
          disposition: 'no instance state crosses into product source',
          projection: 'Factory Projection identifies the captured adoption outcome and freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
    buildRoute({
      id: 'foundry-release',
      title: 'Foundry release',
      purpose: 'Package a generic producer revision, obtain independent artifact judgment, and target product integration.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['release candidate', 'bounded release Job Order', 'immutable artifact verdict'],
      atlas: atlas.release,
      observableReturn: 'Product disposition, independent verdict, artifact identity, and fresh Projection.',
      requirements: ['producer-product-boundary', 'independent-assay', 'integration-target', 'owner-only-main'],
      routeSpecific: {
        intentTitle: 'Frame a generic producer revision as an Intent candidate',
        intakeTitle: 'Verify producer source, cleaned product artifact boundary, and independent Assay route',
        jobOrderScope: 'Package one generic producer revision for independent artifact judgment and product integration.',
        actualityTitle: 'Forge packages an immutable product artifact and targets integration only',
        receiptTitle: 'Record artifact identity and independent Assay verdict',
        dispositionTitle: 'Dispose release at product integration; reserve main for owner-only promotion',
        disposition: 'integration-targeted-main-owner-only',
        boundaries: { producerIsAuthoringSource: true, productIsAuthoringSource: false, independentAssay: true, target: 'integration', mainPromotion: 'owner-only' },
        evidence: standardEvidence({
          actuality: 'producer source is never replaced by a product remote',
          receipt: 'Assay judgment identifies the exact immutable artifact',
          disposition: 'an Agent cannot promote product main',
          projection: 'Projection captures product disposition and artifact freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
    buildRoute({
      id: 'independent-project-assay',
      title: 'Independent project Assay',
      purpose: 'Read one scoped Workshop and return a judgment without repair authority.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['assay candidate', 'read-only assay Job Order', 'finding handoff ticket'],
      atlas: atlas.assay,
      observableReturn: 'Audit verdict, bounded successor handoff ticket where needed, and fresh Project Projection.',
      requirements: ['read-only-assay', 'scoped-workshop', 'successor-job-order', 'ticket-handoff'],
      routeSpecific: {
        intentTitle: 'Frame a scoped independent review as an Intent candidate',
        intakeTitle: 'Verify read-only Assay scope and the Workshop evidence boundary',
        jobOrderScope: 'Read one scoped Workshop, write a judgment, and emit no repair.',
        actualityTitle: 'Assay examines the scoped Workshop without changing its Actuality',
        receiptTitle: 'Return verdict, evidence, and a bounded handoff ticket for any repair',
        dispositionTitle: 'Dispose judgment as read-only; handoff re-enters a new Intent candidate',
        disposition: 'read-only-verdict-with-successor-ticket',
        boundaries: { readOnly: true, repairAuthority: false, handoffRequiresNewJobOrder: true },
        evidence: standardEvidence({
          actuality: 'Assay has no repair authority and performs no repair',
          receipt: 'finding handoff is a ticket, not inherited authority',
          disposition: 'any repair needs a separate Canon-issued Job Order',
          projection: 'Project Projection captures judgment source and freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
    buildRoute({
      id: 'new-workshop',
      title: 'New Workshop',
      purpose: 'Enroll a generic project and establish distinct Projects, Wiki, Workbench, Canon, and evidence ownership.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['enrollment candidate', 'bounded enrollment Job Order', 'routing receipt'],
      atlas: atlas.workshop,
      observableReturn: 'Enrollment result, routing identity, and fresh Workshop Projection.',
      requirements: ['projects-wiki-workbench-separation', 'routing-identity', 'canon-evidence-separation'],
      routeSpecific: {
        intentTitle: 'Frame generic project enrollment as an Intent candidate',
        intakeTitle: 'Verify the Projects, Wiki, Workbench, Canon, and evidence ownership boundaries',
        jobOrderScope: 'Create a generic Workshop routing identity and explanatory scaffolding.',
        actualityTitle: 'Projects enrolls the Workshop and establishes distinct routing and context surfaces',
        receiptTitle: 'Return enrollment result, routing identity, and evidence ownership receipt',
        dispositionTitle: 'Dispose enrollment with separate Projects, Wiki, Workbench, Canon, and Grounding ownership',
        disposition: 'workshop-enrolled-with-separated-ownership',
        boundaries: { owners: ['projects', 'wiki', 'workbench', 'canon', 'grounding'], routingIdentity: true },
        evidence: standardEvidence({
          actuality: 'Projects routes enrollment; Wiki stores durable context; Workbench supplies harness capability',
          receipt: 'Canon Taskboard and Grounding evidence remain separate surfaces',
          disposition: 'no surface substitutes for another owner',
          projection: 'Workshop Projection records routing identity and freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
    buildRoute({
      id: 'project-update',
      title: 'Project update',
      purpose: 'Route one canonical active-work ticket to one Workshop and return bounded proof.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['active-work candidate', 'bounded update Job Order', 'verification receipt'],
      atlas: atlas.update,
      observableReturn: 'Taskboard disposition, verification receipt, and fresh Project Projection.',
      requirements: ['canonical-ticket-routing', 'bounded-engineer-slice', 'verification-receipt'],
      routeSpecific: {
        intentTitle: 'Frame one canonical active-work ticket as an Intent candidate',
        intakeTitle: 'Verify the canonical ticket, Workshop route, and bounded writer scope',
        jobOrderScope: 'Complete one bounded Workshop update and return named verification proof.',
        actualityTitle: 'An assigned Engineer completes only the bounded Workshop slice',
        receiptTitle: 'Return verification receipt and Taskboard-ready disposition evidence',
        dispositionTitle: 'Dispose the ticket with proof; Projection does not authorize follow-on work',
        disposition: 'bounded-update-verified',
        boundaries: { canonicalTicket: true, boundedSlice: true, verificationReceiptRequired: true },
        evidence: standardEvidence({
          actuality: 'Captain routes but does not grant ambient authority',
          receipt: 'verification proof returns to Grounding before disposition',
          disposition: 'Canon owns ticket state; Projection only captures result',
          projection: 'Project Projection captures source, result, and freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
    buildRoute({
      id: 'daily-captain-pass',
      title: 'Daily Captain pass',
      purpose: 'Use scheduled activation to select one frozen eligible slice and explicitly report all lane dispositions.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['daily activation candidate', 'bounded daily Job Order', 'daily capacity receipt'],
      atlas: atlas.daily,
      observableReturn: 'Per-project capacity disposition, daily receipt, and fresh portfolio Projection.',
      requirements: ['scheduled-activation', 'capacity-disposition', 'eligible-blocked-finished-lanes', 'frozen-slice'],
      routeSpecific: {
        intentTitle: 'Frame scheduled portfolio review as an Intent candidate',
        intakeTitle: 'Verify activation level, available capacity, and canonical active-work eligibility',
        jobOrderScope: 'Select one frozen eligible slice and record eligible, blocked, and finished lane dispositions.',
        actualityTitle: 'Captain coordinates one bounded eligible slice within declared capacity',
        receiptTitle: 'Return daily receipt with explicit eligible, blocked, and finished dispositions',
        dispositionTitle: 'Dispose every evaluated lane as eligible, blocked, or finished',
        disposition: 'eligible-blocked-finished-capacity-recorded',
        boundaries: { scheduledActivation: true, frozenSlice: true, laneDispositions: ['eligible', 'blocked', 'finished'] },
        evidence: standardEvidence({
          actuality: 'activation selects work only after Canon-backed capacity evaluation',
          receipt: 'daily receipt names eligible, blocked, and finished outcomes',
          disposition: 'blocked lanes do not silently disappear from the portfolio view',
          projection: 'portfolio Projection captures receipt source and freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
    buildRoute({
      id: 'module-integration',
      title: 'Module integration',
      purpose: 'Validate a Hall-housed socket contract and Ward health evidence without a Module reach-around.',
      primaryOwner: 'Facility Steward / Captain',
      expectedPackets: ['integration candidate', 'bounded integration Job Order', 'contract and health evidence'],
      atlas: atlas.module,
      observableReturn: 'Contract verdict, Ward health evidence, and fresh Integration Projection.',
      requirements: ['hall-housed-socket', 'ward-fit-health-evidence', 'no-module-reach-around', 'integration-not-publication'],
      routeSpecific: {
        intentTitle: 'Frame declared socket-contract integration as an Intent candidate',
        intakeTitle: 'Verify the Hall-housed contract, Module boundary, and Ward fit/health evidence route',
        jobOrderScope: 'Validate one declared socket contract and record Ward fit and health evidence only.',
        actualityTitle: 'Ward validates integration through the declared Hall socket without direct Module reach-around',
        receiptTitle: 'Return contract verdict and Ward fit/health evidence',
        dispositionTitle: 'Dispose integration without turning Ward into a publication lane',
        disposition: 'socket-contract-validated-with-ward-evidence',
        boundaries: { socketOwner: 'hall', wardEvidence: true, directModuleReachAround: false, publicationLane: false },
        evidence: standardEvidence({
          actuality: 'the Hall owns the socket contract; no direct filesystem or implementation reach-around occurs',
          receipt: 'Ward returns fit and health evidence, not publication authority',
          disposition: 'integration remains distinct from product release',
          projection: 'Integration Projection captures contract verdict and freshness',
        }),
        stepNodes: {},
        stepEdges: {},
      },
    }),
  ],
};

function errorForRoute(route, message) {
  return `${route?.id ?? 'unknown-route'}: ${message}`;
}

function sameList(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function validateRouteBoundaryContract(route, errors) {
  const contract = ROUTE_BOUNDARY_CONTRACTS[route.id];
  if (!contract) {
    errors.push(errorForRoute(route, 'must be one of the seven baseline routes'));
    return;
  }

  for (const requirement of contract.requirements) {
    if (!route.requirements?.includes(requirement)) {
      errors.push(errorForRoute(route, `missing required boundary ${requirement}`));
    }
  }
  if (!sameList(route.components, contract.components)) {
    errors.push(errorForRoute(route, 'components must match its declared Atlas coverage'));
  }
  if (!sameList(route.atlas?.nodes, contract.components)) {
    errors.push(errorForRoute(route, 'Atlas node coverage must match its baseline contract'));
  }
  if (!sameList(route.atlas?.edges, contract.edges)) {
    errors.push(errorForRoute(route, 'Atlas edge coverage must match its baseline contract'));
  }
  for (const [key, expected] of Object.entries(contract.boundaries)) {
    const actual = route.boundaries?.[key];
    const matches = Array.isArray(expected) ? sameList(actual, expected) : actual === expected;
    if (!matches) errors.push(errorForRoute(route, `boundaries.${key} must equal ${JSON.stringify(expected)}`));
  }
  const disposition = route.steps?.find((step) => step.kind === 'intent-disposition')?.panels?.grounding?.disposition;
  if (disposition !== contract.disposition) {
    errors.push(errorForRoute(route, `Grounding disposition must equal ${contract.disposition}`));
  }
}

export function validateWorkflowLibrary(library) {
  const errors = [];
  const routes = library?.routes;

  if (!Array.isArray(routes)) return ['workflow library routes must be an array'];
  if (routes.length !== 7) errors.push('workflow library must expose exactly seven routes');

  const seenRouteIds = new Set();
  for (const route of routes) {
    if (!route?.id || !route.title || !Array.isArray(route.steps)) {
      errors.push(errorForRoute(route, 'id, title, and steps are required'));
      continue;
    }
    if (seenRouteIds.has(route.id)) errors.push(errorForRoute(route, 'route id must be unique'));
    seenRouteIds.add(route.id);

    if (PUBLIC_UNSAFE_PATTERN.test(JSON.stringify(route))) {
      errors.push(errorForRoute(route, 'contains non-public-safe deployment-specific or credential-like content'));
    }

    const actorById = new Map(route.actors?.map((actor) => [actor.id, actor]));
    const packetIds = new Set(route.packets?.map((packet) => packet.id));
    const seenStepIds = new Set();
    const issuedOrders = new Set();

    if (route.steps.map((step) => step.kind).join('|') !== REQUIRED_KINDS.join('|')) {
      errors.push(errorForRoute(route, `steps must follow ${REQUIRED_KINDS.join(' → ')}`));
    }

    for (const step of route.steps) {
      if (!step?.id || seenStepIds.has(step.id)) errors.push(errorForRoute(route, 'step id must be nonempty and unique'));
      seenStepIds.add(step?.id);
      if (!actorById.has(step.actorId)) errors.push(errorForRoute(route, `${step.id}: actorId must reference a declared actor`));
      if (!packetIds.has(step.packetId)) errors.push(errorForRoute(route, `${step.id}: packetId must reference a declared packet`));
      if (!Array.isArray(step.atlas?.nodes) || !Array.isArray(step.atlas?.edges)) {
        errors.push(errorForRoute(route, `${step.id}: atlas nodes and edges must be arrays`));
      }
      if (step.panels?.taskboard?.surface !== 'canon') {
        errors.push(errorForRoute(route, `${step.id}: Taskboard surface must be Canon`));
      }
      if (!step.panels?.grounding || step.panels?.projection?.surface !== 'projection') {
        errors.push(errorForRoute(route, `${step.id}: all three panels are required`));
      }
      if (!step.panels?.projection?.source?.identity || !step.panels?.projection?.source?.at) {
        errors.push(errorForRoute(route, `${step.id}: Projection source identity and time are required`));
      }
      if (!['fresh', 'stale'].includes(step.panels?.projection?.freshness)) {
        errors.push(errorForRoute(route, `${step.id}: Projection freshness is required`));
      }
      if (step.kind === 'canon-issue') {
        if (actorById.get(step.actorId)?.type !== 'owner') {
          errors.push(errorForRoute(route, `${step.id}: Canon issues Job Orders through an owner`));
        }
        if (!step.jobOrder?.id || !step.jobOrder?.scope || !step.jobOrder?.canonRef) {
          errors.push(errorForRoute(route, `${step.id}: Job Order id, scope, and Canon reference are required`));
        } else {
          issuedOrders.add(step.jobOrder.id);
        }
      }
      if (step.kind === 'actuality' && !issuedOrders.has(step.jobOrderId)) {
        errors.push(errorForRoute(route, `${step.id}: Actuality requires an earlier Canon-issued Job Order`));
      }
      if (step.kind === 'projection-capture') {
        if (actorById.get(step.actorId)?.type !== 'pawn') {
          errors.push(errorForRoute(route, `${step.id}: final Projection capture must be Pawn-written`));
        }
        const capture = step.panels?.projection?.capture;
        if (!capture?.at || capture.freshness !== 'fresh') {
          errors.push(errorForRoute(route, `${step.id}: final Projection capture freshness is required`));
        }
      }
    }
    validateRouteBoundaryContract(route, errors);
  }
  return errors;
}

if (typeof window !== 'undefined') {
  window.FoundrySchematicWorkflows = FOUNDRY_SCHEMATIC_WORKFLOWS;
}

export default FOUNDRY_SCHEMATIC_WORKFLOWS;
