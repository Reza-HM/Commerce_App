const {spawnSync} = require('node:child_process');
const {readFileSync, statSync} = require('node:fs');
const {parseArgs} = require('node:util');
const {setTimeout: delay} = require('node:timers/promises');

const repository = 'Reza-HM/Commerce_App';
const owner = 'Reza-HM';
const base = 'main';
const workflow = '.github/workflows/ci.yml';
const requiredJobs = ['quality', 'database'];
const actionsApp = 15368;
const prefix = `repos/${repository}`;
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const sameRepository = value => typeof value === 'string' && value.toLowerCase() === repository.toLowerCase();
const sameOwner = value => typeof value === 'string' && value.toLowerCase() === owner.toLowerCase();
const normalizeBody = value => String(value ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '');

class DeliveryError extends Error {}

function execute(program, args, options = {}) {
  const result = spawnSync(program, args, {
    ...options,
    encoding: 'utf8', shell: false, timeout: Math.min(30000, options.timeout ?? 30000), maxBuffer: 8 * 1024 * 1024,
    env: {...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat'}
  });
  if (result.error || result.status !== 0) {
    // Never echo raw tool errors, command arguments, body text, or credentials.
    throw new DeliveryError(program === 'gh'
      ? 'GitHub CLI request failed. Check gh installation, owner login, permissions, and connectivity.'
      : 'Git inspection failed. Check the repository and local Git installation.');
  }
  return result.stdout.trimEnd();
}

function context(overrides = {}) {
  const now = overrides.now ?? Date.now;
  const invoke = overrides.run ?? execute;
  let deadline = Infinity;
  const run = (program, args, options = {}) => {
    const remaining = Math.floor(deadline - now());
    if (remaining <= 0) throw new DeliveryError('Delivery deadline expired; no further mutation is authorized by this invocation.');
    return invoke(program, args, {...options, timeout: Math.min(30000, remaining)});
  };
  const json = (args, input) => {
    try { return JSON.parse(run('gh', ['api', '--hostname', 'github.com', ...args], input === undefined ? {} : {input: JSON.stringify(input)})); }
    catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError('GitHub returned invalid or unavailable delivery metadata.');
    }
  };
  const get = path => json([path]);
  const list = (path, key) => {
    const pages = json(['--paginate', '--slurp', path]);
    if (!Array.isArray(pages)) throw new DeliveryError('GitHub pagination metadata is invalid.');
    const values = pages.flatMap(page => key ? page[key] : page);
    if (!values.every(value => value && typeof value === 'object')) throw new DeliveryError('GitHub list metadata is incomplete.');
    return values;
  };
  return {run, json, get, list, now, setDeadline: value => { deadline = value; }, sleep: overrides.sleep ?? delay,
    report: overrides.report ?? console.log, readBody: overrides.readBody ?? (filename => {
      try {
        if (!/\.(md|txt)$/i.test(filename) || statSync(filename).size > 65536) throw new Error();
        return readFileSync(filename, 'utf8').replace(/^\uFEFF/, '');
      } catch { throw new DeliveryError('Supply a readable UTF-8 Markdown/text body file of at most 64 KiB.'); }
    })};
}

function requireHead(head) {
  if (!fullSha(head)) throw new DeliveryError('Supply the explicitly authorized full 40-character head SHA.');
}

function conventionalTitle(title) {
  return typeof title === 'string' && title.length <= 72 && !title.endsWith('.')
    && /^(feat|fix|refactor|perf|docs|test|build|ci|chore|style|revert)(\([a-z0-9/-]+\))?!?: [a-z0-9][^\r\n]+$/.test(title);
}

