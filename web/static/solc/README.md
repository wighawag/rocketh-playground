# solc

`soljson-v0.8.28+commit.7893614a.js` is the Solidity compiler, version 0.8.28, unmodified. It is copied into the build from https://binaries.soliditylang.org/bin/ by `scripts/soljson.mjs`, which refuses it unless its sha256 matches the one binaries.soliditylang.org's `list.json` gives for that release (pinned in `solc.json`).

The compiler is licensed under the GNU General Public License, version 3 (`LICENSE.txt`, beside this file). Its source code is at https://github.com/ethereum/solidity/tree/v0.8.28.

It is a separate program from the rocketh playground, which loads it in a worker and calls it; the playground's own code is under the GNU Affero General Public License, version 3.
