/**
 * The TypeScript worker: the transpiler for a run (`./typescript-host.ts`). In v1 it also becomes
 * the editor's language service, which is why it holds the whole of `typescript`.
 */
import ts from 'typescript';
import {exposeTypeScript} from './typescript-host.js';

exposeTypeScript(ts);