function inspectIdentity(ctx) {
  const origin = ctx.run('git', ['remote', 'get-url', 'origin']);
  if (!['git@github.com:Reza-HM/Commerce_App.git', 'https://github.com/Reza-HM/Commerce_App.git',
    'https://github.com/Reza-HM/Commerce_App', 'ssh://git@github.com/Reza-HM/Commerce_App.git'].includes(origin)) {
    throw new DeliveryError('Origin is not the supported github.com repository.');
  }
  const user = ctx.get('user');
  const repo = ctx.get(prefix);
  if (!sameOwner(user.login) || !sameOwner(repo.owner?.login) || !sameRepository(repo.full_name)
    || repo.default_branch !== base || repo.permissions?.push !== true) {
    throw new DeliveryError('Delivery requires the authenticated repository owner and the expected main repository.');
  }
  return repo;
}

function prMatches(pr, branch, head, title, body) {
  return pr.state === 'open' && sameRepository(pr.head?.repo?.full_name) && sameRepository(pr.base?.repo?.full_name)
    && pr.head.ref === branch && pr.base.ref === base && pr.head.sha === head
    && pr.title === title && normalizeBody(pr.body) === normalizeBody(body);
}

async function openPullRequest(options, overrides) {
  const ctx = context(overrides);
  requireHead(options.head);
  if (!conventionalTitle(options.title)) throw new DeliveryError('Supply a Conventional Commit title of at most 72 characters.');
  const body = ctx.readBody(options.bodyFile);
  if (!body.trim()) throw new DeliveryError('The reviewed PR description must not be empty.');
  inspectIdentity(ctx);
  if (ctx.run('git', ['status', '--porcelain=v1', '--untracked-files=normal'])) throw new DeliveryError('Finish or preserve local changes before opening the reviewed PR.');
  const branch = ctx.run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch || ['main', 'master', 'develop'].includes(branch)) throw new DeliveryError('Open PRs only from a named feature branch.');
  ctx.run('git', ['check-ref-format', '--branch', branch]);
  if (ctx.run('git', ['rev-parse', 'HEAD']) !== options.head) throw new DeliveryError('Local HEAD differs from the reviewed commit.');
  const remote = ctx.run('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`]);
  if (remote !== `${options.head}\trefs/heads/${branch}`) throw new DeliveryError('Push the authorized feature branch first; local and remote heads must match.');
  if (ctx.get(`${prefix}/branches/${encodeURIComponent(branch)}`).protected !== false) throw new DeliveryError('The published head must be an unprotected feature branch.');
  ctx.get(`${prefix}/branches/${base}`);
  const find = () => ctx.list(`${prefix}/pulls?state=open&base=${base}&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=100`);
  const existing = find();
  const result = candidates => {
    if (candidates.length !== 1 || !prMatches(candidates[0], branch, options.head, options.title, body)) {
      throw new DeliveryError('Existing PR metadata is ambiguous or differs from the reviewed head/title/body; inspect it manually.');
    }
    if (!Number.isSafeInteger(candidates[0].number) || candidates[0].number < 1
      || candidates[0].html_url !== `https://github.com/${repository}/pull/${candidates[0].number}`) {
      throw new DeliveryError('The PR identity/link could not be verified.');
    }
    return {url: candidates[0].html_url, number: candidates[0].number, head: options.head};
  };
  if (existing.length) return result(existing);
  // Explicit --head prevents gh from pushing or forking on our behalf.
  try { ctx.run('gh', ['pr', 'create', '--repo', repository, '--base', base, '--head', branch,
    '--title', options.title, '--body-file', '-'], {input: body}); }
  catch {
    try { return result(find()); }
    catch { throw new DeliveryError('PR creation could not be confirmed. Inspect existing PRs before retrying; no second creation was attempted.'); }
  }
  return result(find());
}

