import test from 'node:test';
import assert from 'node:assert/strict';
import { PowerUpSpecSchema, GenerationErrorSchema } from '@sky/shared';
import { buildApp } from './app.js';
test('API returns validated mock specs and structured errors',async()=>{
  const app=buildApp();
  try {
    for(const text of ['jellyfish umbrella','ghost cloak','angry sun']){
      const response=await app.inject({method:'POST',url:'/api/powerups',payload:{text}});
      assert.equal(response.statusCode,200);
      assert.ok(PowerUpSpecSchema.safeParse(response.json()).success);
    }
    for(const payload of [{text:''},{text:'one two three four five six seven eight nine ten eleven'},{text:'ghost',code:'evil'}]){
      const response=await app.inject({method:'POST',url:'/api/powerups',payload});
      assert.equal(response.statusCode,400);
      assert.ok(GenerationErrorSchema.safeParse(response.json()).success);
    }
    const malformed=await app.inject({method:'POST',url:'/api/powerups',headers:{'content-type':'application/json'},payload:'{'});
    assert.equal(malformed.statusCode,400);
    assert.ok(GenerationErrorSchema.safeParse(malformed.json()).success);
  }finally{await app.close();}
});
