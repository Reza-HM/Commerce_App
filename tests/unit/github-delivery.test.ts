import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const merged = 'c'.repeat(40);
const prefix = 'repos/Reza-HM/Commerce_App';
const title = 'feat(test): add reviewed delivery';
const body = 'Literal `$()`, quotes "", and ; stay text.\nSecond line.\n';
const url = 'https://github.com/Reza-HM/Commerce_App/pull/7';

function fixture() {
  let clock = 0;
  const calls: { program: string; args: string[]; input?: string | undefined }[] = [];
  const state = {
    dirty: false,
    localHead: head,
    remoteHead: head,
    branch: 'feat/example',
    createError: false,
    creationTookEffect: true,
    rejectMerge: false,
    mergeError: false,
    unknownAfterMerge: false,
    prReads: 0,
    onSleep: () => {},
    onReadPr: (count: number) => {
      void count;
    },
  };
  const repo = {
    full_name: 'Reza-HM/Commerce_App',
    owner: { login: 'Reza-HM' },
    default_branch: 'main',
    permissions: { push: true },
    allow_squash_merge: true,
    delete_branch_on_merge: false,
    allow_auto_merge: false,
  };
  const pr = {
    number: 7,
    state: 'open',
    draft: false,
    user: { login: 'Reza-HM', type: 'User' },
    head: { ref: state.branch, sha: head, repo: { full_name: repo.full_name } },
    base: { ref: 'main', sha: base, repo: { full_name: repo.full_name } },
    title,
    body,
    html_url: url,
    mergeable: true,
    mergeable_state: 'clean',
    auto_merge: null as unknown,
    merged: false,
    merge_commit_sha: merged,
  };
  const protection = {
    enforce_admins: { enabled: true },
    required_status_checks: {
      strict: true,
      checks: [
        { context: 'quality', app_id: 15368 },
        { context: 'database', app_id: 15368 },
      ],
    },
    required_conversation_resolution: { enabled: true },
    required_pull_request_reviews: { required_approving_review_count: 0 },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
  const run = {
    id: 50,
    run_attempt: 1,
    path: '.github/workflows/ci.yml',
    event: 'pull_request',
    head_sha: head,
    repository: { full_name: repo.full_name },
    head_repository: { full_name: repo.full_name },
    pull_requests: [{ number: 7, head: { sha: head }, base: { sha: base, ref: 'main' } }],
    status: 'completed',
    conclusion: 'success',
    check_suite_id: 90,
  };
  const jobs = [
    { id: 101, name: 'quality', status: 'completed', conclusion: 'success' },
    { id: 102, name: 'database', status: 'completed', conclusion: 'success' },
  ];
  const checks = jobs.map((job) => ({
    ...job,
    app: { id: 15368 },
    head_sha: head,
    check_suite: { id: 90 },
  }));
  const review = {
    reviewDecision: '',
    autoMergeRequest: null as unknown,
    mergeQueueEntry: null as unknown,
    reviewThreads: {
      nodes: [] as { isResolved: boolean }[],
      pageInfo: { hasNextPage: false, endCursor: null as string | null },
    },
  };
  const prs: unknown[] = [];
  const resources = new Map<string, unknown>([
    ['user', { login: 'Reza-HM' }],
    [prefix, repo],
    [`${prefix}/branches/main/protection`, protection],
    [`${prefix}/branches/${encodeURIComponent(state.branch)}`, { protected: false }],
    [`${prefix}/branches/main`, { protected: true }],
    [`${prefix}/rules/branches/main?per_page=100`, []],
    [`${prefix}/pulls/7`, pr],
    [`${prefix}/pulls/7/reviews?per_page=100`, []],
    [
      `${prefix}/pulls?state=open&base=main&head=Reza-HM%3Afeat%2Fexample&per_page=100`,
      prs,
    ],
    [
      `${prefix}/actions/runs?event=pull_request&head_sha=${head}&per_page=100`,
      { workflow_runs: [run] },
    ],
    [`${prefix}/actions/runs/50`, run],
    [`${prefix}/actions/runs/50/attempts/1/jobs?per_page=100`, { jobs }],
    [`${prefix}/check-runs/101`, checks[0]],
    [`${prefix}/check-runs/102`, checks[1]],
    [
      `${prefix}/commits/${head}/check-runs?filter=latest&per_page=100`,
      { check_runs: checks },
    ],
    [`${prefix}/commits/${head}/statuses?per_page=100`, []],
  ]);
  const routes = new Map<string, () => unknown>();
  const runCommand = (
    program: string,
    args: string[],
    options: { input?: string } = {},
  ) => {
    calls.push({ program, args, input: options.input });
    if (program === 'git') {
      if (args[0] === 'remote') return 'git@github.com:Reza-HM/Commerce_App.git';
      if (args[0] === 'status') return state.dirty ? ' M unrelated.txt' : '';
      if (args[0] === 'symbolic-ref') return state.branch;
      if (args[0] === 'check-ref-format') return state.branch;
      if (args[0] === 'rev-parse') return state.localHead;
      if (args[0] === 'ls-remote')
        return `${state.remoteHead}\trefs/heads/${state.branch}`;
      throw new Error('Unexpected Git command');
    }
    if (args[0] === 'pr') {
      if (state.creationTookEffect) prs.push(pr);
      if (state.createError) throw new Error('PRIVATE_CREDENTIAL');
      return url;
    }
    if (args.includes('graphql'))
      return JSON.stringify({ data: { repository: { pullRequest: review } } });
    const path = args.find((value) => value.startsWith('repos/') || value === 'user');
    if (!path) throw new Error('Unexpected GitHub command');
    if (args.includes('PUT')) {
      if (!state.rejectMerge) {
        pr.merged = true;
        pr.state = 'closed';
      }
      if (state.mergeError) throw new Error('PRIVATE_CREDENTIAL');
      return JSON.stringify({
        merged: !state.rejectMerge,
        sha: state.rejectMerge ? undefined : merged,
      });
    }
    if (path === `${prefix}/pulls/7`) {
      state.prReads++;
      state.onReadPr(state.prReads);
      if (state.unknownAfterMerge && calls.some((call) => call.args.includes('PUT')))
        throw new Error('PRIVATE_CREDENTIAL');
    }
    const value = routes.has(path) ? routes.get(path)!() : resources.get(path);
    if (value === undefined) throw new Error(`Unexpected endpoint ${path}`);
    return JSON.stringify(args.includes('--slurp') ? [value] : value);
  };
  const dependencies = {
    run: runCommand,
    readBody: () => body,
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
      state.onSleep();
    },
    report: () => {},
  };
  return {
    state,
    repo,
    pr,
    protection,
    run,
    jobs,
    checks,
    review,
    prs,
    resources,
    routes,
    calls,
    dependencies,
  };
}

