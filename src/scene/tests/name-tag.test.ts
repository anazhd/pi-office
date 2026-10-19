import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DESK_SEATS, LOUNGE_SEATS } from '../layout.ts'
import { seatedPose } from '../seated-pose.ts'
import { nameTagTop, NAME_TAG_HEIGHT, NAME_TAG_OPACITY } from '../name-tag.ts'

for (const seat of [...DESK_SEATS, ...LOUNGE_SEATS]) {
  test(`${seat.id}: name tag clears the head, not below the feet`, () => {
    for (const pose of ['walking', 'waiting', 'typing', 'relaxing', 'idle']) {
      const center = pose === 'idle' ? -seatedPose(seat).height - 31 : -48
      assert.ok(nameTagTop({ seat, pose }) + NAME_TAG_HEIGHT <= center - 23 - 4 + 1e-9)
    }
  })
}
test('name plates retain translucency with a lighter background', () => {
  assert.ok(NAME_TAG_OPACITY.normal > 0 && NAME_TAG_OPACITY.normal < 0.64)
  assert.ok(NAME_TAG_OPACITY.selected > NAME_TAG_OPACITY.normal && NAME_TAG_OPACITY.selected < 0.94)
})
test('scene does not render work speech bubbles', () => {
  const source = readFileSync(new URL('../office-scene.tsx', import.meta.url), 'utf8')
  assert.ok(!source.includes('SpeechBubble'))
})
