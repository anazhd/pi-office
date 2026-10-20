// Hot-desk occupancy: stability across departures and refreshes, random free-desk choice, no duplicates.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile, writeFile, appendFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DESK_COUNT,
  DESK_GRACE_MS,
  emptyDeskPlan,
  reconcileDesks,
  withDesks,
  type DeskCandidate,
  type DeskPick,
  type DeskPlan,
} from '../../shared/desk-allocation.ts'
import type { ActivityStatus, Character, OfficeSnapshot } from '../../shared/office-types.ts'
import { DeskAllocator, deskStateFile, parseDeskState } from '../desks.ts'
import { OfficeStore } from '../sessions.ts'
import { deskStatePath } from '../paths.ts'

const first: DeskPick = (free) => free[0]
const last: DeskPick = (free) => free[free.length - 1]

/** Deterministic PRNG so "random" tests are reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}
const randomWith = (rng: () => number): DeskPick => (free) => free[Math.floor(rng() * free.length)]

function cand(entries: Array<[string, boolean]>): DeskCandidate[] {
  return entries.map(([id, working]) => ({ id, working }))
}

function deskOf(plan: DeskPlan, id: string): number | undefined {
  return plan.assignments.get(id)
}

function assertInvariants(plan: DeskPlan, roster: DeskCandidate[]) {
  const desks = [...plan.assignments.values()]
  assert.equal(new Set(desks).size, desks.length, 'a desk is never double-booked')
  for (const desk of desks) assert.ok(Number.isInteger(desk) && desk >= 0 && desk < DESK_COUNT)
  const present = new Set(roster.map((c) => c.id))
  for (const id of plan.assignments.keys()) assert.ok(present.has(id), `${id} is on the roster`)
}

test('a new worker picks any free desk the server chooses, not the lowest free one', () => {
  let plan = reconcileDesks(emptyDeskPlan(), cand([['a', true], ['b', true], ['c', true], ['d', true]]), 0, first)
  assert.deepEqual([...plan.assignments.values()], [0, 1, 2, 3])

  let offered: readonly number[] = []
  const pickHighest: DeskPick = (free) => {
    offered = free
    return last(free)
  }
  const roster = cand([['a', true], ['b', true], ['c', true], ['d', true], ['e', true]])
  plan = reconcileDesks(plan, roster, 1000, pickHighest)
  assert.deepEqual([...offered], [4, 5, 6, 7, 8, 9], 'the free list offered to the picker is exactly the free desks')
  assert.equal(deskOf(plan, 'e'), 9, 'the desk chosen by the picker is honoured, not first-free')
  assertInvariants(plan, roster)
})

test('random choice is spread over every free desk instead of filling from desk 0', () => {
  const rng = seeded(0xc0ffee)
  const pick = randomWith(rng)
  const counts = new Array<number>(DESK_COUNT).fill(0)
  for (let trial = 0; trial < 400; trial++) {
    const plan = reconcileDesks(emptyDeskPlan(), cand([['only', true]]), 0, pick)
    counts[deskOf(plan, 'only')!] += 1
  }
  for (let desk = 0; desk < DESK_COUNT; desk++) {
    assert.ok(counts[desk] > 0, `desk ${desk} is reachable`)
  }
  assert.ok(counts[0] < 400 * 0.25, `desk 0 is not a sequential default (${counts[0]} of 400)`)
})

test('departures never move the people who stay; a freed desk goes to a random new worker', () => {
  const t0 = 0
  let plan = reconcileDesks(emptyDeskPlan(), cand([['a', true], ['b', true], ['c', true]]), t0, first)
  assert.equal(deskOf(plan, 'a'), 0)
  assert.equal(deskOf(plan, 'b'), 1)
  assert.equal(deskOf(plan, 'c'), 2)

  // a goes idle; b and c keep working.
  const idleAt = 1000
  plan = reconcileDesks(plan, cand([['a', false], ['b', true], ['c', true]]), idleAt, first)
  plan = reconcileDesks(plan, cand([['a', false], ['b', true], ['c', true]]), idleAt + DESK_GRACE_MS, first)
  assert.equal(deskOf(plan, 'a'), undefined, 'a releases its desk after the grace window')
  assert.equal(deskOf(plan, 'b'), 1)
  assert.equal(deskOf(plan, 'c'), 2)

  let offered: readonly number[] = []
  const roster = cand([['a', false], ['b', true], ['c', true], ['d', true]])
  plan = reconcileDesks(plan, roster, idleAt + DESK_GRACE_MS + 1, (free) => {
    offered = free
    return free[free.length - 1]
  })
  assert.ok(!offered.includes(1) && !offered.includes(2), 'occupied desks are not offered')
  assert.ok(offered.includes(0), 'the released desk is offered again')
  assert.equal(deskOf(plan, 'b'), 1)
  assert.equal(deskOf(plan, 'c'), 2)
  assert.equal(deskOf(plan, 'd'), 9)
  assertInvariants(plan, roster)
})

test('an idle holder keeps its desk through the grace window; reactivation resumes at the same desk', () => {
  let plan = reconcileDesks(emptyDeskPlan(), cand([['a', true]]), 0, first)
  const desk = deskOf(plan, 'a')
  plan = reconcileDesks(plan, cand([['a', false]]), 1000, first)
  plan = reconcileDesks(plan, cand([['a', false]]), 1000 + DESK_GRACE_MS - 1, first)
  assert.equal(deskOf(plan, 'a'), desk, 'no release before the grace window ends')

  plan = reconcileDesks(plan, cand([['a', true]]), 1000 + DESK_GRACE_MS - 1, first)
  assert.equal(deskOf(plan, 'a'), desk)

  // Going idle again restarts the window from the new idle time.
  plan = reconcileDesks(plan, cand([['a', false]]), 100_000, first)
  plan = reconcileDesks(plan, cand([['a', false]]), 100_000 + DESK_GRACE_MS - 1, first)
  assert.equal(deskOf(plan, 'a'), desk)
  plan = reconcileDesks(plan, cand([['a', false]]), 100_000 + DESK_GRACE_MS, first)
  assert.equal(deskOf(plan, 'a'), undefined)
})

test('a full office leaves extra workers without a desk until one is released', () => {
  const roster = Array.from({ length: DESK_COUNT + 2 }, (_, i) => [`m${i}`, true] as [string, boolean])
  let plan = reconcileDesks(emptyDeskPlan(), cand(roster), 0, first)
  const seated = roster.filter(([id]) => deskOf(plan, id) !== undefined)
  const waiting = roster.filter(([id]) => deskOf(plan, id) === undefined)
  assert.equal(seated.length, DESK_COUNT)
  assert.equal(waiting.length, 2)
  assert.equal(new Set(plan.assignments.values()).size, DESK_COUNT)

  // One seated worker goes idle; after the grace window the first waiter gets exactly that desk.
  const holder = seated[0][0]
  const freed = deskOf(plan, holder)!
  const withIdle = roster.map(([id, w]) => [id, id === holder ? false : w] as [string, boolean])
  plan = reconcileDesks(plan, cand(withIdle), 1000, first)
  plan = reconcileDesks(plan, cand(withIdle), 1000 + DESK_GRACE_MS, first)
  assert.equal(deskOf(plan, waiting[0][0]), freed)
  assert.equal(deskOf(plan, waiting[1][0]), undefined, 'the second waiter still waits')
  assertInvariants(plan, cand(withIdle))
})

test('a departed character loses its desk at once, even inside the grace window', () => {
  let plan = reconcileDesks(emptyDeskPlan(), cand([['a', true], ['b', true]]), 0, first)
  plan = reconcileDesks(plan, cand([['b', true]]), 1, first)
  assert.equal(deskOf(plan, 'a'), undefined)
  assert.equal(deskOf(plan, 'b'), 1)
})

test('random churn never double-books, never exceeds capacity, and keeps stayers in place', () => {
  const rng = seeded(0xbadf00d)
  const pick = randomWith(rng)
  const ids = Array.from({ length: 24 }, (_, i) => `p/m${i}`)
  const working = new Map(ids.map((id) => [id, false]))
  let present = new Set<string>()
  let plan = emptyDeskPlan()
  let now = 0

  for (let step = 0; step < 600; step++) {
    now += 1000 + Math.floor(rng() * 9000)
    for (const id of ids) {
      const r = rng()
      if (r < 0.12) working.set(id, !working.get(id))
      if (r > 0.97) present.has(id) ? present.delete(id) : present.add(id)
    }
    if (present.size === 0) present.add(ids[0])
    const roster = ids.filter((id) => present.has(id)).map((id) => ({ id, working: working.get(id)! }))

    const before = new Map(plan.assignments)
    const idleBefore = new Map(plan.idleSince)
    plan = reconcileDesks(plan, roster, now, pick)
    assertInvariants(plan, roster)

    const workingWithoutDesk = roster.filter((c) => c.working && !plan.assignments.has(c.id))
    if (workingWithoutDesk.length > 0) {
      assert.equal(plan.assignments.size, DESK_COUNT, 'a worker waits only when every desk is taken')
    }
    // Stayers keep their desk: a holder still on the roster keeps exactly the same desk, unless it has been
    // idle for the whole grace window (then, and only then, it is released).
    for (const c of roster) {
      const was = before.get(c.id)
      if (was === undefined) continue
      const expired = !c.working && now - (idleBefore.get(c.id) ?? now) >= DESK_GRACE_MS
      if (expired) assert.equal(plan.assignments.get(c.id), undefined, `${c.id} released after grace`)
      else assert.equal(plan.assignments.get(c.id), was, `${c.id} kept its desk`)
    }
  }
})

test('the snapshot carries each character\'s desk, or null when it has none', () => {
  const plan = reconcileDesks(emptyDeskPlan(), cand([['p/a', true], ['p/b', false]]), 0, first)
  const snap = withDesks(snapshotOf([['p/a', 'tool'], ['p/b', 'idle']], 0), plan.assignments)
  assert.equal(snap.characters[0].desk, 0)
  assert.equal(snap.characters[1].desk, null)
})

test('persisted state parses tolerantly: corrupt, duplicate, out-of-range and malformed entries are dropped', () => {
  assert.deepEqual([...parseDeskState('{"version":1,"assignments":{"a":3,"b":3}}').assignments], [['a', 3]])
  const bad = parseDeskState('{"assignments":{"a":10,"b":-1,"c":1.5,"d":"2","e":4,"":5}}')
  assert.deepEqual([...bad.assignments], [['e', 4]])
  assert.equal(bad.warning, null)

  const corrupt = parseDeskState('{not json')
  assert.equal(corrupt.assignments.size, 0)
  assert.match(corrupt.warning ?? '', /not valid JSON/)

  const shape = parseDeskState('[1,2,3]')
  assert.equal(shape.assignments.size, 0)
  assert.match(shape.warning ?? '', /no assignments/)
})

test('deskStateFile is app-owned: explicit env wins, default is under ~/.local/state, never ~/.pi', () => {
  // Linux rules via the pure resolver, so the assertion holds on every CI OS; deskStateFile() delegates to it.
  const linux = (env: Record<string, string>) => deskStatePath({ env, platform: 'linux', home: '/home/u', exists: () => false })
  assert.equal(linux({ PI_OFFICE_STATE_FILE: '/tmp/explicit-desks.json' }), '/tmp/explicit-desks.json')
  assert.equal(linux({ XDG_STATE_HOME: '/tmp/xdg-state' }), '/tmp/xdg-state/pi-office/desks.json')
  const file = linux({})
  assert.equal(file, '/home/u/.local/state/pi-office/desks.json')
  assert.equal(file.includes('/.pi/'), false)
  const saved = { ...process.env }
  try {
    process.env.PI_OFFICE_STATE_FILE = join(tmpdir(), 'explicit-desks.json')
    assert.equal(deskStateFile(), join(tmpdir(), 'explicit-desks.json'))
  } finally {
    process.env = saved
  }
})

test('state file: deferred writes coalesce off the request path and flush on demand', async () => {
  await withDir(async (dir) => {
    const file = join(dir, 'state', 'desks.json')
    const allocator = new DeskAllocator({ file, pick: first, writeDelayMs: 60_000 })
    allocator.apply(snapshotOf([['p/a', 'tool']], 0))
    allocator.apply(snapshotOf([['p/a', 'tool'], ['p/b', 'tool']], 1))
    await assert.rejects(readFile(file, 'utf8'), /ENOENT/, 'apply() itself never touches the disk')
    allocator.flush()
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).assignments, { 'p/a': 0, 'p/b': 1 })
    await writeFile(file, 'SENTINEL')
    allocator.flush()
    assert.equal(await readFile(file, 'utf8'), 'SENTINEL', 'nothing pending: flush writes nothing')

    const quick = new DeskAllocator({ file: join(dir, 'quick.json'), pick: first, writeDelayMs: 5 })
    quick.apply(snapshotOf([['p/c', 'tool']], 0))
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'quick.json'), 'utf8')).assignments, { 'p/c': 0 })
  })
})

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'pi-office-desks-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function character(id: string, status: ActivityStatus): Character {
  const [provider, model] = [id.split('/')[0], id.split('/').slice(1).join('/')]
  return {
    id,
    provider,
    model,
    displayName: id,
    stats: {
      messages: 1,
      outputTokens: 1,
      inputTokens: 1,
      toolCalls: 0,
      sessions: 1,
      todayOutputTokens: 0,
      firstSeen: 0,
      lastSeen: 0,
    },
    level: 1,
    title: 'Intern',
    xp: 0,
    levelProgress: 0,
    status,
    desk: null,
    active: [],
  }
}

function snapshotOf(entries: Array<[string, ActivityStatus]>, now: number): OfficeSnapshot {
  return {
    now,
    characters: entries.map(([id, status]) => character(id, status)),
    totals: { activeSessions: 0, workingCharacters: 0, todayOutputTokens: 0, lifetimeOutputTokens: 0 },
  }
}

test('state file: restart keeps the people who stay at their desks and writes nothing when nothing changed', async () => {
  await withDir(async (dir) => {
    const file = join(dir, 'state', 'desks.json')
    const first1 = new DeskAllocator({ file, pick: first })
    const t0 = 1_000_000
    first1.apply(snapshotOf([['p/a', 'tool'], ['p/b', 'tool'], ['p/c', 'tool']], t0))
    first1.apply(snapshotOf([['p/a', 'idle'], ['p/b', 'tool'], ['p/c', 'tool']], t0 + 1000))
    first1.apply(snapshotOf([['p/a', 'idle'], ['p/b', 'tool'], ['p/c', 'tool']], t0 + 1000 + DESK_GRACE_MS))

    const saved = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(saved, { version: 1, assignments: { 'p/b': 1, 'p/c': 2 } })
    assert.deepEqual(await readdir(join(dir, 'state')), ['desks.json'], 'no temp files left behind')

    // Simulate a restart / deploy: a fresh allocator loads the file and the survivors keep their desks.
    const picks: number[][] = []
    const restarted = new DeskAllocator({
      file,
      pick: (free) => {
        picks.push([...free])
        return free[0]
      },
    })
    const after = restarted.apply(snapshotOf([['p/a', 'idle'], ['p/b', 'tool'], ['p/c', 'thinking']], t0 + 90_000))
    assert.equal(after.characters.find((c) => c.id === 'p/b')!.desk, 1)
    assert.equal(after.characters.find((c) => c.id === 'p/c')!.desk, 2)
    assert.deepEqual(picks, [], 'nobody already seated is re-assigned on restart')

    // Re-applying an identical snapshot must not rewrite the file (sentinel would be overwritten otherwise).
    await writeFile(file, 'SENTINEL')
    restarted.apply(snapshotOf([['p/a', 'idle'], ['p/b', 'tool'], ['p/c', 'thinking']], t0 + 90_001))
    assert.equal(await readFile(file, 'utf8'), 'SENTINEL')
  })
})

test('state file: corrupt content starts an empty office with one warning and no throw', async () => {
  await withDir(async (dir) => {
    const file = join(dir, 'desks.json')
    await writeFile(file, '{{{ not json')
    const warnings: string[] = []
    const allocator = new DeskAllocator({ file, pick: first, warn: (m) => warnings.push(m) })
    const snap = allocator.apply(snapshotOf([['p/a', 'tool']], 0))
    assert.equal(snap.characters[0].desk, 0)
    assert.equal(warnings.length, 1)
    const rewritten = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(rewritten.assignments, { 'p/a': 0 })
  })
})

test('state file: an unwritable location warns once and keeps serving from memory', async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, 'blocker'), 'a regular file, not a directory')
    const warnings: string[] = []
    const allocator = new DeskAllocator({ file: join(dir, 'blocker', 'desks.json'), pick: first, warn: (m) => warnings.push(m) })
    assert.equal(allocator.apply(snapshotOf([['p/a', 'tool']], 0)).characters[0].desk, 0)
    const afterFirst = warnings.length
    assert.ok(afterFirst >= 1 && afterFirst <= 2, 'the blocked read and the blocked write each warn once')
    assert.equal(allocator.apply(snapshotOf([['p/a', 'tool'], ['p/b', 'tool']], 1)).characters[1].desk, 1)
    assert.equal(allocator.apply(snapshotOf([['p/a', 'tool'], ['p/b', 'tool']], 2)).characters[1].desk, 1)
    assert.equal(warnings.length, afterFirst, 'repeated failed writes do not spam the log')
  })
})

test('missing state file is a quiet empty office', async () => {
  await withDir(async (dir) => {
    const warnings: string[] = []
    const allocator = new DeskAllocator({ file: join(dir, 'nope.json'), pick: first, warn: (m) => warnings.push(m) })
    assert.equal(allocator.assignments.size, 0)
    assert.equal(warnings.length, 0)
  })
})

const DAY_LINE = (o: unknown) => JSON.stringify(o) + '\n'

/** One session file per model. `working` leaves an open tool call; otherwise the reply is terminal. */
function sessionText(id: string, provider: string, model: string, stopReason: string, at: number): string {
  const iso = new Date(at).toISOString()
  return (
    DAY_LINE({ type: 'session', id, timestamp: iso, cwd: '/root/github/pi-office' }) +
    DAY_LINE({ type: 'model_change', timestamp: iso, provider, modelId: model }) +
    DAY_LINE({ type: 'message', timestamp: iso, message: { role: 'user', timestamp: at, content: [{ type: 'text', text: 'hi' }] } }) +
    DAY_LINE({
      type: 'message',
      timestamp: iso,
      message: {
        role: 'assistant',
        provider,
        model,
        stopReason,
        timestamp: at + 1,
        usage: { input: 1, output: 10 + id.length, cacheRead: 0, cacheWrite: 0 },
        content: stopReason === 'toolUse' ? [{ type: 'toolCall', name: 'bash' }] : [{ type: 'text', text: 'done' }],
      },
    })
  )
}

