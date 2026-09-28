# Tailscale walkthrough

Guide the user through these steps one at a time. Substitute the chosen tag
(default `tag:amp-cli-proxy-api`), the Amp project ID, and the OIDC subject from SKILL.md step 2.
All pages are in the Tailscale admin console, https://login.tailscale.com/admin.

## 0. Preconditions

- The user is an Owner or Admin of the tailnet.
- DNS page: MagicDNS on and **HTTPS Certificates** enabled. Funnel needs both.
- Note the tailnet DNS name shown on the DNS page (`<something>.ts.net`); the public URL
  will be `https://<hostname>.<tailnet>.ts.net`.

## 1. Create the tag

The trust credential can only use a tag that already exists, and the tag picker shows nothing
until one does.

Access controls → Definitions → **Tags** → **Create tag**:

- Tag name: `amp-cli-proxy-api` (the form may add the `tag:` prefix itself)
- Tag owner: `autogroup:admin` (may be labelled Admins)

Policy-file equivalent: `"tagOwners": { "tag:amp-cli-proxy-api": ["autogroup:admin"] }`.

## 2. Create the OIDC trust credential

Settings → **Trust credentials** → **+ Credential** → **OpenID Connect**.

Settings page:

| Field | Value |
|---|---|
| Description | anything, e.g. `Amp orb - CLIProxyAPI` |
| Issuer | Custom issuer |
| Issuer URL | `https://ampcode.com/api/workload-identity` |
| Subject | the OIDC subject, e.g. `user:<owner-user-id>:project:<project-id>` |
| Audience | leave empty (Tailscale generates one) |
| Custom claims | `project_id` = `<project-id>`; `token_use` = `exchanged` |

Warn the user that `token_use` must be exactly `exchanged` (with the final d). A typo there
was the cause of a real 403 during the first setup.

Continue → Scopes page:

- Keep **Custom scopes**. Check only **Keys → Auth Keys → Write** (Read ticks itself).
- In the **Tags** field that appears, open the dropdown and **select**
  `tag:amp-cli-proxy-api` so it shows as a chip. Typing the text without selecting it leaves
  **Generate credential** disabled. If the tag is missing, do step 1 and reload the page.
- **Generate credential**.

Ask the user to paste the **Client ID** and **Audience** (format
`api.tailscale.com/<client-id>`). They are identifiers, not secrets. The credential list shows
them later too (expand the row).

## 3. Allow Funnel for the tag

Access controls → Definitions → **Node attributes** → **Add node attribute**:

- Targets: `tag:amp-cli-proxy-api`
- Attributes: `funnel`

A default `autogroup:member` → `funnel` row may already exist. It does not cover tagged
machines, so the tag row is still needed.

Policy-file equivalent:
`"nodeAttrs": [{ "target": ["tag:amp-cli-proxy-api"], "attr": ["funnel"] }]`.

## 4. Allow SSH (optional)

Useful for logs and maintenance without the Amp UI. Access controls → **JSON editor**, find the
`"ssh"` list. The default rule targets `autogroup:self`, which does not include tagged
machines. Add a second rule inside the list (keep the existing one, separate with a comma):

```json
{
	"src":    ["autogroup:member"],
	"dst":    ["tag:amp-cli-proxy-api"],
	"users":  ["user"],
	"action": "accept",
}
```

`user` is the orb's login account (it has passwordless sudo). Use `"action": "check"` instead
if the user wants periodic browser re-authentication. If the policy has no `grants`/`acls` rule
letting members reach the tag on port 22 and access is restricted, add one; the default
allow-all policy needs nothing.

## 5. After `enable`

The Machines page should show the host with the tag and badges **Ephemeral**, **SSH** (if
enabled), and **Funnel**. If the name has a `-1` suffix, an older node still holds the name:
have the user remove it on this page, then run `.agents/cliproxy-host reclaim`.

From a tailnet device: `tailscale ssh user@<hostname>`, or `ssh user@<hostname>` when that
device uses Tailscale DNS. Devices without Tailscale DNS can use the full `…ts.net` name
(if their resolver forwards it) or the node's 100.x address.
