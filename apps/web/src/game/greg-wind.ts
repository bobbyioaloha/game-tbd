// Cosmetic damped joints only. Never feeds forces back into racer movement.
export class GregWind {
  readonly angles = [0,0,0,0,0];
  private velocities = [0,0,0,0,0];
  private previous: number | undefined;
  reset(time:number) {this.angles.fill(0);this.velocities.fill(0);this.previous=time;}
  step(time:number,speed:number) {
    if(this.previous===undefined||time<this.previous){this.reset(time);return this.angles;}
    const elapsed=Math.min(0.1,Math.max(0,time-this.previous));this.previous=time;
    const strength=Math.min(1.4,Math.max(0,speed)/45);
    const steps=Math.ceil(elapsed*240);
    for(let step=0;step<steps;step++){
      const dt=elapsed/steps,t=time-elapsed+(step+1)*dt;
      for(let i=0;i<5;i++){
        const tail=i===4;
        const target=strength*(Math.sin(t*(tail?3.5:8)+i*1.9)*(tail?.24:.15)+Math.sin(t*13+i)*.055);
        const acceleration=(target-this.angles[i])*(tail?55:95)-this.velocities[i]*(tail?7:9);
        this.velocities[i]+=acceleration*dt;
        this.angles[i]=Math.max(-.5,Math.min(.5,this.angles[i]+this.velocities[i]*dt));
      }
    }
    return this.angles;
  }
}
