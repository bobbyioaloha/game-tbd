// Pure lock acquisition state, independent of rendering and projectile motion.
export class TargetLock {
  target: number | undefined;
  progress = 0;
  private lost = 0;
  private view = false;
  reset(){this.target=undefined;this.progress=0;this.lost=0;}
  update(candidate:number|undefined, dt:number, lookUp:boolean, currentEligible:boolean){
    if(this.view!==lookUp||!currentEligible)this.reset();
    this.view=lookUp;
    if(candidate!==undefined){
      if(candidate!==this.target){this.reset();this.target=candidate;}
      this.lost=0;this.progress=Math.min(1,this.progress+dt/0.6);
    }else if(this.target!==undefined){
      this.lost+=dt;
      if(this.lost>0.18)this.reset();
    }
    return this.progress>=1?this.target:undefined;
  }
}
