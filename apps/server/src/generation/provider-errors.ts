import { APIError, APIConnectionError, APIConnectionTimeoutError } from 'openai';
import { ProviderDiagnosticSchema, type PipelineErrorData, type ProviderDiagnostic } from '@sky/shared';
import { PipelineFailure } from './pipeline-errors.js';

type FailureMetadata = {status?:unknown; code?:unknown; param?:unknown; requestId?:unknown};
export function providerFailure(metadata:FailureMetadata, model:string):PipelineFailure {
  const provider:ProviderDiagnostic = {model};
  const status = ProviderDiagnosticSchema.shape.httpStatus.safeParse(metadata.status);
  const code = ProviderDiagnosticSchema.shape.code.safeParse(metadata.code);
  const parameter = ProviderDiagnosticSchema.shape.parameter.safeParse(metadata.param);
  const requestId = ProviderDiagnosticSchema.shape.requestId.safeParse(metadata.requestId);
  if (status.success && status.data !== undefined) provider.httpStatus=status.data;
  if (code.success && code.data !== undefined) provider.code=code.data;
  if (parameter.success && parameter.data !== undefined) provider.parameter=parameter.data;
  if (requestId.success && requestId.data !== undefined) provider.requestId=requestId.data;
  // Never copy provider messages, bodies, arbitrary headers or unknown string fields.
  // Authentication errors can echo API keys; canned messages keep these out of logs/exports/UI.
  const failure = (category:PipelineErrorData['code'], message:string) => new PipelineFailure(category,message,provider);
  if (provider.code === 'invalid_api_key' || provider.httpStatus === 401) {
    return failure('PROVIDER_AUTH','OpenAI rejected authentication. Check that the server key is active and its project is accessible.');
  } else if (provider.code === 'model_not_found' || (provider.httpStatus === 404 && provider.parameter === 'model')) {
    return failure('MODEL_UNAVAILABLE','OpenAI could not find or grant access to this model. Check the selected model and project access.');
  } else if (['permission_denied','insufficient_permissions'].includes(provider.code ?? '') || provider.httpStatus === 403) {
    return failure('PROVIDER_PERMISSION','OpenAI denied this request. Check project/key permissions, model access, and regional restrictions.');
  } else if (['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded'].includes(provider.code ?? '')) {
    return failure('PROVIDER_QUOTA','OpenAI reports a credit, quota, or spending limit. Check project billing/limits before another attempt.');
  } else if (['rate_limit_exceeded','slow_down'].includes(provider.code ?? '') || provider.httpStatus === 429) {
    return failure('PROVIDER_RATE_LIMIT','OpenAI limited requests or tokens. Check this model’s rate limits and output-token budget before another attempt.');
  } else if (['invalid_json_schema','invalid_schema'].includes(provider.code ?? '') || ((provider.httpStatus === 400 || provider.httpStatus === 422) && provider.parameter === 'text.format.schema')) {
    return failure('PROVIDER_SCHEMA','OpenAI rejected the structured-output schema. This needs a request-schema fix; adding credits will not help.');
  } else if (['server_error','server_is_overloaded','service_unavailable'].includes(provider.code ?? '') || (provider.httpStatus !== undefined && provider.httpStatus >= 500)) {
    return failure('PROVIDER_UNAVAILABLE','OpenAI reported a server error or overloaded model. No automatic retry was made.');
  } else if (provider.httpStatus === 408) {
    return failure('PROVIDER_TIMEOUT','OpenAI returned an HTTP request timeout. No automatic retry was made.');
  } else if (provider.httpStatus !== undefined && provider.httpStatus >= 400 && provider.httpStatus < 500) {
    return failure('PROVIDER_REQUEST','OpenAI rejected the request. Inspect the HTTP status and parameter below; no automatic retry was made.');
  }
  return failure('PROVIDER_ERROR','OpenAI failed to complete the request. Inspect the API details below; no retry was made.');
}

function timeoutTransportCode(error:unknown):ProviderDiagnostic['transportCode'] {
  // SDK -> fetch error -> native cause. Only recognized codes may leave the server;
  // never forward cause messages, URLs, addresses, credentials, or arbitrary fields.
  let cause=error;
  for (let depth=0;depth<4 && typeof cause === 'object' && cause !== null;depth++) {
    const code=ProviderDiagnosticSchema.shape.transportCode.safeParse('code' in cause ? cause.code : undefined);
    if (code.success && code.data !== undefined) return code.data;
    cause='cause' in cause ? cause.cause : undefined;
  }
  return undefined;
}

export function translateProviderError(error:unknown, model:string):unknown {
  const transportCode=timeoutTransportCode(error);
  if (error instanceof APIConnectionTimeoutError || transportCode) return new PipelineFailure(
    'PROVIDER_TIMEOUT','The OpenAI SDK or network timed out independently of the generation deadline. No automatic retry was made.',
    {model,...(transportCode ? {transportCode} : {})});
  if (error instanceof APIConnectionError) return new PipelineFailure('PROVIDER_CONNECTION','Could not connect to OpenAI. Check the server network, proxy, and TLS configuration.',{model});
  if (error instanceof APIError) return providerFailure({status:error.status,code:error.code,param:error.param,requestId:error.requestID},model);
  return error;
}