type Dependencies = ReturnType<typeof fixture>['dependencies'];
const delivery = createRequire(__filename)('../../scripts/github-delivery.cjs') as {
  openPullRequest: (
    options: { head: string; title: string; bodyFile: string },
    dependencies: Dependencies,
  ) => Promise<{ url: string }>;
  mergePullRequest: (
    options: { head: string; pr: number; timeoutSeconds?: number },
    dependencies: Dependencies,
  ) => Promise<{ state: string; commit: string }>;
  execute: (program: string, args: string[]) => string;
};
const openOptions = { head, title, bodyFile: '.local/reviewed.md' };
const mergeOptions = { head, pr: 7, timeoutSeconds: 1 };
const mutations = (f: ReturnType<typeof fixture>) =>
  f.calls.filter((call) => call.args.includes('create') || call.args.includes('PUT'));

test('opening uses exact reviewed metadata and never pushes or forks', async () => {
  const f = fixture();
  await expect(
    delivery.openPullRequest(openOptions, f.dependencies),
  ).resolves.toMatchObject({ url });
  expect(mutations(f)).toHaveLength(1);
  expect(mutations(f)[0]!.args).toEqual([
    'pr',
    'create',
    '--repo',
    'Reza-HM/Commerce_App',
    '--base',
    'main',
    '--head',
    'feat/example',
    '--title',
    title,
    '--body-file',
    '-',
  ]);
  expect(mutations(f)[0]!.input).toBe(body);
  expect(
    f.calls
      .filter((call) => call.program === 'git')
      .every((call) =>
        [
          'remote',
          'status',
          'symbolic-ref',
          'check-ref-format',
          'rev-parse',
          'ls-remote',
        ].includes(call.args[0]!),
      ),
  ).toBe(true);
});

