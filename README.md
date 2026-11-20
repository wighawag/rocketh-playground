# rocketh playground

A site where you edit Solidity contracts and [rocketh](https://rocketh.dev) deploy scripts in the browser, compile them in the tab, run the real deploy scripts against an EVM in the tab, and download the result as a hardhat-deploy project that runs unchanged with `pnpm i && pnpm hardhat deploy`. Nothing touches a network.

It is meant to live at [play.rocketh.dev](https://play.rocketh.dev). It is being built: the design is the spec [`work/specs/tasked/rocketh-playground.md`](work/specs/tasked/rocketh-playground.md).

## Where this sits

This repository derives from [template-svelte-shadcn](https://github.com/wighawag/template-svelte-shadcn) through a `stem` git remote:

```
template-svelte                    plain scoped CSS, no tailwind
 └─ template-svelte-tailwind       CSS replaced with tailwind
     └─ template-svelte-shadcn     tailwind + shadcn kit
         └─ rocketh-playground     <- you are here
```

A fix that is not specific to the playground belongs in the template, and comes down from there.

## Adding components

```bash
cd web
npx shadcn-svelte@latest add <component>
```

They land in `src/lib/shadcn/ui/` per the aliases in `components.json`.

## Developing

```bash
pnpm install
pnpm -F web dev
```

## License

[AGPL-3.0](LICENSE). A project you download from the playground is generated from the MIT-licensed `hardhat-deploy init` template and is yours, under MIT; the AGPL covers this site's code, not what you build with it.
