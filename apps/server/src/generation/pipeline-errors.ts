import type { PipelineErrorData, ProviderDiagnostic } from '@sky/shared';
export class PipelineFailure extends Error {
  constructor(readonly code: PipelineErrorData['code'], message: string, readonly provider?:ProviderDiagnostic) {super(message);}
}
export function safePipelineError(error: unknown): PipelineErrorData {
  return error instanceof PipelineFailure
    ? {code:error.code, message:error.message,...(error.provider ? {provider:error.provider} : {})}
    : {code:'PROVIDER_ERROR', message:'The model request failed unexpectedly. No retry was made.'};
}
