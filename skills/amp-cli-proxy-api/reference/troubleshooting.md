# Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `enable`: `token exchange failed with status 403` | Trust credential mismatch. The credential's page in the Tailscale console shows which claim failed. Check the issuer URL, subject (personal vs workspace format, project ID), `project_id` claim, and that `token_use` is exactly `exchanged`. The error clears after the next successful exchange. |
| `enable`: `TS_CLIENT_ID is not set` (or another variable) | Add it to the project, then `amp orb restart-processes`. |
| `enable`: `tailscale funnel failed` | No `funnel` node attribute for the tag, or HTTPS certificates are off for the tailnet. |
| `tailscaled` stuck in `NeedsLogin` without an error | The systemd drop-in from `.agents/setup` is missing; rerun setup (E2B network detection). |
| Node named `<hostname>-1` | An older node holds the name. Remove it on the Tailscale Machines page, then run `.agents/cliproxy-host reclaim`. A plain `tailscale set --hostname` left the node on `-1` with Funnel still serving the old name; `reclaim` renames through a temporary name and resets Funnel. Public requests can fail for a few minutes afterwards while DNS and the relay catch up. |
| Old machine still listed after `disable` | The logout did not reach Tailscale (older scripts died with the Tailscale SSH session). Remove it on the Machines page; ephemeral nodes are also removed 30–60 minutes after going offline. |
| Public name does not resolve | New Funnel DNS can take about 10 minutes. Check with `dig @8.8.8.8`; direct queries to the `ts.net` authoritative servers returned empty answers even after public resolvers had the record. |
| `/v1/models` 401 with the right key | The running proxy has an old `config.yaml`. Rerun `enable` (restarts on key change) or restart the service. |
| `/v1/models` returns an empty list | No provider is logged in; do the Claude login. |
| Claude login shows no paste prompt | The `Paste the Claude callback URL` prompt appears about 15 seconds after `Waiting for Claude authentication callback...`. Wait for it. |
| Claude login never completes | The callback URL was not pasted at the prompt, or the process was suspended with Ctrl-Z. Run `fg` to resume a suspended login; otherwise rerun it. |
| `ssh: Could not resolve hostname` | That device does not use Tailscale DNS. Use `tailscale ssh`, the 100.x address, or enable "Use Tailscale DNS settings" on the device. |
| Public endpoint fails while `curl localhost:8317/healthz` works | After a pause `tailscaled` can keep dead connections. `resume` repairs it after a wake and the watchdog within about 4 minutes otherwise; check `events.log` for `recovered` or `recovery_failed`. To repair by hand: `sudo systemctl restart tailscaled && .agents/cliproxy-host resume`. Test each relay with `curl --resolve <name>:443:<ip>` for every address of `getent ahostsv4 <name>`; one relay can recover before the other. |
| `watchdog: stopped` in `status` | Run `.agents/cliproxy-host resume` (starts it), or check `amp orb service logs cliproxy-watchdog`. |
| `lease: ... warning: no successful renewal` in `status` | The plugin cannot reach the executor; `lastError` shows why. `WebSocket is not connected` during an executor reconnect is normal and clears within seconds. If the plugin state is stale (old `startedAt`, no renewals), reload plugins or run `amp orb restart-processes`. |
| Orb paused anyway | Check `.agents/cliproxy-host pauses` first: only kind `pause` means the VM stopped. Then check the marker, credits, whether the thread was archived, and `events.log` for `renewal_failed` before the pause. The lease is best-effort: provider runtime limits can still pause the orb. Gaps in the `tailscaled` journal are not pauses; it can be quiet for long stretches. |
| Debug output missing after editing `config.yaml` | The file was replaced rather than edited in place; restart the service. |
| Amp threads still use Amp credits | The connection is inactive, another active connection wins precedence, or the mapping does not include the model. Check `list`, then run `amp config model-providers check-access --provider-model anthropic/<model>` and compare the serving connection ID. |
| Proxy still runs the old source after changing `CLIPROXY_REPO`/`CLIPROXY_REF` | Run `amp orb restart-processes`, then `.agents/setup` (or `.agents/cliproxy-host update` when the Go version is unchanged). |
| The `amp-cli-proxy-api` skill is missing in an orb | Setup could not install it (it only warns). Run `.agents/cliproxy-host skill`; check `CLIPROXY_SKILL_REPO`/`CLIPROXY_SKILL_REF` if it fails. |
| `.agents/skills/amp-cli-proxy-api/` shows as tracked or modified in Git | The project was scaffolded before the skill copy was ignored. Rerun `scaffold.sh --force .` (adds the ignore entry), then `git rm -r --cached .agents/skills/amp-cli-proxy-api` and commit. |
| `scaffold.sh` exits 3 | Managed files already exist with other content; nothing changed. Merge by hand, or rerun with `--force` after the user approves. |

Claude requests from non-Claude-Code clients such as Amp are cloaked by CLIProxyAPI's default
`auto` mode for OAuth credentials; no `cloak_mode` setting is needed.