test('office store: refresh after departures keeps the remaining workers at their desks', async () => {
  await withDir(async (dir) => {
    const sessions = join(dir, 'sessions', 'proj')
    const state = join(dir, 'state', 'desks.json')
    await mkdir(sessions, { recursive: true })
    const t0 = new Date(2026, 9, 18, 12, 0, 0).getTime() // fixed local noon, not the real clock
    const models = [
      ['anthropic', 'claude-a'],
      ['openai', 'gpt-b'],
      ['google', 'gemini-c'],
      ['deepseek', 'chat-d'],
    ] as const
    for (const [i, [provider, model]] of models.entries()) {
      await writeFile(join(sessions, `s${i}.jsonl`), sessionText(`s${i}`, provider, model, 'toolUse', t0))
    }

    const store = new OfficeStore(join(dir, 'sessions'), undefined, new DeskAllocator({ file: state, pick: first }), { now: () => t0 })
    await store.start()
    try {
      const seatedAt = (snap: OfficeSnapshot) =>
        Object.fromEntries(snap.characters.map((c) => [c.id, c.desk]))
      const initial = seatedAt(store.snapshot(t0 + 1000))
      assert.deepEqual(new Set(Object.values(initial)).size, 4)

      // The first model finishes: its reply is terminal. Then its grace window runs out.
      await appendFile(
        join(sessions, 's0.jsonl'),
        DAY_LINE({
          type: 'message',
          timestamp: new Date(t0).toISOString(),
          message: { role: 'assistant', provider: 'anthropic', model: 'claude-a', stopReason: 'stop', timestamp: t0 + 500, usage: { input: 1, output: 3, cacheRead: 0, cacheWrite: 0 }, content: [{ type: 'text', text: 'done' }] },
        }),
      )
      await store.refresh()
      const idleAt = t0 + 2000
      store.snapshot(idleAt)
      const released = seatedAt(store.snapshot(idleAt + DESK_GRACE_MS))
      assert.equal(released['anthropic/claude-a'], null)
      for (const id of ['openai/gpt-b', 'google/gemini-c', 'deepseek/chat-d']) {
        assert.equal(released[id], initial[id], `${id} stays at its desk after a departure`)
      }

      // Browser refresh (new snapshot reader, same server state file) and a server restart: same seats.
      const restarted = new OfficeStore(join(dir, 'sessions'), undefined, new DeskAllocator({ file: state, pick: last }), { now: () => t0 })
      await restarted.start()
      try {
        const afterRefresh = seatedAt(restarted.snapshot(idleAt + DESK_GRACE_MS + 5_000))
        assert.equal(afterRefresh['anthropic/claude-a'], null)
        for (const id of ['openai/gpt-b', 'google/gemini-c', 'deepseek/chat-d']) {
          assert.equal(afterRefresh[id], initial[id], `${id} is not reshuffled after a refresh`)
        }
      } finally {
        restarted.stop()
      }
    } finally {
      store.stop()
    }
  })
})