test('opening is repeatable without rewriting an existing matching PR', async () => {
  const f = fixture();
  f.prs.push(f.pr);
  await expect(
    delivery.openPullRequest(openOptions, f.dependencies),
  ).resolves.toMatchObject({ url });
  expect(mutations(f)).toHaveLength(0);
});

test.each([
  'dirty',
  'localHead',
  'remoteHead',
  'branch',
  'title',
  'body',
  'duplicate',
  'protected',
  'owner',
  'repository',
  'origin',
])('opening refuses unsafe or mismatched %s before mutation', async (condition) => {
  const f = fixture();
  if (condition === 'dirty') f.state.dirty = true;
  if (condition === 'localHead') f.state.localHead = merged;
  if (condition === 'remoteHead') f.state.remoteHead = merged;
  if (condition === 'branch') f.state.branch = 'main';
  if (condition === 'title') {
    f.pr.title = 'feat(test): changed title';
    f.prs.push(f.pr);
  }
  if (condition === 'body') {
    f.pr.body = 'different';
    f.prs.push(f.pr);
  }
  if (condition === 'duplicate') f.prs.push(f.pr, f.pr);
  if (condition === 'protected')
    f.resources.set(`${prefix}/branches/feat%2Fexample`, { protected: true });
  if (condition === 'owner') f.resources.set('user', { login: 'someone-else' });
  if (condition === 'repository') f.repo.full_name = 'elsewhere/project';
  const deps =
    condition === 'origin'
      ? {
          ...f.dependencies,
          run: (program: string, args: string[], options?: { input?: string }) =>
            program === 'git' && args[0] === 'remote'
              ? 'https://example.invalid/other.git'
              : f.dependencies.run(program, args, options),
        }
      : f.dependencies;
  await expect(delivery.openPullRequest(openOptions, deps)).rejects.toThrow();
  expect(mutations(f)).toHaveLength(0);
});

test.each([true, false])(
  'uncertain creation is reconciled once, took effect=%s',
  async (tookEffect) => {
    const f = fixture();
    f.state.createError = true;
    f.state.creationTookEffect = tookEffect;
    const result = delivery.openPullRequest(openOptions, f.dependencies);
    if (tookEffect) await expect(result).resolves.toMatchObject({ url });
    else await expect(result).rejects.toThrow('could not be confirmed');
    expect(mutations(f)).toHaveLength(1);
  },
);

test('merge waits for pending evidence and submits one exact-head squash request', async () => {
  const f = fixture();
  f.run.status = 'in_progress';
  f.jobs[0]!.status = 'in_progress';
  f.state.onSleep = () => {
    f.run.status = 'completed';
    f.jobs[0]!.status = 'completed';
  };
  await expect(
    delivery.mergePullRequest({ head, pr: 7, timeoutSeconds: 20 }, f.dependencies),
  ).resolves.toEqual({ state: 'merged', url, commit: merged });
  const writes = mutations(f);
  expect(writes).toHaveLength(1);
  expect(writes[0]!.args).toContain(`${prefix}/pulls/7/merge`);
  expect(JSON.parse(writes[0]!.input!)).toEqual({
    sha: head,
    merge_method: 'squash',
    commit_title: title,
    commit_message: body,
  });
  expect(
    f.calls.some((call) =>
      call.args.some((arg) =>
        [
          '--admin',
          '--auto',
          '--delete-branch',
          'push',
          'config',
          'reset',
          'rebase',
          'review',
        ].includes(arg),
      ),
    ),
  ).toBe(false);
});

