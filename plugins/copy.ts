// @amp-plugin updated automatically from https://raw.githubusercontent.com/ben-vargas/amp-plugins/main/plugins/copy.ts
import type { PluginAPI, PluginThread, ThreadMessage } from '@ampcode/plugin'

const PAGE_SIZE = 20
const CLIPBOARD_TIMEOUT_MS = 5_000
const CLIPBOARD_SCRIPT = `
ObjC.import('AppKit')
const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile
const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding)
if (text.isNil()) {
	throw new Error('clipboard input is not valid UTF-8')
}

const pasteboard = $.NSPasteboard.generalPasteboard
pasteboard.clearContents
if (!pasteboard.setStringForType(text, $.NSPasteboardTypeString)) {
	throw new Error('NSPasteboard setString:forType: failed')
}
`

async function copyToClipboard(markdown: string): Promise<void> {
	if (!markdown.trim()) {
		throw new Error('the assistant turn is empty')
	}

	const clipboardProcess = (() => {
		try {
			return Bun.spawn({
				cmd: [
					'/usr/bin/osascript',
					'-l',
					'JavaScript',
					'-e',
					CLIPBOARD_SCRIPT,
				],
				stdin: 'pipe',
				stdout: 'ignore',
				stderr: 'pipe',
			})
		} catch (error) {
			throw new Error('could not start the macOS clipboard process', {
				cause: error,
			})
		}
	})()

	let inputError: unknown
	let timedOut = false
	const timeout = setTimeout(() => {
		timedOut = true
		try {
			clipboardProcess.kill(9)
		} catch {
			// The process may have exited between the timer firing and the kill.
		}
	}, CLIPBOARD_TIMEOUT_MS)
	const stderrPromise = new Response(clipboardProcess.stderr).text()

	try {
		try {
			clipboardProcess.stdin.write(markdown)
			await clipboardProcess.stdin.end()
		} catch (error) {
			inputError = error
			try {
				clipboardProcess.kill(9)
			} catch {
				// The process may already have exited after closing its input.
			}
		}

		const [exitCode, stderr] = await Promise.all([
			clipboardProcess.exited,
			stderrPromise,
		])
		const detail = stderr.trim().slice(0, 1_000)

		if (timedOut) {
			throw new Error('the macOS clipboard process timed out')
		}

		if (inputError) {
			throw new Error(
				`could not send Markdown to the macOS clipboard process${detail ? `: ${detail}` : ''}`,
				{ cause: inputError },
			)
		}

		if (exitCode !== 0) {
			throw new Error(
				`macOS clipboard process exited with code ${exitCode}${detail ? `: ${detail}` : ''}`,
			)
		}
	} finally {
		clearTimeout(timeout)
	}
}

function assistantText(message: ThreadMessage): string {
	if (message.role !== 'assistant') {
		return ''
	}

	return message.content
		.flatMap((block) =>
			block.type === 'text' && block.text.trim() ? [block.text] : [],
		)
		.join('\n\n')
}

function isUserPrompt(message: ThreadMessage): boolean {
	return (
		message.role === 'user' &&
		message.content.some(
			(block) => block.type === 'text' && block.text.trim().length > 0,
		)
	)
}

async function lastAssistantTurn(
	thread: PluginThread,
): Promise<{ markdown: string; messageCount: number } | null> {
	const parts: string[] = []
	let offset = 0

	while (true) {
		const messages = await thread.messages({
			from: 'end',
			offset,
			limit: PAGE_SIZE,
		})

		if (messages.length === 0) {
			break
		}

		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index]
			const text = assistantText(message)

			if (text) {
				parts.push(text)
				continue
			}

			if (parts.length > 0 && isUserPrompt(message)) {
				return {
					markdown: parts.reverse().join('\n\n'),
					messageCount: parts.length,
				}
			}
		}

		if (messages.length < PAGE_SIZE) {
			break
		}

		offset += messages.length
	}

	if (parts.length === 0) {
		return null
	}

	return {
		markdown: parts.reverse().join('\n\n'),
		messageCount: parts.length,
	}
}

export default function (amp: PluginAPI) {
	amp.registerCommand(
		'copy',
		{
			title: 'Copy last turn',
			category: 'copy',
			description:
				'Copy the last completed assistant turn to the clipboard as Markdown',
		},
		async (ctx) => {
			try {
				if (!ctx.thread) {
					await ctx.ui.notify('No active thread to copy from.')
					return
				}

				if (ctx.system.executor.kind !== 'local') {
					await ctx.ui.notify('Copy requires Amp to be running locally.')
					return
				}

				if (process.platform !== 'darwin') {
					await ctx.ui.notify('Copy currently supports macOS only.')
					return
				}

				const state = await ctx.thread.state.get()
				if (state !== 'idle') {
					await ctx.ui.notify(
						`The thread is ${state}; copy is available after the turn finishes.`,
					)
					return
				}

				const turn = await lastAssistantTurn(ctx.thread)
				if (!turn) {
					await ctx.ui.notify('No completed assistant turn found.')
					return
				}

				await copyToClipboard(turn.markdown)

				await ctx.ui.notify(
					`Copied last turn (${turn.markdown.length} characters from ${turn.messageCount} assistant ${turn.messageCount === 1 ? 'message' : 'messages'}).`,
				)
			} catch (error) {
				amp.logger.log('Copy command failed:', error)
				await ctx.ui.notify(
					`Could not copy the last turn: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		},
	)
}
