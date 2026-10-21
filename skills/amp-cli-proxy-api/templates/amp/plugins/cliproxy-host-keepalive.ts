import { appendFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginAPI, Subscription } from '@ampcode/plugin'

export const description =
	'Keeps the orb awake while it is enabled as the CLIProxyAPI host (.agents/cliproxy-host enable). Does nothing elsewhere.'

// Shared with .agents/cliproxy-host: it writes and removes the marker, and reads the lease
// state and events for status and pauses.
const STATE_DIR = join(homedir(), '.config', 'cliproxy-host')
const MARKER = join(STATE_DIR, 'enabled')
const STATE_FILE = join(STATE_DIR, 'keepalive.json')
const EVENTS = join(STATE_DIR, 'events.log')

// The SDK renews a lease every 4 minutes and only logs a failed renewal, then waits another
// 4 minutes. Taking a fresh lease every minute renews it 4 times as often, and a failed
// attempt rejects here, so it is retried after 10 seconds and recorded.
const RENEW_MS = 60_000
const RETRY_MS = 10_000
const ATTEMPT_TIMEOUT_MS = 30_000

type State = {
	pid: number
	startedAt: string
	holding: boolean
	lastAttemptAt: string | null
	lastSuccessAt: string | null
	lastFailureAt: string | null
	lastError: string | null
	consecutiveFailures: number
	renewals: number
	failures: number
}

export default function (amp: PluginAPI) {
	const state: State = {
		pid: process.pid,
		startedAt: new Date().toISOString(),
		holding: false,
		lastAttemptAt: null,
		lastSuccessAt: null,
		lastFailureAt: null,
		lastError: null,
		consecutiveFailures: 0,
		renewals: 0,
		failures: 0,
	}
	let lease: Subscription | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let disposed = false

	const save = () => {
		try {
			mkdirSync(STATE_DIR, { recursive: true })
			writeFileSync(`${STATE_FILE}.tmp`, `${JSON.stringify(state, null, '\t')}\n`)
			renameSync(`${STATE_FILE}.tmp`, STATE_FILE)
		} catch (error) {
			amp.logger.log(`cliproxy-host: could not write ${STATE_FILE}: ${String(error)}`)
		}
	}

	const event = (type: string, fields: Record<string, unknown> = {}) => {
		try {
			mkdirSync(STATE_DIR, { recursive: true })
			const line = { t: new Date().toISOString(), type, src: 'plugin', ...fields }
			appendFileSync(EVENTS, `${JSON.stringify(line)}\n`)
		} catch {
			// Diagnostics must never break the lease.
		}
	}

	const release = (type: string) => {
		lease?.unsubscribe()
		lease = undefined
		if (state.holding) {
			state.holding = false
			save()
			event(type)
			amp.logger.log(`cliproxy-host: keep-alive lease released (${type})`)
		}
	}

	// Rejects after ATTEMPT_TIMEOUT_MS so a request that never answers (for example while the
	// executor reconnects) cannot stall renewals. A lease that arrives later is dropped.
	const acquire = () =>
		new Promise<Subscription>((resolve, reject) => {
			let settled = false
			const timeout = setTimeout(() => {
				settled = true
				reject(new Error(`no answer within ${ATTEMPT_TIMEOUT_MS / 1000}s`))
			}, ATTEMPT_TIMEOUT_MS)
			amp.system.executor.keepAlive().then(
				(subscription) => {
					clearTimeout(timeout)
					if (settled) subscription.unsubscribe()
					else resolve(subscription)
				},
				(error: unknown) => {
					clearTimeout(timeout)
					if (!settled) reject(error)
				},
			)
		})

	const tick = async () => {
		timer = undefined
		if (disposed) return
		if (!existsSync(MARKER)) {
			release('lease_released')
			schedule(RENEW_MS)
			return
		}
		state.lastAttemptAt = new Date().toISOString()
		try {
			const next = await acquire()
			if (disposed) {
				next.unsubscribe()
				return
			}
			// Keep the previous lease, which still renews itself, until the new one is held.
			lease?.unsubscribe()
			lease = next
			const failures = state.consecutiveFailures
			const previousSuccess = state.lastSuccessAt
			const wasHolding = state.holding
			state.holding = true
			state.lastSuccessAt = state.lastAttemptAt
			state.consecutiveFailures = 0
			state.renewals++
			if (!wasHolding) {
				event('lease_acquired', { failures })
				amp.logger.log('cliproxy-host: keep-alive lease acquired')
			} else if (failures > 0) {
				event('renewal_recovered', { failures, previousSuccess })
				amp.logger.log(`cliproxy-host: keep-alive renewed again after ${failures} failures`)
			}
			save()
			schedule(RENEW_MS)
		} catch (error) {
			if (disposed) return
			state.lastFailureAt = new Date().toISOString()
			state.lastError = String(error)
			state.consecutiveFailures++
			state.failures++
			// The first failure of a streak, then every 30th (about every 5 minutes).
			if (state.consecutiveFailures % 30 === 1) {
				event('renewal_failed', {
					consecutive: state.consecutiveFailures,
					lastSuccessAt: state.lastSuccessAt,
					error: state.lastError.slice(0, 300),
				})
				amp.logger.log(`cliproxy-host: keep-alive renewal failed: ${state.lastError}`)
			}
			save()
			schedule(RETRY_MS)
		}
	}

	const schedule = (ms: number) => {
		if (!disposed) timer = setTimeout(() => void tick(), ms)
	}

	void tick()
	amp.onDispose(() => {
		disposed = true
		if (timer) clearTimeout(timer)
		release('plugin_stopped')
	})
}