test.each([
  'draft',
  'author',
  'bot',
  'fork',
  'base',
  'head',
  'closed',
  'conflict',
  'behind',
  'auto',
  'title',
])('merge refuses ineligible PR: %s', async (condition) => {
  const f = fixture();
  if (condition === 'draft') f.pr.draft = true;
  if (condition === 'author') f.pr.user.login = 'another-author';
  if (condition === 'bot') f.pr.user.type = 'Bot';
  if (condition === 'fork') f.pr.head.repo.full_name = 'somebody/Commerce_App';
  if (condition === 'base') f.pr.base.ref = 'develop';
  if (condition === 'head') f.pr.head.sha = merged;
  if (condition === 'closed') f.pr.state = 'closed';
  if (condition === 'conflict') f.pr.mergeable = false;
  if (condition === 'behind') f.pr.mergeable_state = 'behind';
  if (condition === 'auto') f.pr.auto_merge = {};
  if (condition === 'title') f.pr.title = 'Nonconventional title';
  await expect(delivery.mergePullRequest(mergeOptions, f.dependencies)).rejects.toThrow();
  expect(mutations(f)).toHaveLength(0);
});

test.each([
  'admin',
  'strict',
  'threads',
  'prs',
  'force',
  'delete',
  'missing',
  'app',
  'squash',
  'autodelete',
  'automerge',
  'queue',
  'unavailable',
])('merge refuses missing/unsupported enforcement: %s', async (condition) => {
  const f = fixture();
  if (condition === 'admin') f.protection.enforce_admins.enabled = false;
  if (condition === 'strict') f.protection.required_status_checks.strict = false;
  if (condition === 'threads')
    f.protection.required_conversation_resolution.enabled = false;
  if (condition === 'prs')
    f.resources.set(`${prefix}/branches/main/protection`, {
      ...f.protection,
      required_pull_request_reviews: null,
    });
  if (condition === 'force') f.protection.allow_force_pushes.enabled = true;
  if (condition === 'delete') f.protection.allow_deletions.enabled = true;
  if (condition === 'missing') f.protection.required_status_checks.checks.pop();
  if (condition === 'app') f.protection.required_status_checks.checks[0]!.app_id = -1;
  if (condition === 'squash') f.repo.allow_squash_merge = false;
  if (condition === 'autodelete') f.repo.delete_branch_on_merge = true;
  if (condition === 'automerge') f.repo.allow_auto_merge = true;
  if (condition === 'queue')
    f.resources.set(`${prefix}/rules/branches/main?per_page=100`, [
      { type: 'merge_queue' },
    ]);
  if (condition === 'unavailable')
    f.resources.delete(`${prefix}/branches/main/protection`);
  await expect(delivery.mergePullRequest(mergeOptions, f.dependencies)).rejects.toThrow();
  expect(mutations(f)).toHaveLength(0);
});

