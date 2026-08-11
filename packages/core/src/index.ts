export {
  createTestPlatform,
  type TestPlatform,
} from "./adapter/testing.js"
export type {
  CoraPlatform,
  CoraPlayer,
  PlatformEvents,
} from "./adapter/types.js"
export {
  type CreateKernelOptions,
  createKernel,
  type Kernel,
} from "./kernel/kernel.js"
export {
  type CoraModule,
  type CoraModuleContext,
  defineModule,
  type HookUnsubscribe,
  type KernelHooks,
} from "./modules/define-module.js"