function verifyProtection(ctx, repo) {
  if (repo.allow_squash_merge !== true || repo.delete_branch_on_merge !== false || repo.allow_auto_merge !== false) {
    throw new DeliveryError('Require squash support, disabled automatic branch deletion, and disabled native auto-merge.');
  }
  let protection;
  try { protection = ctx.get(`${prefix}/branches/${base}/protection`); }
  catch { throw new DeliveryError('Cannot verify main protection. Configure the reviewed rule and check owner administration access.'); }
  const checks = protection.required_status_checks?.checks;
  if (protection.enforce_admins?.enabled !== true || protection.required_status_checks?.strict !== true
    || protection.required_conversation_resolution?.enabled !== true || !protection.required_pull_request_reviews
    || protection.allow_force_pushes?.enabled !== false || protection.allow_deletions?.enabled !== false
    || !Array.isArray(checks) || requiredJobs.some(name => !checks.some(check => check.context === name && check.app_id === actionsApp))) {
    throw new DeliveryError('Main protection is missing or insufficient; obtain owner-reviewed setup rather than bypassing it.');
  }
  const rules = ctx.list(`${prefix}/rules/branches/${base}?per_page=100`);
  if (rules.some(rule => rule.type === 'merge_queue')) throw new DeliveryError('Merge queues are outside this delivery policy.');
  if (rules.some(rule => rule.type === 'workflows')) throw new DeliveryError('Required workflow rules need a separately reviewed delivery policy.');
  const effectiveChecks = [...checks];
  for (const rule of rules.filter(value => value.type === 'required_status_checks')) {
    if (!Array.isArray(rule.parameters?.required_status_checks)) throw new DeliveryError('Additional check rules cannot be verified.');
    for (const check of rule.parameters.required_status_checks) {
      if (typeof check.context !== 'string') throw new DeliveryError('Additional check rules are incomplete.');
      effectiveChecks.push({context: check.context, app_id: check.integration_id ?? -1});
    }
  }
  return effectiveChecks;
}

function reviewState(ctx, number) {
  let cursor = null;
  const seen = new Set();
  do {
    const query = 'query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewDecision autoMergeRequest{enabledAt} mergeQueueEntry{id} reviewThreads(first:100,after:$cursor){nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}';
    const response = ctx.json(['graphql', '--input', '-'], {query, variables: {owner, name: 'Commerce_App', number, cursor}});
    const pr = response.data?.repository?.pullRequest;
    if (response.errors || !pr || !Array.isArray(pr.reviewThreads?.nodes)) throw new DeliveryError('Review metadata cannot be verified.');
    if (pr.autoMergeRequest || pr.mergeQueueEntry || ['CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(pr.reviewDecision)
      || pr.reviewThreads.nodes.some(thread => thread.isResolved !== true)) {
      throw new DeliveryError('Resolve reviews/conversations and any existing deferred merge before using this helper.');
    }
    const page = pr.reviewThreads.pageInfo;
    if (!page || typeof page.hasNextPage !== 'boolean') throw new DeliveryError('Review pagination cannot be verified.');
    cursor = page.hasNextPage ? page.endCursor : null;
    if (page.hasNextPage && (!cursor || seen.has(cursor) || seen.size >= 100)) throw new DeliveryError('Review pagination is incomplete.');
    seen.add(cursor);
  } while (cursor);
  const reviews = ctx.list(`${prefix}/pulls/${number}/reviews?per_page=100`);
  const latest = new Map();
  for (const review of reviews.sort((a,b) => a.id - b.id)) {
    if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) latest.set(review.user?.login, review.state);
  }
  if ([...latest.values()].includes('CHANGES_REQUESTED')) throw new DeliveryError('An outstanding review requests changes.');
}

function eligible(pr, head, initialBase) {
  if (pr.state !== 'open' || pr.draft !== false || pr.user?.type !== 'User' || !sameOwner(pr.user?.login)
    || !sameRepository(pr.head?.repo?.full_name) || !sameRepository(pr.base?.repo?.full_name)
    || pr.base.ref !== base || pr.head.sha !== head || !fullSha(pr.base.sha) || pr.auto_merge) {
    throw new DeliveryError('PR is not an owner-authored ready PR at the explicitly authorized head into main.');
  }
  if (initialBase && pr.base.sha !== initialBase) throw new DeliveryError('The base changed; deliberately revalidate and rerun.');
  if (pr.mergeable === false || ['behind', 'dirty', 'draft'].includes(pr.mergeable_state)) throw new DeliveryError('Resolve conflicts or update the branch to the current base before merging.');
  if (!conventionalTitle(pr.title)) throw new DeliveryError('The squash title must follow the repository Conventional Commit rules.');
}

