import { expect, test } from 'claude-code/testing'
import { goalText, nextPlan } from '../hooks/plan'

test('plan tools turn into one step list', () => {
  const todo = nextPlan(undefined, 'TodoWrite', { todos: [{ content: 'Read code', status: 'completed' }, { content: 'Fix bug', status: 'in_progress' }, { content: 'Test', status: 'pending' }] })!
  expect(todo.map(s => s.status)).toEqual(['completed', 'in_progress', 'pending'])

  const items = nextPlan(undefined, 'mcp__ccd_turn__update_plan', { items: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] })!
  const advanced = nextPlan(items, 'mcp__ccd_turn__update_plan', { advance: true })!
  expect(advanced.map(s => s.status)).toEqual(['completed', 'in_progress'])
  expect(nextPlan(advanced, 'mcp__ccd_turn__update_plan', { done: [2] })!.map(s => s.status)).toEqual(['completed', 'completed'])

  const made = nextPlan(nextPlan(undefined, 'TaskCreate', { subject: 'One' }), 'TaskCreate', { subject: 'Two' })!
  expect(nextPlan(made, 'TaskUpdate', { taskId: '2', status: 'in_progress' })!.map(s => s.status)).toEqual(['pending', 'in_progress'])
  expect(nextPlan(made, 'TaskUpdate', { taskId: '1', status: 'deleted' })!.map(s => s.text)).toEqual(['Two'])

  // ids stay unique after a delete
  let abc: ReturnType<typeof nextPlan> = undefined
  for (const subject of ['A', 'B', 'C']) abc = nextPlan(abc, 'TaskCreate', { subject })
  const d = nextPlan(nextPlan(abc, 'TaskUpdate', { taskId: '2', status: 'deleted' }), 'TaskCreate', { subject: 'D' })!
  expect(d.map(s => s.id)).toEqual(['1', '3', '4'])
  expect(nextPlan(d, 'TaskUpdate', { taskId: '3', status: 'completed' })!.map(s => s.status)).toEqual(['pending', 'completed', 'pending'])

  expect(nextPlan(todo, 'Read', { file_path: '/a' })).toBeUndefined()
})

test('the goal is the first sentence of the task', () => {
  expect(goalText('Fix the retro screen. Keep it small.')).toBe('Fix the retro screen.')
  expect(goalText(undefined)).toBeUndefined()
  expect(goalText('x'.repeat(300))!.length).toBe(120)
})
