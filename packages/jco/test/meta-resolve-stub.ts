// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
import { vi } from 'vitest';
import { createRequire } from 'node:module';
vi.stubGlobal('globalCreateRequire', createRequire);