test.each(['thread', 'decision', 'request', 'queue', 'auto', 'pagination'])(
  'merge refuses unresolved review state: %s',
  async (condition) => {
    const f = fixture();
    if (condition === 'thread') f.review.reviewThreads.nodes.push({ isResolved: false });
    if (condition === 'decision') f.review.reviewDecision = 'REVIEW_REQUIRED';
    if (condition === 'request')
      f.resources.set(`${prefix}/pulls/7/reviews?per_page=100`, [
        { id: 1, state: 'CHANGES_REQUESTED', user: { login: 'reviewer' } },
      ]);
    if (condition === 'queue') f.review.mergeQueueEntry = { id: 'queued' };
    if (condition === 'auto') f.review.autoMergeRequest = { enabledAt: 'now' };
    if (condition === 'pagination') {
      f.review.reviewThreads.pageInfo.hasNextPage = true;
      f.review.reviewThreads.pageInfo.endCursor = 'repeated';
    }
    await expect(
      delivery.mergePullRequest(mergeOptions, f.dependencies),
    ).rejects.toThrow();
    expect(mutations(f)).toHaveLength(0);
  },
);

test('a later approving review resolves an earlier change request, comments do not erase it', async () => {
  const f = fixture();
  f.resources.set(`${prefix}/pulls/7/reviews?per_page=100`, [
    { id: 1, state: 'CHANGES_REQUESTED', user: { login: 'reviewer' } },
    { id: 2, state: 'COMMENTED', user: { login: 'reviewer' } },
  ]);
  await expect(delivery.mergePullRequest(mergeOptions, f.dependencies)).rejects.toThrow(
    'requests changes',
  );
  f.resources.set(`${prefix}/pulls/7/reviews?per_page=100`, [
    { id: 1, state: 'CHANGES_REQUESTED', user: { login: 'reviewer' } },
    { id: 3, state: 'APPROVED', user: { login: 'reviewer' } },
  ]);
  await expect(
    delivery.mergePullRequest(mergeOptions, f.dependencies),
  ).resolves.toMatchObject({ state: 'merged' });
});

test.each([
  'no-run',
  'no-jobs',
  'skipped',
  'neutral',
  'cancelled',
  'failed',
  'duplicate',
  'old-head',
  'old-base',
  'foreign-workflow',
  'foreign-app',
  'foreign-suite',
  'missing-suite',
  'new-run',
  'additional',
])('no false green from incomplete/current-check evidence: %s', async (condition) => {
  const f = fixture();
  if (condition === 'no-run')
    f.resources.set(
      `${prefix}/actions/runs?event=pull_request&head_sha=${head}&per_page=100`,
      { workflow_runs: [] },
    );
  if (condition === 'no-jobs') f.jobs.length = 0;
  if (['skipped', 'neutral', 'cancelled', 'failed'].includes(condition))
    f.jobs[0]!.conclusion = condition;
  if (condition === 'duplicate') f.jobs.push({ ...f.jobs[0]! });
  if (condition === 'old-head') f.checks[0]!.head_sha = merged;
  if (condition === 'old-base') f.run.pull_requests[0]!.base.sha = merged;
  if (condition === 'foreign-workflow') f.run.path = '.github/workflows/other.yml';
  if (condition === 'foreign-app') f.checks[0]!.app.id = 1;
  if (condition === 'foreign-suite') f.checks[0]!.check_suite.id = 1;
  if (condition === 'missing-suite')
    f.routes.set(`${prefix}/actions/runs/50`, () => ({
      ...f.run,
      check_suite_id: undefined,
    }));
  if (condition === 'new-run')
    f.routes.set(`${prefix}/actions/runs/50`, () => ({ ...f.run, run_attempt: 2 }));
  if (condition === 'additional')
    f.protection.required_status_checks.checks.push({
      context: 'another-check',
      app_id: -1,
    });
  await expect(delivery.mergePullRequest(mergeOptions, f.dependencies)).rejects.toThrow();
  expect(mutations(f)).toHaveLength(0);
});

test.each(['head', 'base', 'protection'])(
  'the final recheck catches a changed %s before mutation',
  async (change) => {
    const f = fixture();
    f.state.onReadPr = (count) => {
      if (count === 2) {
        if (change === 'head') f.pr.head.sha = merged;
        if (change === 'base') f.pr.base.sha = merged;
        if (change === 'protection') f.protection.enforce_admins.enabled = false;
      }
    };
    await expect(
      delivery.mergePullRequest(mergeOptions, f.dependencies),
    ).rejects.toThrow();
    expect(mutations(f)).toHaveLength(0);
  },
);

