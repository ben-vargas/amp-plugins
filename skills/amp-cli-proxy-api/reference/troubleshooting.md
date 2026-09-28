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
| Orb paused anyway | Host marker missing, credits exhausted, or the thread was archived. Check `status` and look for `cliproxy-host: keep-alive lease acquired` in `~/.cache/amp/logs/headless.log`. |
| Debug output missing after editing `config.yaml` | The file was replaced rather than edited in place; restart the service. |
| Amp threads still use Amp credits | The connection is inactive, another active connection wins precedence, or the mapping does not include the model. Check `list`, then run `amp config model-providers check-access --provider-model anthropic/<model>` and compare the serving connection ID. |
| Proxy still runs the old source after changing `CLIPROXY_REPO`/`CLIPROXY_REF` | Run `amp orb restart-processes`, then `.agents/setup` (or `.agents/cliproxy-host update` when the Go version is unchanged). |
| The `amp-cli-proxy-api` skill is missing in an orb | Setup could not install it (it only warns). Run `.agents/cliproxy-host skill`; check `CLIPROXY_SKILL_REPO`/`CLIPROXY_SKILL_REF` if it fails. |
| `.agents/skills/amp-cli-proxy-api/` shows as tracked or modified in Git | The project was scaffolded before the skill copy was ignored. Rerun `scaffold.sh --force .` (adds the ignore entry), then `git rm -r --cached .agents/skills/amp-cli-proxy-api` and commit. |
| `scaffold.sh` exits 3 | Managed files already exist with other content; nothing changed. Merge by hand, or rerun with `--force` after the user approves. |

Claude requests from non-Claude-Code clients such as Amp are cloaked by CLIProxyAPI's default
`auto` mode for OAuth credentials; no `cloak_mode` setting is needed.
