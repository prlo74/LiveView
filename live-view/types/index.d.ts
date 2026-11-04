export type Kind = 'edit' | 'read' | 'browse' | 'run' | 'search' | 'agent' | 'other'

export type Step = {
  id: string
  at: number
  tool: string
  kind: Kind
  target: string
  isDone: boolean
  /** When the tool answered (ms); absent while it runs. */
  endAt?: number
  isError?: boolean
  /** The person declined it: their choice, never counted as the agent failing. */
  isDenied?: boolean
}

export type FileTouch = { path: string; adds: number; dels: number; isEdited: boolean }

/** One line of an agent's screen: its line number in the file, and whether the agent added or removed it. */
export type ScreenLine = { no: number; mark: ' ' | '+' | '-'; text: string }

/** What the agent is looking at right now: a file in its editor, its terminal, or a page. */
export type Screen = {
  kind: 'file' | 'terminal' | 'browser'
  title: string
  language?: string
  lines: ScreenLine[]
  /** Index into `lines` the view centres on (the edit, or the first line read). */
  focus: number
  markdown?: string
  isRunning?: boolean
}

/** Something the agent just did that the screen reacts to (a flash, a banner, particles). */
export type FxKind = 'add' | 'cut' | 'error' | 'pass' | 'fail' | 'spawn' | 'done' | 'search' | 'run' | 'browse'
export type FxEvent = { id: string; kind: FxKind; size: number; at: number; label: string }

/** Model tokens an agent used, summed over its turns. */
export type Usage = { input: number; output: number; cacheRead: number }

export type AgentView = {
  id: string
  label: string
  status: 'working' | 'idle' | 'done'
  steps: Step[]
  files: FileTouch[]
  screen?: Screen
  fx?: FxEvent
  /** When each recent edit landed, for the activity pulse. */
  edits: number[]
  linesChanged: number
  /** When the agent was first seen (ms). */
  startedAt: number
  usage: Usage
  /** The model its last turn ran on, as the API names it. */
  model?: string
  /** Estimated from `usage` and a per-model price table. */
  costUsd: number
  turns: number
  /** Total time spent in turns (ms). */
  turnMs: number
  /** Tool calls made, ever (steps keeps only the last 100). */
  calls: number
  errors: number
  /** Total time tool calls took (ms). */
  stepMs: number
  /** Tool calls by tool name. */
  toolMix: Record<string, number>
  /** The agent that spawned this one; absent for the main agent. */
  parentId?: string
  /** What the agent did, in plain sentences, newest last (kept to 30). */
  updates: Update[]
  /** The local dev server this agent started or last edited a site for. */
  siteUrl?: string
  /** What it was asked to do: a helper's spawn prompt, or the person's latest prompt for the main agent (cut to 600 chars). */
  task?: string
  /** The steps it plans, from its own to-do tool calls (TodoWrite, TaskCreate/TaskUpdate, update_plan). */
  plan?: PlanStep[]
  /** The HTML file it last edited, for the Agent Web's site preview (absolute path). */
  htmlFile?: string
  /** When it last edited a file beside that HTML file, so the preview knows to reload. */
  siteRev?: number
  /** Set while a tool call of its waits on an approval (the engine decided to ask): when, and which tool.
   *  `person`: true once a dialog was raised for the person, false when the mode decides (auto mode's classifier), unset when unknown. */
  waiting?: { since: number; tool: string; id?: string; person?: boolean }
}

/** One step of an agent's plan. */
export type PlanStep = { id?: string; text: string; status: 'pending' | 'in_progress' | 'completed' }

/** A local dev server an agent started, and its latest snapshot. */
export type Site = {
  url: string
  /** When the server was first seen in a command's output (ms). */
  foundAt: number
  /** When the latest snapshot was taken (ms); 0 before the first. */
  at: number
  /** The latest snapshot, a small JPEG, base64 (drawn on desktop). */
  jpeg?: string
  /** The same snapshot as a small PNG file on disk (drawn on the terminal). */
  png?: string
  /** Bumped with each new snapshot, so a surface reloads the file. */
  generation: number
  /** When a snapshot is wanted (ms); absent when none is pending. */
  dueAt?: number
  isTaking?: boolean
  /** Why the last snapshot failed, in plain words. */
  error?: string
}

/** Where the site being built is shown: snapshots in each agent's tile, or the app's browser pane. */
export type SiteMode = 'tiles' | 'pane'

/** One plain-language line about what an agent did. */
export type Update = {
  at: number
  text: string
  tone: 'add' | 'cut' | 'pass' | 'fail' | 'error' | 'info'
  /** Updates that share a key and land close together merge into one ("Read 3 files"). */
  mergeKey?: string
  /** What merged updates name, in order (file names, patterns). */
  names?: string[]
}

/** One minute of the whole session's activity, for sparklines and deltas. */
export type Bucket = {
  /** The minute's start (ms, floored to 60 000). */
  t: number
  calls: number
  errors: number
  tokens: number
  cost: number
  lines: number
  stepMs: number
}

export type Page = 'overview' | 'team' | 'agents' | 'activity' | 'files'
export type Range = 'session' | '15m' | '1h'

declare module 'claude-code' {
  interface PluginState {
    'live-view': {
      agents: Shaped<Record<string, AgentView>>
      focused: Shaped<string>
      director: Shaped<boolean>
      /** The last 120 minutes, oldest first. */
      series: Shaped<Bucket[]>
      page: Shaped<Page>
      range: Shaped<Range>
      /** Local dev servers by URL. */
      sites: Shaped<Record<string, Site>>
      siteMode: Shaped<SiteMode>
      /** Whether the Agent Web window was opened this session. */
      webOn: Shaped<boolean>
    }
  }
}
