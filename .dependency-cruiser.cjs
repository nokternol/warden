/**
 * Enforces the server-architecture North Star's module boundaries
 * (docs/architecture/server-architecture-north-star.md): a module's
 * internals are reachable only through its own index.ts, and cross-module
 * imports may only follow the declared direction graph. Both rule families
 * are deny-by-default — a module omitted from another's allow-list is
 * forbidden as a target, not enumerated as a violation to avoid.
 *
 * Scope is server/, src/ and contract/. Test folders and stories are excluded
 * because tests legitimately reach into a module's own internals to unit-test
 * them.
 */

// Every directory under server/modules/ is listed here, so each one gets a
// direction rule; server/__tests__/boundaries.test.ts fails on one that isn't.
const MODULES = [
  'appSettings',
  'auth',
  'automations',
  'media',
  'mediaQueries',
  'providers',
  'system',
];

// The North Star's declared direction graph. A module may always import
// kernel; kernel imports no module. Anything not listed here for a module
// is a forbidden cross-module target.
const ALLOWED_TARGETS = {
  providers: [],
  media: ['providers'],
  mediaQueries: ['media', 'providers'],
  automations: ['media', 'mediaQueries', 'providers'],
  auth: ['providers'],
  system: [],
  appSettings: [],
};

const directionRules = MODULES.map((mod) => {
  const forbiddenTargets = MODULES.filter(
    (other) => other !== mod && !(ALLOWED_TARGETS[mod] || []).includes(other)
  );
  return {
    name: `direction-${mod}`,
    severity: 'error',
    comment:
      `server/modules/${mod}/ may only cross into ` +
      `[${(ALLOWED_TARGETS[mod] || []).join(', ') || 'kernel only'}] plus kernel, ` +
      "per the North Star's declared direction graph (docs/architecture/server-architecture-north-star.md). " +
      "Type-only imports are exempt — they're the sanctioned dependency-inversion pattern " +
      '(system declares an interface, another module implements it by importing only the type).',
    from: { path: `^server/modules/${mod}/` },
    to: {
      path: `^server/modules/(${forbiddenTargets.join('|')})/`,
      dependencyTypesNot: ['type-only'],
    },
  };
});

module.exports = {
  forbidden: [
    {
      name: 'no-src-to-server',
      severity: 'error',
      comment:
        'The client may reach the server only through the API contract (contract/), ' +
        'never by importing server code — not even a type.',
      from: { path: '^src/' },
      to: { path: '^server/' },
    },
    {
      name: 'no-server-to-src',
      severity: 'error',
      comment:
        'The server may share code with the client only through the API contract ' +
        '(contract/), never by importing client code.',
      from: { path: '^server/' },
      to: { path: '^src/' },
    },
    {
      name: 'contract-depends-on-nothing-local',
      severity: 'error',
      comment:
        'The API contract is the shared root both sides derive from: it imports neither ' +
        'src/ nor server/ (only zod and @orpc/contract).',
      from: { path: '^contract/' },
      to: { path: '^(src|server)/' },
    },
    {
      name: 'contract-imports-only-zod-and-orpc',
      severity: 'error',
      comment:
        'The API contract is declarations only: the one package it may import besides ' +
        'zod is @orpc/contract, so no runtime, framework or Node code reaches the client ' +
        'through it.',
      from: { path: '^contract/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional', 'npm-no-pkg', 'npm-unknown', 'core'],
        pathNot: 'node_modules/(zod|@orpc/contract)/',
      },
    },
    {
      name: 'no-module-internal-reach-in',
      severity: 'error',
      comment:
        "A module's internals are private — other modules may only import its public " +
        'index.ts, never a deep path inside it.',
      from: { path: '^server/modules/([^/]+)/' },
      to: {
        path: '^server/modules/(?!$1/)[^/]+/(?!index\\.ts$).+',
      },
    },
    {
      name: 'no-root-deep-import-into-module',
      severity: 'error',
      comment:
        "Server-root files (container.ts, index.ts, kernel/) may only import a module's " +
        'public index.ts, never a deep path inside it.',
      from: { path: '^server/(?!modules/)' },
      to: { path: '^server/modules/[^/]+/(?!index\\.ts$).+' },
    },
    {
      name: 'kernel-imports-no-module',
      severity: 'error',
      comment:
        "The kernel is infrastructure with no domain meaning — it may not import any " +
        'feature module.',
      from: { path: '^server/kernel/' },
      to: { path: '^server/modules/' },
    },
    ...directionRules,
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)__tests__/|\\.stories\\.tsx$' },
    // node_modules is included (but not followed) so package imports can be checked.
    includeOnly: { path: '^(server|src|contract)/|node_modules/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: require('path').join(__dirname, 'server/tsconfig.json') },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