test('changed base during waiting stops rather than approving later evidence', async () => {
  const f = fixture();
  f.run.status = 'in_progress';
  f.state.onSleep = () => {
    f.pr.base.sha = merged;
  };
  await expect(
    delivery.mergePullRequest({ head, pr: 7, timeoutSeconds: 20 }, f.dependencies),
  ).rejects.toThrow('base changed');
  expect(mutations(f)).toHaveLength(0);
});

test('slow metadata requests consume the finite wait budget before any merge', async () => {
  const f = fixture();
  let time = 0;
  f.dependencies.now = () => {
    time += 1001;
    return time;
  };
  await expect(delivery.mergePullRequest(mergeOptions, f.dependencies)).rejects.toThrow(
    'deadline expired',
  );
  expect(mutations(f)).toHaveLength(0);
});

test.each(['pending', 'skipped', 'success'])(
  'effective ruleset checks must really pass: %s',
  async (status) => {
    const f = fixture();
    f.resources.set(`${prefix}/rules/branches/main?per_page=100`, [
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: [{ context: 'extra', integration_id: 123 }],
        },
      },
    ]);
    f.resources.set(`${prefix}/commits/${head}/check-runs?filter=latest&per_page=100`, {
      check_runs: [
        ...f.checks,
        {
          name: 'extra',
          app: { id: 123 },
          status: status === 'pending' ? 'in_progress' : 'completed',
          conclusion: status,
        },
      ],
    });
    const result = delivery.mergePullRequest(mergeOptions, f.dependencies);
    if (status === 'success')
      await expect(result).resolves.toMatchObject({ state: 'merged' });
    else {
      await expect(result).rejects.toThrow();
      expect(mutations(f)).toHaveLength(0);
    }
  },
);

test.each(['rejected', 'interrupted-success', 'interrupted-no-effect', 'unknown'])(
  'merge mutation is never retried after %s',
  async (condition) => {
    const f = fixture();
    if (['rejected', 'interrupted-no-effect'].includes(condition))
      f.state.rejectMerge = true;
    if (condition.startsWith('interrupted')) f.state.mergeError = true;
    if (condition === 'unknown') f.state.unknownAfterMerge = true;
    const result = delivery.mergePullRequest(mergeOptions, f.dependencies);
    if (condition === 'interrupted-success')
      await expect(result).resolves.toMatchObject({ state: 'merged', commit: merged });
    else
      await expect(result).rejects.toThrow(
        condition === 'unknown' ? 'unknown' : 'not confirmed merged',
      );
    expect(mutations(f)).toHaveLength(1);
  },
);

test('tool failures do not expose stderr or credential values', () => {
  expect(() =>
    delivery.execute(process.execPath, [
      '-e',
      'process.stderr.write("PRIVATE_CREDENTIAL");process.exit(1)',
    ]),
  ).toThrow('Git inspection failed');
  expect(() => delivery.execute('missing-gh-executable-for-test', [])).toThrow(
    'Git inspection failed',
  );
});

test('subprocess arguments remain literal text without a shell', () => {
  const literal = 'space "quotes" $() `literal` ; & |';
  expect(
    delivery.execute(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1])',
      '--',
      literal,
    ]),
  ).toBe(literal);
});

test.each([
  ['open'],
  ['merge', '--pr', '7', '--head', 'short'],
  ['merge', '--pr', '7', '--head', head, '--timeout-seconds', '0'],
])('CLI rejects malformed invocation safely: %j', (...args: string[]) => {
  const result = spawnSync(
    process.execPath,
    [resolve('scripts/github-delivery.cjs'), ...args],
    { encoding: 'utf8', timeout: 5000 },
  );
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).not.toContain('PRIVATE_CREDENTIAL');
});
