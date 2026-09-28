import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginAPI, Subscription } from '@ampcode/plugin'

export const description =
	'Keeps the orb awake while it is enabled as the CLIProxyAPI host (.agents/cliproxy-host enable). Does nothing elsewhere.'

// Written and removed by .agents/cliproxy-host.
const MARKER = join(homedir(), '.config', 'cliproxy-host', 'enabled')
const CHECK_INTERVAL_MS = 60_000

export default function (amp: PluginAPI) {
	let lease: Subscription | undefined
	let acquiring = false

	const sync = async () => {
		const enabled = existsSync(MARKER)
		if (enabled && !lease && !acquiring) {
			acquiring = true
			try {
				lease = await amp.system.executor.keepAlive()
				amp.logger.log('cliproxy-host: keep-alive lease acquired')
			} catch (error) {
				amp.logger.log(`cliproxy-host: keep-alive unavailable: ${String(error)}`)
			} finally {
				acquiring = false
			}
		} else if (!enabled && lease) {
			lease.unsubscribe()
			lease = undefined
			amp.logger.log('cliproxy-host: keep-alive lease released')
		}
	}

	void sync()
	const timer = setInterval(() => void sync(), CHECK_INTERVAL_MS)
	amp.onDispose(() => {
		clearInterval(timer)
		lease?.unsubscribe()
	})
}