function checkEvidence(ctx, pr, requiredChecks) {
  const runs = ctx.list(`${prefix}/actions/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`, 'workflow_runs')
    .filter(run => run.path === workflow && run.event === 'pull_request' && sameRepository(run.repository?.full_name)
      && sameRepository(run.head_repository?.full_name) && run.head_sha === pr.head.sha
      && run.pull_requests?.some(link => link.number === pr.number && link.head?.sha === pr.head.sha
        && link.base?.sha === pr.base.sha && link.base.ref === base));
  if (!runs.length) return false;
  // A deliberate newer run replaces old evidence; never select an old green run.
  const run = runs.sort((a,b) => b.id - a.id)[0];
  const current = ctx.get(`${prefix}/actions/runs/${run.id}`);
  if (current.run_attempt !== run.run_attempt || current.head_sha !== pr.head.sha || current.path !== workflow) return false;
  if (!Number.isSafeInteger(current.check_suite_id)) throw new DeliveryError('The CI workflow check-suite identity is missing.');
  const jobs = ctx.list(`${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`, 'jobs');
  let pending = current.status !== 'completed';
  if (current.status === 'completed' && current.conclusion !== 'success') throw new DeliveryError('The current CI run did not succeed; inspect its jobs before a deliberate rerun.');
  const known = [];
  for (const name of requiredJobs) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length > 1) throw new DeliveryError('Mandatory CI jobs are ambiguous.');
    if (!matches.length) { pending = true; continue; }
    const job = matches[0];
    if (job.status !== 'completed') { pending = true; continue; }
    if (job.conclusion !== 'success') throw new DeliveryError('A mandatory CI job failed, was skipped, or was cancelled.');
    if (!Number.isSafeInteger(job.id)) throw new DeliveryError('CI job metadata is invalid.');
    const check = ctx.get(`${prefix}/check-runs/${job.id}`);
    if (check.name !== name || check.app?.id !== actionsApp || check.check_suite?.id !== current.check_suite_id
      || check.head_sha !== pr.head.sha || check.status !== 'completed' || check.conclusion !== 'success') {
      throw new DeliveryError('Mandatory CI evidence is stale or from an unexpected workflow/app/revision.');
    }
    known.push(check);
  }
  const allChecks = ctx.list(`${prefix}/commits/${pr.head.sha}/check-runs?filter=latest&per_page=100`, 'check_runs');
  const statuses = ctx.list(`${prefix}/commits/${pr.head.sha}/statuses?per_page=100`);
  for (const requirement of requiredChecks) {
    if (known.some(check => check.name === requirement.context && check.app?.id === requirement.app_id)) continue;
    const matches = allChecks.filter(check => check.name === requirement.context
      && (requirement.app_id === -1 || requirement.app_id == null || check.app?.id === requirement.app_id));
    if (matches.length > 1) throw new DeliveryError('Additional required check evidence is ambiguous.');
    if (matches.length) {
      const check = matches[0];
      if (check.status !== 'completed') { pending = true; continue; }
      if (check.conclusion !== 'success') throw new DeliveryError('An additional required check did not succeed.');
    } else {
      const status = statuses.find(value => value.context === requirement.context);
      if (!status || status.state === 'pending') { pending = true; continue; }
      if (requirement.app_id != null && requirement.app_id !== -1 || status.state !== 'success') throw new DeliveryError('An additional required status cannot be verified as successful.');
    }
  }
  return !pending && requiredJobs.every(name => known.some(check => check.name === name));
}

