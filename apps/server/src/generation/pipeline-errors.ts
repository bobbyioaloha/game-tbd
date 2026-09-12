import type { PipelineErrorData } from '@sky/shared';
export class PipelineFailure extends Error {
  constructor(readonly code: PipelineErrorData['code'], message: string) {super(message);}
}
export function safePipelineError(error: unknown): PipelineErrorData {
  return error instanceof PipelineFailure
    ? {code:error.code, message:error.message}
    : {code:'PROVIDER_ERROR', message:'The model request failed. Check server configuration, model access, and account limits.'};
}
