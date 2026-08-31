# Streamient CLI

Command-line access to Streamient notes, memories, knowledge search, URLs, email records, projects, graph links, and Git sync through the live Streamient MCP server.

## Install

```sh
pnpm add --global @streamient/cli
```

Or with npm:

```sh
npm install --global @streamient/cli
```

Node.js 24 or newer is required.

## Authenticate

Create a personal access token under **Settings → Access Tokens**, then expose it to the current shell:

```fish
set -gx STREAMIENT_CLI_ACCESS_TOKEN 'your-personal-access-token'
```

The CLI never stores credentials. Do not pass tokens as arguments or include them in URLs.

Multiple accounts remain environment-only:

```fish
set -gx STREAMIENT_CLI_ACCESS_TOKEN_WORK 'work-token'
streamient-cli knowledge search 'launch decision' --account work

set -gx CUSTOMER_TOKEN 'customer-token'
streamient-cli projects list --token-env CUSTOMER_TOKEN
```

`--account work` reads `STREAMIENT_CLI_ACCESS_TOKEN_WORK`. Raw `--token` values are rejected because command arguments can be exposed in shell history and process listings.

## Use

```fish
streamient-cli doctor
streamient-cli knowledge search 'release decision' --per-page 3 --pretty
streamient-cli notes create --title 'Launch notes' --content '<p>Approved</p>'
streamient-cli notes delete NOTE_ID --yes
streamient-cli tools list
streamient-cli --help
```

Compact JSON is the default output. Use `--pretty`, `--table`, `--input`, `--file`, `--project-id`, or `--server` as needed.

Documentation: [docs.streamient.com/cli](https://docs.streamient.com/cli/)
