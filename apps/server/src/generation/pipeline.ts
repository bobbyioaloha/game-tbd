import { randomUUID } from 'node:crypto';
import {
  CreationDesignSchema, GeneratedCreationSchema, MeshAppearanceSchema, PipelineRequestSchema,
  GeometryWireSchema, type GeneratedCreation, type PipelineEvent, type PipelineProfile,
  type PipelineRequest, type PipelineStage, type StageConfig, type StageMetric,
} from '@sky/shared';
import { DESIGN_INSTRUCTIONS, DESIGN_JSON_SCHEMA, GEOMETRY_INSTRUCTIONS, GEOMETRY_JSON_SCHEMA } from './model-schemas.js';
import { PipelineFailure, safePipelineError } from './pipeline-errors.js';
import type { StageTransport } from './stage-transport.js';

export type PipelineOptions = {signal?:AbortSignal; emit?:(event:PipelineEvent)=>void};
export class CreationPipeline {
  constructor(readonly profiles:PipelineProfile[], private transports:{mock:StageTransport;live?:StageTransport},
    private budgets = {totalMs:30000,designMs:8000}) {}
  async run(request:PipelineRequest, options:PipelineOptions = {}):Promise<GeneratedCreation> {
    const started = performance.now();
    const elapsed = () => Math.max(0,Math.round(performance.now()-started));
    let stage:PipelineStage = 'design';
    const metrics:StageMetric[] = [];
    const emit = options.emit ?? (() => {});
    const overall = new AbortController();
    const cancel = () => overall.abort(new PipelineFailure('CANCELLED','Attempt cancelled.'));
    options.signal?.addEventListener('abort',cancel,{once:true});
    if (options.signal?.aborted) cancel();
    const totalTimer = setTimeout(() => overall.abort(new PipelineFailure('TIMEOUT','The 30-second attempt deadline was reached.')),this.budgets.totalMs);
    const ensureActive = () => {
      if (performance.now()-started >= this.budgets.totalMs && !overall.signal.aborted) overall.abort(new PipelineFailure('TIMEOUT','The attempt deadline was reached.'));
      overall.signal.throwIfAborted();
    };
    try {
      const parsedRequest = PipelineRequestSchema.safeParse(request);
      if (!parsedRequest.success) throw new PipelineFailure('INVALID_REQUEST','Use one to ten words and select an available pipeline profile.');
      const profile = this.profiles.find(item => item.id === parsedRequest.data.profileId);
      if (!profile) throw new PipelineFailure('INVALID_REQUEST','Unknown pipeline profile.');
      if (!profile.available) throw new PipelineFailure('NOT_CONFIGURED',profile.unavailableReason ?? 'The live provider is not configured.');
      const transport = this.transports[profile.mode];
      if (!transport) throw new PipelineFailure('NOT_CONFIGURED','The live provider is not configured.');
      const call = async (config:StageConfig,instructions:string,input:string,schema:Record<string,unknown>) => {
        ensureActive();
        const currentStage = stage as 'design'|'geometry';
        emit({type:'stage',stage,elapsedMs:elapsed()});
        const controller = new AbortController();
        const forward = () => controller.abort(overall.signal.reason);
        overall.signal.addEventListener('abort',forward,{once:true});
        if (overall.signal.aborted) forward();
        const remaining = this.budgets.totalMs-(performance.now()-started);
        const budget = currentStage === 'design' ? Math.min(this.budgets.designMs,remaining) : remaining;
        const timer = setTimeout(() => controller.abort(new PipelineFailure('TIMEOUT',currentStage+' stage exceeded its time budget.')),Math.max(0,budget));
        let rejectAbort:(reason:unknown)=>void = () => {};
        const abortListener = () => rejectAbort(controller.signal.reason);
        const stageStarted = performance.now();
        try {
          controller.signal.throwIfAborted();
          // Race enforces the deadline even when a test/provider ignores AbortSignal.
          const aborted = new Promise<never>((_,reject) => {rejectAbort=reject;controller.signal.addEventListener('abort',abortListener,{once:true});});
          const response = await Promise.race([transport.run({stage:currentStage,config,instructions,input,schema,signal:controller.signal}),aborted]);
          ensureActive();
          if (performance.now()-stageStarted >= budget) throw new PipelineFailure('TIMEOUT',currentStage+' stage exceeded its time budget.');
          const metric:StageMetric = {stage:currentStage,model:config.model,durationMs:Math.round(performance.now()-stageStarted),...(response.usage ? {usage:response.usage} : {})};
          metrics.push(metric);
          return {response,metric};
        } catch (error) {
          if (!metrics.some(item => item.stage === currentStage)) metrics.push({stage:currentStage,model:config.model,durationMs:Math.round(performance.now()-stageStarted)});
          throw error;
        } finally {
          clearTimeout(timer); overall.signal.removeEventListener('abort',forward);
          controller.signal.removeEventListener('abort',abortListener);
        }
      };
      const designed = await call(profile.design,DESIGN_INSTRUCTIONS,parsedRequest.data.text,DESIGN_JSON_SCHEMA);
      const design = CreationDesignSchema.safeParse(designed.response.data);
      if (!design.success) throw new PipelineFailure('INVALID_DESIGN','Design did not contain a valid visual brief and one supported effect.');
      emit({type:'design',design:design.data,metric:designed.metric});
      stage = 'geometry';
      // Deliberately hand off only appearance data, never the effect or original prompt.
      const geometry = await call(profile.geometry,GEOMETRY_INSTRUCTIONS,design.data.visualBrief,GEOMETRY_JSON_SCHEMA);
      emit({type:'geometry',metric:geometry.metric});
      stage = 'validation';
      emit({type:'stage',stage,elapsedMs:elapsed()});
      const wire = GeometryWireSchema.safeParse(geometry.response.data);
      if (!wire.success) throw new PipelineFailure('INVALID_MESH','Geometry response did not match the mesh structure.');
      const mesh = MeshAppearanceSchema.safeParse({
        type:'mesh', vertices:wire.data.vertices.map(v => [v.x,v.y,v.z]),
        triangles:wire.data.faces.map(f => [f.a,f.b,f.c]),faceColors:wire.data.faces.map(f => f.color),
      });
      if (!mesh.success) throw new PipelineFailure('INVALID_MESH','Mesh contains invalid coordinates, triangle indices, or degenerate faces.');
      const spec = GeneratedCreationSchema.parse({version:2,id:randomUUID(),
        displayName:design.data.displayName,description:design.data.description,
        appearance:mesh.data,effects:[design.data.effect]});
      ensureActive();
      emit({type:'complete',spec,elapsedMs:elapsed(),metrics});
      return spec;
    } catch (error) {
      const safe = safePipelineError(error);
      emit({type:'failed',stage,error:safe,elapsedMs:elapsed(),metrics});
      throw new PipelineFailure(safe.code,safe.message);
    } finally {
      clearTimeout(totalTimer); options.signal?.removeEventListener('abort',cancel);
    }
  }
}
