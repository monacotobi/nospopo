# Security policy

## Supported version

The project keeps one line of development: the `main` branch. A fix goes into
`main` only.

## How to report a problem

Use GitHub's private vulnerability reporting:
[Report a vulnerability](https://github.com/monacotobi/nospopo/security/advisories/new).

Do not open a public issue for a security problem.

Please give:

- the Chrome version and the extension version;
- the page or the URL where the problem shows;
- the steps that repeat the problem.

## What the extension can reach

- It reads and changes pages on `https://open.spotify.com/*` only.
- It stores one value, `enabled`, in `chrome.storage.local`.
- It sends no network request, and it collects no data.
- It holds two permissions: `storage` and `alarms`.
- It runs no remote code. Every file is in this repository.
