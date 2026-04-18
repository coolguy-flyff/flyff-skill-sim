/**
 * End-to-end sanity check with the real scraped data. Run with `yarn tsx tools/smoke-test.ts`.
 */
import classes from '../public/data/class.json';
import skills from '../public/data/skill.json';
import { SkillEngine, createInitialState } from '../src/engine';
import type { ClassRecord, SkillRecord } from '../src/engine/types';

const classesTyped = classes as ClassRecord[];
const skillsTyped = skills as SkillRecord[];

const mentalist = classesTyped.find((c) => c.name.en === 'Mentalist')!;
const engine = new SkillEngine({
    skills: skillsTyped,
    classes: classesTyped,
    initialState: createInitialState(mentalist.id),
});

console.log('=== Mentalist build sanity check ===');
engine.setLevel(190);
console.log('Level 190, class Mentalist');
console.log('  Total points:', engine.getTotalPoints());
console.log('  Current tier class:', engine.getCurrentTierClass()?.name.en);
console.log('  Chain:', engine.getClassChain().map((c) => c.name.en).join(' -> '));

const hexe = skillsTyped.find((s) => s.name.en === "Hexe's Lament")!;
console.log(`\nHexe's Lament (base id=${hexe.id}):`);
console.log('  masterVariations on skill:', hexe.masterVariations);

const variations = engine.getMasterVariations(hexe.id);
console.log('  engine.getMasterVariations ->', variations.map((v) => `${v.id}=${v.name.en}`));

const variation = variations[0];
console.log('\nVariation alloc before base max:');
console.log('  canIncrement:', engine.canIncrement(variation.id));

engine.max(hexe.id);
console.log(`\nAfter maxing base (${engine.getSkillLevel(hexe.id)}):`);
console.log('  canIncrement variation:', engine.canIncrement(variation.id));

engine.increment(variation.id);
console.log(`  allocated ${variation.name.en} -> lvl ${engine.getSkillLevel(variation.id)}`);

const other = variations[1];

if (other) {
    console.log('  canIncrement other variation:', engine.canIncrement(other.id));
}

console.log('\nRemaining points:', engine.getRemainingPoints(), '/', engine.getTotalPoints());

// Level down and verify refund
engine.setLevel(60);
console.log('\nAfter dropping to level 60:');
console.log('  Hexe lvl:', engine.getSkillLevel(hexe.id));
console.log('  Variation lvl:', engine.getSkillLevel(variation.id));
console.log('  Spent:', engine.getSpentPoints(), '/', engine.getTotalPoints());
