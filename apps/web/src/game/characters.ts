export const CHARACTERS = [
  {id:'greg', introPose:'Reach', personality:'Anxious rule-follower. Still trying to reach the ripcord.', model:'greg', name:'Greg', species:'Tyrannosaurus', department:'Accounts payable', color:'#c47b48', note:'Equipment issued. Suitability assumed.', ready:true},
  {id:'linda', introPose:'Checklist', personality:'Procedural optimist. Your concern has been noted.', model:'linda', name:'Linda', species:'Triceratops', department:'Human resources', color:'#827491', note:'Equipment issued. Your concern has been noted.', ready:true},
  {id:'steve', introPose:'Diagnostics', personality:'Distracted troubleshooter. Has tried turning it off and on.', model:'steve', name:'Steve', species:'Stegosaurus', department:'IT support', color:'#598d87', note:'Equipment issued. Have you tried restarting it?', ready:true},
  {id:'susan', introPose:null, personality:'Practical caretaker. Ready before everyone else.', model:null, name:'Susan', species:'Parasaurolophus', department:'Facilities', color:'#bca454', note:'Induction pending.', ready:false},
] as const;

export type PlayableCharacter = NonNullable<(typeof CHARACTERS)[number]['model']>;
// Negative yaw shows the right flank while the muzzle points toward screen-left.
export const DEFAULT_CHARACTER_ANGLE = -37;
export function raceLineup(player:PlayableCharacter){
  const selected=CHARACTERS.find(character=>character.model===player);
  if(!selected)throw new Error('Character is not equipped');
  return [selected,...CHARACTERS.filter(character=>character.id!==selected.id)];
}
