import { setTimeout as delay } from 'node:timers/promises';
import { mockCreationForText, type GenerationRequest } from '@sky/shared';

// Trust boundary: a provider returns unknown, and the route validates it.
// Future Astra adapter implements this interface with SDK retries disabled.
// Honor signal for timeouts and disconnects; never execute model-generated code.
export interface CreationProvider {
  readonly mode: 'mock' | 'live';
  generate(request: GenerationRequest, options: {signal: AbortSignal}): Promise<unknown>;
}
export const mockCreationProvider: CreationProvider = {
  mode: 'mock',
  async generate({text}, {signal}) {
    await delay(600, undefined, {signal});
    return mockCreationForText(text.toLowerCase());
  },
};