async function mergePullRequest(options, overrides) {
  const ctx = context(overrides);
  requireHead(options.head);
  const number = Number(options.pr);
  const seconds = options.timeoutSeconds === undefined ? 1800 : Number(options.timeoutSeconds);
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isInteger(seconds) || seconds < 1 || seconds > 1800) {
    throw new DeliveryError('Supply a positive PR number and a timeout between 1 and 1800 seconds.');
  }
  const repo = inspectIdentity(ctx);
  const checks = verifyProtection(ctx, repo);
  let pr = ctx.get(`${prefix}/pulls/${number}`);
  eligible(pr, options.head);
  const initialBase = pr.base.sha;
  const deadline = ctx.now() + seconds * 1000;
  ctx.setDeadline(deadline);
  for (;;) {
    eligible(pr, options.head, initialBase);
    reviewState(ctx, number);
    if (checkEvidence(ctx, pr, checks) && pr.mergeable === true && pr.mergeable_state === 'clean') break;
    if (ctx.now() >= deadline) throw new DeliveryError('Timed out waiting for complete current CI evidence; no merge was requested.');
    ctx.report(`PR #${number}: waiting for current required CI (head ${options.head.slice(0, 7)}).`);
    await ctx.sleep(Math.min(10000, deadline - ctx.now()));
    pr = ctx.get(`${prefix}/pulls/${number}`);
  }
  pr = ctx.get(`${prefix}/pulls/${number}`);
  eligible(pr, options.head, initialBase);
  const finalChecks = verifyProtection(ctx, ctx.get(prefix));
  reviewState(ctx, number);
  if (ctx.now() >= deadline || pr.mergeable !== true || pr.mergeable_state !== 'clean' || !checkEvidence(ctx, pr, finalChecks)) {
    throw new DeliveryError('Merge readiness changed during the final check; no merge was requested.');
  }
  let response;
  try {
    response = ctx.json(['--method', 'PUT', `${prefix}/pulls/${number}/merge`, '--input', '-'], {
      sha: options.head, merge_method: 'squash', commit_title: pr.title, commit_message: pr.body ?? ''
    });
  } catch { /* An interrupted mutation is reconciled read-only, never repeated. */ }
  // Reconciliation gets one bounded read even if the waiting budget has expired.
  ctx.setDeadline(Infinity);
  let outcome;
  try { outcome = ctx.get(`${prefix}/pulls/${number}`); }
  catch { throw new DeliveryError(`Merge outcome is unknown for PR #${number}; inspect GitHub before taking another action.`); }
  if (outcome.merged === true && outcome.head?.sha === options.head && fullSha(outcome.merge_commit_sha)
    && (!response?.sha || response.sha === outcome.merge_commit_sha)) {
    return {state: 'merged', url: outcome.html_url, commit: outcome.merge_commit_sha};
  }
  throw new DeliveryError(`PR #${number} was not confirmed merged at the authorized head; inspect GitHub. No merge retry was attempted.`);
}

async function main(args = process.argv.slice(2)) {
  try {
    const [operation, ...rest] = args;
    const {values} = parseArgs({args: rest, options: {
      head: {type: 'string'}, title: {type: 'string'}, 'body-file': {type: 'string'},
      pr: {type: 'string'}, 'timeout-seconds': {type: 'string'}
    }, strict: true, allowPositionals: false});
    let result;
    if (operation === 'open' && values.head && values.title && values['body-file'] && !values.pr && !values['timeout-seconds']) {
      result = await openPullRequest({head: values.head, title: values.title, bodyFile: values['body-file']});
    } else if (operation === 'merge' && values.head && values.pr && !values.title && !values['body-file']) {
      result = await mergePullRequest({head: values.head, pr: values.pr, timeoutSeconds: values['timeout-seconds']});
    } else throw new DeliveryError('Use pr:open with --head, --title, --body-file; or pr:merge with --pr, --head, optional --timeout-seconds.');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof DeliveryError ? error.message : 'Delivery failed. Check the documented arguments and prerequisites.');
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = {DeliveryError, execute, context, openPullRequest, mergePullRequest, conventionalTitle, eligible, checkEvidence, verifyProtection, main};
